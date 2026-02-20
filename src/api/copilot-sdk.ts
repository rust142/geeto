/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { CopilotClient as _CopilotClient, Session } from '@github/copilot-sdk'
import { CopilotClient } from '@github/copilot-sdk'

import { exec } from '../utils/exec.js'
import { log } from '../utils/logging.js'

// Copilot SDK wrapper (lazy-load, optional)

// Minimum Copilot CLI version required for SDK compatibility
export const MIN_COPILOT_VERSION = '0.0.400'

// Cache file path for storing copilot binary info
const CACHE_FILE = path.join(os.homedir(), '.cache', 'geeto', 'copilot-bin.json')
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

interface CopilotBinCache {
  path: string
  version: string
  timestamp: number
}

/**
 * Parse version string to numeric value for comparison.
 */
export const parseParts = (v: string): number => {
  const parts = v.split('.').map((n) => Number.parseInt(n, 10))
  const [major = 0, minor = 0, patch = 0] = parts
  return major * 1_000_000 + minor * 1_000 + patch
}

/**
 * Read cached copilot binary info from file.
 */
const readCache = (): CopilotBinCache | null => {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) as CopilotBinCache
    // Check if cache is still valid (within TTL and binary still exists)
    if (Date.now() - data.timestamp < CACHE_TTL_MS && fs.existsSync(data.path)) {
      return data
    }
  } catch {
    // ignore
  }
  return null
}

/**
 * Write copilot binary info to cache file.
 */
const writeCache = (info: { path: string; version: string }): void => {
  try {
    const cacheDir = path.dirname(CACHE_FILE)
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true })
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ ...info, timestamp: Date.now() }))
  } catch {
    // ignore cache write failures
  }
}

/**
 * Get version from a specific copilot binary path.
 */
const getVersionFromPath = (binPath: string): string | null => {
  try {
    const verOut = exec(`"${binPath}" --version`, true)
    const m = verOut.match(/(\d+\.\d+\.\d+)/)
    return m?.[1] ?? null
  } catch {
    return null
  }
}

/**
 * Find the best (newest) copilot binary from known locations.
 * Uses file-based caching to avoid slow exec calls on every startup.
 */
export const findBestCopilotBinary = (): { path: string; version: string } | null => {
  const minNum = parseParts(MIN_COPILOT_VERSION)

  // Super fast path: check cache first
  const cached = readCache()
  if (cached && parseParts(cached.version) >= minNum) {
    return { path: cached.path, version: cached.version }
  }

  // Check PATH first (most common case)
  try {
    const pathBin = exec('which copilot', true).trim()
    if (pathBin && fs.existsSync(pathBin)) {
      const ver = getVersionFromPath(pathBin)
      if (ver) {
        const num = parseParts(ver)
        if (num >= minNum) {
          const result = { path: pathBin, version: ver }
          writeCache(result)
          return result
        }
      }
    }
  } catch {
    // ignore, will check other locations
  }

  // PATH version is outdated or not found - scan known locations
  const home = os.homedir()
  const knownPaths = [
    '/usr/local/bin/copilot',
    '/usr/bin/copilot',
    path.join(home, '.config/Code/User/globalStorage/github.copilot-chat/copilotCli/copilot'),
    path.join(home, '.npm-global/bin/copilot'),
    path.join(home, '.local/bin/copilot'),
  ]

  for (const binPath of knownPaths) {
    if (fs.existsSync(binPath)) {
      const ver = getVersionFromPath(binPath)
      if (ver) {
        const num = parseParts(ver)
        if (num >= minNum) {
          const result = { path: binPath, version: ver }
          writeCache(result)
          return result
        }
      }
    }
  }

  return null
}

// Cached best copilot binary info
let cachedCopilotPath: string | null = null

/**
 * Check if Copilot CLI version is compatible with SDK.
 * Automatically finds the newest copilot binary to bypass PATH cache issues.
 * Returns true if compatible, false otherwise.
 */
export const checkCopilotCliVersion = (): boolean => {
  const best = findBestCopilotBinary()
  if (!best) {
    return false
  }

  const minNum = parseParts(MIN_COPILOT_VERSION)
  const currentNum = parseParts(best.version)

  if (currentNum >= minNum) {
    // Cache the path for the SDK to use
    cachedCopilotPath = best.path
    // Update PATH so CopilotClient can find it
    if (cachedCopilotPath) {
      const binDir = path.dirname(cachedCopilotPath)
      if (!process.env.PATH?.startsWith(binDir)) {
        process.env.PATH = `${binDir}:${process.env.PATH}`
      }
    }
    return true
  }

  return false
}

let client: _CopilotClient | null = null
let versionChecked = false
let versionCompatible = false

const ensureClient = async (): Promise<boolean> => {
  // Check CLI version once before attempting to start client
  if (!versionChecked) {
    versionChecked = true
    versionCompatible = checkCopilotCliVersion()
  }

  if (!versionCompatible) {
    return false
  }

  if (client) {
    return true
  }
  try {
    // Suppress Node.js experimental warnings from copilot subprocess
    process.env.NODE_NO_WARNINGS = '1'
    client = new CopilotClient({ autoStart: true })
    // Narrow client into a local const to satisfy strict no-non-null assertions
    const startedClient = client
    if (!startedClient) {
      return false
    }
    await startedClient.start()
    return true
  } catch (error: unknown) {
    // SDK optional: log info and fall back
    const msg = error instanceof Error && error.message ? error.message : String(error)
    log.info(msg)
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
      console.log('') // Force newline to separate from any active spinner
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
        .replaceAll(/```[\S\s]*?```/g, '')
        .replaceAll(/^"+|"+$/g, '')
        .trim()
      const normalized = cleaned.replaceAll(/\n\s*\n+/g, '\n\n').trim()
      return normalized && normalized.length >= 8 ? normalized : null
    } catch (error) {
      console.log('') // Force newline to separate from any active spinner
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

export const generateReleaseNotes = async (
  commits: string,
  language: 'en' | 'id',
  correction?: string,
  model?: string
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

  const result = await withSession(model, async (session) => {
    try {
      const response = await session.sendAndWait({ prompt })
      const content = response?.data?.content ?? ''
      const cleaned = String(content)
        .replaceAll(/```[\S\s]*?```/g, '')
        .replaceAll(/^"+|"+$/g, '')
        .trim()
      return cleaned || null
    } catch (error) {
      console.log('')
      log.error('Copilot Error: ' + String(error))
      return null
    }
  })

  return result
}

export default {
  generateBranchName,
  generateCommitMessage,
  generateReleaseNotes,
}
