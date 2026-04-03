/**
 * Copilot integration for AI-powered branch naming and commit messages
 */

import {
  generateBranchName as sdkGenerateBranchName,
  generateCommitMessage as sdkGenerateCommitMessage,
  generateReleaseNotes as sdkGenerateReleaseNotes,
  generateText as sdkGenerateText,
  getAvailableModelChoices as sdkGetAvailableModels,
  isAvailable as sdkIsAvailable,
} from './copilot-sdk.js'
import { saveAISuggestion } from '../utils/ai-provider-helpers.js'
import { log } from '../utils/logging.js'

// Supported models on Copilot
export type CopilotModel = string

/**
 * Return Copilot model choices from the SDK in realtime.
 * This deliberately does NOT read or write `.geeto/copilot-model.json`.
 */
export const getCopilotModels = async (): Promise<
  Array<{ label: string; value: CopilotModel }>
> => {
  try {
    const ok = await sdkIsAvailable()
    if (!ok) {
      log.info('Copilot SDK not available; returning no Copilot models.')
      return []
    }
    const live = await sdkGetAvailableModels()
    if (Array.isArray(live) && live.length > 0) {
      return live as Array<{ label: string; value: CopilotModel }>
    }
    return []
  } catch (error) {
    log.warn(`Failed to fetch live Copilot models: ${String(error)}`)
    return []
  }
}

/**
 * Generate branch name from title using Copilot SDK
 */
export const generateBranchName = async (
  text: string,
  correction?: string,
  model: CopilotModel = 'claude-haiku-4.5'
): Promise<string | null> => {
  try {
    const ok = await sdkIsAvailable()
    if (!ok) {
      log.warn('Copilot SDK not available; install @github/copilot-sdk to enable Copilot features.')
      return null
    }

    const sdkRes = await sdkGenerateBranchName(text, correction, model)
    if (!sdkRes) {
      return null
    }

    // Persist original provider response so the user can inspect the unmodified AI output.
    await saveAISuggestion('copilot', model, sdkRes)

    return sdkRes
  } catch (error) {
    log.clearLine()
    log.gap()
    log.warn('Copilot Error: ' + String(error))
    return null
  }
}

/**
 * Generate commit message from git diff using Copilot SDK
 */
export const generateCommitMessage = async (
  diff: string,
  correction?: string,
  model: CopilotModel = 'claude-haiku-4.5'
): Promise<string | null> => {
  try {
    const ok = await sdkIsAvailable()
    if (!ok) {
      log.warn('Copilot SDK not available; install @github/copilot-sdk to enable Copilot features.')
      return null
    }
    const sdkRes = await sdkGenerateCommitMessage(diff, correction, model)
    return sdkRes
  } catch (error) {
    log.clearLine()
    log.gap()
    log.warn('Copilot Error: ' + String(error))
    return null
  }
}

export const generateReleaseNotes = async (
  commits: string,
  language: 'en' | 'id',
  correction?: string,
  model: CopilotModel = 'claude-haiku-4.5'
): Promise<string | null> => {
  try {
    const ok = await sdkIsAvailable()
    if (!ok) {
      log.warn('Copilot SDK not available; install @github/copilot-sdk to enable Copilot features.')
      return null
    }
    return await sdkGenerateReleaseNotes(commits, language, correction, model)
  } catch (error) {
    log.clearLine()
    log.gap()
    log.warn('Copilot Error: ' + String(error))
    return null
  }
}

export const generateText = async (
  prompt: string,
  model: CopilotModel = 'claude-haiku-4.5'
): Promise<string | null> => {
  try {
    const ok = await sdkIsAvailable()
    if (!ok) return null
    return await sdkGenerateText(prompt, model)
  } catch (error) {
    log.warn('Copilot Error: ' + String(error))
    return null
  }
}
