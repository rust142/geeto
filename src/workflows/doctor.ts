/**
 * Doctor workflow
 * Diagnose installation, show where geeto lives, and smart uninstall.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { confirm } from '../cli/input.js'
import { colors } from '../utils/colors.js'
import { execSilent } from '../utils/exec.js'
import { log } from '../utils/logging.js'
import { VERSION } from '../version.js'

// ── Types ──────────────────────────────────────────────────────────

type InstallMethod = 'homebrew' | 'npm' | 'bun' | 'binary' | 'unknown'

interface InstallInfo {
  binPath: string
  method: InstallMethod
  version: string
  configDir: string
}

// ── Alias markers (must match src/workflows/alias.ts) ──────────────

const MARKER_START = '# >>> geeto aliases >>>'
const MARKER_END = '# <<< geeto aliases <<<'

// ── Detection helpers ──────────────────────────────────────────────

const findBinaryPath = (): string => {
  try {
    return execSilent('which geeto').trim()
  } catch {
    try {
      return execSilent('command -v geeto').trim()
    } catch {
      return ''
    }
  }
}

const detectMethodFromPath = (binPath: string): InstallMethod => {
  if (binPath.includes('/opt/homebrew/') || binPath.includes('/usr/local/Cellar/')) {
    return 'homebrew'
  }
  if (binPath.includes('node_modules')) {
    return 'npm'
  }
  if (binPath.includes('.bun')) {
    return 'bun'
  }
  return 'binary'
}

const confirmWithPackageManager = (guess: InstallMethod): InstallMethod => {
  // Double-check Homebrew
  if (guess === 'homebrew' || guess === 'binary') {
    try {
      const result = execSilent('brew list geeto').trim()
      if (result) return 'homebrew'
    } catch {
      // not installed via brew
    }
  }

  // Double-check npm
  if (guess === 'npm' || guess === 'binary') {
    try {
      const result = execSilent('npm list -g geeto').trim()
      if (result && !result.includes('empty')) return 'npm'
    } catch {
      // not installed via npm
    }
  }

  // Double-check bun
  if (guess === 'bun' || guess === 'binary') {
    try {
      const result = execSilent('bun pm ls -g').trim()
      if (result.includes('geeto')) return 'bun'
    } catch {
      // not installed via bun
    }
  }

  return guess
}

const getConfigDir = (): string => {
  const homeConfig = path.join(os.homedir(), '.geeto')
  if (fs.existsSync(homeConfig)) return homeConfig

  const localConfig = path.resolve('.geeto')
  if (fs.existsSync(localConfig)) return localConfig

  return homeConfig // default even if not yet created
}

const methodLabel = (method: InstallMethod): string => {
  const labels: Record<InstallMethod, string> = {
    homebrew: 'Homebrew',
    npm: 'npm (global)',
    bun: 'bun (global)',
    binary: 'Standalone binary',
    unknown: 'Unknown',
  }
  return labels[method]
}

// ── Core detection ─────────────────────────────────────────────────

const detectInstallation = (): InstallInfo => {
  const binPath = findBinaryPath()

  let method: InstallMethod = 'unknown'
  if (binPath) {
    const guess = detectMethodFromPath(binPath)
    method = confirmWithPackageManager(guess)
  }

  // Get version from the installed binary, not from source code
  let version = VERSION
  if (binPath && binPath !== '(not found in PATH)') {
    try {
      const out = execSilent(`"${binPath}" --version`).trim()
      // Extract version number (e.g. "geeto 0.7.0-alpha.2" → "0.7.0-alpha.2")
      const match = out.match(/\d+\.\d+\.\d+[\w.-]*/)
      if (match) version = match[0]
    } catch {
      // Fallback to source version
    }
  }

  return {
    binPath: binPath || '(not found in PATH)',
    method,
    version,
    configDir: getConfigDir(),
  }
}

// ── Shell RC helpers ───────────────────────────────────────────────

const detectRcFile = (): string => {
  const shell = process.env.SHELL ?? ''
  const home = os.homedir()

  if (shell.includes('zsh')) return path.join(home, '.zshrc')
  if (shell.includes('bash')) {
    const bashrc = path.join(home, '.bashrc')
    if (fs.existsSync(bashrc)) return bashrc
    return path.join(home, '.bash_profile')
  }
  if (shell.includes('fish')) return path.join(home, '.config', 'fish', 'config.fish')

  // Fallback
  const zshrc = path.join(home, '.zshrc')
  if (fs.existsSync(zshrc)) return zshrc
  const bashrc = path.join(home, '.bashrc')
  if (fs.existsSync(bashrc)) return bashrc

  return ''
}

