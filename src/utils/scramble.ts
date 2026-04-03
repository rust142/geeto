/**
 * Progress spinner that replaces the old scramble animation.
 *
 * Accepts the same StepInput[] API as before but shows a clean
 * spinner with the last step's text instead of multi-line animation.
 */

import { colors } from './colors.js'

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

/** Single counter definition for multi-counter steps. */
export interface CounterDef {
  to: number
  prefix?: string
  suffix?: string
}

/** Step input: plain string, single counter, or multi-counter. */
export type StepInput =
  | string
  | { text: string; countTo: number; suffix?: string }
  | { text: string; counts: CounterDef[] }

/** Extract display text from a StepInput. */
const stepText = (s: StepInput): string => (typeof s === 'string' ? s : `${s.text}...`)

/**
 * Drop-in replacement for the old ScrambleProgress.
 *
 * Same API: `.start(steps)`, `.addSteps(steps)`, `.stop()`, `.succeed(text)`, `.fail(text)`
 * Now renders a single-line spinner instead of multi-line scramble animation.
 */
export class ScrambleProgress {
  private interval: NodeJS.Timeout | null = null
  private frame = 0
  private message = ''
  private startTime = 0

  start(steps: StepInput[]): void {
    const last = steps.at(-1)
    this.message = last ? stepText(last) : ''
    this.frame = 0
    this.startTime = Date.now()

    process.stdout.write('\u001B[?25l') // Hide cursor
    this.interval = setInterval(() => {
      const f = SPINNER_FRAMES[this.frame % SPINNER_FRAMES.length]
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000)
      const time = elapsed > 0 ? ` ${colors.gray}(${elapsed}s)${colors.reset}` : ''
      process.stdout.write(`\r${colors.cyan}${f}${colors.reset} ${this.message}${time}\u001B[K`)
      this.frame++
    }, 80)
  }

  addSteps(steps: StepInput[]): void {
    if (steps.length === 0) return
    const last = steps.at(-1)
    if (last) this.message = stepText(last)
  }

  private cleanup(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
    process.stdout.write('\r\u001B[K')
    process.stdout.write('\u001B[?25h') // Show cursor
  }

  stop(): void {
    this.cleanup()
  }

  succeed(message: string): void {
    this.cleanup()
    console.log(`${colors.green}✓${colors.reset} ${message}`)
  }

  fail(message: string): void {
    this.cleanup()
    console.log(`${colors.red}✗${colors.reset} ${message}`)
  }
}
