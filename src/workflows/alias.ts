/**
 * Shell alias management workflow
 * Installs/removes short aliases for geeto commands in shell config.
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { confirm } from '../cli/input.js'
import { multiSelect } from '../cli/menu.js'
import { colors } from '../utils/colors.js'
import { log } from '../utils/logging.js'
import { isWindows } from '../utils/platform.js'

// ── Alias definitions ──────────────────────────────────────────────

interface AliasEntry {
  /** Short alias name, e.g. "gps" */
  alias: string
  /** Full geeto command */
  command: string
  /** Short description */
  desc: string
}

const ALIASES: AliasEntry[] = [
  { alias: 'gsa', command: 'geeto -sa', desc: 'Stage all' },
  { alias: 'gco', command: 'geeto -c', desc: 'Commit' },
  { alias: 'gps', command: 'geeto -p', desc: 'Push' },
  { alias: 'gpl', command: 'geeto -pl', desc: 'Pull' },
  { alias: 'gsw', command: 'geeto -sw', desc: 'Switch branch' },
  { alias: 'gcl', command: 'geeto -cl', desc: 'Cleanup branches' },
  { alias: 'gpr', command: 'geeto -pr', desc: 'Create PR' },
  { alias: 'gis', command: 'geeto -i', desc: 'Create Issue' },
  { alias: 'glg', command: 'geeto -lg', desc: 'Log / history' },
  { alias: 'gsh', command: 'geeto -sh', desc: 'Stash' },
  { alias: 'gam', command: 'geeto -am', desc: 'Amend commit' },
  { alias: 'gun', command: 'geeto -u', desc: 'Undo' },
  { alias: 'grv', command: 'geeto -rv', desc: 'Revert commit' },
  { alias: 'gtg', command: 'geeto -t', desc: 'Tag / release' },
  { alias: 'gft', command: 'geeto -ft', desc: 'Fetch' },
  { alias: 'gst', command: 'geeto -st', desc: 'Status' },
  { alias: 'gcm', command: 'geeto -cmp', desc: 'Compare branches' },
  { alias: 'gcp', command: 'geeto -cp', desc: 'Cherry-pick' },
  { alias: 'gdr', command: 'geeto -dr', desc: 'Dry-run' },
  { alias: 'gtr', command: 'geeto -tr', desc: 'Trello' },
]

const MARKER_START = '# >>> geeto aliases >>>'
const MARKER_END = '# <<< geeto aliases <<<'

// ── System binary check ────────────────────────────────────────────

/**
 * Check if a name is already a system binary / builtin.
 * Returns the path if found, empty string otherwise.
 */
