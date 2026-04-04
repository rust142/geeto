/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { CopilotClient as _CopilotClient, Session } from '@github/copilot-sdk'
import { CopilotClient } from '@github/copilot-sdk'

import {
  buildPromptWithCorrection,
  buildReleaseNotesPrompt,
  cleanAIContent,
  MIN_AI_RESPONSE_LENGTH,
  normalizeBranchName,
} from '../utils/ai-text.js'
import { exec } from '../utils/exec.js'
import { log } from '../utils/logging.js'

// Copilot SDK wrapper (lazy-load, optional)

// Minimum Copilot CLI version required for SDK compatibility
export const MIN_COPILOT_VERSION = '0.0.400'

// Minimum Node.js version for Copilot SDK JS fallback (requires node:sqlite)
const MIN_NODE_VERSION_FOR_COPILOT = '22.5.0'

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
 * Find the bundled native binary shipped with @github/copilot.
 * The native binary (Mach-O / ELF) works without Node.js,
 * bypassing the node:sqlite requirement entirely.
 */
const findBundledNativeBinary = (): string | null => {
  const platform = os.platform()
  const arch = os.arch()
  const isWin = platform === 'win32'
  const binName = isWin ? 'copilot.exe' : 'copilot'
  const pkg = `@github/copilot-${platform}-${arch}`

  // Walk up from this file (or cwd) to find node_modules
  const searchRoots = [process.cwd()]
  try {
    // __dirname equivalent for ESM — find the package from copilot-sdk location
    const sdkEntry = import.meta.resolve?.('@github/copilot-sdk')
    if (sdkEntry) {
      const sdkDir = path.dirname(sdkEntry.replace('file://', ''))
      // Go up to node_modules parent
      const nmIdx = sdkDir.lastIndexOf('node_modules')
      if (nmIdx !== -1) searchRoots.unshift(sdkDir.slice(0, nmIdx))
    }
  } catch {
    // ignore
  }

  for (const root of searchRoots) {
    const binPath = path.join(root, 'node_modules', pkg, binName)
    if (fs.existsSync(binPath)) return binPath
  }
  return null
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
  const isWin = os.platform() === 'win32'
  const copilotBin = isWin ? 'copilot.exe' : 'copilot'

  // Super fast path: check cache first
  const cached = readCache()
  if (cached && fs.existsSync(cached.path) && parseParts(cached.version) >= minNum) {
    return { path: cached.path, version: cached.version }
  }

  // Check PATH first (most common case)
  try {
    const whichCmd = isWin ? 'where copilot' : 'which copilot'
    const pathBin = exec(whichCmd, true).trim().split('\n')[0]?.trim() // `where` may return multiple
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
  const knownPaths: string[] = isWin
    ? [
        // Windows install locations (matches copilot-setup.ts)
        path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'GitHub CLI', copilotBin),
        'C:\\Program Files\\GitHub CLI\\' + copilotBin,
        'C:\\Program Files (x86)\\GitHub CLI\\' + copilotBin,
        path.join(home, 'AppData', 'Roaming', 'npm', copilotBin),
        path.join(home, 'scoop', 'shims', copilotBin),
        path.join(
          home,
          '.config',
          'Code',
          'User',
          'globalStorage',
          'github.copilot-chat',
          'copilotCli',
          copilotBin
        ),
      ]
    : [
        // macOS / Linux install locations (matches copilot-setup.ts)
        '/opt/homebrew/bin/copilot',
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

/**
 * Check if Copilot CLI version is compatible with SDK.
 * The standalone CLI is used as fallback when the bundled CLI is unavailable
 * (e.g. in bun-compiled binaries). Also used for setup guidance.
 */
export const checkCopilotCliVersion = (): boolean => {
  const best = findBestCopilotBinary()
  if (!best) {
    return false
  }
  return parseParts(best.version) >= parseParts(MIN_COPILOT_VERSION)
}

let client: _CopilotClient | null = null

/**
 * Lazily start the Copilot SDK client.
 *
 * Resolution order:
 * 1. Bundled native binary – platform-specific Mach-O/ELF from @github/copilot-{platform}-{arch}.
 *    Works on ANY Node/Bun version (no node:sqlite needed).
 * 2. Bundled JS CLI – SDK default (@github/copilot/index.js). Requires Node 22.5+ for node:sqlite.
 * 3. System CLI – Standalone Copilot CLI binary found on PATH or known locations
 *    (used when bundled CLI is unavailable, e.g. Bun-compiled binary).
 */
const ensureClient = async (): Promise<boolean> => {
  if (client) {
    return true
  }

  // Suppress Node.js experimental warnings from copilot subprocess
  process.env.NODE_NO_WARNINGS = '1'

  const nodeVersion = process.versions.node
  const nodeOk = parseParts(nodeVersion) >= parseParts(MIN_NODE_VERSION_FOR_COPILOT)

  // ── Attempt 1: bundled native binary (no Node.js dependency) ──────────
  const nativeBin = findBundledNativeBinary()
  if (nativeBin) {
    try {
      client = new CopilotClient({ cliPath: nativeBin, autoStart: true })
      await client.start()
      return true
    } catch (nativeError: unknown) {
      const nativeMsg = nativeError instanceof Error ? nativeError.message : String(nativeError)
      client = null
      // Fall through to JS fallback — only log in verbose situations
      if (nativeMsg.includes('headless') || nativeMsg.includes('Unknown flag')) {
        log.clearLine()
        log.gap()
        log.info('Copilot SDK: native binary does not support --headless.')
        log.info('Upgrade SDK: bun add @github/copilot-sdk@latest')
        log.gap()
        return false
      }
      // Otherwise silently fall through to next attempt
    }
  }

  // ── Attempt 2: bundled JS CLI (default SDK behaviour, needs Node 22.5+) ──
  if (nodeOk) {
    try {
      client = new CopilotClient({ autoStart: true })
      await client.start()
      return true
    } catch (bundledError: unknown) {
      const bundledMsg = bundledError instanceof Error ? bundledError.message : String(bundledError)
      client = null

      // Only fall through to system CLI when the bundled CLI cannot be resolved
      const isMissingModule =
        bundledMsg.includes('Cannot find module') ||
        bundledMsg.includes('ResolveMessage') ||
        bundledMsg.includes('ENOENT')

      if (!isMissingModule) {
        log.clearLine()
        log.gap()
        if (bundledMsg.includes('protocol version mismatch')) {
          log.info('SDK protocol mismatch with bundled Copilot CLI.')
          log.info('  • Downgrade Copilot CLI to v1.0.16: copilot update --version 1.0.16')
          log.info('  • Or wait for Geeto v0.8.0+ with updated SDK')
        } else if (bundledMsg.includes('headless') || bundledMsg.includes('Unknown flag')) {
          log.info('Copilot SDK: bundled CLI does not support --headless (Bun compat issue).')
          log.info('Upgrade SDK: bun add @github/copilot-sdk@latest')
        } else {
          log.info(`Copilot SDK unavailable: ${bundledMsg}`)
        }
        log.gap()
        return false
      }
    }
  }

  // ── Attempt 3: system Copilot CLI (standalone native binary) ──────────
  const systemCli = findBestCopilotBinary()
  if (systemCli) {
    try {
      log.clearLine()
      log.gap()
      log.info(`Using system Copilot CLI (v${systemCli.version})`)
      log.gap()
      client = new CopilotClient({ cliPath: systemCli.path, autoStart: true })
      await client.start()
      return true
    } catch (systemError: unknown) {
      const sysMsg = systemError instanceof Error ? systemError.message : String(systemError)
      log.clearLine()
      log.gap()

      // Detect SDK protocol version mismatch
      const protoMatch = sysMsg.match(/SDK expects version (\d+).*server reports version (\d+)/)
      if (protoMatch) {
        const sdkProto = protoMatch[1]
        const serverProto = protoMatch[2]
        log.info(`Protocol mismatch: SDK expects v${sdkProto}, Copilot CLI reports v${serverProto}`)
        if (Number(serverProto) > Number(sdkProto)) {
          log.info('Your Copilot CLI is newer than this Geeto version supports.')
          log.info('Options:')
          log.info('  • Downgrade Copilot CLI to v1.0.16: copilot update --version 1.0.16')
          log.info('  • Wait for Geeto v0.8.0+ which will support newer Copilot CLI')
        } else {
          log.info('Your Copilot CLI is too old for this SDK version.')
          log.info('  • Update Copilot CLI: copilot update')
        }
      } else {
        log.info(`System Copilot CLI failed: ${sysMsg}`)
      }
      log.gap()
      client = null
    }
  }

  // ── All attempts exhausted ────────────────────────────────────────────
  log.clearLine()
  log.gap()
  if (!nodeOk && !nativeBin) {
    log.warn(`Copilot requires Node.js ${MIN_NODE_VERSION_FOR_COPILOT}+ (you have ${nodeVersion}).`)
    log.info('The node:sqlite module is not available in your current version.')
  }
  log.info('No working Copilot CLI found. Use Gemini / OpenRouter instead,')
  log.info('or install Copilot CLI: brew install copilot-cli')
  log.gap()
  return false
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
  const prompt = buildPromptWithCorrection('branch-name-prompt.md', text, 'Input', correction)

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
      const cleaned = normalizeBranchName(first)
      return cleaned || null
    } catch (error) {
      log.clearLine()
      log.gap()
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
  const prompt = buildPromptWithCorrection('commit-message-prompt.md', diff, 'Diff', correction)

  const result = await withSession(model, async (session) => {
    try {
      const response = await session.sendAndWait({ prompt })
      const content = response?.data?.content ?? ''
      return cleanAIContent(String(content), {
        normalizeBlankLines: true,
        minLength: MIN_AI_RESPONSE_LENGTH,
      })
    } catch (error) {
      log.clearLine()
      log.gap()
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
  const prompt = buildReleaseNotesPrompt(commits, language, correction)

  const result = await withSession(model, async (session) => {
    try {
      const response = await session.sendAndWait({ prompt })
      const content = response?.data?.content ?? ''
      return cleanAIContent(String(content))
    } catch (error) {
      log.clearLine()
      log.gap()
      log.error('Copilot Error: ' + String(error))
      return null
    }
  })

  return result
}

/** Send a raw prompt to Copilot and return the text response. */
export const generateText = async (prompt: string, model?: string): Promise<string | null> => {
  const result = await withSession(model, async (session) => {
    try {
      const response = await session.sendAndWait({ prompt })
      const content = response?.data?.content ?? ''
      return cleanAIContent(String(content))
    } catch {
      return null
    }
  })
  return result
}

export default {
  generateBranchName,
  generateCommitMessage,
  generateReleaseNotes,
  generateText,
}