const hasAliasBlock = (rcPath: string): boolean => {
  if (!rcPath || !fs.existsSync(rcPath)) return false
  try {
    const content = fs.readFileSync(rcPath, 'utf8')
    return content.includes(MARKER_START) && content.includes(MARKER_END)
  } catch {
    return false
  }
}

const removeAliasBlock = (rcPath: string): boolean => {
  if (!rcPath || !fs.existsSync(rcPath)) return false
  try {
    const content = fs.readFileSync(rcPath, 'utf8')
    const startIdx = content.indexOf(MARKER_START)
    const endIdx = content.indexOf(MARKER_END)
    if (startIdx === -1 || endIdx === -1) return false

    const before = content.slice(0, Math.max(0, startIdx - 1))
    const after = content.slice(endIdx + MARKER_END.length)
    fs.writeFileSync(rcPath, before + after, 'utf8')
    return true
  } catch {
    return false
  }
}

// ── Public workflows ───────────────────────────────────────────────

export async function handleWhereInstalled(): Promise<void> {
  const C = colors.cyan
  const G = colors.gray
  const R = colors.reset
  const B = colors.bright

  const info = detectInstallation()

  console.log('')
  log.info(`${B}Geeto Installation Info${R}`)
  console.log('')
  console.log(`  ${G}Path:${R}     ${C}${info.binPath}${R}`)
  console.log(`  ${G}Method:${R}   ${C}${methodLabel(info.method)}${R}`)
  console.log(`  ${G}Version:${R}  ${C}${info.version}${R}`)
  console.log(`  ${G}Config:${R}   ${C}${info.configDir}${R}`)

  const rcFile = detectRcFile()
  if (rcFile && hasAliasBlock(rcFile)) {
    console.log(`  ${G}Aliases:${R}  ${C}${rcFile}${R}`)
  }

  console.log('')
}

export async function handleUninstall(): Promise<void> {
  const R = colors.reset
  const Y = colors.yellow
  const RED = colors.red

  const info = detectInstallation()

  // ── Show current installation info ───────────────────────────────
  await handleWhereInstalled()

  if (info.method === 'unknown') {
    log.error('Could not detect geeto installation. Is it installed?')
    return
  }

  // ── Confirm uninstall ────────────────────────────────────────────
  const shouldUninstall = confirm(`${RED}Are you sure you want to uninstall geeto?${R}`, false)
  if (!shouldUninstall) {
    log.info('Uninstall cancelled.')
    return
  }

  // ── Ask about config removal ─────────────────────────────────────
  const configExists = fs.existsSync(info.configDir)
  let removeConfig = false
  if (configExists) {
    removeConfig = confirm(`Remove config directory? ${Y}(${info.configDir})${R}`, false)
  }

  // ── Ask about alias removal ──────────────────────────────────────
  const rcFile = detectRcFile()
  const aliasesExist = hasAliasBlock(rcFile)
  let removeAliases = false
  if (aliasesExist) {
    removeAliases = confirm(`Remove shell aliases from ${Y}${rcFile}${R}?`, false)
  }

  // ── Execute uninstall ────────────────────────────────────────────
  log.step('Uninstalling geeto…')

  try {
    switch (info.method) {
      case 'homebrew': {
        execSilent('brew uninstall geeto')
        break
      }
      case 'npm': {
        execSilent('npm uninstall -g geeto')
        break
      }
      case 'bun': {
        execSilent('bun remove -g geeto')
        break
      }
      case 'binary': {
        if (info.binPath && info.binPath !== '(not found in PATH)') {
          fs.unlinkSync(info.binPath)
        }
        break
      }
    }
    log.success('geeto binary removed.')
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    log.error(`Failed to uninstall: ${msg}`)
    log.warn('You may need to run with sudo or remove manually.')
    return
  }

  // ── Remove config if requested ───────────────────────────────────
  if (removeConfig) {
    try {
      fs.rmSync(info.configDir, { recursive: true, force: true })
      log.success(`Config removed: ${info.configDir}`)
    } catch {
      log.warn(`Could not remove ${info.configDir} — remove manually.`)
    }
  }

  // ── Remove aliases if requested ──────────────────────────────────
  if (removeAliases) {
    const removed = removeAliasBlock(rcFile)
    if (removed) {
      log.success(`Aliases removed from ${rcFile}`)
      log.info('Restart your shell or run: source ' + rcFile)
    } else {
      log.warn(`Could not find alias block in ${rcFile}`)
    }
  }

  console.log('')
  log.success('geeto has been uninstalled. Thanks for using it! 👋')
  console.log('')
}
