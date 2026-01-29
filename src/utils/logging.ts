/**
 * Logging utilities with colored output
 */

import { colors } from './colors.js'

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
