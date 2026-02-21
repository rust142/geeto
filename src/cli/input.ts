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

  // Ensure cursor is visible (may have been hidden by a spinner)
  process.stdout.write('\u001B[?25h')

  const platform = os.platform()
  const fullQuestion = defaultValue ? `${question} (${defaultValue}) ` : question
  process.stdout.write(`\n${fullQuestion}`)

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
 * Interactive multiline text input with editing support.
 *
 * Shortcuts:
 * - Enter      → new line
 * - Backspace  → delete character
 * - Ctrl+W     → delete word
 * - Ctrl+U     → clear current line
 * - Ctrl+L     → clear all text
 * - Ctrl+D     → submit
 * - Ctrl+C     → cancel
 *
 * Returns trimmed text or `null` when cancelled.
 */
export const askMultiline = (question: string, initialText = ''): string | null => {
  if (process.stdin.isTTY && process.stdin.isRaw) {
    process.stdin.setRawMode(false)
  }
  process.stdout.write('\u001B[?25h')

  const isMac = process.platform === 'darwin'
  const delWordHint = isMac ? '⌥⌫' : 'Ctrl+W'

  const showHeader = (): void => {
    console.log(`\n\u001B[36m?\u001B[0m ${question}`)
    console.log(`  \u001B[90mEnter=newline | Ctrl+D=submit | Ctrl+C=cancel\u001B[0m`)
    console.log(`  \u001B[90m${delWordHint}=del word | Ctrl+U=del line | Ctrl+L=clear all\u001B[0m`)
  }

  showHeader()

  if (initialText.trim()) {
    console.log('  \u001B[90m── current ──\u001B[0m')
    for (const l of initialText.split('\n')) {
      console.log(`  \u001B[90m${l}\u001B[0m`)
    }
    console.log('  \u001B[90m── type below (Ctrl+D empty = keep) ──\u001B[0m')
  }

  // Non-TTY fallback (piped input)
  if (!process.stdin.isTTY) {
    const r = spawnSync('cat', [], {
      stdio: ['inherit', 'pipe', 'inherit'],
      encoding: 'utf8',
    })
    const t = r.stdout?.trim() ?? ''
    if (!t && initialText.trim()) return initialText.trim()
    return t || null
  }

  // Pause readline so fs.readSync can use fd 0
  rl.pause()
  process.stdin.setRawMode(true)

  const lines: string[] = ['']
  let li = 0
  const buf = Buffer.alloc(16)

  /** Redraw all text from scratch (clears screen) */
  const fullRedraw = (): void => {
    process.stdout.write('\u001B[2J\u001B[H')
    showHeader()
    for (let i = 0; i <= li; i++) {
      process.stdout.write(lines[i] ?? '')
      if (i < li) process.stdout.write('\n')
    }
  }

  /** Delete word backwards on current line */
  const deleteWord = (): void => {
    const cur = lines[li] ?? ''
    if (!cur) return
    const stripped = cur.replace(/\s+$/, '')
    const sp = stripped.lastIndexOf(' ')
    lines[li] = sp === -1 ? '' : stripped.slice(0, sp + 1)
    process.stdout.write(`\r\u001B[K${lines[li]}`)
  }

  try {
    for (;;) {
      let n: number
      try {
        n = fs.readSync(0, buf, 0, buf.length, null)
      } catch {
        break
      }
      if (n === 0) break

      const b = buf[0] as number | undefined
      if (b === undefined) break

      // Ctrl+C → cancel
      if (b === 3) {
        process.stdout.write('\n')
        return null
      }

      // Ctrl+D → submit
      if (b === 4) {
        process.stdout.write('\n')
        const text = lines.join('\n').trim()
        if (!text && initialText.trim()) return initialText.trim()
        return text || null
      }

      // Enter → new line
      if (b === 13 || b === 10) {
        process.stdout.write('\n')
        li++
        lines.splice(li, 0, '')
        continue
      }

      // Backspace
      if (b === 127 || b === 8) {
        const cur = lines[li] ?? ''
        if (cur.length > 0) {
          // Delete within current line
          lines[li] = cur.slice(0, -1)
          process.stdout.write('\b \b')
        } else if (li > 0) {
          // At start of line → merge with previous line
          lines.splice(li, 1)
          li--
          fullRedraw()
        }
        continue
      }

      // Ctrl+W → delete word
      if (b === 23) {
        deleteWord()
        continue
      }

      // Ctrl+U → clear current line
      if (b === 21) {
        lines[li] = ''
        process.stdout.write('\r\u001B[K')
        continue
      }

      // Ctrl+L → clear all, restart
      if (b === 12) {
        lines.length = 0
        lines.push('')
        li = 0
        fullRedraw()
        continue
      }

      // ESC sequences → Option+Backspace (ESC+DEL) = del word
      if (b === 27) {
        if (n >= 2 && buf[1] === 0x7f) {
          deleteWord()
        }
        continue
      }

      // Printable characters
      if (b >= 32) {
        const ch = buf.toString('utf8', 0, n)
        lines[li] = (lines[li] ?? '') + ch
        process.stdout.write(ch)
      }
    }
  } finally {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false)
    }
    rl.resume()
  }

  const text = lines.join('\n').trim()
  if (!text && initialText.trim()) return initialText.trim()
  return text || null
}

/**
 * Inline multi-line text editor using the system's built-in terminal editor.
 * Opens nano (macOS/Linux) or notepad (Windows) with the initial text.
 *
 * Kept async (returns Promise) so all existing callers using
 * `await editInline(...)` continue to work without changes.
 */
export const editInline = (
  initialText: string,
  label = 'Edit Message',
  _syntax = ''
): Promise<string | null> => {
  if (process.stdin.isTTY && process.stdin.isRaw) {
    process.stdin.setRawMode(false)
  }
  process.stdout.write('\u001B[?25h')

  console.log(`\n  \u001B[36m${label}\u001B[0m`)

  const tmpDir = os.tmpdir()
  const tmpPath = path.join(tmpDir, `geeto-${Date.now()}.md`)
  try {
    fs.writeFileSync(tmpPath, initialText, { encoding: 'utf8' })
  } catch {
    return Promise.resolve(null)
  }

  const editor = process.platform === 'win32' ? 'notepad' : 'nano'
  try {
    spawnSync(editor, [tmpPath], { stdio: 'inherit' })
    const edited = fs.readFileSync(tmpPath, { encoding: 'utf8' }).trim()
    if (!edited) return Promise.resolve(null)
    return Promise.resolve(edited)
  } catch {
    return Promise.resolve(null)
  } finally {
    try {
      fs.unlinkSync(tmpPath)
    } catch {
      // ignore cleanup errors
    }
  }
}

/**
 * Close the readline interface
 */
export const closeInput = (): void => {
  rl.close()
}
