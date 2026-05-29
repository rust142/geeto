/**
 * Gemini integration for AI-powered branch naming and commit messages
 */

import {
  generateBranchName as sdkGenerateBranchName,
  generateCommitMessage as sdkGenerateCommitMessage,
  generateReleaseNotes as sdkGenerateReleaseNotes,
  generateText as sdkGenerateText,
  getAvailableModelChoices as sdkGetAvailableModels,
  isAvailable as sdkIsAvailable,
} from './gemini-sdk.js'
import { saveAISuggestion } from '../utils/ai-provider-helpers.js'
import { resolveConfigPath } from '../utils/config.js'
import { log } from '../utils/logging.js'

// Supported models on Gemini
export type GeminiModel = string

/**
 * Return Gemini model choices.
 * Checks `.geeto/gemini-model.json` (user favorites) first, then falls back to live SDK.
 */
export const getGeminiModels = async (): Promise<Array<{ label: string; value: GeminiModel }>> => {
  try {
    // Check persisted favorites first
    const fs = await import('node:fs')
    const cfgPath = resolveConfigPath('gemini-model.json')
    if (fs.existsSync(cfgPath)) {
      try {
        const raw = fs.readFileSync(cfgPath, 'utf8')
        const parsed = JSON.parse(raw) as Array<{ label?: string; value?: string }>
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((p) => ({
            label: p.label ?? String(p.value),
            value: String(p.value),
          }))
        }
      } catch (error) {
        log.warn(`Could not read .geeto/gemini-model.json: ${(error as Error).message}`)
      }
    }

    // Fallback to live SDK
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
    log.warn(`Failed to fetch Gemini models: ${String(error)}`)
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
    await saveAISuggestion('gemini', model, sdkRes)

    return sdkRes
  } catch (error) {
    log.clearLine()
    log.gap()
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
    log.clearLine()
    log.gap()
    log.warn('Gemini Error: ' + String(error))
    return null
  }
}

export const generateReleaseNotes = async (
  commits: string,
  language: 'en' | 'id',
  correction?: string,
  model: GeminiModel = 'gemini-2.5-flash'
): Promise<string | null> => {
  try {
    const ok = sdkIsAvailable()
    if (!ok) {
      log.warn('Gemini SDK not available; install @google/genai to enable Gemini features.')
      return null
    }
    return await sdkGenerateReleaseNotes(commits, language, correction, model)
  } catch (error) {
    log.clearLine()
    log.gap()
    log.warn('Gemini Error: ' + String(error))
    return null
  }
}

export const generateText = async (
  prompt: string,
  model: GeminiModel = 'gemini-2.5-flash'
): Promise<string | null> => {
  try {
    const ok = sdkIsAvailable()
    if (!ok) return null
    return await sdkGenerateText(prompt, model)
  } catch (error) {
    log.warn('Gemini Error: ' + String(error))
    return null
  }
}
