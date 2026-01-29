/**
 * GitHub Copilot integration for AI-powered branch naming and commit messages
 */

import { log } from '../utils/logging.js'
import {
  generateBranchName as sdkGenerateBranchName,
  generateCommitMessage as sdkGenerateCommitMessage,
  isAvailable as sdkIsAvailable,
  getAvailableModelChoices as sdkGetAvailableModels,
} from './copilot-sdk.js'

// Supported models on GitHub Copilot
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
 * Generate branch name from title using GitHub Copilot SDK
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
    try {
      const fs = await import('node:fs/promises')
      const pathMod = await import('node:path')
      const path = pathMod.default || pathMod
      const outDir = path.join(process.cwd(), '.geeto')
      await fs.mkdir(outDir, { recursive: true })
      const payload = {
        provider: 'copilot',
        model,
        raw: sdkRes,
        cleaned: sdkRes,
        timestamp: new Date().toISOString(),
      }
      await fs.writeFile(
        path.join(outDir, 'last-ai-suggestion.json'),
        JSON.stringify(payload, null, 2)
      )
    } catch {
      /* ignore file write failures */
    }

    return sdkRes
  } catch (error) {
    log.warn('Copilot Error: ' + String(error))
    return null
  }
}

/**
 * Generate commit message from git diff using GitHub Copilot SDK
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
    log.warn('Copilot Error: ' + String(error))
    return null
  }
}
