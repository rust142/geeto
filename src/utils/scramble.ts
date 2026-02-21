/**
 * Hacker-style scramble/decode text animation for terminal.
 *
 * Characters start as random symbols and gradually resolve
 * from left to right into the target text.
 */

import { colors } from './colors.js'

// Characters used for the scramble effect
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*<>{}[]|/~'

const randomGlyph = (): string => GLYPHS[Math.floor(Math.random() * GLYPHS.length)] ?? '?'

/** Build a single frame: resolved chars + scrambled remainder. */
const buildFrame = (text: string, revealedCount: number): string => {
  let frame = ''
  const chars = [...text]
  for (const [i, ch] of chars.entries()) {
    if (ch === ' ') {
      frame += ' '
    } else if (i < revealedCount) {
      frame += ch
    } else {
      frame += randomGlyph()
    }
  }
  return frame
}

export interface ScrambleOptions {
  /** Milliseconds per animation frame (default: 35). */
  frameDelay?: number
  /** How many characters to reveal per tick (default: 1). */
  charsPerTick?: number
  /** Extra scramble-only frames before reveal starts (default: 6). */
  scrambleFrames?: number
}

/**
 * Animate a single line of text with a scramble→reveal effect.
 *
 * Uses `\r` overwrite so the cursor stays on one line.
 * Returns a promise that resolves when the animation completes.
 */
export const scrambleLine = (text: string, opts: ScrambleOptions = {}): Promise<void> => {
  const frameDelay = opts.frameDelay ?? 35
  const charsPerTick = opts.charsPerTick ?? 1
  const scrambleFrames = opts.scrambleFrames ?? 6

  return new Promise((resolve) => {
    let revealed = 0
    let scrambleCount = 0

    process.stdout.write('\u001B[?25l') // Hide cursor

    const tick = setInterval(() => {
      // Phase 1: pure scramble (no characters revealed yet)
      if (scrambleCount < scrambleFrames) {
        const frame = buildFrame(text, 0)
        process.stdout.write(`\r  ${colors.gray}${frame}${colors.reset}`)
        scrambleCount++
        return
      }

      // Phase 2: gradual reveal from left to right
      revealed = Math.min(revealed + charsPerTick, text.length)
      const resolvedPart = text.slice(0, revealed)
      const scrambledPart = buildFrame(text.slice(revealed), 0)

      // Dim → bright transition: resolved is bright, rest is dim
      process.stdout.write(
        `\r  ${colors.cyan}${colors.bright}${resolvedPart}${colors.reset}${colors.gray}${scrambledPart}${colors.reset}`
      )

      if (revealed >= text.length) {
        clearInterval(tick)
        // Final: fully revealed in bright cyan
        process.stdout.write(`\r  ${colors.cyan}${colors.bright}${text}${colors.reset}\n`)
        process.stdout.write('\u001B[?25h') // Show cursor
        resolve()
      }
    }, frameDelay)
  })
}

export interface ScrambleSequenceStep {
  /** Text to display. */
  text: string
  /** Optional pause in ms after this step completes (default: 200). */
  pauseAfter?: number
}

/**
 * Run a sequence of scramble animations.
 *
 * Each step animates on its own line (in-place overwrite),
 * then moves down for the next step.
 *
 * Example:
 * ```
 * await scrambleSequence([
 *   { text: 'collecting...' },
 *   { text: 'compressing...' },
 *   { text: 'delivering...' },
 *   { text: 'done ✓', pauseAfter: 0 },
 * ])
 * ```
 */
export const scrambleSequence = async (
  steps: ScrambleSequenceStep[],
  opts: ScrambleOptions = {}
): Promise<void> => {
  for (const step of steps) {
    await scrambleLine(step.text, opts)
    const pause = step.pauseAfter ?? 200
    if (pause > 0) {
      await new Promise((resolve) => setTimeout(resolve, pause))
    }
  }
}

/** Step input: plain string or an object with a count-up animation. */
export type StepInput = string | { text: string; countTo: number; suffix?: string }

/**
 * Multi-step scramble progress indicator.
 *
 * Animates a sequence of text lines with scramble→reveal, each staying
 * on screen once decoded.  The final step enters an idle-glitch mode
 * with an elapsed-time counter until `.stop()` / `.succeed()` is called.
 *
 * Steps that include a `countTo` value get an extra count-up animation
 * after the base text is revealed:
 *   `collecting objects (1)...`  →  `(45)...`  →  `(89)...`
 *
 * API (drop-in replacement for `log.spinner()`):
 *   `.start(steps)`,  `.stop()`,  `.succeed(text)`,  `.fail(text)`
 */
export class ScrambleProgress {
  private interval: NodeJS.Timeout | null = null
  private stepInputs: StepInput[] = []
  private currentStep = 0
  private revealed = 0
  private scrambleCount = 0
  private startTime = 0
  private pauseCount = 0
  private countValue = 0
  private countFrames = 0
  private phase: 'scramble' | 'reveal' | 'count' | 'pause' | 'idle' = 'scramble'
  /** Number of step lines printed with \\n (above the current animated line). */
  private linesAbove = 0

  private readonly scrambleFrames = 4
  private readonly charsPerTick = 2
  private readonly frameDelay = 35
  private readonly pauseFrames = 5
  private readonly countTotalFrames = 10

  /** Get the base display text for a step (without count). */
  private getBaseText(idx: number): string {
    const input = this.stepInputs[idx]
    if (!input) return ''
    return typeof input === 'string' ? input : `${input.text}...`
  }

