/**
 * Interactive input utilities
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

/**
 * Ask a question and return user input
 */
export const askQuestion = (question: string, defaultValue?: string): string => {
  if (process.stdin.isTTY && process.stdin.isRaw) {
    process.stdin.setRawMode(false)
  }

  const platform = os.platform()
  const fullQuestion = defaultValue ? `${question} (${defaultValue}) ` : question
  process.stdout.write(fullQuestion)

  const result =
    platform === 'win32'
      ? spawnSync('powershell', ['-Command', '$input = Read-Host; Write-Output $input'], {
          stdio: ['inherit', 'pipe', 'inherit'],
          encoding: 'utf8',
        })
      : spawnSync('bash', ['-c', 'read -r line && echo "$line"'], {
          stdio: ['inherit', 'pipe', 'inherit'],
          encoding: 'utf8',
        })

  const input = result.stdout?.trim() ?? ''
  return input ?? defaultValue ?? ''
}

/**
 * Progress bar utility for long operations
 */
export class ProgressBar {
  private total: number
  private current: number
  private width: number
  private title: string

  constructor(total: number, title: string = 'Progress', width: number = 40) {
    this.total = total
    this.current = 0
    this.width = width
    this.title = title
  }

  update(current: number): void {
    this.current = Math.min(current, this.total)
    this.render()
  }

  increment(amount: number = 1): void {
    this.current = Math.min(this.current + amount, this.total)
    this.render()
  }

  complete(): void {
    this.current = this.total
    this.render()
    console.log('') // New line after completion
  }

  private render(): void {
    const percentage = this.total > 0 ? Math.round((this.current / this.total) * 100) : 0
    const filled = Math.round((this.current / this.total) * this.width)
    const empty = this.width - filled

    const bar = '█'.repeat(filled) + '░'.repeat(empty)
    const status = `${this.current}/${this.total} (${percentage}%)`

    process.stdout.write(`\r${this.title}: [${bar}] ${status}`)
  }
}

/**
 * Syntax highlighting for git diff output
 */
export const highlightDiff = (diff: string): string => {
  return diff
    .replaceAll(/^(\+{3}|-{3}).*$/gm, '\u001B[36m$1\u001B[0m') // File headers (cyan)
    .replaceAll(/^@@.*@@$/gm, '\u001B[33m$1\u001B[0m') // Hunk headers (yellow)
    .replaceAll(/^(\+.*)$/gm, '\u001B[32m$1\u001B[0m') // Added lines (green)
    .replaceAll(/^(-.*)$/gm, '\u001B[31m$1\u001B[0m') // Removed lines (red)
    .replaceAll(/^(\s.*)$/gm, '\u001B[37m$1\u001B[0m') // Context lines (white)
}

/**
 * Ask a yes/no confirmation question
 */
export const confirm = (question: string, defaultYes: boolean = true): boolean => {
  const suffix = defaultYes ? ' (Y/n): ' : ' (y/N): '
  const answer = askQuestion(`${question}${suffix}`)
  if (answer === '') {
    return defaultYes
  }
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes'
}

/**
 * Inline multi-line text editor that runs entirely inside the CLI.
 * Returns the edited text or `null` when the user presses Escape to cancel.
 *
 * Controls:
 *   Arrow keys  — navigate
 *   Enter       — new line
 *   Backspace   — delete left
 *   Delete      — delete right
 *   Home / End  — start / end of line
 *   Ctrl+S      — save and exit
 *   Escape      — cancel
 */

/* ── Syntax highlighting ──────────────────────────── */

type SyntaxRule = { re: RegExp; c: string }

const buildKwRegex = (kw: string): RegExp => new RegExp(String.raw`\b(${kw})\b`, 'g') // eslint-disable-line

const SH_RE = buildKwRegex(
  'if|then|else|elif|fi|for|do|done|while|case|' +
    'esac|in|function|return|export|source|alias|local|readonly'
)
const JS_RE = buildKwRegex(
  'const|let|var|function|return|if|else|for|while|' +
    'do|switch|case|break|continue|import|export|from|' +
    'default|class|extends|new|this|async|await|try|' +
    'catch|throw|typeof|instanceof|of|in|true|false|null|undefined'
)
const PY_RE = buildKwRegex(
  'def|class|if|elif|else|for|while|return|import|' +
    'from|as|try|except|finally|with|yield|lambda|' +
    'pass|break|continue|and|or|not|in|is|True|False|' +
    'None|self|async|await'
)

