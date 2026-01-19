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
    console.log(`
    ${colors.yellow}🐱${colors.reset} ${colors.cyan}Git Flow Automation${colors.reset} ${colors.yellow}🐱${colors.reset}

       ${colors.yellow}╭─────────╮${colors.reset}
       ${colors.yellow}│${colors.reset} ${colors.bright} Geeto ${colors.reset} ${colors.yellow}│${colors.reset}
       ${colors.yellow}╰────╥────╯${colors.reset}
            ${colors.yellow}║${colors.reset}
    ${colors.gray}   /\\_/\\     ${colors.blue}╔═══════════════════════════════╗${colors.reset}
    ${colors.gray}  ( o.o )    ${colors.blue}║${colors.reset}  ${colors.cyan}AI-Powered Branch Naming${colors.reset}     ${colors.blue}║${colors.reset}
    ${colors.gray}   > ^ <     ${colors.blue}║${colors.reset}  ${colors.green}Trello Integration${colors.reset}           ${colors.blue}║${colors.reset}
    ${colors.gray}  /     \\    ${colors.blue}║${colors.reset}  ${colors.yellow}Smart Git Workflows${colors.reset}          ${colors.blue}║${colors.reset}
    ${colors.gray} (       )   ${colors.blue}╚═══════════════════════════════╝${colors.reset}
    ${colors.gray}  \\_____/${colors.reset}
    ${colors.reset}`)
  },
} as const