  /** Get the full display text for a step (with count if applicable). */
  private getFullText(idx: number, count?: number): string {
    const input = this.stepInputs[idx]
    if (!input) return ''
    if (typeof input === 'string') return input
    const suffix = input.suffix ?? ''
    const value = count ?? input.countTo
    return `${input.text} (${value}${suffix})...`
  }

  /** Check if a step has a count-up animation. */
  private hasCount(idx: number): boolean {
    const input = this.stepInputs[idx]
    return typeof input !== 'string' && input?.countTo !== undefined && input.countTo > 0
  }

  /** Get the target count for a step. */
  private getCountTarget(idx: number): number {
    const input = this.stepInputs[idx]
    if (typeof input === 'string' || !input?.countTo) return 0
    return input.countTo
  }

  start(steps: StepInput[]): void {
    this.stepInputs = steps
    this.currentStep = 0
    this.revealed = 0
    this.scrambleCount = 0
    this.pauseCount = 0
    this.countValue = 0
    this.countFrames = 0
    this.phase = 'scramble'
    this.linesAbove = 0
    this.startTime = Date.now()

    process.stdout.write('\u001B[?25l') // Hide cursor
    process.stdout.write('\u001B7') // Save cursor position (DEC)

    this.interval = setInterval(() => {
      if (this.currentStep >= this.stepInputs.length) return

      const baseText = this.getBaseText(this.currentStep)
      const isLastStep = this.currentStep >= this.stepInputs.length - 1

      switch (this.phase) {
        case 'scramble': {
          const frame = buildFrame(baseText, 0)
          process.stdout.write(`\r  ${colors.gray}${frame}${colors.reset}\u001B[K`)
          this.scrambleCount++
          if (this.scrambleCount >= this.scrambleFrames) {
            this.phase = 'reveal'
          }
          break
        }

        case 'reveal': {
          this.revealed = Math.min(this.revealed + this.charsPerTick, baseText.length)
          const resolved = baseText.slice(0, this.revealed)
          const scrambled = buildFrame(baseText.slice(this.revealed), 0)

          process.stdout.write(
            `\r  ${colors.cyan}${colors.bright}${resolved}${colors.reset}${colors.gray}${scrambled}${colors.reset}\u001B[K`
          )

          if (this.revealed >= baseText.length) {
            // If step has count, enter count phase; otherwise pause/idle
            if (this.hasCount(this.currentStep)) {
              this.phase = 'count'
              this.countValue = 0
              this.countFrames = 0
            } else {
              this.phase = isLastStep ? 'idle' : 'pause'
              this.pauseCount = 0
            }
          }
          break
        }

        case 'count': {
          const target = this.getCountTarget(this.currentStep)
          this.countFrames++
          // Ease-in: accelerate count increments
          const progress = Math.min(this.countFrames / this.countTotalFrames, 1)
          this.countValue = Math.min(Math.ceil(target * progress), target)

          const displayText = this.getFullText(this.currentStep, this.countValue)
          process.stdout.write(
            `\r  ${colors.cyan}${colors.bright}${displayText}${colors.reset}\u001B[K`
          )

          if (this.countValue >= target) {
            this.phase = isLastStep ? 'idle' : 'pause'
            this.pauseCount = 0
          }
          break
        }

        case 'pause': {
          this.pauseCount++
          if (this.pauseCount >= this.pauseFrames) {
            // Finalise current line and advance
            const finalText = this.hasCount(this.currentStep)
              ? this.getFullText(this.currentStep)
              : baseText
            process.stdout.write(
              `\r  ${colors.cyan}${colors.bright}${finalText}${colors.reset}\u001B[K\n`
            )
            this.linesAbove++
            this.currentStep++
            this.revealed = 0
            this.scrambleCount = 0
            this.countValue = 0
            this.countFrames = 0
            this.phase = 'scramble'
          }
          break
        }

        case 'idle': {
          const elapsed = Math.floor((Date.now() - this.startTime) / 1000)
          const timeDisplay = elapsed > 0 ? ` ${colors.gray}(${elapsed}s)${colors.reset}` : ''

          const idleText = this.hasCount(this.currentStep)
            ? this.getFullText(this.currentStep)
            : baseText
          const chars = [...idleText]
          const glitchCount = 1 + Math.floor(Math.random() * 2)
          for (let g = 0; g < glitchCount; g++) {
            const pos = Math.floor(Math.random() * chars.length)
            if (chars[pos] !== ' ') {
              chars[pos] = randomGlyph()
            }
          }

          process.stdout.write(
            `\r  ${colors.cyan}${colors.bright}${chars.join('')}${colors.reset}${timeDisplay}\u001B[K`
          )
          break
        }
      }
    }, this.frameDelay)
  }

  private cleanup(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
    // Restore cursor to saved position and erase everything below
    process.stdout.write('\u001B8') // Restore cursor position (DEC)
    process.stdout.write('\u001B[J') // Erase from cursor to end of screen
    process.stdout.write('\u001B[?25h') // Show cursor
  }

  /** Stop the animation silently (clear current line). */
  stop(): void {
    this.cleanup()
  }

  /** Stop and print a green `✓ message`. */
  succeed(message: string): void {
    this.cleanup()
    console.log(`${colors.green}✓${colors.reset} ${message}`)
  }

  /** Stop and print a red `✗ message`. */
  fail(message: string): void {
    this.cleanup()
    console.log(`${colors.red}✗${colors.reset} ${message}`)
  }
}
