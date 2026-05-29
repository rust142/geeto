/**
 * Create Issue workflow — supports GitHub and GitLab
 * Interactive issue creation from CLI
 */

import type { CopilotModel } from '../api/copilot.js'
import type { GeminiModel } from '../api/gemini.js'
import type { OpenRouterModel } from '../api/openrouter.js'

import { getPlatformAPI } from '../api/platform.js'
import { askQuestion, confirm, editMultiline } from '../cli/input.js'
import { multiSelect, select } from '../cli/menu.js'
import { getModelForProvider, showAIPreview, updateModelInState } from '../utils/ai-workflow.js'
import { colors } from '../utils/colors.js'
import { isDryRun, logDryRun } from '../utils/dry-run.js'
import { generateTextWithProvider, getAIProviderShortName } from '../utils/git-ai.js'
import { getPlatformRepoFromRemote, validatePlatformConfig } from '../utils/github-helpers.js'
import { log } from '../utils/logging.js'
import { loadPrompt } from '../utils/prompt-loader.js'
import { loadState } from '../utils/state.js'

/**
 * Call AI to generate an issue title and body from a brief description
 */
const callAIForIssue = async (
  description: string,
  provider: 'copilot' | 'gemini' | 'openrouter' | 'groq',
  model: string | undefined,
  correction?: string
): Promise<{ title: string; body: string } | null> => {
  const promptBase = loadPrompt('issue-prompt.md') + `\n\nUser description:\n${description}`

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
 * Interactive Create Issue workflow
 */
export const handleCreateIssue = async (): Promise<void> => {
  log.banner()
  // Detect platform and resolve repo info
  const platformRepo = getPlatformRepoFromRemote()
  if (!platformRepo) return

  const platformLabel = platformRepo.platform === 'github' ? 'GitHub' : 'GitLab'
  log.step(`${colors.cyan}Create ${platformLabel} Issue${colors.reset}\n`)

  if (!validatePlatformConfig(platformRepo.platform)) return

  const api = getPlatformAPI(platformRepo.platform)

  log.info(`Repo: ${colors.cyan}${platformRepo.owner}/${platformRepo.repo}${colors.reset}`)

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
    const description = await editMultiline('Brief description for AI: ', '')
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
      showAIPreview('Issue', title, body)

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
          const editedBody = await editMultiline('Edit issue body:', body)
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
            { label: 'GitHub Copilot', value: 'copilot' },
            { label: 'OpenRouter', value: 'openrouter' },
            { label: 'Groq', value: 'groq' },
            { label: 'Back', value: 'back' },
          ])
          if (prov !== 'back') {
            const { chooseModelForProvider } = await import('../utils/git-ai.js')
            const chosen = await chooseModelForProvider(
              prov as 'gemini' | 'copilot' | 'openrouter' | 'groq',
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
        const edited = await editMultiline('Enter issue description', '')
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
        log.info(`Bug report template applied. Edit in ${platformLabel} after creation.`)
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
        log.info(`Feature request template applied. Edit in ${platformLabel} after creation.`)
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
  const labels = await api.listLabels(
    platformRepo.projectPath,
    platformRepo.owner,
    platformRepo.repo
  )
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
      assignees = [platformRepo.owner]
      break
    }
    case 'custom': {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false)
      }
      const username = askQuestion(`${platformLabel} username: `).trim()
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
    logDryRun(`${platformLabel} API: Create issue "${title}"`)
    log.success('Issue would be created (dry-run)')
    return
  }

  const issueSpinner = log.spinner()
  issueSpinner.start('Creating issue...')

  const issue = await api.createIssue({
    projectPath: platformRepo.projectPath,
    title,
    body,
    labels: selectedLabels,
    assignees,
    owner: platformRepo.owner,
    repo: platformRepo.repo,
  })

  if (issue) {
    issueSpinner.succeed('Issue created!')
    console.log('')
    console.log(`  ${colors.green}#${issue.number}${colors.reset} ${issue.title}`)
    console.log(`  ${colors.cyan}${issue.url}${colors.reset}`)

    // OSC 8 clickable link
    console.log('')
    console.log(
      `  \u001B]8;;${issue.url}\u0007` +
        `${colors.cyan}Open in browser →${colors.reset}` +
        `\u001B]8;;\u0007`
    )
  } else {
    issueSpinner.fail('Failed to create issue')
  }
}
