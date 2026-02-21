/**
 * Create Pull Request workflow
 * Push current branch & create a PR on GitHub
 */

import type { CopilotModel } from '../api/copilot.js'
import type { GeminiModel } from '../api/gemini.js'
import type { OpenRouterModel } from '../api/openrouter.js'

import {
  createPullRequest,
  getDefaultBranch,
  listPullRequests,
  parseRepoFromUrl,
} from '../api/github.js'
import { askQuestion, confirm, editInline } from '../cli/input.js'
import { select } from '../cli/menu.js'
import { setupGithubConfigInteractive } from '../core/github-setup.js'
import { colors } from '../utils/colors.js'
import { DEFAULT_GEMINI_MODEL, hasGithubConfig } from '../utils/config.js'
import { isDryRun, logDryRun } from '../utils/dry-run.js'
import { execAsync, execSilent } from '../utils/exec.js'
import { getAIProviderShortName } from '../utils/git-ai.js'
import { getCurrentBranch } from '../utils/git.js'
import { log } from '../utils/logging.js'
import { loadState, saveState } from '../utils/state.js'

/**
 * Get recent commit messages on current branch (for PR body)
 */
const getRecentCommits = (base: string, limit = 20): string[] => {
  try {
    const output = execSilent(`git log --no-merges --format="- %s" ${base}..HEAD -${limit}`).trim()
    if (!output) return []
    return output.split('\n').filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Get all branch names for base branch selection
 */
const getBaseBranches = (): string[] => {
  const branches: string[] = []

  try {
    const local = execSilent('git branch --format="%(refname:short)"')
    for (const name of local.split('\n').filter(Boolean)) {
      branches.push(name)
    }
  } catch {
    // Ignore
  }

  return branches
}

/**
 * Check if current branch is pushed to remote
 */
const isBranchPushed = (branch: string): boolean => {
  try {
    execSilent(`git rev-parse --verify origin/${branch}`)
    return true
  } catch {
    return false
  }
}

/**
 * Check if there are unpushed commits
 */
const hasUnpushedCommits = (branch: string): boolean => {
  try {
    const count = execSilent(`git rev-list origin/${branch}..HEAD --count`).trim()
    return Number.parseInt(count, 10) > 0
  } catch {
    return true // If remote doesn't exist, we definitely have unpushed
  }
}

/**
 * Get the first commit subject on this branch (for default title)
 */
const getFirstCommitSubject = (base: string): string => {
  try {
    return execSilent(`git log --format="%s" ${base}..HEAD --reverse -1`).trim()
  } catch {
    return ''
  }
}

/**
 * Format a markdown line for terminal preview display
 */
const formatMdLine = (line: string): string => {
  const trimmed = line.trimStart()
  // Headings — strip markdown markers for cleaner display
  if (trimmed.startsWith('### ')) {
    return `  ${colors.bright}${trimmed.slice(4)}${colors.reset}`
  }
  if (trimmed.startsWith('## ')) {
    return `  ${colors.cyan}${colors.bright}${trimmed.slice(3)}${colors.reset}`
  }
  // Bullet points
  if (trimmed.startsWith('- ')) {
    return `    ${trimmed}`
  }
  // Empty line
  if (!trimmed) return ''
  // Normal text
  return `  ${colors.gray}${trimmed}${colors.reset}`
}

/**
 * Get the diff between base branch and HEAD for AI generation
 */
const getDiffForAI = (base: string, maxChars = 12000): string => {
  try {
    const diff = execSilent(`git diff ${base}...HEAD`).trim()
    if (!diff) return ''
    // Truncate if too large to avoid token limits
    if (diff.length > maxChars) {
      return diff.slice(0, maxChars) + '\n\n[diff truncated]'
    }
    return diff
  } catch {
    return ''
  }
}

/**
 * Generate PR title and body using a specific AI provider & model
 */
const callAIForPR = async (
  diff: string,
  commits: string[],
  branchName: string,
  baseBranch: string,
  provider: 'copilot' | 'gemini' | 'openrouter',
  model: string | undefined,
  correction?: string
): Promise<{ title: string; body: string } | null> => {
  const commitList = commits.length > 0 ? `\nRecent commits:\n${commits.join('\n')}` : ''

  const promptBase = [
    'Generate a Pull Request title and body from this git diff.',
    'Output ONLY in this exact format (no extra markers):',
    '',
    'TITLE: <concise PR title, max 72 chars, imperative mood>',
    '',
    'BODY:',
    '## Summary',
    '<1-2 sentence summary of what this PR does>',
    '',
    '## Changes',
    '<bullet list of key changes>',
    '',
    `Branch: ${branchName} → ${baseBranch}`,
    commitList,
    '',
    `Diff:\n${diff}`,
  ].join('\n')

  const prompt = correction ? `${promptBase}\n\nAdjustment: ${correction}` : promptBase

  const providerName = getAIProviderShortName(provider)
  const modelDisplay = model ? ` (${model})` : ''

  const spinner = log.spinner()
  spinner.start(`Generating PR with ${providerName}${modelDisplay}...`)

  let result: string | null = null
  try {
    if (provider === 'copilot') {
      const { generateText } = await import('../api/copilot.js')
      result = await generateText(prompt, model as CopilotModel)
    } else if (provider === 'openrouter') {
      const { generateText } = await import('../api/openrouter.js')
      result = await generateText(prompt, model as OpenRouterModel)
    } else {
      const { generateText } = await import('../api/gemini.js')
      result = await generateText(prompt, (model as GeminiModel) ?? 'gemini-2.5-flash')
    }
    spinner.stop()
  } catch {
    spinner.stop()
    log.warn('AI generation failed')
    return null
  }

  if (!result) {
    log.warn('AI returned empty response')
    return null
  }

  // Parse TITLE: and BODY: from response
  const titleMatch = result.match(/TITLE:\s*(.+)/i)
  const bodyMatch = result.match(/BODY:\s*([\s\S]+)/i)

  const title = titleMatch?.[1]?.trim() ?? ''
  const body = bodyMatch?.[1]?.trim() ?? result.trim()

  return {
    title: title || branchName,
    body,
  }
}

/**
 * Show AI PR preview in terminal
 */
const showAIPRPreview = (title: string, body: string): void => {
  log.ai('Suggested PR:\n')
  console.log(`  ${colors.cyan}${colors.bright}${title}${colors.reset}\n`)
  for (const line of body.split('\n')) {
    console.log(formatMdLine(line))
  }
  console.log('')
}

/**
 * Get current model string for a given provider from state
 */
const getModelForProvider = (
  provider: 'copilot' | 'gemini' | 'openrouter',
  state: ReturnType<typeof loadState>
): string | undefined => {
  if (provider === 'copilot') return state?.copilotModel
  if (provider === 'openrouter') return state?.openrouterModel
  return state?.geminiModel ?? DEFAULT_GEMINI_MODEL
}

/**
 * Update model in state for a given provider and save
 */
const updateModelInState = (
  state: ReturnType<typeof loadState>,
  provider: 'copilot' | 'gemini' | 'openrouter',
  model: string
): void => {
  if (!state) return
  switch (provider) {
    case 'copilot': {
      state.copilotModel = model as CopilotModel
      break
    }
    case 'openrouter': {
      state.openrouterModel = model as OpenRouterModel
      break
    }
    default: {
      state.geminiModel = model as GeminiModel
      break
    }
  }
  saveState(state)
}

/**
 * Interactive Create PR workflow
 */
export const handleCreatePR = async (): Promise<void> => {
  log.banner()
  log.step(`${colors.cyan}Create Pull Request${colors.reset}\n`)

  // Check GitHub config
  if (!hasGithubConfig()) {
    const ok = setupGithubConfigInteractive()
    if (!ok) {
      log.info('Setup cancelled. Run --setup-github later.')
      return
    }
    console.log('')
  }

  // Resolve repo info from remote
  let remoteUrl = ''
  try {
    remoteUrl = execSilent('git remote get-url origin').trim()
  } catch {
    log.error('No git remote "origin" found.')
    log.info('Add a remote: git remote add origin <url>')
    return
  }

  const repoInfo = parseRepoFromUrl(remoteUrl)
  if (!repoInfo) {
    log.error('Could not parse GitHub owner/repo from remote URL.')
    log.info(`Remote: ${remoteUrl}`)
    return
  }

  const current = getCurrentBranch()
  log.info(`Repo: ${colors.cyan}${repoInfo.owner}/${repoInfo.repo}${colors.reset}`)
  log.info(`Branch: ${colors.green}${current}${colors.reset}\n`)

  // Check for existing PR
  const spinner = log.spinner()
  spinner.start('Checking for existing PRs...')
  const existingPRs = await listPullRequests(repoInfo.owner, repoInfo.repo, current)
  spinner.stop()

  if (existingPRs.length > 0) {
    const pr = existingPRs[0]
    if (pr) {
      log.warn('An open PR already exists for this branch:')
      console.log(`  ${colors.cyan}#${pr.number}${colors.reset} ${pr.title}`)
      console.log(`  ${colors.gray}${pr.html_url}${colors.reset}\n`)

      const cont = confirm('Create another PR anyway?')
      if (!cont) return
      console.log('')
    }
  }

  // Get default branch for base
  spinner.start('Fetching repo info...')
  const defaultBranch = await getDefaultBranch(repoInfo.owner, repoInfo.repo)
  spinner.stop()

  // Select base branch
  const localBranches = getBaseBranches().filter((b) => b !== current)
  const commonBases = ['main', 'master', 'development', 'develop']

  // Sort: default branch first, then common bases, then alphabetical
  localBranches.sort((a, b) => {
    if (a === defaultBranch) return -1
    if (b === defaultBranch) return 1
    const aCommon = commonBases.indexOf(a)
    const bCommon = commonBases.indexOf(b)
    if (aCommon !== -1 && bCommon === -1) return -1
    if (bCommon !== -1 && aCommon === -1) return 1
    if (aCommon !== -1 && bCommon !== -1) return aCommon - bCommon
    return a.localeCompare(b)
  })

  const baseOptions = localBranches.map((b) => {
    const isDefault = b === defaultBranch ? ` ${colors.green}(default)${colors.reset}` : ''
    return { label: `${b}${isDefault}`, value: b }
  })

  if (baseOptions.length === 0) {
    log.error('No other branches found for base.')
    return
  }

  const baseBranch = await select('Base branch (merge into):', baseOptions)
  if (!baseBranch) return

  // PR content generation
  const commits = getRecentCommits(baseBranch)
  let prTitle = ''
  let prBody = ''
  let aiUsed = false

  // Try AI generation if provider is configured
  aiBlock: {
    const diff = getDiffForAI(baseBranch)
    if (!diff) break aiBlock

    const state = loadState()
    let aiProvider =
      state?.aiProvider && state.aiProvider !== 'manual'
        ? state.aiProvider
        : (null as 'copilot' | 'gemini' | 'openrouter' | null)

    if (!aiProvider) break aiBlock

    let currentModel = getModelForProvider(aiProvider, state)
    const providerLabel = getAIProviderShortName(aiProvider)
    const modelLabel = currentModel ? ` (${currentModel})` : ''

    const useAI = confirm(`Use ${providerLabel}${modelLabel} for PR? (recommended)`)
    if (!useAI) break aiBlock

    aiUsed = true
    log.info(`Git diff size: ${diff.length} chars`)
    console.log('')

    let correction = ''
    let aiDone = false

    while (!aiDone) {
      const aiResult = await callAIForPR(
        diff,
        commits,
        current,
        baseBranch,
        aiProvider,
        currentModel,
        correction
      )

      if (!aiResult) {
        log.warn('AI failed. Falling back to manual.')
        aiUsed = false
        break
      }

      prTitle = aiResult.title
      prBody = aiResult.body
      showAIPRPreview(prTitle, prBody)
      log.info('Incorrect? check .geeto/last-ai-suggestion.json (possible AI/context limit).')

      const action = await select('Accept this PR content?', [
        { label: 'Yes, use it', value: 'accept' },
        { label: 'Regenerate', value: 'regenerate' },
        { label: 'Correct AI (give feedback)', value: 'correct' },
        { label: 'Edit inline', value: 'edit' },
        { label: 'Change model', value: 'change-model' },
        { label: 'Change AI provider', value: 'change-provider' },
        { label: 'Discard & enter manually', value: 'discard' },
      ])

      switch (action) {
        case 'accept': {
          aiDone = true
          break
        }
        case 'regenerate': {
          correction = ''
          continue
        }
        case 'correct': {
          if (process.stdin.isTTY) process.stdin.setRawMode(false)
          correction = askQuestion('Corrections for AI: ')
          continue
        }
        case 'edit': {
          const editedBody = await editInline(prBody, 'Edit PR Body', '.md')
          if (editedBody !== null) prBody = editedBody
          if (process.stdin.isTTY) process.stdin.setRawMode(false)
          const editedTitle = askQuestion('Edit title (Enter to keep): ').trim()
          if (editedTitle) prTitle = editedTitle
          aiDone = true
          break
        }
        case 'change-model': {
          const { chooseModelForProvider } = await import('../utils/git-ai.js')
          const chosen = await chooseModelForProvider(aiProvider, 'Choose model:', 'Back')
          if (chosen && chosen !== 'back') {
            currentModel = chosen
            updateModelInState(state, aiProvider, chosen)
          }
          correction = ''
          continue
        }
        case 'change-provider': {
          const prov = await select('Choose AI provider:', [
            { label: 'Gemini', value: 'gemini' },
            { label: 'GitHub Copilot', value: 'copilot' },
            { label: 'OpenRouter', value: 'openrouter' },
            { label: 'Back', value: 'back' },
          ])
          if (prov !== 'back') {
            const { chooseModelForProvider } = await import('../utils/git-ai.js')
            const chosen = await chooseModelForProvider(
              prov as 'gemini' | 'copilot' | 'openrouter',
              'Choose model:',
              'Back'
            )
            if (chosen && chosen !== 'back') {
              aiProvider = prov as 'copilot' | 'gemini' | 'openrouter'
              currentModel = chosen
              if (state) {
                state.aiProvider = aiProvider
                updateModelInState(state, aiProvider, chosen)
              }
            }
          }
          correction = ''
          continue
        }
        default: {
          prTitle = ''
          prBody = ''
          aiUsed = false
          aiDone = true
          break
        }
      }
    }
  }

  // Manual fallback (or if AI was discarded/failed)
  if (!prTitle) {
    const firstCommit = getFirstCommitSubject(baseBranch)
    const defaultTitle = firstCommit || current

    if (process.stdin.isTTY) process.stdin.setRawMode(false)
    log.info(`Suggested title: ${colors.cyan}${defaultTitle}${colors.reset}`)
    const customTitle = askQuestion('PR title (Enter to use suggested): ').trim()
    prTitle = customTitle || defaultTitle
  }

  if (!prBody && !aiUsed) {
    console.log('')
    if (commits.length > 0) {
      const bodyChoice = await select('PR description:', [
        { label: 'Auto-generate from commits', value: 'commits' },
        { label: 'Write custom description', value: 'custom' },
        { label: 'Empty (no description)', value: 'empty' },
      ])

      switch (bodyChoice) {
        case 'commits': {
          prBody = `## Changes\n\n${commits.join('\n')}`
          break
        }
        case 'custom': {
          const edited = await editInline('', 'PR Description', '.md')
          prBody = edited?.trim() ?? ''
          break
        }
        default: {
          prBody = ''
          break
        }
      }
    } else {
      const edited = await editInline('', 'PR Description', '.md')
      prBody = edited?.trim() ?? ''
    }
  }

  // Draft?
  console.log('')
  const isDraft = await select('PR type:', [
    { label: 'Ready for review', value: 'ready' },
    { label: 'Draft', value: 'draft' },
  ])

  // Summary
  console.log('')
  console.log(`${colors.cyan}┌──────────────────────────────────────────────┐${colors.reset}`)
  console.log(`${colors.cyan}│${colors.reset} ` + `${colors.bright}PR Summary${colors.reset}`)
  console.log(`${colors.cyan}├──────────────────────────────────────────────┤${colors.reset}`)
  console.log(`${colors.cyan}│${colors.reset} Title: ${colors.bright}${prTitle}${colors.reset}`)
  console.log(
    `${colors.cyan}│${colors.reset} ` +
      `${colors.green}${current}${colors.reset} → ` +
      `${colors.cyan}${baseBranch}${colors.reset}`
  )
  console.log(
    `${colors.cyan}│${colors.reset} Type: ` +
      `${isDraft === 'draft' ? `${colors.yellow}Draft${colors.reset}` : `${colors.green}Ready${colors.reset}`}`
  )
  if (prBody) {
    const bodyLines = prBody.split('\n')
    console.log(`${colors.cyan}│${colors.reset} Body:`)
    for (const line of bodyLines) {
      console.log(`${colors.cyan}│${colors.reset}   ${colors.gray}${line}${colors.reset}`)
    }
  }
  console.log(`${colors.cyan}└──────────────────────────────────────────────┘${colors.reset}`)

  console.log('')
  const proceed = confirm('Create this PR?')
  if (!proceed) {
    log.info('Cancelled.')
    return
  }
  console.log('')

  // Push if needed
  const pushed = isBranchPushed(current)
  if (!pushed || hasUnpushedCommits(current)) {
    const pushSpinner = log.spinner()
    pushSpinner.start(`Pushing ${current} to origin...`)
    try {
      await execAsync(`git push -u origin ${current}`, true)
      pushSpinner.succeed(`Pushed ${current} to origin`)
    } catch {
      pushSpinner.fail('Failed to push')
      log.error('Could not push branch to remote.')
      log.info('Push manually and try again.')
      return
    }
  }

  // Create PR
  if (isDryRun()) {
    logDryRun(`GitHub API: Create PR "${prTitle}" (${current} → ${baseBranch})`)
    log.success('PR would be created (dry-run)')
    return
  }

  const prSpinner = log.spinner()
  prSpinner.start('Creating pull request...')

  const pr = await createPullRequest({
    owner: repoInfo.owner,
    repo: repoInfo.repo,
    title: prTitle,
    body: prBody,
    head: current,
    base: baseBranch,
    draft: isDraft === 'draft',
  })

  if (pr) {
    prSpinner.succeed('Pull request created!')
    console.log('')
    console.log(`  ${colors.green}#${pr.number}${colors.reset} ${pr.title}`)
    console.log(`  ${colors.cyan}${pr.html_url}${colors.reset}`)

    // Show clickable link
    console.log('')
    console.log(
      `  \u001B]8;;${pr.html_url}\u0007` +
        `${colors.cyan}Open in browser →${colors.reset}` +
        `\u001B]8;;\u0007`
    )
  } else {
    prSpinner.fail('Failed to create pull request')
  }
}
