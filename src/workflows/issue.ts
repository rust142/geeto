/**
 * Create GitHub Issue workflow
 * Interactive issue creation from CLI
 */

import type { CopilotModel } from '../api/copilot.js'
import type { GeminiModel } from '../api/gemini.js'
import type { OpenRouterModel } from '../api/openrouter.js'

import { createIssue, listLabels, parseRepoFromUrl } from '../api/github.js'
import { askMultiline, askQuestion, confirm, editInline } from '../cli/input.js'
import { multiSelect, select } from '../cli/menu.js'
import { setupGithubConfigInteractive } from '../core/github-setup.js'
import { colors } from '../utils/colors.js'
import { DEFAULT_GEMINI_MODEL, hasGithubConfig } from '../utils/config.js'
import { isDryRun, logDryRun } from '../utils/dry-run.js'
import { execSilent } from '../utils/exec.js'
import { generateTextWithProvider, getAIProviderShortName } from '../utils/git-ai.js'
import { log } from '../utils/logging.js'
import { loadState, saveState } from '../utils/state.js'

/**
 * Format a markdown line for terminal preview display
 */
const formatMdLine = (line: string): string => {
  const trimmed = line.trimStart()
  if (trimmed.startsWith('### ')) {
    return `  ${colors.bright}${trimmed.slice(4)}${colors.reset}`
  }
  if (trimmed.startsWith('## ')) {
    return `  ${colors.cyan}${colors.bright}${trimmed.slice(3)}${colors.reset}`
  }
  if (trimmed.startsWith('- ')) {
    return `    ${trimmed}`
  }
  if (!trimmed) return ''
  return `  ${colors.gray}${trimmed}${colors.reset}`
}

/**
 * Call AI to generate an issue title and body from a brief description
 */
const callAIForIssue = async (
  description: string,
  provider: 'copilot' | 'gemini' | 'openrouter',
  model: string | undefined,
  correction?: string
): Promise<{ title: string; body: string } | null> => {
  const promptBase = [
    'Generate a GitHub Issue title and body from this description.',
    'IMPORTANT: Always write in English regardless of the input language.',
    'Output ONLY in this exact format (no extra markers):',
    '',
    'TITLE: <concise issue title, max 72 chars>',
    '',
    'BODY:',
    '## Description',
    '<clear description of the issue>',
    '',
    '## Expected Behavior / Goal',
    '<what should happen or what is the goal>',
    '',
    '## Additional Context',
    '<any relevant details>',
    '',
    `User description:\n${description}`,
  ].join('\n')

  const prompt = correction ? `${promptBase}\n\nAdjustment: ${correction}` : promptBase

  const providerName = getAIProviderShortName(provider)
  const modelDisplay = model ? ` (${model})` : ''

  const spinner = log.spinner()
  spinner.start(`Generating issue with ${providerName}${modelDisplay}...`)

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

  const titleMatch = result.match(/TITLE:\s*(.+)/i)
  const bodyMatch = result.match(/BODY:\s*([\s\S]+)/i)

  const title = titleMatch?.[1]?.trim() ?? ''
  const body = bodyMatch?.[1]?.trim() ?? result.trim()

  return { title: title || 'Untitled Issue', body }
}

/**
 * Show AI issue preview in terminal
 */
