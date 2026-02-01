/**
 * Gemini integration for AI-powered branch naming and commit messages
 */

import path from 'node:path'

import {
  generateBranchName as sdkGenerateBranchName,
  generateCommitMessage as sdkGenerateCommitMessage,
  getAvailableModelChoices as sdkGetAvailableModels,
  isAvailable as sdkIsAvailable,
} from './gemini-sdk.js'
import { log } from '../utils/logging.js'

// Supported models on Gemini
export type GeminiModel = string

/**
 * Return Gemini model choices from the SDK in realtime.
 * This deliberately does NOT read or write `.geeto/gemini-model.json`.
 */
export const getGeminiModels = async (): Promise<Array<{ label: string; value: GeminiModel }>> => {
  try {
    const ok = sdkIsAvailable()
    if (!ok) {
      log.info('Gemini SDK not available; returning no Gemini models.')
      return []
    }

    const live = await sdkGetAvailableModels()
    if (Array.isArray(live) && live.length > 0) {
      return live as Array<{ label: string; value: GeminiModel }>
    }
    return []
  } catch (error) {
    log.warn(`Failed to fetch live Gemini models: ${String(error)}`)
    return []
  }
}

/**
 * Generate branch name from title using Gemini SDK
 */
export const generateBranchName = async (
  text: string,
  correction?: string,
  model: GeminiModel = 'gemini-2.5-flash'
): Promise<string | null> => {
  try {
    const ok = sdkIsAvailable()
    if (!ok) {
      log.warn('Gemini SDK not available; install @google/genai to enable Gemini features.')
      return null
    }
    const sdkRes = await sdkGenerateBranchName(text, correction, model)
    if (!sdkRes) {
      return null
    }

    // Persist original provider response so the user can inspect the unmodified AI output.
    try {
      const fs = await import('node:fs/promises')
      const outDir = path.join(process.cwd(), '.geeto')
      await fs.mkdir(outDir, { recursive: true })
      const payload = {
        provider: 'gemini',
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
    log.warn('Gemini Error: ' + String(error))
    return null
  }
}

/**
 * Generate commit message from git diff using Gemini SDK
 */
export const generateCommitMessage = async (
  diff: string,
  correction?: string,
  model: GeminiModel = 'gemini-2.5-flash'
): Promise<string | null> => {
  try {
    const ok = sdkIsAvailable()
    if (!ok) {
      log.warn('Gemini SDK not available; install @google/genai to enable Gemini features.')
      return null
    }
    const sdkRes = await sdkGenerateCommitMessage(diff, correction, model)
    return sdkRes
  } catch (error) {
    log.warn('Gemini Error: ' + String(error))
    return null
  }
}
