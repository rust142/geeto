/**
 * AI Provider selection workflow - handles AI provider and model selection
 */

import type { CopilotModel } from '../api/copilot.js'
import type { GeminiModel } from '../api/gemini.js'
import type { OpenRouterModel } from '../api/openrouter.js'

// SelectOption type previously used for model lists; not needed after refactor

import { select } from '../cli/menu.js'
import { chooseModelForProvider } from '../utils/git-ai.js'

export const handleAIProviderSelection = async (): Promise<{
  aiProvider: 'gemini' | 'copilot' | 'openrouter' | 'manual'
  copilotModel?: CopilotModel
  openrouterModel?: OpenRouterModel
  geminiModel?: GeminiModel
}> => {
  let aiProvider: 'gemini' | 'copilot' | 'openrouter' | 'manual'
  let copilotModel: CopilotModel | undefined
  let openrouterModel: OpenRouterModel | undefined
  let geminiModel: GeminiModel | undefined

  // AI provider selection loop
  while (true) {
    aiProvider = (await select('Choose AI Provider for branch naming and commit messages:', [
      { label: 'Gemini', value: 'gemini' },
      { label: 'GitHub (Recommended)', value: 'copilot' },
      { label: 'OpenRouter', value: 'openrouter' },
      { label: 'Manual', value: 'manual' },
    ])) as 'gemini' | 'copilot' | 'openrouter' | 'manual'

    // Setup the selected AI provider using centralized helper where possible
    if (aiProvider === 'manual') {
      // No model selection required; proceed
      break
    }

    const chosen = await chooseModelForProvider(
      aiProvider as 'gemini' | 'copilot' | 'openrouter',
      undefined,
      'Back to AI provider menu'
    )
    if (!chosen) {
      // setup failed or was cancelled; re-run provider selection
      continue
    }
    if (chosen === 'back') {
      continue
    }

    // Assign chosen model to the appropriate variable
    switch (aiProvider) {
      case 'gemini': {
        geminiModel = chosen as GeminiModel

        break
      }
      case 'copilot': {
        copilotModel = chosen as CopilotModel
        console.log('')

        break
      }
      case 'openrouter': {
        openrouterModel = chosen as OpenRouterModel

        break
      }
      // No default
    }

    // If we get here, user has made their choice
    break
  }

  return { aiProvider, copilotModel, openrouterModel, geminiModel }
}