const showAIIssuePreview = (title: string, body: string): void => {
  log.ai('Suggested Issue:\n')
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
 * Update model in state and persist
 */
const updateModelInState = (
  state: ReturnType<typeof loadState>,
  provider: 'copilot' | 'gemini' | 'openrouter',
  model: string
): void => {
  if (!state) return
  if (provider === 'copilot') state.copilotModel = model
  else if (provider === 'openrouter') state.openrouterModel = model
  else state.geminiModel = model
  saveState(state)
}

/**
 * Interactive Create Issue workflow
 */
export const handleCreateIssue = async (): Promise<void> => {
  log.banner()
  log.step(`${colors.cyan}Create GitHub Issue${colors.reset}\n`)

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

  log.info(`Repo: ${colors.cyan}${repoInfo.owner}/${repoInfo.repo}${colors.reset}`)

  // Issue content generation
  let title = ''
  let body = ''
  let aiUsed = false

  // Try AI generation if provider is configured
  aiBlock: {
    const state = loadState()
    let aiProvider =
      state?.aiProvider && state.aiProvider !== 'manual'
        ? state.aiProvider
        : (null as 'copilot' | 'gemini' | 'openrouter' | null)

    if (!aiProvider) break aiBlock

    let currentModel = getModelForProvider(aiProvider, state)
    const providerLabel = getAIProviderShortName(aiProvider)
    const modelLabel = currentModel ? ` (${currentModel})` : ''

    const useAI = confirm(`Use ${providerLabel}${modelLabel} for issue? (recommended)`)
    if (!useAI) break aiBlock

    aiUsed = true

    if (process.stdin.isTTY) process.stdin.setRawMode(false)
    const description = askMultiline('Brief description for AI: ', '')
    if (!description) {
      log.warn('No description provided. Falling back to manual.')
      aiUsed = false
      break aiBlock
    }

    console.log('')
    let correction = ''
    let aiDone = false

    while (!aiDone) {
      const aiResult = await callAIForIssue(description, aiProvider, currentModel, correction)

      if (!aiResult) {
        log.warn('AI failed. Falling back to manual.')
        aiUsed = false
        break
      }

      title = aiResult.title
      body = aiResult.body
      showAIIssuePreview(title, body)

      const action = await select('Accept this issue content?', [
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
          const editedBody = await editInline(body, 'Edit issue body:', 'md')
          if (editedBody !== null) body = editedBody
          if (process.stdin.isTTY) process.stdin.setRawMode(false)
          const editedTitle = askQuestion('Edit title (Enter to keep): ').trim()
          if (editedTitle) title = editedTitle
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
            { label: 'Copilot', value: 'copilot' },
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
          title = ''
          body = ''
          aiUsed = false
          aiDone = true
          break
        }
      }
    }
  }

  // Manual fallback (or if AI was discarded/failed)
  if (!title) {
    if (process.stdin.isTTY) process.stdin.setRawMode(false)
    title = askQuestion('Issue title: ').trim()
    if (!title) {
      log.error('Title is required.')
      return
    }
  }

  if (!body && !aiUsed) {
    console.log('')
    const bodyChoice = await select('Issue description:', [
      { label: 'Write description', value: 'write' },
      { label: 'Edit inline (markdown)', value: 'inline' },
      { label: 'Use template (Bug Report)', value: 'bug' },
      { label: 'Use template (Feature Request)', value: 'feature' },
      { label: 'Empty (no description)', value: 'empty' },
    ])

    switch (bodyChoice) {
      case 'write': {
        if (process.stdin.isTTY) process.stdin.setRawMode(false)
        body = askQuestion('Description: ').trim()
        break
      }
      case 'inline': {
        const edited = await editInline('', 'Enter issue description', 'md')
        if (edited !== null) body = edited
        break
      }
      case 'bug': {
        body = [
          '## Bug Report',
          '',
          '### Description',
          'A clear description of what the bug is.',
          '',
          '### Steps to Reproduce',
          '1. ',
          '2. ',
          '3. ',
          '',
          '### Expected Behavior',
          '',
          '',
          '### Actual Behavior',
          '',
          '',
          '### Environment',
          `- OS: ${process.platform}`,
          `- Node: ${process.version}`,
        ].join('\n')
        log.info('Bug report template applied. Edit in GitHub after creation.')
        break
      }
      case 'feature': {
        body = [
          '## Feature Request',
          '',
          '### Description',
          'A clear description of the feature you want.',
          '',
          '### Motivation',
          'Why is this feature needed?',
          '',
          '### Proposed Solution',
          '',
          '',
          '### Alternatives Considered',
          '',
        ].join('\n')
        log.info('Feature request template applied. Edit in GitHub after creation.')
        break
      }
      default: {
        body = ''
        break
      }
    }
  }

  // Labels
  console.log('')
  const spinner = log.spinner()
  spinner.start('Fetching labels...')
  const labels = await listLabels(repoInfo.owner, repoInfo.repo)
  spinner.stop()

  let selectedLabels: string[] = []

  if (labels.length > 0) {
    const labelOptions = labels.map((l) => ({
      label: `${l.name}${l.description ? ` ${colors.gray}— ${l.description}${colors.reset}` : ''}`,
      value: l.name,
    }))

    selectedLabels = await multiSelect('Add labels (optional):', labelOptions)
  }

  // Assignees
  console.log('')
  const assignChoice = await select('Assign to:', [
    { label: 'No one', value: 'none' },
    { label: 'Me (repo owner)', value: 'me' },
    { label: 'Custom username', value: 'custom' },
  ])

  let assignees: string[] = []
  switch (assignChoice) {
    case 'me': {
      assignees = [repoInfo.owner]
      break
    }
    case 'custom': {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false)
      }
      const username = askQuestion('GitHub username: ').trim()
      if (username) assignees = [username]
      break
    }
    default: {
      break
    }
  }

  // Summary
  console.log('')
  console.log(`${colors.cyan}┌──────────────────────────────────────────────┐${colors.reset}`)
  console.log(`${colors.cyan}│${colors.reset} ${colors.bright}Issue Summary${colors.reset}`)
  console.log(`${colors.cyan}├──────────────────────────────────────────────┤${colors.reset}`)
  console.log(`${colors.cyan}│${colors.reset} Title: ${colors.bright}${title}${colors.reset}`)
  if (body) {
    const bodyPreview = body.length > 50 ? body.slice(0, 50) + '...' : body
    const cleanPreview = bodyPreview.replaceAll('\n', ' ')
    console.log(`${colors.cyan}│${colors.reset} Body: ${colors.gray}${cleanPreview}${colors.reset}`)
  }
  if (selectedLabels.length > 0) {
    console.log(
      `${colors.cyan}│${colors.reset} Labels: ${colors.yellow}${selectedLabels.join(', ')}${colors.reset}`
    )
  }
  if (assignees.length > 0) {
    console.log(
      `${colors.cyan}│${colors.reset} Assignee: ${colors.green}${assignees.join(', ')}${colors.reset}`
    )
  }
  console.log(`${colors.cyan}└──────────────────────────────────────────────┘${colors.reset}`)

  console.log('')
  const proceed = confirm('Create this issue?')
  if (!proceed) {
    log.info('Cancelled.')
    return
  }
  console.log('')

  // Create Issue
  if (isDryRun()) {
    logDryRun(`GitHub API: Create issue "${title}"`)
    log.success('Issue would be created (dry-run)')
    return
  }

  const issueSpinner = log.spinner()
  issueSpinner.start('Creating issue...')

  const issue = await createIssue({
    owner: repoInfo.owner,
    repo: repoInfo.repo,
    title,
    body,
    labels: selectedLabels,
    assignees,
  })

  if (issue) {
    issueSpinner.succeed('Issue created!')
    console.log('')
    console.log(`  ${colors.green}#${issue.number}${colors.reset} ${issue.title}`)
    console.log(`  ${colors.cyan}${issue.html_url}${colors.reset}`)

    // OSC 8 clickable link
    console.log('')
    console.log(
      `  \u001B]8;;${issue.html_url}\u0007` +
        `${colors.cyan}Open in browser →${colors.reset}` +
        `\u001B]8;;\u0007`
    )
  } else {
    issueSpinner.fail('Failed to create issue')
  }
}