const systemBinaryPath = (name: string): string => {
  try {
    if (isWindows()) {
      const out = execSync(`where ${name} 2>NUL`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim()
      return out.split('\n')[0] ?? ''
    }
    const out = execSync(`command -v ${name} 2>/dev/null`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    return out
  } catch {
    return ''
  }
}

/**
 * Generate alternative alias names when the preferred one conflicts.
 * Tries: ge-prefix (gpr→gepr), gto-prefix (gpr→gtopr), alias+o (gpr→gpro).
 * Returns the first non-conflicting alternative, or empty string.
 */
const suggestAlternative = (alias: string): string => {
  // Extract the suffix after 'g' (e.g. 'pr' from 'gpr')
  const suffix = alias.startsWith('g') ? alias.slice(1) : alias

  const candidates = [
    `ge${suffix}`, // gpr → gepr
    `gto${suffix}`, // gpr → gtopr
    `${alias}o`, // gpr → gpro
    `gee${suffix}`, // gpr → geepr
  ]

  for (const candidate of candidates) {
    if (!systemBinaryPath(candidate)) {
      return candidate
    }
  }
  return ''
}

// ── Shell profile detection ────────────────────────────────────────

type ShellType = 'zsh' | 'bash' | 'fish' | 'powershell' | 'unknown'

interface ShellInfo {
  type: ShellType
  rcFile: string
}

const detectShell = (): ShellInfo => {
  if (isWindows()) {
    // PowerShell profile
    const psProfile = path.join(
      os.homedir(),
      'Documents',
      'PowerShell',
      'Microsoft.PowerShell_profile.ps1'
    )
    return { type: 'powershell', rcFile: psProfile }
  }

  const shell = process.env.SHELL ?? ''
  const home = os.homedir()

  if (shell.includes('zsh')) {
    return { type: 'zsh', rcFile: path.join(home, '.zshrc') }
  }
  if (shell.includes('bash')) {
    // Prefer .bashrc, fallback to .bash_profile on macOS
    const bashrc = path.join(home, '.bashrc')
    if (fs.existsSync(bashrc)) return { type: 'bash', rcFile: bashrc }
    return { type: 'bash', rcFile: path.join(home, '.bash_profile') }
  }
  if (shell.includes('fish')) {
    return {
      type: 'fish',
      rcFile: path.join(home, '.config', 'fish', 'config.fish'),
    }
  }

  // Fallback: check if common rc files exist
  const zshrc = path.join(home, '.zshrc')
  if (fs.existsSync(zshrc)) return { type: 'zsh', rcFile: zshrc }

  const bashrc = path.join(home, '.bashrc')
  if (fs.existsSync(bashrc)) return { type: 'bash', rcFile: bashrc }

  return { type: 'unknown', rcFile: '' }
}

// ── Alias formatting ───────────────────────────────────────────────

const formatAliasLine = (entry: AliasEntry, shellType: ShellType): string => {
  if (shellType === 'fish') {
    return `alias ${entry.alias} '${entry.command}'`
  }
  if (shellType === 'powershell') {
    // PowerShell needs a function wrapper for commands with args
    return `function ${entry.alias} { ${entry.command} @args }`
  }
  // bash / zsh
  return `alias ${entry.alias}='${entry.command}'`
}

const buildAliasBlock = (entries: AliasEntry[], shellType: ShellType): string => {
  const comment = shellType === 'powershell' ? '#' : '#'
  const lines = [MARKER_START, `${comment} Auto-generated by geeto — do not edit manually`]
  for (const entry of entries) {
    lines.push(formatAliasLine(entry, shellType))
  }
  lines.push(MARKER_END)
  return lines.join('\n')
}

// ── RC file manipulation ───────────────────────────────────────────

const readRcFile = (filePath: string): string => {
  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return ''
  }
}

const getExistingAliases = (content: string): string[] => {
  const startIdx = content.indexOf(MARKER_START)
  const endIdx = content.indexOf(MARKER_END)
  if (startIdx === -1 || endIdx === -1) return []

  const block = content.slice(startIdx, endIdx)
  const aliases: string[] = []
  for (const line of block.split('\n')) {
    // Match alias foo='...' or alias foo '...' or function foo { ... }
    const match = line.match(/^(?:alias\s+(\w+)|function\s+(\w+))/)
    if (match) {
      aliases.push(match[1] ?? match[2] ?? '')
    }
  }
  return aliases.filter(Boolean)
}

/**
 * Scan entire RC file for ALL alias definitions (outside our block too).
 * Returns a map: alias name → resolved command.
 */
const scanAllAliases = (content: string, shellType: ShellType): Map<string, string> => {
  const result = new Map<string, string>()

  // Remove our geeto block so we don't double-count
  let cleaned = content
  const sIdx = content.indexOf(MARKER_START)
  const eIdx = content.indexOf(MARKER_END)
  if (sIdx !== -1 && eIdx !== -1) {
    cleaned = content.slice(0, sIdx) + content.slice(eIdx + MARKER_END.length)
  }

  for (const line of cleaned.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('#')) continue

    if (shellType === 'powershell') {
      // function foo { some-command @args }
      const m = trimmed.match(/^function\s+(\w+)\s*\{(.+)\}/)
      if (m?.[1] && m[2]) result.set(m[1], m[2].trim())
      continue
    }

    // alias foo='bar' or alias foo="bar" or alias foo bar (fish)
    const m =
      trimmed.match(/^alias\s+(\w+)='([^']*)'/) ??
      trimmed.match(/^alias\s+(\w+)="([^"]*)"/) ??
      trimmed.match(/^alias\s+(\w+)\s+'([^']*)'/) ??
      trimmed.match(/^alias\s+(\w+)=(\S+)/)
    if (m?.[1] && m[2]) {
      result.set(m[1], m[2])
    }
  }
  return result
}

