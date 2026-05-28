import type { CopilotModel } from '../api/copilot.js'
import type { GeminiModel } from '../api/gemini.js'
import type { OpenRouterModel } from '../api/openrouter.js'

import { colors } from './colors.js'
import { DEFAULT_GEMINI_MODEL } from './config.js'
import { log } from './logging.js'
import { loadState, saveState } from './state.js'

/**
 * Get the persisted model name for the given AI provider.
 */
export const getModelForProvider = (
  provider: 'copilot' | 'gemini' | 'openrouter' | 'groq',
  state: ReturnType<typeof loadState>
): string | undefined => {
  if (provider === 'copilot') return state?.copilotModel
  if (provider === 'openrouter') return state?.openrouterModel
  if (provider === 'groq') return state?.groqModel
  return state?.geminiModel ?? DEFAULT_GEMINI_MODEL
}

/**
 * Update the AI model selection in the persisted workflow state.
 */
export const updateModelInState = (
  state: ReturnType<typeof loadState>,
  provider: 'copilot' | 'gemini' | 'openrouter' | 'groq',
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
    case 'groq': {
      state.groqModel = model
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
 * Format a single markdown line for terminal display.
 */
export const formatMdLine = (line: string): string => {
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
 * Display an AI-generated preview (PR description, issue body, etc.) in the terminal.
 */
export const showAIPreview = (label: string, title: string, body: string): void => {
  log.ai(`Suggested ${label}:\n`)
  console.log(`  ${colors.cyan}${colors.bright}${title}${colors.reset}\n`)
  for (const line of body.split('\n')) {
    console.log(formatMdLine(line))
  }
  console.log('')
}
