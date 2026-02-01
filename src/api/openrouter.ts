/**
 * OpenRouter integration for AI-powered branch naming and commit messages
 */
import path from 'node:path'

import {
  generateBranchName as sdkGenerateBranchName,
  generateCommitMessage as sdkGenerateCommitMessage,
  isAvailable as sdkIsAvailable,
} from './openrouter-sdk.js'
import { log } from '../utils/logging.js'

// Supported models on OpenRouter
export type OpenRouterModel = string

/**
 * Return OpenRouter model choices from the SDK in realtime.
 */
export const getOpenRouterModels = async (): Promise<
  Array<{ label: string; value: OpenRouterModel }>
> => {
  try {
    // Prefer persisted list in .geeto/openrouter-model.json per project sync
    const fs = await import('node:fs')
    const cfgPath = path.join(process.cwd(), '.geeto', 'openrouter-model.json')
    if (fs.existsSync(cfgPath)) {
      try {
        const raw = fs.readFileSync(cfgPath, 'utf8')
        const parsed = JSON.parse(raw) as Array<{ label?: string; value?: string }>
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((p) => ({ label: p.label ?? String(p.value), value: String(p.value) }))
        }
        return []
      } catch (error) {
        log.warn(`Could not read .geeto/openrouter-model.json: ${(error as Error).message}`)
        return []
      }
    }

    // If no persisted file, return empty (do not hit SDK automatically)
    log.info('No .geeto/openrouter-model.json. Open Settings → Sync OpenRouter models.')
    return []
  } catch (error) {
    log.warn(`Failed to read OpenRouter models: ${String(error)}`)
    return []
  }
}

/**
 * Generate branch name from title using OpenRouter SDK
 */
export const generateBranchName = async (
  text: string,
  correction?: string,
  model: OpenRouterModel = 'gemini-2.5-flash'
): Promise<string | null> => {
  try {
    const ok = sdkIsAvailable()
    if (!ok) {
      log.warn(
        'OpenRouter SDK not available; install @openrouter/sdk to enable OpenRouter features.'
      )
      return null
    }
    const sdkRes = await sdkGenerateBranchName(text, correction, model)
    if (!sdkRes) {
      return null
    }

    //       // Clean up the result
    let cleaned = sdkRes.trim()

    // Try to extract from backticks first
    const backtickMatch = cleaned.match(/`([^`]+)`/)
    if (backtickMatch?.[1]) {
      cleaned = backtickMatch[1].trim()
    }

    // Take only the first line if multiple lines
    cleaned = cleaned.split('\n').at(0)?.trim() ?? ''

    cleaned = cleaned
      .toLowerCase()
      .replaceAll(/[^\da-z-]/g, '') // Remove special chars except hyphens
      .replaceAll(/-+/g, '-') // Replace multiple hyphens
      .replaceAll(/^-|-$/g, '') // Remove leading/trailing hyphens

    const branchName = cleaned

    // Persist original provider response so the user can inspect the unmodified AI output.
    try {
      const fs = await import('node:fs/promises')
      const outDir = path.join(process.cwd(), '.geeto')
      await fs.mkdir(outDir, { recursive: true })
      const payload = {
        provider: 'openrouter',
        model,
        raw: sdkRes,
        cleaned: cleaned,
        timestamp: new Date().toISOString(),
      }
      await fs.writeFile(
        path.join(outDir, 'last-ai-suggestion.json'),
        JSON.stringify(payload, null, 2)
      )
    } catch {
      /* ignore file write failures */
    }

    return branchName && branchName.length >= 3 ? branchName : null
  } catch (error) {
    log.warn('OpenRouter Error: ' + String(error))
    return null
  }
}

/**
 * Generate commit message from git diff using OpenRouter SDK
 */
export const generateCommitMessage = async (
  diff: string,
  correction?: string,
  model: OpenRouterModel = 'gemini-2.5-flash'
): Promise<string | null> => {
  try {
    const ok = sdkIsAvailable()
    if (!ok) {
      log.warn(
        'OpenRouter SDK not available; install @openrouter/sdk to enable OpenRouter features.'
      )
      return null
    }
    const sdkRes = await sdkGenerateCommitMessage(diff, correction, model)
    return sdkRes
  } catch (error) {
    log.warn('OpenRouter Error: ' + String(error))
    return null
  }
}
