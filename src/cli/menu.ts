/**
 * Interactive menu utilities
 */

import type { SelectOption } from '../types/index.js'

import { colors } from '../utils/colors.js'

let currentDataListener: ((key: Buffer) => void) | null = null

/**
 * Interactive select menu with arrow keys
 */
export const select = async (question: string, options: SelectOption[]): Promise<string> => {
  return new Promise((resolve) => {
    let selectedIndex = 0

    const renderMenu = () => {
      process.stdout.write('\u001B[2K')
      for (let i = 0; i < options.length; i++) {
        process.stdout.write('\u001B[1A\u001B[2K')
      }
      for (const [idx, opt] of options.entries()) {
        const prefix = idx === selectedIndex ? `${colors.cyan}❯${colors.reset}` : ' '
        const label =
          idx === selectedIndex
            ? `${colors.cyan}${colors.bright}${opt.label}${colors.reset}`
            : `${colors.gray}${opt.label}${colors.reset}`
        console.log(`${prefix} ${label}`)
      }
    }

    console.log(`${colors.cyan}?${colors.reset} ${question}`)
    console.log(
      `${colors.gray}  (↑↓/jk arrows, Enter select, 'c' clear, 'q' quit)${colors.reset}\n`
    )
    for (const [idx, opt] of options.entries()) {
      const prefix = idx === selectedIndex ? `${colors.cyan}❯${colors.reset}` : ' '
      const label =
        idx === selectedIndex
          ? `${colors.cyan}${colors.bright}${opt.label}${colors.reset}`
          : `${colors.gray}${opt.label}${colors.reset}`
      console.log(`${prefix} ${label}`)
    }

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true)
    }
    process.stdin.resume()

    const cleanup = () => {
      if (currentDataListener) {
        process.stdin.removeListener('data', currentDataListener)
        currentDataListener = null
      }
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false)
      }
      process.stdin.pause()
    }

    const onKeypress = (key: Buffer) => {
      const keyStr = key.toString()
      switch (keyStr) {
        case '\u001B[A':
        case 'k': {
          selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : options.length - 1
          renderMenu()
          break
        }
        case '\u001B[B':
        case 'j': {
          selectedIndex = selectedIndex < options.length - 1 ? selectedIndex + 1 : 0
          renderMenu()
          break
        }
        case '\r':
        case '\n': {
          cleanup()
          console.log('')
          resolve(options[selectedIndex]?.value ?? '')
          break
        }
        case 'q':
        case 'Q':
        case '\u0003': {
          cleanup()
          console.log('\n\nCancelled by user')
          process.exit(0)
        }
        // eslint-disable-next-line no-fallthrough
        case 'c':
        case 'C': {
          console.clear()
          console.log(`${colors.cyan}?${colors.reset} ${question}`)
          console.log(
            `${colors.gray}  (Use arrow keys, Enter to select, 'c' to clear screen)${colors.reset}\n`
          )
          for (const [idx, opt] of options.entries()) {
            const prefix = idx === selectedIndex ? `${colors.cyan}❯${colors.reset}` : ' '
            const label =
              idx === selectedIndex
                ? `${colors.cyan}${colors.bright}${opt.label}${colors.reset}`
                : `${colors.gray}${opt.label}${colors.reset}`
            console.log(`${prefix} ${label}`)
          }
          break
        }
      }
    }

    currentDataListener = onKeypress
    process.stdin.on('data', onKeypress)
  })
}
