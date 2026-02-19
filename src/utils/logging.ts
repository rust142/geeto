/**
 * Logging utilities with colored output
 */

import { colors } from './colors.js'

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

class Spinner {
  private interval: NodeJS.Timeout | null = null
  private currentFrame = 0
  private message = ''
  private startTime = 0

  start(message: string): void {
    this.message = message
    this.currentFrame = 0
    this.startTime = Date.now()
    process.stdout.write('\u001B[?25l') // Hide cursor
    this.interval = setInterval(() => {
      const frame = SPINNER_FRAMES[this.currentFrame]
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000)
      const timeDisplay = elapsed > 0 ? ` ${colors.gray}(${elapsed}s)${colors.reset}` : ''
      process.stdout.write(`\r${colors.cyan}${frame}${colors.reset} ${this.message}${timeDisplay}`)
      this.currentFrame = (this.currentFrame + 1) % SPINNER_FRAMES.length
    }, 80)
  }

  stop(finalMessage?: string): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
    process.stdout.write('\r\u001B[K') // Clear line
    process.stdout.write('\u001B[?25h') // Show cursor
    if (finalMessage) {
      console.log(finalMessage)
    } else {
      process.stdout.write('\n') // Move to next line when no final message
    }
  }

  succeed(message: string): void {
    this.stop(`${colors.green}✓${colors.reset} ${message}`)
  }

  fail(message: string): void {
    this.stop(`${colors.red}✗${colors.reset} ${message}`)
  }
}

export const log = {
  info: (msg: string) => {
    console.log(`${colors.blue}ℹ${colors.reset} ${msg}`)
  },
  success: (msg: string) => {
    console.log(`${colors.green}✓${colors.reset} ${msg}`)
  },
  warn: (msg: string) => {
    console.log(`${colors.yellow}⚠${colors.reset} ${msg}`)
  },
  error: (msg: string) => {
    console.log(`${colors.red}✗${colors.reset} ${msg}`)
  },
  step: (msg: string) => {
    console.log(`\n${colors.cyan}${colors.bright}▶ ${msg}${colors.reset}`)
  },
  ai: (msg: string) => {
    console.log(`${colors.cyan}[AI]${colors.reset} ${msg}`)
  },
  /** Print a dim horizontal rule for visual separation. */
  divider: () => {
    console.log(`${colors.gray}${'─'.repeat(58)}${colors.reset}`)
  },
  spinner: () => new Spinner(),
  banner: () => {
    console.log('')
    console.log(
      `  ${colors.cyan}${colors.bright}⚡ Geeto${colors.reset}  ${colors.gray}AI-Powered Git Workflow${colors.reset}`
    )
    console.log('')
  },
} as const
