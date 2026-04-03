/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { GenerateContentResponse, GoogleGenAI, Model, Pager } from '@google/genai'

import { GeminiModel } from './gemini.js'
import {
  buildPromptWithCorrection,
  buildReleaseNotesPrompt,
  cleanAIContent,
  MIN_AI_RESPONSE_LENGTH,
  normalizeBranchName,
} from '../utils/ai-text.js'
import { getGeminiConfig } from '../utils/config.js'
import { log } from '../utils/logging.js'

// Gemini SDK wrapper (lazy-load, optional)

let client: GoogleGenAI | null = null

const ensureClient = (): boolean => {
  if (client) {
    return true
  }
  try {
    client = new GoogleGenAI({ apiKey: getGeminiConfig().apiKey })
    // Narrow client into a local const to satisfy strict no-non-null assertions
    const startedClient = client

    if (!startedClient) {
      return false
    }
    return true
  } catch (error) {
    // SDK optional: log info and fall back
    try {
      const msg = error && (error as Error).message ? (error as Error).message : String(error)
      log.info(msg)
    } catch {
      log.info('Google GenAI SDK not available — falling back to Google GenAI.')
    }
    client = null
    return false
  }
}

export const isAvailable = (): boolean => {
  return ensureClient()
}

export const generateBranchName = async (
  text: string,
  correction?: string,
  model?: GeminiModel
): Promise<string | null> => {
  const prompt = buildPromptWithCorrection('branch-name-prompt.md', text, 'Input', correction)

  const result = await client?.models.generateContent({
    model: model ?? 'gemini-2.5-flash',
    contents: prompt,
  })

  try {
    const content = (result as GenerateContentResponse).text
    const first =
      String(content)
        .trim()
        .split('\n')
        .find((l: string) => !!l) ?? ''
    const cleaned = normalizeBranchName(first)
    return cleaned || null
  } catch (error) {
    log.error('Google GenAI Error: ' + String(error))
    return null
  }
}
export const generateCommitMessage = async (
  diff: string,
  correction?: string,
  model?: GeminiModel
): Promise<string | null> => {
  const prompt = buildPromptWithCorrection('commit-message-prompt.md', diff, 'Diff', correction)

  const result = await client?.models.generateContent({
    model: model ?? 'gemini-2.5-flash',
    contents: prompt,
  })

  try {
    const content = (result as GenerateContentResponse).text
    return cleanAIContent(String(content), {
      normalizeBlankLines: true,
      minLength: MIN_AI_RESPONSE_LENGTH,
    })
  } catch (error) {
    log.error('Google GenAI Error: ' + String(error))
    return null
  }
}

type ModelDetail = {
  id: string
  name: string
  description: string | null
  inputTokenLimit: number | null
  outputTokenLimit: number | null
  label: string
  value: string
}