const rulesFor = (ext: string): SyntaxRule[] => {
  const g = '\u001B[32m' // green
  const y = '\u001B[33m' // yellow
  const c = '\u001B[36m' // cyan
  const gr = '\u001B[90m' // gray
  const m = '\u001B[35m' // magenta
  const str: SyntaxRule = { re: /(['"`])(?:(?!\1).)*\1/g, c: g }
  const num: SyntaxRule = { re: /\b\d+\.?\d*\b/g, c: m }

  if (/^\.(sh|bash|bashrc|zshrc|zsh|profile|bash_profile)$/.test(ext)) {
    return [{ re: /#.*/g, c: gr }, str, { re: /\$\{?\w+\}?/g, c: y }, { re: SH_RE, c }]
  }
  if (/^\.(js|ts|jsx|tsx|mjs|cjs)$/.test(ext)) {
    return [{ re: /\/\/.*/g, c: gr }, str, { re: JS_RE, c }, num]
  }
  if (ext === '.py') {
    return [{ re: /#.*/g, c: gr }, str, { re: PY_RE, c }, num]
  }
  if (ext === '.json') {
    return [str, num, { re: /\b(true|false|null)\b/g, c }]
  }
  if (ext === '.md') {
    return [
      { re: /^#{1,6}\s.*/g, c },
      { re: /\*\*[^*]+\*\*/g, c: y },
      { re: /`[^`]+`/g, c: g },
    ]
  }
  if (/^\.(ya?ml|toml)$/.test(ext)) {
    return [
      { re: /#.*/g, c: gr },
      str,
      { re: /^[\w.-]+(?=\s*[=:])/gm, c },
      { re: /\b(true|false)\b/g, c: m },
      num,
    ]
  }
  if (/^\.(s?css)$/.test(ext)) {
    return [{ re: /\/\*.+?\*\//g, c: gr }, str, { re: /[.#][\w-]+/g, c: y }, num]
  }
  return [{ re: /#.*/g, c: gr }, str, num]
}

/** Apply syntax highlighting via sequential replacement */
const colorize = (text: string, rules: SyntaxRule[]): string => {
  if (rules.length === 0 || text.length === 0) return text
  let r = text
  for (const rule of rules) {
    r = r.replaceAll(rule.re, (m) => `${rule.c}${m}\u001B[0m`)
  }
  return r
}

export const editInline = (
  initialText: string,
  label = 'Edit Message',
  syntax = ''
): Promise<string | null> => {
  return new Promise((resolve) => {
    const synRules = syntax ? rulesFor(syntax) : []
    const lines = initialText.split('\n')
    let row = 0
    let col = lines[0]?.length ?? 0
    let rendered = false

    const cols = process.stdout.columns || 80
    const maxRows = Math.max(Math.min((process.stdout.rows || 24) - 6, 20), 3)
    // totalLines = maxRows content + 1 footer (no header anymore)
    const totalLines = maxRows + 1

    // Use \r\n everywhere — Bun raw mode may disable OPOST
    // which means bare \n won't carriage-return
    const NL = '\r\n'

    /* ── helpers ────────────────────────────────────── */

    const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

    const lineAt = (r: number): string => lines[r] ?? ''

    const render = () => {
      let frame = ''

      if (rendered) {
        // Go up one line at a time (most compatible) and clear each
        for (let i = 0; i < totalLines; i++) {
          frame += '\u001B[A' // CUU — cursor up 1
        }
        frame += '\r' // ensure column 0
        frame += '\u001B[0J' // ED 0 — clear from cursor to end of screen
      }
      rendered = true

      // Content lines — reserve 1 extra col for cursor at end of line
      const scrollTop = Math.max(0, row - maxRows + 1)
      for (let i = 0; i < maxRows; i++) {
        const idx = scrollTop + i
        if (idx < lines.length) {
          const num = String(idx + 1).padStart(3)
          const line = lines[idx] ?? ''
          const maxLen = cols - 9
          const visible = line.length > maxLen ? line.slice(0, maxLen - 1) + '…' : line

          if (idx === row) {
            const c = clamp(col, 0, visible.length)
            const before = colorize(visible.slice(0, c), synRules)
            const cursor = visible[c] ?? ' '
            const after = colorize(visible.slice(c + 1), synRules)
            frame += `  \u001B[90m${num}\u001B[0m \u001B[36m│\u001B[0m ${before}\u001B[7m${cursor}\u001B[27m${after}${NL}`
          } else {
            const hl = colorize(visible, synRules)
            frame += `  \u001B[90m${num}\u001B[0m \u001B[90m│\u001B[0m ${hl}${NL}`
          }
        } else {
          frame += `  \u001B[90m    │ ~\u001B[0m${NL}`
        }
      }

      // Footer — title + hints + cursor position
      frame += `  \u001B[36m─── ${label} ───\u001B[0m  \u001B[90mCtrl+S save · Esc cancel · Ctrl+K del line · ⌥←→ word · Ln ${row + 1}/${lines.length} · Col ${col + 1}\u001B[0m${NL}`

      process.stdout.write(frame)
    }

    /* ── raw-mode input handling ───────────────────── */

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true)
    }
    process.stdin.resume()

    // Hide cursor (we draw our own)
    process.stdout.write('\u001B[?25l')

    render()

    // Track escape sequence state to distinguish Esc from arrow keys
    let escBuf = ''
    let escTimer: NodeJS.Timeout | null = null

    const cleanup = () => {
      process.stdin.removeListener('data', onData)
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false)
      }
      process.stdin.pause()
      process.stdout.write('\u001B[?25h') // Show cursor again
      if (escTimer) clearTimeout(escTimer)
    }

    const onData = (buf: Buffer) => {
      const raw = buf.toString('utf8')

      // If we have a pending escape, accumulate
      if (escBuf) {
        escBuf += raw
        if (escTimer) clearTimeout(escTimer)
      } else if (raw === '\u001B') {
        // Start escape sequence
        escBuf = '\u001B'
        escTimer = setTimeout(() => {
          // Standalone Escape — cancel editing
          escBuf = ''
          cleanup()
          resolve(null)
        }, 50)
        return
      }

      const key = escBuf || raw
      escBuf = ''
      if (escTimer) {
        clearTimeout(escTimer)
        escTimer = null
      }

      // Ctrl+S  (0x13) — save
      if (key === '\u0013') {
        cleanup()
        resolve(lines.join('\n').trim())
        return
      }

      // Ctrl+C (0x03) — cancel
      if (key === '\u0003') {
        cleanup()
        resolve(null)
        return
      }

      // Ctrl+K (0x0B) — delete current line
      if (key === '\u000B') {
        if (lines.length > 1) {
          lines.splice(row, 1)
          if (row >= lines.length) row = lines.length - 1
          col = clamp(col, 0, lineAt(row).length)
        } else {
          lines[0] = ''
          col = 0
        }
        render()
        return
      }

      // Arrow up
      if (key === '\u001B[A') {
        if (row > 0) {
          row--
          col = clamp(col, 0, lineAt(row).length)
        }
        render()
        return
      }

      // Arrow down
      if (key === '\u001B[B') {
        if (row < lines.length - 1) {
          row++
          col = clamp(col, 0, lineAt(row).length)
        }
        render()
        return
      }

      // Cmd+Right / Option+Right / Ctrl+Right / Arrow right
      // macOS:   Cmd+Right → \x1B[1;9C → end of line
      //          Option+Right → \x1Bf or \x1B[1;3C → forward word
      // Linux/Win: Ctrl+Right → \x1B[1;5C → forward word
      if (key === '\u001B[1;9C') {
        col = lineAt(row).length
        render()
        return
      }
      if (key === '\u001Bf' || key === '\u001B[1;3C' || key === '\u001B[1;5C') {
        const line = lineAt(row)
        let c = col
        while (c < line.length && /\w/.test(line[c] ?? '')) c++
        while (c < line.length && /\W/.test(line[c] ?? '')) c++
        col = c
        render()
        return
      }
      if (key === '\u001B[C') {
        if (col < lineAt(row).length) {
          col++
        } else if (row < lines.length - 1) {
          row++
          col = 0
        }
        render()
        return
      }

      // Cmd+Left / Option+Left / Ctrl+Left / Arrow left
      // macOS:   Cmd+Left → \x1B[1;9D → start of line
      //          Option+Left → \x1Bb or \x1B[1;3D → backward word
      // Linux/Win: Ctrl+Left → \x1B[1;5D → backward word
      if (key === '\u001B[1;9D') {
        col = 0
        render()
        return
      }
      if (key === '\u001Bb' || key === '\u001B[1;3D' || key === '\u001B[1;5D') {
        const line = lineAt(row)
        let c = col
        while (c > 0 && /\W/.test(line[c - 1] ?? '')) c--
        while (c > 0 && /\w/.test(line[c - 1] ?? '')) c--
        col = c
        render()
        return
      }
      if (key === '\u001B[D') {
        if (col > 0) {
          col--
        } else if (row > 0) {
          row--
          col = lineAt(row).length
        }
        render()
        return
      }

      // Home — also \x1B[1;2D (Shift+Left in some terminals)
      if (key === '\u001B[H' || key === '\u001BOH') {
        col = 0
        render()
        return
      }

      // End
      if (key === '\u001B[F' || key === '\u001BOF') {
        col = lineAt(row).length
        render()
        return
      }

      // Delete
      if (key === '\u001B[3~') {
        const line = lineAt(row)
        if (col < line.length) {
          lines[row] = line.slice(0, col) + line.slice(col + 1)
        } else if (row < lines.length - 1) {
          // Join with next line
          lines[row] = line + (lines[row + 1] ?? '')
          lines.splice(row + 1, 1)
        }
        render()
        return
      }

      // Backspace
      if (key === '\u007F' || key === '\b') {
        if (col > 0) {
          const line = lineAt(row)
          lines[row] = line.slice(0, col - 1) + line.slice(col)
          col--
        } else if (row > 0) {
          // Join with previous line
          col = lineAt(row - 1).length
          lines[row - 1] = lineAt(row - 1) + lineAt(row)
          lines.splice(row, 1)
          row--
        }
        render()
        return
      }

      // Enter
      if (key === '\r' || key === '\n') {
        const line = lineAt(row)
        const before = line.slice(0, col)
        const after = line.slice(col)
        lines[row] = before
        lines.splice(row + 1, 0, after)
        row++
        col = 0
        render()
        return
      }

      // Tab → 2 spaces
      if (key === '\t') {
        const line = lineAt(row)
        lines[row] = line.slice(0, col) + '  ' + line.slice(col)
        col += 2
        render()
        return
      }

      // Printable characters
      for (const ch of raw) {
        const code = ch.codePointAt(0) ?? 0
        if (code >= 32) {
          const line = lineAt(row)
          lines[row] = line.slice(0, col) + ch + line.slice(col)
          col++
        }
      }
      render()
    }

    process.stdin.on('data', onData)
  })
}

/**
 * Edit multi-line content in the user's editor (from $EDITOR).
 * Writes initialText to a temp file, opens $EDITOR, and returns the edited content.
 */
export const editInEditor = (initialText = '', filenameHint = 'geeto-commit.txt'): string => {
  const tmpDir = os.tmpdir()
  const tmpPath = path.join(tmpDir, `${Date.now()}-${filenameHint}`)
  try {
    fs.writeFileSync(tmpPath, initialText, { encoding: 'utf8' })
  } catch {
    return initialText
  }

  const editor = process.env.EDITOR ?? (process.platform === 'win32' ? 'notepad' : 'vi')
  try {
    spawnSync(editor, [tmpPath], { stdio: 'inherit' })
    const edited = fs.readFileSync(tmpPath, { encoding: 'utf8' })
    return edited.trim()
  } catch {
    // On failure, return initial text
    return initialText
  }
}

/**
 * Close the readline interface
 */
export const closeInput = (): void => {
  rl.close()
}
