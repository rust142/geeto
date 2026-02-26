/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { OpenRouter } from '@openrouter/sdk'

import { OpenRouterModel } from './openrouter.js'
import { getOpenRouterConfig } from '../utils/config.js'
import { log } from '../utils/logging.js'

// OpenRouter SDK wrapper (lazy-load, optional)

let client: OpenRouter | null = null

const ensureClient = (): boolean => {
  if (client) {
    return true
  }
  try {
    client = new OpenRouter({ apiKey: getOpenRouterConfig().apiKey })
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
      log.info('OpenRouter SDK not available — falling back to OpenRouter.')
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
  model?: OpenRouterModel
): Promise<string | null> => {
  const promptBase = `Generate a git branch name suffix from this input. Output ONLY the kebab-case suffix (lowercase-with-hyphens), 3-50 chars, nothing else.`
  const prompt = correction
    ? `${promptBase}\n\nInput:\n${text}\n\nAdjustment: ${correction}`
    : `${promptBase}\n\nInput:\n${text}`

  const completion = await client?.chat.send({
    model: model ?? 'gemini-2.5-flash',
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  })

  try {
    const content = completion?.choices[0]?.message?.content as string
    const first =
      String(content)
        .trim()
        .split('\n')
        .find((l: string) => !!l) ?? ''
    // sanitize to kebab-case
    const cleaned = String(first)
      .toLowerCase()
      .replaceAll(/[^\d\sa-z-]/g, ' ')
      .trim()
      .replaceAll(/\s+/g, '-')
      .replaceAll(/-+/g, '-')
      .replaceAll(/^-|-$/g, '')
    return cleaned || null
  } catch (error) {
    log.clearLine()
    log.gap()
    log.error('OpenRouter Error: ' + String(error))
    return null
  }
}
export const generateCommitMessage = async (
  diff: string,
  correction?: string,
  model?: OpenRouterModel
): Promise<string | null> => {
  const promptBase = `Generate a conventional commit message from this git diff. Output ONLY the commit message in this format:\n\n<type>(<scope>): <short summary>\n\n<Detailed multi-line body explaining the change. Wrap lines at ~72 characters. LIMITS: subject max 100 chars; body max 360 chars. Include why the change was made and any important notes. Separate subject and body by a single blank line. Do not include any extraneous commentary or markers. Use imperative mood.

Example:
refactor(ai): migrate providers to SDKs

Replaces direct API/CLI calls for Copilot and Gemini with SDK integrations.
This simplifies code, improves maintainability, and adds dynamic model
fetching. Updates .gitignore for geeto binaries.`
  const prompt = correction
    ? `${promptBase}\n\nDiff:\n${diff}\n\nAdjustment: ${correction}`
    : `${promptBase}\n\nDiff:\n${diff}`

  const completion = await client?.chat.send({
    model: model ?? 'gemini-2.5-flash',
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  })

  try {
    const content = completion?.choices[0]?.message?.content as string
    const cleaned = String(content)
      .replaceAll(/```[\S\s]*?```/g, '')
      .replaceAll(/^"+|"+$/g, '')
      .trim()
    const normalized = cleaned.replaceAll(/\n\s*\n+/g, '\n\n').trim()
    return normalized && normalized.length >= 8 ? normalized : null
  } catch (error) {
    log.clearLine()
    log.gap()
    log.error('OpenRouter Error: ' + String(error))
    return null
  }
}

type ModelDetail = {
  id: string
  canonicalSlug: string | null
  huggingFaceId: string | null
  name: string
  description: string | null
  version: string | null
  created: number | null
  pricing: { prompt?: string | null; completion?: string | null } | null
  contextLength: number | null
  inputTokenLimit: number | null
  outputTokenLimit: number | null
  architecture: {
    tokenizer?: string | null
    instructType?: string | null
    modality?: string | null
    inputModalities?: string[]
    outputModalities?: string[]
  } | null
  topProvider: {
    contextLength?: number | null
    maxCompletionTokens?: number | null
    isModerated?: boolean | null
  } | null
  perRequestLimits: any
  supportedParameters: string[]
  defaultParameters: Record<string, any> | null
  expirationDate: string | null
  supportedActions: string[]
  temperature: number | null
  maxTemperature: number | null
  topP: number | null
  topK: number | null
  thinking: boolean | null
  needsEnable: boolean
  isPremium?: boolean
  multiplier?: number | null
  label: string
  value: string
}

export const getAvailableModelsDetailed = async (): Promise<ModelDetail[] | null> => {
  const ok = ensureClient()
  if (!ok || !client) {
    return null
  }

  try {
    const resp: any = await client.models.list()

    let list: any[] = []
    if (Array.isArray(resp.data)) {
      list = resp.data
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
            canonicalSlug: null,
            huggingFaceId: null,
            name: m,
            description: null,
            version: null,
            created: null,
            pricing: null,
            contextLength: null,
            inputTokenLimit: null,
            outputTokenLimit: null,
            architecture: null,
            topProvider: null,
            perRequestLimits: null,
            supportedParameters: [],
            defaultParameters: null,
            expirationDate: null,
            supportedActions: [],
            temperature: null,
            maxTemperature: null,
            topP: null,
            topK: null,
            thinking: null,
            needsEnable: false,
            isPremium: false,
            multiplier: null,
            label: m,
            value: m,
          }
        }

        const id = String(m.id ?? '')
        const name = String(m.name ?? id)
        const description = String(m.description ?? m.summary ?? '') || null
        const version = m.version ?? m.modelVersion ?? m.modelVersionId ?? null

        // OpenRouter model specific fields
        const canonicalSlug = String(m.canonicalSlug ?? m.canonical_slug ?? m.slug ?? '') || null
        const huggingFaceId = String(m.huggingFaceId ?? m.hugging_face_id ?? '') || null
        const created = typeof m.created === 'number' ? m.created : null

        const pricing = m.pricing ?? m.pricingInfo ?? null

        let contextLength: number | null = null
        if (typeof m.contextLength === 'number') {
          contextLength = m.contextLength
        } else if (typeof m.context_length === 'number') {
          contextLength = m.context_length
        }

        const inputTokenLimit: number | null = contextLength

        let outputTokenLimit: number | null = null
        if (m.topProvider) {
          if (typeof m.topProvider.maxCompletionTokens === 'number') {
            outputTokenLimit = m.topProvider.maxCompletionTokens
          } else if (typeof m.topProvider.max_completion_tokens === 'number') {
            outputTokenLimit = m.topProvider.max_completion_tokens
          }
        }

        let supportedActions: string[] = []
        if (Array.isArray(m.supportedActions)) {
          supportedActions = m.supportedActions
        } else if (Array.isArray(m.supported_actions)) {
          supportedActions = m.supported_actions
        }

        const temperature = typeof m.temperature === 'number' ? m.temperature : null

        let maxTemperature: number | null = null
        if (typeof m.maxTemperature === 'number') {
          maxTemperature = m.maxTemperature
        } else if (typeof m.max_temperature === 'number') {
          maxTemperature = m.max_temperature
        }

        const topP = typeof m.topP === 'number' ? m.topP : null
        const topK = typeof m.topK === 'number' ? m.topK : null
        const thinking = typeof m.thinking === 'boolean' ? m.thinking : null

        let archInputModalities: string[] = []
        let archOutputModalities: string[] = []
        if (m.architecture) {
          if (Array.isArray(m.architecture.inputModalities)) {
            archInputModalities = m.architecture.inputModalities
          } else if (Array.isArray(m.architecture.input_modalities)) {
            archInputModalities = m.architecture.input_modalities
          }

          if (Array.isArray(m.architecture.outputModalities)) {
            archOutputModalities = m.architecture.outputModalities
          } else if (Array.isArray(m.architecture.output_modalities)) {
            archOutputModalities = m.architecture.output_modalities
          }
        }

        const architecture = m.architecture
          ? {
              tokenizer: m.architecture.tokenizer ?? null,
              instructType: m.architecture.instructType ?? m.architecture.instruct_type ?? null,
              modality: m.architecture.modality ?? null,
              inputModalities: archInputModalities,
              outputModalities: archOutputModalities,
            }
          : null

        let tpContextLength: number | null = null
        let tpMaxCompletionTokens: number | null = null
        let tpIsModerated: boolean | null = null
        if (m.topProvider) {
          if (typeof m.topProvider.contextLength === 'number') {
            tpContextLength = m.topProvider.contextLength
          } else if (typeof m.topProvider.context_length === 'number') {
            tpContextLength = m.topProvider.context_length
          }

          if (typeof m.topProvider.maxCompletionTokens === 'number') {
            tpMaxCompletionTokens = m.topProvider.maxCompletionTokens
          } else if (typeof m.topProvider.max_completion_tokens === 'number') {
            tpMaxCompletionTokens = m.topProvider.max_completion_tokens
          }

          if (typeof m.topProvider.isModerated === 'boolean') {
            tpIsModerated = m.topProvider.isModerated
          }
        }

        const topProvider = m.topProvider
          ? {
              contextLength: tpContextLength,
              maxCompletionTokens: tpMaxCompletionTokens,
              isModerated: tpIsModerated,
            }
          : null

        const perRequestLimits = m.perRequestLimits ?? m.per_request_limits ?? null

        let supportedParameters: string[] = []
        if (Array.isArray(m.supportedParameters)) {
          supportedParameters = m.supportedParameters
        } else if (Array.isArray(m.supported_parameters)) {
          supportedParameters = m.supported_parameters
        }

        const defaultParameters = m.defaultParameters ?? m.default_parameters ?? null
        const expirationDate = m.expirationDate ?? m.expires_at ?? m.expiration_date ?? null

        const needsEnableField = m.requiresEnable ?? m.requireEnable ?? m.requires_enable ?? null
        const needsEnable = Boolean(needsEnableField)

        return {
          id,
          canonicalSlug,
          huggingFaceId,
          name,
          description,
          version,
          created,
          pricing,
          contextLength,
          inputTokenLimit,
          outputTokenLimit,
          architecture,
          topProvider,
          perRequestLimits,
          supportedParameters,
          defaultParameters,
          expirationDate,
          supportedActions,
          temperature,
          maxTemperature,
          topP,
          topK,
          thinking,
          needsEnable,
          label: name,
          value: id || name,
        }
      })
      .filter((m) => m.outputTokenLimit)
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
  model?: OpenRouterModel
): Promise<string | null> => {
  const langLabel = language === 'id' ? 'Indonesian (Bahasa Indonesia)' : 'English'
  const promptBase = `You are a release notes writer. Given a list of git commit messages, generate user-friendly release notes in ${langLabel}. Output ONLY the release notes content (no title/heading, no version number, no date — those are added separately).

Rules:
- Start with "### What's New?" as the top-level section
- Group changes into subsections: "#### New Features", "#### Bug Fixes", "#### Other Improvements"
- Only include subsections that have items (skip empty ones)
- Use simple, non-technical language that end users can understand
- Each item should be a bullet point starting with "-"
- Strip conventional commit prefixes (feat:, fix:, chore:, etc.)
- Keep it concise but informative
- If there are breaking changes, add a "#### Breaking Changes" subsection at the top
- Do NOT include commit hashes or author names

Formatting (follow EXACTLY — this is markdownlint-compliant):
- Always put ONE blank line after EVERY heading (### or ####) before the first bullet
- Always put ONE blank line after the last bullet in a section before the next #### heading
- Never have more than one consecutive blank line
- Example output:

### What's New?

#### New Features

- Feature description here
- Another feature

#### Bug Fixes

- Fix description here

#### Other Improvements

- Improvement here`

  const prompt = correction
    ? `${promptBase}\n\nCommits:\n${commits}\n\nAdjustment: ${correction}`
    : `${promptBase}\n\nCommits:\n${commits}`

  const completion = await client?.chat.send({
    model: model ?? 'gemini-2.5-flash',
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  })

  try {
    const content = completion?.choices[0]?.message?.content as string
    const cleaned = String(content)
      .replaceAll(/```[\S\s]*?```/g, '')
      .replaceAll(/^"+|"+$/g, '')
      .trim()
    return cleaned || null
  } catch (error) {
    log.clearLine()
    log.gap()
    log.error('OpenRouter Error: ' + String(error))
    return null
  }
}

/** Send a raw prompt to OpenRouter and return the text response. */
export const generateText = async (prompt: string, model?: string): Promise<string | null> => {
  if (!ensureClient()) return null

  const completion = await client?.chat.send({
    model: model ?? 'gemini-2.5-flash',
    messages: [{ role: 'user', content: prompt }],
  })

  try {
    const content = completion?.choices[0]?.message?.content as string
    const cleaned = String(content)
      .replaceAll(/```[\S\s]*?```/g, '')
      .replaceAll(/^"+|"+$/g, '')
      .trim()
    return cleaned || null
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