export const getAvailableModelsDetailed = async (): Promise<ModelDetail[] | null> => {
  const ok = ensureClient()
  if (!ok || !client) {
    return null
  }

  try {
    const resp: Pager<Model> = await client.models.list()

    let list: any[] = []
    if (Array.isArray(resp?.page)) {
      list = resp.page
    } else if (Array.isArray(resp)) {
      list = resp
    } else {
      list = []
    }

    if (!Array.isArray(list) || list.length === 0) {
      return null
    }

    const mapped: ModelDetail[] = list
      .map((m: any) => {
        if (!m) {
          return null as unknown as ModelDetail
        }

        if (typeof m === 'string') {
          return {
            id: m,
            name: m,
            description: null,
            inputTokenLimit: null,
            outputTokenLimit: null,
            label: m,
            value: m,
          }
        }

        const id = String(m.name ?? m.id ?? m.model ?? '')
        const name = String(m.displayName ?? m.title ?? m.name ?? id)
        const description = String(m.description ?? m.summary ?? '') || null

        let inputTokenLimit: number | null = null
        if (typeof m.inputTokenLimit === 'number') {
          inputTokenLimit = m.inputTokenLimit
        } else if (typeof m.input_token_limit === 'number') {
          inputTokenLimit = m.input_token_limit
        }

        let outputTokenLimit: number | null = null
        if (typeof m.outputTokenLimit === 'number') {
          outputTokenLimit = m.outputTokenLimit
        } else if (typeof m.output_token_limit === 'number') {
          outputTokenLimit = m.output_token_limit
        }

        return {
          id,
          name,
          description,
          inputTokenLimit,
          outputTokenLimit,
          label: name,
          value: id || name,
        }
      })
      .filter((m: ModelDetail | null) => {
        if (!m) return false

        const id = m.id.toLowerCase()
        const name = m.name.toLowerCase()

        // Exclude non-text generation models (blacklist)
        const excludePatterns = [
          'vision',
          'video',
          'audio',
          'embedding',
          'imagen',
          'text-embedding',
          'aqa',
          'whisper',
          'speech',
          'tts',
          'multimodal',
          'image',
          'palm',
          'e2b',
          'e4b',
          'banana',
          'gemma',
          'computer', // computer use models
          'robotics', // robotics models
        ]

        for (const pattern of excludePatterns) {
          if (id.includes(pattern) || name.includes(pattern)) {
            return false
          }
        }

        // Whitelist: only Gemini models (Flash, Pro, Experimental, Lite variants)
        const includePatterns = ['gemini']

        const hasValidPattern = includePatterns.some(
          (pattern) => id.includes(pattern) || name.includes(pattern)
        )

        if (!hasValidPattern) {
          return false
        }

        // Require at least 16384 output tokens for quality commit message generation
        if (m.outputTokenLimit !== null && m.outputTokenLimit < 16384) {
          return false
        }

        return true
      })
      // eslint-disable-next-line unicorn/no-array-sort
      .sort((a, b) => a.name.localeCompare(b.name)) // sort by name

    const out = mapped.filter(Boolean) as ModelDetail[]

    return out.length > 0 ? out : null
  } catch {
    return null
  }
}

export const getAvailableModelChoices = async () => {
  const detailed = (await getAvailableModelsDetailed()) ?? []

  const choices = [] as Array<{ label: string; value: string }>
  const indexWidth = String(detailed.length).length

  // compute max widths for name and io columns so values align nicely
  let maxNameLen = 0
  let maxIoLen = 0
  for (const d of detailed) {
    if (d.label.length > maxNameLen) {
      maxNameLen = d.label.length
    }
    const ioStr = `${d.inputTokenLimit ?? 'n/a'}/${d.outputTokenLimit ?? 'n/a'} tokens`
    if (ioStr.length > maxIoLen) {
      maxIoLen = ioStr.length
    }
  }

  for (const [i, d] of detailed.entries()) {
    const idx = `${String(i + 1).padStart(indexWidth, ' ')}.`
    const ioStr = `${d.inputTokenLimit ?? 'n/a'}/${d.outputTokenLimit ?? 'n/a'} tokens`
    const padCount = Math.max(1, maxNameLen - d.label.length + 2)
    const paddedName = d.label + ' '.repeat(padCount)
    const label = `${idx} ${paddedName}${ioStr}`
    choices.push({ label, value: d.value })
  }

  return choices
}

export const generateReleaseNotes = async (
  commits: string,
  language: 'en' | 'id',
  correction?: string,
  model?: GeminiModel
): Promise<string | null> => {
  const prompt = buildReleaseNotesPrompt(commits, language, correction)

  const result = await client?.models.generateContent({
    model: model ?? 'gemini-2.5-flash',
    contents: prompt,
  })

  try {
    const content = (result as GenerateContentResponse).text
    return cleanAIContent(String(content))
  } catch (error) {
    log.error('Google GenAI Error: ' + String(error))
    return null
  }
}

/** Send a raw prompt to Gemini and return the text response. */
export const generateText = async (prompt: string, model?: GeminiModel): Promise<string | null> => {
  if (!ensureClient()) return null

  const result = await client?.models.generateContent({
    model: model ?? 'gemini-2.5-flash',
    contents: prompt,
  })

  try {
    const content = (result as GenerateContentResponse).text
    return cleanAIContent(String(content))
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