const writeAliasBlock = (filePath: string, block: string): void => {
  const dirPath = path.dirname(filePath)
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }

  let content = readRcFile(filePath)

  // Replace existing block or append
  const startIdx = content.indexOf(MARKER_START)
  const endIdx = content.indexOf(MARKER_END)

  if (startIdx !== -1 && endIdx !== -1) {
    const before = content.slice(0, startIdx)
    const after = content.slice(endIdx + MARKER_END.length)
    content = before + block + after
  } else {
    // Append with spacing
    if (content.length > 0 && !content.endsWith('\n')) {
      content += '\n'
    }
    content += `\n${block}\n`
  }

  fs.writeFileSync(filePath, content, 'utf8')
}

const removeAliasBlock = (filePath: string): boolean => {
  const content = readRcFile(filePath)
  const startIdx = content.indexOf(MARKER_START)
  const endIdx = content.indexOf(MARKER_END)
  if (startIdx === -1 || endIdx === -1) return false

  const before = content.slice(0, Math.max(0, startIdx - 1))
  const after = content.slice(endIdx + MARKER_END.length)
  const cleaned = before + after

  fs.writeFileSync(filePath, cleaned, 'utf8')
  return true
}

// ── Main handler ───────────────────────────────────────────────────

export const handleAlias = async (): Promise<void> => {
  log.banner()
  log.step(`${colors.cyan}Shell Aliases${colors.reset}\n`)

  // Detect shell
  const shell = detectShell()
  if (shell.type === 'unknown' || !shell.rcFile) {
    log.error('Could not detect shell. Supported: zsh, bash, fish, PowerShell.')
    return
  }

  console.log(`  ${colors.gray}Shell: ${shell.type}  •  RC: ${shell.rcFile}${colors.reset}`)

  // Check which aliases are already installed (from geeto block)
  const existingContent = readRcFile(shell.rcFile)
  const existingAliases = getExistingAliases(existingContent)

  // Scan ALL aliases in rc file (outside geeto block)
  const rcAliases = scanAllAliases(existingContent, shell.type)

  // Also build reverse map: command → alias name(s) for value conflict check
  const commandToAlias = new Map<string, string>()
  for (const [name, cmd] of rcAliases) {
    commandToAlias.set(cmd, name)
  }

  if (existingAliases.length > 0) {
    console.log(
      `  ${colors.yellow}${existingAliases.length} geeto alias(es) already installed${colors.reset}`
    )
  }
  if (rcAliases.size > 0) {
    console.log(`  ${colors.gray}${rcAliases.size} total alias(es) in RC file${colors.reset}`)
  }
  console.log('')

  // Check system binary conflicts
  const conflicts = new Map<string, string>()
  for (const entry of ALIASES) {
    const bin = systemBinaryPath(entry.alias)
    if (bin) {
      conflicts.set(entry.alias, bin)
    }
  }

  // Compute column widths for alignment
  const maxAlias = Math.max(...ALIASES.map((a) => a.alias.length))
  const maxCmd = Math.max(...ALIASES.map((a) => a.command.length))
  const maxDesc = Math.max(...ALIASES.map((a) => a.desc.length))

  // Build options for multi-select
  const options = ALIASES.map((entry) => {
    const conflict = conflicts.get(entry.alias)
    const installed = existingAliases.includes(entry.alias)
    const existingCmd = rcAliases.get(entry.alias)
    const existingName = commandToAlias.get(entry.command)

    const aliasCol = entry.alias.padEnd(maxAlias)
    const cmdCol = entry.command.padEnd(maxCmd)
    const descCol = entry.desc.padEnd(maxDesc)

    let label = `${aliasCol} → ${cmdCol}  ${colors.gray}${descCol}${colors.reset}`

    if (conflict) {
      const alt = suggestAlternative(entry.alias)
      label += `  ${colors.red}⚠ bin: ${conflict}${colors.reset}`
      if (alt) {
        label += `  ${colors.cyan}→ try: ${alt}${colors.reset}`
      }
    }
    if (existingCmd && !installed) {
      label += `  ${colors.yellow}⚠ exists: ${entry.alias}='${existingCmd}'${colors.reset}`
    }
    if (existingName && existingName !== entry.alias) {
      label += `  ${colors.blue}≈ same as: ${existingName}${colors.reset}`
    }
    if (installed) {
      label += `  ${colors.green}✓ installed${colors.reset}`
    }

    return { label, value: entry.alias }
  })

  const selected = await multiSelect('Select aliases to install:', options)

  if (selected.length === 0) {
    // Check if user wants to remove existing aliases
    if (existingAliases.length > 0) {
      console.log('')
      const remove = confirm('Remove all geeto aliases?', false)
      if (remove) {
        const removed = removeAliasBlock(shell.rcFile)
        if (removed) {
          log.success('All geeto aliases removed.')
          console.log(`  ${colors.gray}Run: source ${shell.rcFile}${colors.reset}`)
        }
      } else {
        log.info('No changes made.')
      }
    } else {
      log.info('No aliases selected.')
    }
    return
  }

  // Filter out conflicting aliases with warning
  const safeEntries: AliasEntry[] = []
  const skippedConflicts: AliasEntry[] = []

  for (const alias of selected) {
    const entry = ALIASES.find((a) => a.alias === alias)
    if (!entry) continue

    if (conflicts.has(alias)) {
      skippedConflicts.push(entry)
    } else {
      safeEntries.push(entry)
    }
  }

  // Warn about conflicts and offer alternatives
  if (skippedConflicts.length > 0) {
    console.log('')
    log.warn('The following aliases conflict with system binaries:')
    for (const entry of skippedConflicts) {
      const bin = conflicts.get(entry.alias) ?? ''
      const alt = suggestAlternative(entry.alias)
      let line = `  ${colors.red}✗${colors.reset} ${entry.alias} → ${bin}`
      if (alt) line += `  ${colors.cyan}(suggested: ${alt})${colors.reset}`
      console.log(line)
    }
    console.log('')

    // Auto-use alternatives for conflicting aliases
    const hasAlternatives = skippedConflicts.some((e) => suggestAlternative(e.alias) !== '')
    if (hasAlternatives) {
      const useAlts = confirm('Use suggested alternatives instead?')
      if (useAlts) {
        for (const entry of skippedConflicts) {
          const alt = suggestAlternative(entry.alias)
          if (alt) {
            safeEntries.push({ ...entry, alias: alt })
          }
        }
      } else {
        const force = confirm('Install conflicting aliases anyway?', false)
        if (force) {
          safeEntries.push(...skippedConflicts)
        }
      }
    } else {
      const force = confirm('Install conflicting aliases anyway?', false)
      if (force) {
        safeEntries.push(...skippedConflicts)
      }
    }
  }

  if (safeEntries.length === 0) {
    log.info('No aliases to install.')
    return
  }

  // Preview
  console.log('')
  console.log(`  ${colors.bright}Installing ${safeEntries.length} alias(es):${colors.reset}`)
  for (const entry of safeEntries) {
    console.log(
      `  ${colors.green}+${colors.reset} ${colors.cyan}${entry.alias}${colors.reset} → ${entry.command}`
    )
  }
  console.log('')

  const doInstall = confirm('Write to ' + shell.rcFile + '?')
  if (!doInstall) {
    log.info('Cancelled.')
    return
  }

  // Write
  const block = buildAliasBlock(safeEntries, shell.type)
  writeAliasBlock(shell.rcFile, block)

  log.success(`${safeEntries.length} alias(es) installed!`)

  if (shell.type === 'fish') {
    console.log(`  ${colors.gray}Run: source ${shell.rcFile}${colors.reset}`)
  } else if (shell.type === 'powershell') {
    console.log(`  ${colors.gray}Run: . $PROFILE${colors.reset}`)
  } else {
    console.log(`  ${colors.gray}Run: source ${shell.rcFile}${colors.reset}`)
  }
}
