/**
 * Create Pull Request / Merge Request workflow
 * Push current branch & create a PR on GitHub or MR on GitLab
 */

import type { CopilotModel } from '../api/copilot.js'
import type { GeminiModel } from '../api/gemini.js'
import type { OpenRouterModel } from '../api/openrouter.js'

import { getPlatformAPI } from '../api/platform.js'
import { askQuestion, confirm, editInline } from '../cli/input.js'
import { select } from '../cli/menu.js'
import { getModelForProvider, showAIPreview, updateModelInState } from '../utils/ai-workflow.js'
import { colors } from '../utils/colors.js'
import { isDryRun, logDryRun } from '../utils/dry-run.js'
import { execAsync, execSilent } from '../utils/exec.js'
import { generateTextWithProvider, getAIProviderShortName } from '../utils/git-ai.js'
import { getCurrentBranch } from '../utils/git.js'
import { getPlatformRepoFromRemote, validatePlatformConfig } from '../utils/github-helpers.js'
import { log } from '../utils/logging.js'
import { loadPrompt } from '../utils/prompt-loader.js'
import { loadState } from '../utils/state.js'

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
    loadPrompt('pr-prompt.md'),
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
    result = await generateTextWithProvider(
      provider,
      prompt,
      model as CopilotModel,
      model as OpenRouterModel,
      (model as GeminiModel) ?? 'gemini-2.5-flash'
    )
    spinner.stop()
  } catch {
    spinner.fail('AI generation failed')
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
 * Interactive Create PR workflow
 */
export const handleCreatePR = async (): Promise<void> => {
  log.banner()

  // Detect platform & resolve repo info from remote
  const platformRepo = getPlatformRepoFromRemote()
  if (!platformRepo) return
  if (!validatePlatformConfig(platformRepo.platform)) return
  const api = getPlatformAPI(platformRepo.platform)

  const prLabel = platformRepo.platform === 'gitlab' ? 'MR' : 'PR'
  const prLabelFull = platformRepo.platform === 'gitlab' ? 'Merge Request' : 'Pull Request'

  log.step(`${colors.cyan}Create ${prLabelFull}${colors.reset}\n`)

  const current = getCurrentBranch()
  log.info(`Repo: ${colors.cyan}${platformRepo.owner}/${platformRepo.repo}${colors.reset}`)
  log.info(`Branch: ${colors.green}${current}${colors.reset}\n`)

  // Check for existing PR/MR
  const spinner = log.spinner()
  spinner.start(`Checking for existing ${prLabel}s...`)
  const existingPRs = await api.listPRs(
    platformRepo.projectPath,
    current,
    platformRepo.owner,
    platformRepo.repo
  )
  spinner.stop()

  if (existingPRs.length > 0) {
    const pr = existingPRs[0]
    if (pr) {
      log.warn(`An open ${prLabel} already exists for this branch:`)
      console.log(`  ${colors.cyan}#${pr.number}${colors.reset} ${pr.title}`)
      console.log(`  ${colors.gray}${pr.url}${colors.reset}\n`)

      const cont = confirm(`Create another ${prLabel} anyway?`)
      if (!cont) return
      console.log('')
    }
  }

  // Get default branch for base
  spinner.start('Fetching repo info...')
  const defaultBranch = await api.getDefaultBranch(
    platformRepo.projectPath,
    platformRepo.owner,
    platformRepo.repo
  )
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

    const useAI = confirm(`Use ${providerLabel}${modelLabel} for ${prLabel}? (recommended)`)
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
      showAIPreview(prLabel, prTitle, prBody)
      log.info('Incorrect? check .geeto/last-ai-suggestion.json (possible AI/context limit).')

      const action = await select(`Accept this ${prLabel} content?`, [
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
          const editedBody = await editInline(prBody, `Edit ${prLabel} Body`, '.md')
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
    const customTitle = askQuestion(`${prLabel} title (Enter to use suggested): `).trim()
    prTitle = customTitle || defaultTitle
  }

  if (!prBody && !aiUsed) {
    console.log('')
    if (commits.length > 0) {
      const bodyChoice = await select(`${prLabel} description:`, [
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
          const edited = await editInline('', `${prLabel} Description`, '.md')
          prBody = edited?.trim() ?? ''
          break
        }
        default: {
          prBody = ''
          break
        }
      }
    } else {
      const edited = await editInline('', `${prLabel} Description`, '.md')
      prBody = edited?.trim() ?? ''
    }
  }

  // Draft?
  console.log('')
  const isDraft = await select(`${prLabel} type:`, [
    { label: 'Ready for review', value: 'ready' },
    { label: 'Draft', value: 'draft' },
  ])

  // Summary
  console.log('')
  console.log(`${colors.cyan}┌──────────────────────────────────────────────┐${colors.reset}`)
  console.log(
    `${colors.cyan}│${colors.reset} ` + `${colors.bright}${prLabel} Summary${colors.reset}`
  )
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
  const proceed = confirm(`Create this ${prLabel}?`)
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
    const platformName = platformRepo.platform === 'gitlab' ? 'GitLab' : 'GitHub'
    logDryRun(`${platformName} API: Create ${prLabel} "${prTitle}" (${current} → ${baseBranch})`)
    log.success(`${prLabel} would be created (dry-run)`)
    return
  }

  const prSpinner = log.spinner()
  prSpinner.start(`Creating ${prLabelFull.toLowerCase()}...`)

  const pr = await api.createPR({
    projectPath: platformRepo.projectPath,
    title: prTitle,
    body: prBody,
    sourceBranch: current,
    targetBranch: baseBranch,
    draft: isDraft === 'draft',
    owner: platformRepo.owner,
    repo: platformRepo.repo,
  })

  if (pr) {
    prSpinner.succeed(`${prLabelFull} created!`)
    console.log('')
    console.log(`  ${colors.green}#${pr.number}${colors.reset} ${pr.title}`)
    console.log(`  ${colors.cyan}${pr.url}${colors.reset}`)

    // Show clickable link
    console.log('')
    console.log(
      `  \u001B]8;;${pr.url}\u0007` +
        `${colors.cyan}Open in browser →${colors.reset}` +
        `\u001B]8;;\u0007`
    )
  } else {
    prSpinner.fail(`Failed to create ${prLabelFull.toLowerCase()}`)
  }
}
