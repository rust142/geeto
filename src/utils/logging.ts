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
  spinner: () => new Spinner(),
  banner: () => {
    const raw = `....................................................................................................
  ................................:-----*%+...........................................................
  ............................::--:.:::::+:-.-.............:%:===.*@@%%=..............................
  ..........................::=.:::::-:::+%**++-=#%%#***=#++.-::-%=:+*---::...........................
  .........................::-:::-########=+.::::+.--:::::+-::::::-#*:::::+.-.........................
  ........................:.=---=##-:::::+---*%=--+:--##--=+=-:-=+*:-------=--........................
  ........................:-:---%##------=------=%-------=%%=--+%%---*##=---%.:.......................
  ........................:+-===-%*#+-==+====%%#=*-==+%%*==#===*%#-==+##====#:-.......................
  ........................--*===========*%=======*#=======+%=====+*=======+#*:........................
  .........................-=#+==+==+===#%########+########+##*#####*++*###+::........................
  ..........................-.*##########*.::--::---::==:.:=:=**+-::=****-.-..........................
  ............................:=:...:-..:-:...................:::....::::.............................
  ....................................................................................................
  ..............................THE.NEXT-GEN.GIT.FLOW.AUTOMATION - GEETO..............................
  ....................................................................................................................`
    // Auto-detect common left margin (columns of dots/spaces) and remove it so art is flush-left
    const lines = raw.split('\n')
    const nonEmpty = lines.filter((l) => l.trim().length > 0)
    const leadingCounts = nonEmpty.map((l) => {
      let i = 0
      while (i < l.length && (l[i] === '.' || l[i] === ' ')) {
        i++
      }
      return i
    })
    const minLeading = leadingCounts.length > 0 ? Math.min(...leadingCounts) : 0
    const cleaned = lines
      .map((l) => l.slice(minLeading))
      .map((l) => l.replaceAll('.', ' '))
      .map((l) => l.replace(/\s+$/u, ''))
      .join('\n')
    console.log(`${colors.cyan}${colors.bright}${cleaned}${colors.reset}`)
  },
} as const
