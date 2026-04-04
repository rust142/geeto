/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

/**
 * Copilot AI provider — direct REST API client.
 *
 * Uses GitHub Copilot Chat Completions API (api.individual.githubcopilot.com)
 * instead of the @github/copilot-sdk. This removes the dependency on the
 * Copilot CLI binary and avoids protocol version mismatch issues.
 *
 * Auth: uses `gh auth token` (GitHub CLI) or GITHUB_TOKEN env var.
 */

import {
  buildPromptWithCorrection,
  buildReleaseNotesPrompt,
  cleanAIContent,
  MIN_AI_RESPONSE_LENGTH,
  normalizeBranchName,
} from '../utils/ai-text.js'
import { exec } from '../utils/exec.js'
import { log } from '../utils/logging.js'

// ── API Configuration ───────────────────────────────────────────────────
const COPILOT_API_BASE = 'https://api.individual.githubcopilot.com'
const CHAT_ENDPOINT = `${COPILOT_API_BASE}/chat/completions`
const MODELS_ENDPOINT = `${COPILOT_API_BASE}/models`

// ── Token Management ────────────────────────────────────────────────────
let cachedToken: string | null = null

/**
 * Get GitHub auth token for Copilot API access.
 * Priority: 1) cached token, 2) GITHUB_TOKEN env, 3) `gh auth token`
 */
const getToken = (): string | null => {
  if (cachedToken) return cachedToken

  // Try env vars first (fast path)
  const envToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? null
  if (envToken) {
    cachedToken = envToken
    return envToken
  }

  // Fall back to gh CLI
  try {
    const token = exec('gh auth token', true).trim()
    if (token) {
      cachedToken = token
      return token
    }
  } catch {
    // gh CLI not available or not authenticated
  }

  return null
}

// ── Chat Completions ────────────────────────────────────────────────────
interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatResponse {
  choices?: Array<{
    message?: { content?: string; role?: string }
    finish_reason?: string
  }>
  error?: { message?: string; code?: string }
}

const chatCompletion = async (messages: ChatMessage[], model?: string): Promise<string | null> => {
  const token = getToken()
  if (!token) {
    log.warn('No GitHub token available. Run `gh auth login` to authenticate.')
    return null
  }

  const body = {
    model: model ?? 'gpt-5-mini',
    messages,
  }

  try {
    const res = await fetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const errorText = await res.text().catch(() => '')
      if (res.status === 401 || res.status === 403) {
        cachedToken = null
        log.clearLine()
        log.warn('GitHub token expired or unauthorized. Run `gh auth login` to re-authenticate.')
      } else {
        log.clearLine()
        log.warn(`Copilot API error (${res.status}): ${errorText.slice(0, 200)}`)
      }
      return null
    }

    const data = (await res.json()) as ChatResponse
    const content = data.choices?.[0]?.message?.content
    return content ?? null
  } catch (error) {
    log.clearLine()
    log.error('Copilot API request failed: ' + String(error))
    return null
  }
}

// ── Public API (same exports as before) ─────────────────────────────────

/**
 * Check if Copilot API is accessible (has valid token).
 */
