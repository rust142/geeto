/**
 * Interactive input utilities
 */

import { spawnSync } from 'node:child_process'
import os from 'node:os'
import readline from 'node:readline'
import fs from 'node:fs'
import path from 'node:path'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

// Command history for enhanced UX
let commandHistory: string[] = []

/**
 * Enhanced question asking with history support
 */
export const askQuestion = (
  question: string,
  defaultValue?: string,
  useHistory: boolean = false
): string => {
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
  const finalInput = input ?? defaultValue ?? ''

  // Add to history if it's a meaningful input and history is enabled
  if (useHistory && finalInput && !commandHistory.includes(finalInput)) {
    commandHistory.unshift(finalInput)
    if (commandHistory.length > 50) {
      commandHistory = commandHistory.slice(0, 50)
    } // Limit history
  }

  return finalInput
}

/**
 * Get command history
 */
export const getCommandHistory = (): string[] => commandHistory

/**
 * Clear command history
 */
export const clearCommandHistory = (): void => {
  commandHistory = []
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

  const editor = process.env.EDITOR || (process.platform === 'win32' ? 'notepad' : 'vi')
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
