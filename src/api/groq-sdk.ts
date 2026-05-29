import OpenAI from 'openai'

import {
  buildPromptWithCorrection,
  buildReleaseNotesPrompt,
  cleanAIContent,
  MIN_AI_RESPONSE_LENGTH,
  normalizeBranchName,
} from '../utils/ai-text.js'
import { getGroqConfig } from '../utils/config.js'
import { log } from '../utils/logging.js'

const GROQ_BASE = 'https://api.groq.com/openai/v1'
const DEFAULT_MODEL = 'llama-3.3-70b-versatile'

export type GroqModel = string

let client: OpenAI | null = null

const ensureClient = (): boolean => {
  if (client) return true
  try {
    const { apiKey } = getGroqConfig()
    if (!apiKey) return false
    client = new OpenAI({ baseURL: GROQ_BASE, apiKey })
    return true
  } catch {
    client = null
    return false
  }
}

export const isAvailable = (): boolean => ensureClient()

export const generateBranchName = async (
  text: string,
  correction?: string,
  model?: GroqModel
): Promise<string | null> => {
  if (!ensureClient()) return null
  const prompt = buildPromptWithCorrection('branch-name-prompt.md', text, 'Input', correction)
  try {
    const res = await (client as OpenAI).chat.completions.create({
      model: model ?? DEFAULT_MODEL,
      messages: [{ role: 'user', content: prompt }],
    })
    const content = res.choices[0]?.message?.content
    if (!content) return null
    const first =
      content
        .trim()
        .split('\n')
        .find((l) => !!l) ?? ''
    return normalizeBranchName(first) || null
  } catch (error) {
    log.clearLine()
    log.warn('Groq Error: ' + String(error))
    return null
  }
}

export const generateCommitMessage = async (
  diff: string,
  correction?: string,
  model?: GroqModel
): Promise<string | null> => {
  if (!ensureClient()) return null
  const prompt = buildPromptWithCorrection('commit-message-prompt.md', diff, 'Diff', correction)
  try {
    const res = await (client as OpenAI).chat.completions.create({
      model: model ?? DEFAULT_MODEL,
      messages: [{ role: 'user', content: prompt }],
    })
    const content = res.choices[0]?.message?.content
    if (!content) return null
    return cleanAIContent(content, { normalizeBlankLines: true, minLength: MIN_AI_RESPONSE_LENGTH })
  } catch (error) {
    log.clearLine()
    log.warn('Groq Error: ' + String(error))
    return null
  }
}

export const generateReleaseNotes = async (
  commits: string,
  language: 'en' | 'id',
  correction?: string,
  model?: GroqModel
): Promise<string | null> => {
  if (!ensureClient()) return null
  const prompt = buildReleaseNotesPrompt(commits, language, correction)
  try {
    const res = await (client as OpenAI).chat.completions.create({
      model: model ?? DEFAULT_MODEL,
      messages: [{ role: 'user', content: prompt }],
    })
    const content = res.choices[0]?.message?.content
    if (!content) return null
    return cleanAIContent(content)
  } catch (error) {
    log.clearLine()
    log.warn('Groq Error: ' + String(error))
    return null
  }
}

export const generateText = async (prompt: string, model?: GroqModel): Promise<string | null> => {
  if (!ensureClient()) return null
  try {
    const res = await (client as OpenAI).chat.completions.create({
      model: model ?? DEFAULT_MODEL,
      messages: [{ role: 'user', content: prompt }],
    })
    const content = res.choices[0]?.message?.content
    if (!content) return null
    return cleanAIContent(content)
  } catch {
    return null
  }
}

const FALLBACK_MODELS: Array<{ label: string; value: string }> = [
  { label: 'llama-3.3-70b-versatile  (recommended)', value: 'llama-3.3-70b-versatile' },
  { label: 'llama-3.1-8b-instant  (fastest)', value: 'llama-3.1-8b-instant' },
  { label: 'gemma2-9b-it', value: 'gemma2-9b-it' },
  { label: 'mixtral-8x7b-32768', value: 'mixtral-8x7b-32768' },
]

export const getGroqModels = async (): Promise<Array<{ label: string; value: string }>> => {
  if (!ensureClient()) return FALLBACK_MODELS
  try {
    const res = await (client as OpenAI).models.list()
    const models = res.data
      .filter(
        (m) =>
          m.id.includes('llama') ||
          m.id.includes('mixtral') ||
          m.id.includes('gemma') ||
          m.id.includes('qwen') ||
          m.id.includes('deepseek')
      )
      // eslint-disable-next-line unicorn/no-array-sort
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((m) => ({ label: m.id, value: m.id }))
    return models.length > 0 ? models : FALLBACK_MODELS
  } catch {
    return FALLBACK_MODELS
  }
}
