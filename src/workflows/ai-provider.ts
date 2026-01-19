/**
 * AI Provider selection workflow - handles AI provider and model selection
 */

import type { FreeModel as OpenRouterFreeModel } from '../types'

import { confirm, select } from '../cli'
import { log } from '../utils'
import { getAIProviderDisplayName } from '../utils/git.js'

export const handleAIProviderSelection = async (): Promise<{
  aiProvider: 'gemini' | 'copilot' | 'openrouter'
  copilotModel?: 'claude-haiku-4.5' | 'gpt-5'
  openrouterModel?: OpenRouterFreeModel
}> => {
  let aiProvider: 'gemini' | 'copilot' | 'openrouter'
  let copilotModel: 'claude-haiku-4.5' | 'gpt-5' | undefined
  let openrouterModel: OpenRouterFreeModel | undefined

  // Choose AI Provider with model selection loop
  // eslint-disable-next-line no-constant-condition
  while (true) {
    aiProvider = (await select('Choose AI Provider for branch naming and commit messages:', [
      { label: 'Gemini AI (Free - Rate Limited)', value: 'gemini' },
      { label: 'GitHub Copilot (Requires Subscription)', value: 'copilot' },
      { label: 'OpenRouter (Requires Credits)', value: 'openrouter' },
    ])) as 'gemini' | 'copilot' | 'openrouter'

    log.info(`Selected AI Provider: ${getAIProviderDisplayName(aiProvider)}`)

    // Choose Copilot Model if Copilot is selected
    if (aiProvider === 'copilot') {
      // Setup GitHub Copilot CLI first
      const { ensureAIProvider } = await import('../core/setup.js')
      const copilotReady = await ensureAIProvider('copilot')
      if (!copilotReady) {
        log.warn('GitHub Copilot is not set up.')
        const setupChoice = await select('What would you like to do?', [
          { label: 'Setup GitHub Copilot now', value: 'setup' },
          { label: 'Use manual mode only', value: 'manual' },
          { label: 'Back to AI provider selection', value: 'back' },
        ])

        if (setupChoice === 'back') {
          continue // Go back to AI provider selection
        }

        if (setupChoice === 'setup') {
          // Try to setup again (this will show installation/auth prompts)
          const setupSuccess = await ensureAIProvider('copilot')
          if (!setupSuccess) {
            log.warn('GitHub Copilot setup failed.')
            const useManual = confirm('Continue with manual mode?')
            if (!useManual) {
              continue // Go back to AI provider selection
            }
            // Force manual mode
            aiProvider = 'gemini' // Use gemini as fallback for manual operations
            copilotModel = undefined
            break // Exit the loop with manual mode
          }
          // If setup successful, continue with Copilot model selection
        } else {
          // Chose manual mode
          aiProvider = 'gemini' // Use gemini as fallback for manual operations
          copilotModel = undefined
          break // Exit the loop with manual mode
        }
      }

      const modelChoice = (await select('Choose Copilot Model (cost-effective options):', [
        {
          label: 'Claude Haiku 4.5 (Fastest & Cheapest - ~$0.10 input, ~$0.30 output)',
          value: 'claude-haiku-4.5',
        },
        {
          label: 'GPT-5 (Balanced & Cost-Effective - ~$0.20 input, ~$0.60 output)',
          value: 'gpt-5',
        },
        { label: 'Back to AI Provider selection', value: 'back' },
      ])) as 'claude-haiku-4.5' | 'gpt-5' | 'back'

      if (modelChoice === 'back') {
        continue // Go back to AI provider selection
      }

      copilotModel = modelChoice
      log.info(`Selected Copilot Model: ${copilotModel}`)
    }

    // Choose OpenRouter Model if OpenRouter is selected
    if (aiProvider === 'openrouter') {
      // Setup OpenRouter first
      const { ensureAIProvider } = await import('../core/setup.js')
      const openrouterReady = await ensureAIProvider('openrouter')
      if (!openrouterReady) {
        log.warn('OpenRouter is not set up.')
        const setupChoice = await select('What would you like to do?', [
          { label: 'Setup OpenRouter now', value: 'setup' },
          { label: 'Use manual mode only', value: 'manual' },
          { label: 'Back to AI provider selection', value: 'back' },
        ])

        if (setupChoice === 'back') {
          continue // Go back to AI provider selection
        }

        if (setupChoice === 'setup') {
          // Try to setup again
          const setupSuccess = await ensureAIProvider('openrouter')
          if (!setupSuccess) {
            log.warn('OpenRouter setup failed.')
            const useManual = confirm('Continue with manual mode?')
            if (!useManual) {
              continue // Go back to AI provider selection
            }
            // Force manual mode
            aiProvider = 'gemini' // Use gemini as fallback for manual operations
            openrouterModel = undefined
            break // Exit the loop with manual mode
          }
          // If setup successful, continue with OpenRouter model selection
        } else {
          // Chose manual mode
          aiProvider = 'gemini' // Use gemini as fallback for manual operations
          openrouterModel = undefined
          break // Exit the loop with manual mode
        }
      }

      const modelChoice = (await select('Choose OpenRouter Model (cheapest options):', [
        {
          label: 'Olmo 3.1 32B (AllenAI - Cheapest: $0.20 input, $0.60 output)',
          value: 'allenai/olmo-3.1-32b-instruct',
        },
        {
          label: 'MiniMax M2.1 (MiniMax - $0.27 input, $1.12 output)',
          value: 'minimax/minimax-m2.1',
        },
        {
          label: 'Llama 3.2 3B (Meta - $0.15 input, $0.15 output)',
          value: 'meta-llama/llama-3.2-3b-instruct:free',
        },
        {
          label: 'Llama 3.1 8B (Meta - $0.22 input, $0.22 output)',
          value: 'meta-llama/llama-3.1-8b-instruct:free',
        },
        { label: 'Back to AI Provider selection', value: 'back' },
      ])) as OpenRouterFreeModel | 'back'

      if (modelChoice === 'back') {
        continue // Go back to AI provider selection
      }

      openrouterModel = modelChoice
      log.info(`Selected OpenRouter Model: ${openrouterModel}`)
    }

    // Setup the selected AI provider
    if (aiProvider === 'gemini') {
      const { ensureAIProvider } = await import('../core/setup.js')
      const geminiReady = await ensureAIProvider('gemini')
      if (!geminiReady) {
        log.warn('Gemini setup incomplete. You can continue, but AI features may not work.')
        const continueAnyway = confirm('Continue anyway?')
        if (!continueAnyway) {
          continue // Go back to AI provider selection
        }
      }
    }

    // If we get here, user has made their choice
    break
  }

  return { aiProvider, copilotModel, openrouterModel }
}
