/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { CopilotClient } from '@github/copilot-sdk'
import { log } from '../utils/logging.js'
import type { CopilotClient as _CopilotClient, Session } from '@github/copilot-sdk'

// Copilot SDK wrapper (lazy-load, optional)

let client: _CopilotClient | null = null

const ensureClient = async (): Promise<boolean> => {
  if (client) {
    return true
  }
  try {
    client = new CopilotClient({ autoStart: true })
    // Narrow client into a local const to satisfy strict no-non-null assertions
    const startedClient = client
    if (!startedClient) {
      return false
    }
    await startedClient.start()
    return true
  } catch (error) {
    // SDK optional: log info and fall back
    try {
      const msg = error && (error as Error).message ? (error as Error).message : String(error)
      log.info(msg)
    } catch {
      log.info('Copilot SDK not available — falling back to Copilot CLI.')
    }
    client = null
    return false
  }
}

const withSession = async (
  model: string | undefined,
  fn: (session: Session) => Promise<string | null>
): Promise<string | null> => {
  const ok = await ensureClient()
  if (!ok || !client) {
    return null
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const session = await client.createSession({ model })
    try {
      const res = await fn(session)

      // best-effort destroy session workspace
      try {
        await session.destroy()
      } catch {
        // ignore
      }
      return res
    } catch (error) {
      try {
        await session.destroy()
      } catch {
        // ignore
      }
      throw error
    }
  } catch (error) {
    log.warn('Failed to create Copilot session: ' + String(error))
    return null
  }
}

export const isAvailable = async (): Promise<boolean> => {
  return ensureClient()
}

export const stopClient = async (): Promise<void> => {
  if (!client) {
    return
  }
  try {
    await client.stop()
  } catch {
    try {
      // Some runtime implementations expose forceStop; call if present
      await client.forceStop()
    } catch {
      /* ignore */
    }
  }
  client = null
}

export const generateBranchName = async (
  text: string,
  correction?: string,
  model?: string
): Promise<string | null> => {
  const promptBase = `Generate a git branch name suffix from this input. Output ONLY the kebab-case suffix (lowercase-with-hyphens), 3-50 chars, nothing else.`
  const prompt = correction
    ? `${promptBase}\n\nInput:\n${text}\n\nAdjustment: ${correction}`
    : `${promptBase}\n\nInput:\n${text}`

  const result = await withSession(model, async (session) => {
    // sendAndWait returns the assistant message event with data.content
    try {
      const response = await session.sendAndWait({ prompt })
      const content = response?.data?.content ?? ''
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
      log.error('Copilot Error: ' + String(error))
      return null
    }
  })

  return result
}

export const generateCommitMessage = async (
  diff: string,
  correction?: string,
  model?: string
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

  const result = await withSession(model, async (session) => {
    try {
      const response = await session.sendAndWait({ prompt })
      const content = response?.data?.content ?? ''
      // Normalize full response: remove fenced blocks, trim surrounding quotes, collapse extra blank lines
      const cleaned = String(content)
        .replace(/```[\s\S]*?```/g, '')
        .replace(/^"+|"+$/g, '')
        .trim()
      const normalized = cleaned.replace(/\n\s*\n+/g, '\n\n').trim()
      return normalized && normalized.length >= 8 ? normalized : null
    } catch (error) {
      log.error('Copilot Error: ' + String(error))
      return null
    }
  })

  return result
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
  try {
    const runtime: any = client
    let list: any = null
    if (typeof runtime.listModels === 'function') {
      list = await runtime.listModels()
    } else if (typeof runtime.getModels === 'function') {
      list = await runtime.getModels()
    } else if (Array.isArray((runtime as any).models)) {
      list = (runtime as any).models
    }

    if (!list || !Array.isArray(list)) {
      return null
    }

    const mapped: Array<ModelDetail | null> = await Promise.all(
      list.map(async (m: any) => {
        if (!m) {
          return null
        }

        if (typeof m === 'string') {
          return {
            id: m,
            name: m,
            inputTokenLimit: null,
            outputTokenLimit: null,
            needsEnable: false,
            isPremium: false,
            multiplier: null,
            label: m,
            value: m,
          }
        }

        const id = String(m.id ?? m.model ?? m.name ?? '')
        const name = String(m.name ?? m.title ?? id)
        const policyState = m.policy?.state ?? m.state ?? null
        const billing = m.billing ?? m.pricing ?? null
        const isPremium = Boolean(billing?.is_premium ?? billing?.premium ?? false)
        const multiplierRaw = billing?.multiplier ?? billing?.cost_multiplier ?? null
        const multiplier = typeof multiplierRaw === 'number' ? multiplierRaw : null

        let needsEnable = Boolean(policyState && String(policyState).toLowerCase() !== 'enabled')

        // If the policy state is unknown, try to ping the model via adapter to check enablement
        if (policyState === null) {
          try {
            const adapter = await import('./copilot-adapter.js')
            if (adapter && typeof adapter.pingModel === 'function') {
              try {
                const pingOk = await adapter.pingModel(id || name)
                needsEnable = !pingOk
              } catch {
                // If ping fails, leave needsEnable as false to avoid blocking users
                needsEnable = false
              }
            }
          } catch {
            // adapter import failed; ignore and proceed
          }
        }

        // capabilities.limits may contain token limits for the runtime
        let inputTokenLimit: number | null = null
        let outputTokenLimit: number | null = null
        try {
          const limits = m.capabilities?.limits
          if (limits) {
            if (typeof limits.max_prompt_tokens === 'number') {
              inputTokenLimit = limits.max_prompt_tokens
            }
            if (typeof limits.max_output_tokens === 'number') {
              outputTokenLimit = limits.max_output_tokens
            }
          }
        } catch {
          // ignore parsing errors; leave as null
        }

        const label = `${name}`
        const value = id || label
        return {
          id,
          name,
          inputTokenLimit,
          outputTokenLimit,
          needsEnable,
          isPremium,
          multiplier,
          label,
          value,
        }
      })
    )

    const out = mapped.filter(Boolean) as ModelDetail[]
    if (out.length > 0) {
      return out
    }
    return null
  } catch {
    return null
  }
}

export const getAvailableModelChoices = async (defaultModelId?: string) => {
  const detailed = (await getAvailableModelsDetailed()) ?? []

  // compute max lengths using simple loops (avoid reduce)
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

export default {
  generateBranchName,
  generateCommitMessage,
}
