/**
 * Interactive input utilities
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import readline from 'node:readline'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

const readStdinText = (): string => {
  try {
    return fs.readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

const supportsStickyTerminalLayout = (): boolean => {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false

  const term = process.env.TERM?.toLowerCase()
  if (term === 'dumb') return false

  if (process.platform !== 'win32') return term !== undefined

  return [
    process.env.WT_SESSION,
    // cspell:ignore ANSICON
    process.env.ANSICON,
    process.env.ConEmuANSI === 'ON' ? '1' : undefined,
    process.env.TERM_PROGRAM === 'vscode' ? '1' : undefined,
    term !== undefined && term !== 'dumb' ? term : undefined,
  ].some(Boolean)
}

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
 * Ask a yes/no confirmation question with interactive arrow-key toggle.
 *
 * Shortcuts:
 * - ↑ / ↓     → cycle between Y and N (wraps around)
 * - y / Y      → immediately confirm yes
 * - n / N      → immediately confirm no
 * - Enter      → confirm current selection
 * - Ctrl+C     → exit
 *
 * Falls back to plain text input when stdin is not a TTY.
 */
export const confirm = (question: string, defaultYes: boolean = true): boolean => {
  // Ensure cursor is visible and raw mode is off before we start
  if (process.stdin.isTTY && process.stdin.isRaw) {
    process.stdin.setRawMode(false)
  }
  if (supportsStickyTerminalLayout()) {
    process.stdout.write('\u001B[?25h')
  }

  // Non-TTY fallback — plain text input
  if (!process.stdin.isTTY) {
    const suffix = defaultYes ? ' (Y/n): ' : ' (y/N): '
    const answer = askQuestion(`${question}${suffix}`)
    if (answer === '') return defaultYes
    return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes'
  }

  let selected: boolean | null = null // null = no selection yet, use defaultYes on Enter
  const suffix = defaultYes ? '(Y/n)' : '(y/N)'

  // Strip leading newlines from question — render them once as spacing, not on every redraw
  const leadingNewlines = question.match(/^\n+/)?.[0] ?? ''
  const cleanQuestion = question.slice(leadingNewlines.length)

  /** Render the interactive prompt line (single-line overwrite). */
  const render = (): void => {
    const answer =
      selected === null
        ? ''
        : selected
          ? '\u001B[36m\u001B[1mY\u001B[0m'
          : '\u001B[36m\u001B[1mN\u001B[0m'
    const line = `${cleanQuestion} ${suffix} ${answer}`
    process.stdout.write(`\r${line}\u001B[K`)
  }

  /** Render the final confirmed state and move to next line. */
  const renderFinal = (label: string): void => {
    const line = `${cleanQuestion} ${suffix} \u001B[36m${label}\u001B[0m`
    process.stdout.write(`\r${line}\u001B[K\n`)
  }

  // Write leading newlines once, then initial render on the new line
  process.stdout.write(leadingNewlines + '\n')
  render()

  // Enter raw mode for key-by-key reading
  rl.pause()
  process.stdin.setRawMode(true)

  const buf = Buffer.alloc(16)

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

      // Ctrl+C → exit
      if (b === 3) {
        process.stdout.write('\u001B[?25h\n')
        process.exit(0)
      }

      // Escape (standalone, not arrow sequence) → cancel, return false
      if (b === 27 && (n === 1 || buf[1] !== 0x5b)) {
        renderFinal('N')
        return false
      }

      // Enter → confirm current selection (null = use default)
      if (b === 13 || b === 10) {
        const result = selected ?? defaultYes
        renderFinal(result ? 'Y' : 'N')
        return result
      }

      // y / Y → immediately yes
      if (b === 0x79 || b === 0x59) {
        renderFinal('Y')
        return true
      }

      // n / N → immediately no
      if (b === 0x6e || b === 0x4e) {
        renderFinal('N')
        return false
      }

      // ESC sequences — arrow keys
      if (b === 27 && n >= 3 && buf[1] === 0x5b) {
        const arrow = buf[2]
        // UP (0x41) or DOWN (0x42) → toggle
        if (arrow === 0x41 || arrow === 0x42) {
          if (selected === null) {
            // First arrow press: UP → Y, DOWN → N
            selected = arrow === 0x41
          } else {
            selected = !selected
          }
          render()
        }
        continue
      }
    }
  } finally {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false)
    }
    process.stdout.write('\u001B[?25h') // Show cursor
    rl.resume()
  }

  return selected ?? defaultYes
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
export const editMultiline = async (question: string, initialText = ''): Promise<string | null> => {
  if (process.stdin.isTTY && process.stdin.isRaw) {
    process.stdin.setRawMode(false)
  }

  const isMac = process.platform === 'darwin'
  const delWordHint = isMac ? '⌥⌫' : 'Ctrl+W'
  const cleanQuestion = question.trim()
  const hintText1 = 'Enter=newline | Ctrl+D=submit | Ctrl+C=cancel'
  const hintText2 = `${delWordHint}=del word | Ctrl+U=del line | Ctrl+L=clear all`
  const compactHintText = `Enter=newline | Ctrl+D=submit | Ctrl+C=cancel | ${delWordHint}=del word | Ctrl+U=line | Ctrl+L=clear`

  const printPlainIntro = (): void => {
    console.log(`\n? ${cleanQuestion}`)
    if (initialText.trim()) {
      console.log('  -- current --')
      for (const l of initialText.split('\n')) {
        console.log(`  ${l}`)
      }
      console.log('  -- type below (empty = keep) --')
    }
  }

  const getTextResult = (rawText: string): string | null => {
    const t = rawText.trim()
    if (!t && initialText.trim()) return initialText.trim()
    return t || null
  }

  // Non-TTY fallback (piped input)
  if (!process.stdin.isTTY) {
    printPlainIntro()
    return getTextResult(readStdinText())
  }

  if (!supportsStickyTerminalLayout()) {
    printPlainIntro()
    console.log('  Submit with EOF: Ctrl+D on Unix/macOS, Ctrl+Z then Enter on Windows.')
    rl.pause()
    const text = getTextResult(readStdinText())
    rl.resume()
    return text
  }

  process.stdout.write('\u001B[?25h')

  // Pause readline so fs.readSync can use fd 0
  rl.pause()
  process.stdin.setRawMode(true)

  let rows = process.stdout.rows ?? 24
  let columns = process.stdout.columns ?? 80
  let footerRows = rows < 6 ? 1 : 2
  let scrollTop = rows < 6 ? 2 : 3
  let scrollBottom = Math.max(scrollTop, rows - footerRows)
  let resizeTimer: NodeJS.Timeout | undefined
  let stickyTimer: NodeJS.Timeout | undefined

  const updateTerminalSize = (): void => {
    rows = process.stdout.rows ?? 24
    columns = process.stdout.columns ?? 80
    footerRows = rows < 6 ? 1 : 2
    scrollTop = rows < 6 ? 2 : 3
    scrollBottom = Math.max(scrollTop, rows - footerRows)
  }

  const printHeader = (): void => {
    process.stdout.write(`\u001B[1;1H\u001B[2K\u001B[36m?\u001B[0m ${cleanQuestion}`)
  }

  const printHints = (): void => {
    const formatHint = (text: string): string => {
      const maxLength = Math.max(1, columns - 2)
      const trimmed =
        text.length > maxLength
          ? maxLength <= 3
            ? '.'.repeat(maxLength)
            : text.slice(0, maxLength - 3) + '...'
          : text
      return `  \u001B[90m${trimmed}\u001B[0m`
    }

    if (footerRows === 1) {
      process.stdout.write(`\u001B[${rows};1H\u001B[2K${formatHint(compactHintText)}`)
      return
    }
    process.stdout.write(`\u001B[${rows - 1};1H\u001B[2K${formatHint(hintText1)}`)
    process.stdout.write(`\u001B[${rows};1H\u001B[2K${formatHint(hintText2)}`)
  }

  const refreshStickyChrome = (): void => {
    const currentRows = process.stdout.rows ?? 24
    const currentColumns = process.stdout.columns ?? 80
    if (currentRows !== rows || currentColumns !== columns) {
      fullRedraw(true)
    }
  }

  const lines: string[] = initialText.trim() ? initialText.split('\n') : ['']
  let li = lines.length - 1
  let ci = (lines[li] ?? '').length

  const currentLine = (): string => lines[li] ?? ''

  const isWhitespace = (ch: string): boolean => /\s/.test(ch)

  const moveCursorToInput = (): void => {
    const row = Math.min(scrollBottom, scrollTop + li)
    const col = Math.max(1, ci + 1)
    process.stdout.write(`\u001B[${row};${col}H`)
  }

  /** Redraw editor layout; header+hints stay fixed around the scrollable content area. */
  const fullRedraw = (clearScreen = false): void => {
    updateTerminalSize()
    process.stdout.write('\u001B[r')
    if (clearScreen) process.stdout.write('\u001B[2J')
    printHeader()
    process.stdout.write(`\u001B[${scrollTop};${scrollBottom}r`)
    process.stdout.write(`\u001B[${scrollTop};1H\u001B[J`)
    for (let i = 0; i < lines.length; i++) {
      process.stdout.write(lines[i] ?? '')
      if (i < lines.length - 1) process.stdout.write('\n')
    }
    printHints()
    moveCursorToInput()
  }

  const handleResize = (): void => {
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      fullRedraw(true)
    }, 25)
  }

  process.on('SIGWINCH', handleResize)

  // Use the alternate screen so sticky multiline editing does not fight shell scrollback.
  process.stdout.write('\u001B[?1049h')
  fullRedraw(true)
  stickyTimer = setInterval(refreshStickyChrome, 150)

  /** Delete word backwards on current line */
  const deleteWord = (): void => {
    const cur = currentLine()
    if (!cur || ci === 0) return
    const before = cur.slice(0, ci)
    const after = cur.slice(ci)
    const stripped = before.replace(/\s+$/, '')
    const sp = stripped.lastIndexOf(' ')
    const nextBefore = sp === -1 ? '' : stripped.slice(0, sp + 1)
    lines[li] = nextBefore + after
    ci = nextBefore.length
    fullRedraw()
  }

  const moveWordLeft = (): void => {
    if (ci === 0) {
      if (li > 0) {
        li--
        ci = currentLine().length
      }
      moveCursorToInput()
      return
    }

    const cur = currentLine()
    let nextCursor = ci
    while (nextCursor > 0 && isWhitespace(cur[nextCursor - 1] ?? '')) nextCursor--
    while (nextCursor > 0 && !isWhitespace(cur[nextCursor - 1] ?? '')) nextCursor--
    ci = nextCursor
    moveCursorToInput()
  }

  const moveWordRight = (): void => {
    const cur = currentLine()
    if (ci >= cur.length) {
      if (li < lines.length - 1) {
        li++
        ci = 0
      }
      moveCursorToInput()
      return
    }

    let nextCursor = ci
    while (nextCursor < cur.length && !isWhitespace(cur[nextCursor] ?? '')) nextCursor++
    while (nextCursor < cur.length && isWhitespace(cur[nextCursor] ?? '')) nextCursor++
    ci = nextCursor
    moveCursorToInput()
  }

  const getFinalText = (): string | null => {
    const text = lines.join('\n').trim()
    if (!text && initialText.trim()) return initialText.trim()
    return text || null
  }

  return await new Promise<string | null>((resolve) => {
    let done = false

    const finish = (value: string | null): void => {
      if (done) return
      done = true
      process.stdin.off('data', handleData)
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false)
      }
      if (resizeTimer) clearTimeout(resizeTimer)
      if (stickyTimer) clearInterval(stickyTimer)
      process.off('SIGWINCH', handleResize)
      process.stdout.write('\u001B[r\u001B[?1049l')
      rl.resume()
      resolve(value)
    }

    function handleData(chunk: Buffer | string): void {
      const input = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      const n = input.length

      for (let offset = 0; offset < n; offset++) {
        const b = input[offset] as number | undefined
        if (b === undefined) break

        // Ctrl+C → cancel
        if (b === 3) {
          process.stdout.write('\n')
          finish(null)
          return
        }

        // Ctrl+D → submit
        if (b === 4) {
          process.stdout.write('\n')
          finish(getFinalText())
          return
        }

        // Enter → new line
        if (b === 13 || b === 10) {
          const cur = currentLine()
          lines[li] = cur.slice(0, ci)
          li++
          lines.splice(li, 0, cur.slice(ci))
          ci = 0
          fullRedraw()
          continue
        }

        // Backspace
        if (b === 127 || b === 8) {
          const cur = currentLine()
          if (ci > 0) {
            // Delete within current line
            lines[li] = cur.slice(0, ci - 1) + cur.slice(ci)
            ci--
            fullRedraw()
          } else if (li > 0) {
            // At start of line → merge with previous line
            const previousLength = (lines[li - 1] ?? '').length
            lines[li - 1] = (lines[li - 1] ?? '') + cur
            lines.splice(li, 1)
            li--
            ci = previousLength
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
          ci = 0
          fullRedraw()
          continue
        }

        // Ctrl+L → clear all, restart
        if (b === 12) {
          lines.length = 0
          lines.push('')
          li = 0
          ci = 0
          fullRedraw()
          continue
        }

        // ESC sequences → Option+Backspace / Option+Arrow / Ctrl+Arrow
        if (b === 27) {
          const next = input[offset + 1]
          if (next === 0x7f) {
            deleteWord()
            offset += 1
            continue
          }
          if (next === 0x62) {
            moveWordLeft()
            offset += 1
            continue
          }
          if (next === 0x66) {
            moveWordRight()
            offset += 1
            continue
          }
          if (next === 0x5b) {
            let sequenceEnd = offset + 2
            while (sequenceEnd < n) {
              const value = input[sequenceEnd]
              if (value !== undefined && value >= 0x40 && value <= 0x7e) break
              sequenceEnd++
            }
            const code = input[sequenceEnd]
            const sequence = input.toString('utf8', offset, sequenceEnd + 1)
            const isWordArrow =
              sequence.includes(';3') ||
              sequence.includes(';5') ||
              /^\u001B\[[35][CD]$/.test(sequence)
            if (code === 0x44) {
              if (isWordArrow) {
                moveWordLeft()
              } else if (ci > 0) {
                ci--
              } else if (li > 0) {
                li--
                ci = currentLine().length
              }
              moveCursorToInput()
            } else if (code === 0x43) {
              if (isWordArrow) {
                moveWordRight()
              } else if (ci < currentLine().length) {
                ci++
              } else if (li < lines.length - 1) {
                li++
                ci = 0
              }
              moveCursorToInput()
            } else if (code === 0x41 && li > 0) {
              li--
              ci = Math.min(ci, currentLine().length)
              moveCursorToInput()
            } else if (code === 0x42 && li < lines.length - 1) {
              li++
              ci = Math.min(ci, currentLine().length)
              moveCursorToInput()
            }
            offset = sequenceEnd
            continue
          }
          process.stdout.write('\n')
          finish(null)
          return
        }

        // Printable text segment. A raw read can contain text plus control keys.
        if (b >= 32) {
          let end = offset + 1
          while (end < n) {
            const next = input[end]
            if (next === undefined || next < 32 || next === 127 || next === 27) break
            end++
          }
          const ch = input.toString('utf8', offset, end)
          const cur = currentLine()
          lines[li] = cur.slice(0, ci) + ch + cur.slice(ci)
          ci += ch.length
          fullRedraw()
          offset = end - 1
        }
      }
    }

    process.stdin.on('data', handleData)
    process.stdin.resume()
  })
}

/**
 * Close the readline interface
 */
export const closeInput = (): void => {
  rl.close()
}
