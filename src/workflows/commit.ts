/**
 * Commit workflow - handles commit-related operations
 */

import type { GeetoState } from '../types'

import { generateCommitMessage as generateCommitMessageCopilot } from '../api/copilot'
import { generateCommitMessage as generateCommitMessageOpenRouter } from '../api/openrouter'
import { askQuestion, confirm, select } from '../cli'
import { exec, execSilent, log } from '../utils'
import { getAIProviderDisplayName } from '../utils/git'

export const getCommitTypes = () => [
  { label: 'feat     - New feature', value: 'feat' },
  { label: 'fix      - Bug fix', value: 'fix' },
  { label: 'docs     - Documentation', value: 'docs' },
  { label: 'style    - Code style changes', value: 'style' },
  { label: 'refactor - Code refactoring', value: 'refactor' },
  { label: 'test     - Testing', value: 'test' },
  { label: 'chore    - Maintenance', value: 'chore' },
  { label: 'perf     - Performance improvement', value: 'perf' },
  { label: 'ci       - CI/CD changes', value: 'ci' },
  { label: 'build    - Build system changes', value: 'build' },
  { label: 'revert   - Revert changes', value: 'revert' },
  { label: 'cancel', value: 'cancel' },
]

export const getDefaultCommitTool = (aiProvider: 'gemini' | 'copilot' | 'openrouter'): string => {
  switch (aiProvider) {
    case 'gemini': {
      return 'gemini'
    }
    case 'copilot': {
      return 'copilot'
    }
    case 'openrouter': {
      return 'openrouter'
    }
    default: {
      return 'manual'
    }
  }
}

export const handleCommitWorkflow = async (state: GeetoState): Promise<boolean> => {
  log.step('Step 3: Commit')

  // Auto-select commit tool based on chosen AI provider
  const aiProvider = state.aiProvider ?? 'gemini'
  let selectedTool = getDefaultCommitTool(aiProvider)

  // Allow user to override if they want
  const useAutoTool = confirm(
    `Use ${getAIProviderDisplayName(aiProvider)} for commit? (recommended)`
  )
  if (!useAutoTool) {
    const aiTools = [
      { label: 'Gemini API (Free - Rate Limited)', value: 'gemini' },
      { label: 'GitHub Copilot (Requires Subscription)', value: 'copilot' },
      { label: 'OpenRouter (Requires Credits)', value: 'openrouter' },
      { label: 'Manual commit', value: 'manual' },
    ]
    selectedTool = await select('Choose commit method:', aiTools)
  }

  let commitSuccess = false

  if (selectedTool === 'gemini') {
    log.ai('Running Gemini API...')

    // Ensure Gemini is still properly configured
    const { ensureAIProvider } = await import('../core/setup.js')
    const geminiReady = await ensureAIProvider('gemini')
    if (!geminiReady) {
      log.warn('Gemini API setup issues detected!')
      const fixSetup = confirm('Fix Gemini API setup now?')
      if (fixSetup) {
        const setupSuccess = await ensureAIProvider('gemini')
        if (!setupSuccess) {
          log.warn('Could not fix Gemini API setup. Falling back to manual commit.')
          selectedTool = 'manual'
        }
      } else {
        log.warn('Gemini API not available. Falling back to manual commit.')
        selectedTool = 'manual'
      }
    }

    try {
      exec('geminicommit -y')
      log.success('Committed with geminicommit')
      commitSuccess = true
    } catch {
      log.warn('Gemini API commit failed! Choose another method...')
    }
  }

  if (selectedTool === 'copilot') {
    log.ai('Running GitHub Copilot commit...')

    // Ensure GitHub Copilot is still properly configured
    const { ensureAIProvider } = await import('../core/setup.js')
    const copilotReady = await ensureAIProvider('copilot')
    if (!copilotReady) {
      log.warn('GitHub Copilot setup issues detected!')
      const fixSetup = confirm('Fix GitHub Copilot setup now?')
      if (fixSetup) {
        const setupSuccess = await ensureAIProvider('copilot')
        if (!setupSuccess) {
          log.warn('Could not fix GitHub Copilot setup. Falling back to manual commit.')
          selectedTool = 'manual'
        }
      } else {
        log.warn('GitHub Copilot not available. Falling back to manual commit.')
        selectedTool = 'manual'
      }
    }

    // Use GitHub Copilot to generate commit message
    try {
      log.info('Analyzing staged changes with GitHub Copilot...')

      // Get diff summary for Copilot
      const diffSummary = execSilent('git diff --cached --stat')
      const commitMessage = await generateCommitMessageCopilot(
        diffSummary,
        undefined,
        state.copilotModel
      )

      if (commitMessage) {
        const useSuggestion = confirm(`Use Copilot suggestion: "${commitMessage}"?`)
        if (useSuggestion) {
          exec(`git commit -m "${commitMessage}"`)
          log.success('Committed with GitHub Copilot')
          commitSuccess = true
        }
      } else {
        log.warn('Could not generate commit message from Copilot')
      }
    } catch {
      log.warn('GitHub Copilot commit failed')
    }
  }

  if (selectedTool === 'openrouter') {
    log.ai('Running OpenRouter commit...')

    // Ensure OpenRouter is still properly configured
    const { ensureAIProvider } = await import('../core/setup.js')
    const openrouterReady = await ensureAIProvider('openrouter')
    if (!openrouterReady) {
      log.warn('OpenRouter setup issues detected!')
      const fixSetup = confirm('Fix OpenRouter setup now?')
      if (fixSetup) {
        const setupSuccess = await ensureAIProvider('openrouter')
        if (!setupSuccess) {
          log.warn('Could not fix OpenRouter setup. Falling back to manual commit.')
          selectedTool = 'manual'
        }
      } else {
        log.warn('OpenRouter not available. Falling back to manual commit.')
        selectedTool = 'manual'
      }
    }

    // Use OpenRouter to generate commit message
    try {
      log.info('Analyzing staged changes with OpenRouter...')

      // Get diff summary for OpenRouter
      const diffSummary = execSilent('git diff --cached --stat')
      const commitMessage = await generateCommitMessageOpenRouter(
        diffSummary,
        undefined,
        state.openrouterModel
      )

      if (commitMessage) {
        const useSuggestion = confirm(`Use OpenRouter suggestion: "${commitMessage}"?`)
        if (useSuggestion) {
          exec(`git commit -m "${commitMessage}"`)
          log.success('Committed with OpenRouter')
          commitSuccess = true
        }
      } else {
        log.warn('Could not generate commit message from OpenRouter')
      }
    } catch {
      log.warn('OpenRouter commit failed')
    }
  }

  if (!commitSuccess || selectedTool === 'manual') {
    const commitType = await select('Select commit type:', getCommitTypes())

    if (commitType === 'cancel') {
      log.warn('Commit cancelled.')
      process.exit(0)
    }

    const scope = askQuestion('Scope (optional, press Enter to skip): ').trim()
    let description = ''

    while (!description) {
      description = askQuestion('Commit message: ').trim()
      if (!description) {
        log.error('Commit message cannot be empty!')
      }
    }

    const commitMsg = scope
      ? `${commitType}(${scope}): ${description}`
      : `${commitType}: ${description}`

    try {
      exec(`git commit -m "${commitMsg}"`)
      log.success(`Committed: ${commitMsg}`)
    } catch {
      log.error('Commit failed!')
      process.exit(1)
    }
  }

  return true
}
