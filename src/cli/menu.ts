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
    const maxVisibleItems = 15 // Show max 15 items at once
    let scrollOffset = 0

    const getVisibleRange = () => {
      // Keep selected item in view
      if (selectedIndex < scrollOffset) {
        scrollOffset = selectedIndex
      } else if (selectedIndex >= scrollOffset + maxVisibleItems) {
        scrollOffset = selectedIndex - maxVisibleItems + 1
      }

      const start = scrollOffset
      const end = Math.min(scrollOffset + maxVisibleItems, options.length)
      return { start, end }
    }

    const renderMenu = () => {
      const { start, end } = getVisibleRange()
      const visibleCount = end - start

      // Clear only the rendered lines (visible items + hint + blank line)
      for (let i = 0; i < visibleCount + 2; i++) {
        process.stdout.write('\u001B[1A\u001B[2K')
      }

      // Re-render hint and items (question stays at top)
      console.log(
        `${colors.gray}  (↑↓/jk arrows, Enter select, 'c' clear, 'q' quit)${colors.reset}\n`
      )

      for (let idx = start; idx < end; idx++) {
        const opt = options[idx]
        if (!opt) continue
        const prefix = idx === selectedIndex ? `${colors.cyan}❯${colors.reset}` : ' '
        const label =
          idx === selectedIndex
            ? `${colors.cyan}${colors.bright}${opt.label}${colors.reset}`
            : `${colors.gray}${opt.label}${colors.reset}`
        console.log(`${prefix} ${label}`)
      }
    }

    // Initial render (question + hint + items)
    console.log(`${colors.cyan}?${colors.reset} ${question}`)
    console.log(
      `${colors.gray}  (↑↓/jk arrows, Enter select, 'c' clear, 'q' quit)${colors.reset}\n`
    )

    const { start, end } = getVisibleRange()
    for (let idx = start; idx < end; idx++) {
      const opt = options[idx]
      if (!opt) continue
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
        case 'c':
        case 'C': {
          console.clear()
          console.log(`${colors.cyan}?${colors.reset} ${question}`)
          console.log(
            `${colors.gray}  (↑↓/jk arrows, Enter select, 'c' clear, 'q' quit)${colors.reset}\n`
          )

          const { start, end } = getVisibleRange()
          for (let idx = start; idx < end; idx++) {
            const opt = options[idx]
            if (!opt) continue
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