export const isAvailable = async (): Promise<boolean> => {
  const token = getToken()
  if (!token) return false

  try {
    const res = await fetch(MODELS_ENDPOINT, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * No-op for backwards compatibility. REST API is stateless.
 */
export const stopClient = async (): Promise<void> => {
  // REST API is stateless — nothing to stop
}

export const generateBranchName = async (
  text: string,
  correction?: string,
  model?: string
): Promise<string | null> => {
  const prompt = buildPromptWithCorrection('branch-name-prompt.md', text, 'Input', correction)

  try {
    const content = await chatCompletion([{ role: 'user', content: prompt }], model)
    if (!content) return null

    const first =
      content
        .trim()
        .split('\n')
        .find((l: string) => !!l) ?? ''
    return normalizeBranchName(first) || null
  } catch (error) {
    log.clearLine()
    log.gap()
    log.error('Copilot Error: ' + String(error))
    return null
  }
}

export const generateCommitMessage = async (
  diff: string,
  correction?: string,
  model?: string
): Promise<string | null> => {
  const prompt = buildPromptWithCorrection('commit-message-prompt.md', diff, 'Diff', correction)

  try {
    const content = await chatCompletion([{ role: 'user', content: prompt }], model)
    if (!content) return null

    return cleanAIContent(content, {
      normalizeBlankLines: true,
      minLength: MIN_AI_RESPONSE_LENGTH,
    })
  } catch (error) {
    log.clearLine()
    log.gap()
    log.error('Copilot Error: ' + String(error))
    return null
  }
}

/**
 * Detailed model info and helpers for formatted choices
 */
type ModelDetail = {
  id: string
  name: string
  inputTokenLimit: number | null
  outputTokenLimit: number | null
  needsEnable: boolean
  isPremium: boolean
  multiplier: number | null
  label: string
  value: string
}

export const getAvailableModelsDetailed = async (): Promise<ModelDetail[] | null> => {
  const token = getToken()
  if (!token) return null

  try {
    const res = await fetch(MODELS_ENDPOINT, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) return null

    const data = (await res.json()) as { data?: any[] }
    const list = data.data
    if (!Array.isArray(list)) return null

    const result: ModelDetail[] = []
    for (const m of list) {
      if (!m?.id) continue

      // Skip non-chat models (embeddings, etc.)
      const type = m.capabilities?.type
      if (type && type !== 'chat') continue

      const id = String(m.id)
      const name = String(m.name ?? id)
      const limits = m.capabilities?.limits
      const inputTokenLimit =
        typeof limits?.max_prompt_tokens === 'number' ? limits.max_prompt_tokens : null
      const outputTokenLimit =
        typeof limits?.max_output_tokens === 'number' ? limits.max_output_tokens : null

      const policyState = m.policy?.state ?? null
      const needsEnable = Boolean(policyState && String(policyState).toLowerCase() !== 'enabled')

      const billing = m.capabilities?.supports?.billing ?? null
      const isPremium = Boolean(billing?.premium_billing)
      const multiplierRaw = billing?.copilot_premium_request_multiplier ?? null
      const multiplier = typeof multiplierRaw === 'number' ? multiplierRaw : null

      result.push({
        id,
        name,
        inputTokenLimit,
        outputTokenLimit,
        needsEnable,
        isPremium,
        multiplier,
        label: name,
        value: id,
      })
    }

    return result.length > 0 ? result : null
  } catch {
    return null
  }
}

export const getAvailableModelChoices = async (defaultModelId?: string) => {
  const detailed = (await getAvailableModelsDetailed()) ?? []

  let maxNameLen = 0
  let maxIoLen = 0
  let maxMultLen = 0
  for (const d of detailed) {
    const enableHintLen = d.needsEnable ? ' (requires enablement)'.length : 0
    const defaultHintLen =
      defaultModelId && (d.id === defaultModelId || d.value === defaultModelId)
        ? ' (default)'.length + 2
        : 0
    const nameLen = String(d.name).length + enableHintLen + defaultHintLen
    if (nameLen > maxNameLen) {
      maxNameLen = nameLen
    }

    const ioStr = `${d.inputTokenLimit ?? 'n/a'}/${d.outputTokenLimit ?? 'n/a'} tokens`
    if (ioStr.length > maxIoLen) {
      maxIoLen = ioStr.length
    }

    const multStr = d.multiplier === null ? '' : `${d.multiplier}x`
    if (multStr.length > maxMultLen) {
      maxMultLen = multStr.length
    }
  }

  const choices = [] as Array<{ label: string; value: string }>
  const indexWidth = String(detailed.length).length
  for (const [i, d] of detailed.entries()) {
    const idx = `${String(i + 1).padStart(indexWidth, ' ')}.`
    const isDefault = defaultModelId && (d.id === defaultModelId || d.value === defaultModelId)
    const defaultHint = isDefault ? ' (default)' : ''
    const enableHint = d.needsEnable ? ' (requires enablement)' : ''
    const nameWithHint = `${d.name}${defaultHint}${enableHint}`
    const defaultMark = isDefault ? ' ✓' : ''
    const padCount = Math.max(0, maxNameLen - nameWithHint.length + 2)
    const paddedName = nameWithHint + ' '.repeat(padCount) + defaultMark
    const ioStr = `${d.inputTokenLimit ?? 'n/a'}/${d.outputTokenLimit ?? 'n/a'} tokens`
    const ioPadded = ioStr + ' '.repeat(Math.max(0, maxIoLen - ioStr.length + 2))

    const mult = d.multiplier === null ? '' : `${d.multiplier}x`
    const paddedMult = mult + ' '.repeat(Math.max(0, maxMultLen - mult.length))
    const label = `${idx} ${paddedName}${ioPadded}${paddedMult}`
    choices.push({ label, value: d.value })
  }

  return choices
}

export const generateReleaseNotes = async (
  commits: string,
  language: 'en' | 'id',
  correction?: string,
  model?: string
): Promise<string | null> => {
  const prompt = buildReleaseNotesPrompt(commits, language, correction)

  try {
    const content = await chatCompletion([{ role: 'user', content: prompt }], model)
    if (!content) return null
    return cleanAIContent(content)
  } catch (error) {
    log.clearLine()
    log.gap()
    log.error('Copilot Error: ' + String(error))
    return null
  }
}

/** Send a raw prompt to Copilot and return the text response. */
export const generateText = async (prompt: string, model?: string): Promise<string | null> => {
  try {
    const content = await chatCompletion([{ role: 'user', content: prompt }], model)
    if (!content) return null
    return cleanAIContent(content)
  } catch {
    return null
  }
}

export default {
  generateBranchName,
  generateCommitMessage,
  generateReleaseNotes,
  generateText,
}
