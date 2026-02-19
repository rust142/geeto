/**
 * Interactive menu utilities
 */

import type { SelectOption } from '../types/index.js'

import { colors } from '../utils/colors.js'

let currentDataListener: ((key: Buffer) => void) | null = null

/**
 * Interactive select menu with arrow keys and search
 */
export const select = async (question: string, options: SelectOption[]): Promise<string> => {
  return new Promise((resolve) => {
    let selectedIndex = 0
    const maxVisibleItems = 15 // Show max 15 items at once
    let scrollOffset = 0
    let searchMode = false
    let searchQuery = ''
    let filteredOptions = options

    const filterOptions = (query: string) => {
      if (!query) {
        return options
      }
      return options.filter((opt) => opt.label.toLowerCase().includes(query.toLowerCase()))
    }

    const getVisibleRange = () => {
      // Keep selected item in view
      if (selectedIndex < scrollOffset) {
        scrollOffset = selectedIndex
      } else if (selectedIndex >= scrollOffset + maxVisibleItems) {
        scrollOffset = selectedIndex - maxVisibleItems + 1
      }

      const start = scrollOffset
      const end = Math.min(scrollOffset + maxVisibleItems, filteredOptions.length)
      return { start, end }
    }

    const renderMenu = () => {
      const { start, end } = getVisibleRange()
      const visibleCount = end - start

      // Clear only the rendered lines (visible items + hint + search input + blank line)
      const linesToClear = visibleCount + (searchMode ? 3 : 2)
      for (let i = 0; i < linesToClear; i++) {
        process.stdout.write('\u001B[1A\u001B[2K')
      }

      // Re-render hint and items (question stays at top)
      const hintText = searchMode
        ? `  (Esc cancel search, Enter select)`
        : `  (↑↓/jk arrows, / search, Enter select, 'c' clear, 'q' quit)`
      console.log(`${colors.gray}${hintText}${colors.reset}`)

      if (searchMode) {
        console.log(`${colors.cyan}/ search:${colors.reset} ${searchQuery}`)
      }

      console.log('') // Blank line

      for (let idx = start; idx < end; idx++) {
        const opt = filteredOptions[idx]
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
      `${colors.gray}  (↑↓/jk arrows, / search, Enter select, 'c' clear, 'q' quit)${colors.reset}\n`
    )

    const { start, end } = getVisibleRange()
    for (let idx = start; idx < end; idx++) {
      const opt = filteredOptions[idx]
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

      // Handle search mode
      if (searchMode) {
        if (keyStr === '\u001B') {
          // Escape key - cancel search
          searchMode = false
          searchQuery = ''
          filteredOptions = options
          selectedIndex = 0
          scrollOffset = 0
          renderMenu()
          return
        }

        if (keyStr === '\r' || keyStr === '\n') {
          // Enter - select filtered item
          cleanup()
          resolve(filteredOptions[selectedIndex]?.value ?? '')
          return
        }

        if (keyStr === '\u007F' || keyStr === '\b') {
          // Backspace
          searchQuery = searchQuery.slice(0, -1)
          filteredOptions = filterOptions(searchQuery)
          selectedIndex = 0
          scrollOffset = 0
          renderMenu()
          return
        }

        // Printable characters
        if (keyStr.length === 1) {
          const code = keyStr.codePointAt(0) ?? 0
          if (code >= 32 && code <= 126) {
            searchQuery += keyStr
            filteredOptions = filterOptions(searchQuery)
            selectedIndex = 0
            scrollOffset = 0
            renderMenu()
            return
          }
        }

        // Arrow keys in search mode
        if (keyStr === '\u001B[A' || keyStr === 'k') {
          selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : filteredOptions.length - 1
          renderMenu()
          return
        }

        if (keyStr === '\u001B[B' || keyStr === 'j') {
          selectedIndex = selectedIndex < filteredOptions.length - 1 ? selectedIndex + 1 : 0
          renderMenu()
          return
        }

        return
      }

      // Normal navigation mode
      switch (keyStr) {
        case '/': {
          searchMode = true
          renderMenu()
          break
        }
        case '\u001B[A':
        case 'k': {
          selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : filteredOptions.length - 1
          renderMenu()
          break
        }
        case '\u001B[B':
        case 'j': {
          selectedIndex = selectedIndex < filteredOptions.length - 1 ? selectedIndex + 1 : 0
          renderMenu()
          break
        }
        case '\r':
        case '\n': {
          cleanup()
          resolve(filteredOptions[selectedIndex]?.value ?? '')
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
            `${colors.gray}  (↑↓/jk arrows, / search, Enter select, 'c' clear, 'q' quit)${colors.reset}\n`
          )

          const { start, end } = getVisibleRange()
          for (let idx = start; idx < end; idx++) {
            const opt = filteredOptions[idx]
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

/**
 * Interactive multi-select menu with checkboxes (Space to toggle, Enter to confirm)
 */
export const multiSelect = async (question: string, options: SelectOption[]): Promise<string[]> => {
  return new Promise((resolve) => {
    let selectedIndex = 0
    const maxVisibleItems = 15
    let scrollOffset = 0
    let searchMode = false
    let searchQuery = ''
    let filteredOptions = options
    const checked = new Set<string>()

    const filterOptions = (query: string) => {
      if (!query) return options
      return options.filter((opt) => opt.label.toLowerCase().includes(query.toLowerCase()))
    }

    const getVisibleRange = () => {
      if (selectedIndex < scrollOffset) {
        scrollOffset = selectedIndex
      } else if (selectedIndex >= scrollOffset + maxVisibleItems) {
        scrollOffset = selectedIndex - maxVisibleItems + 1
      }
      const start = scrollOffset
      const end = Math.min(scrollOffset + maxVisibleItems, filteredOptions.length)
      return { start, end }
    }

    const renderItem = (opt: SelectOption, idx: number) => {
      const cursor = idx === selectedIndex ? `${colors.cyan}❯${colors.reset}` : ' '
      const box = checked.has(opt.value)
        ? `${colors.green}◉${colors.reset}`
        : `${colors.gray}○${colors.reset}`
      const label =
        idx === selectedIndex
          ? `${colors.cyan}${colors.bright}${opt.label}${colors.reset}`
          : `${colors.gray}${opt.label}${colors.reset}`
      return `${cursor} ${box} ${label}`
    }

    const renderMenu = () => {
      const { start, end } = getVisibleRange()
      const visibleCount = end - start

      // Clear rendered lines (visible items + hint + search input + blank line + count line)
      const linesToClear = visibleCount + (searchMode ? 4 : 3)
      for (let i = 0; i < linesToClear; i++) {
        process.stdout.write('\u001B[1A\u001B[2K')
      }

      // Hint line
      const hintText = searchMode
        ? `  (Esc cancel search, Space toggle, Enter confirm)`
        : `  (↑↓/jk arrows, Space toggle, 'a' all, 'n' none, / search, Enter confirm, 'q' quit)`
      console.log(`${colors.gray}${hintText}${colors.reset}`)

      if (searchMode) {
        console.log(`${colors.cyan}/ search:${colors.reset} ${searchQuery}`)
      }

      // Count line
      console.log(
        `${colors.gray}  Selected: ${colors.cyan}${checked.size}${colors.gray}/${options.length}${colors.reset}`
      )

      console.log('') // Blank line

      for (let idx = start; idx < end; idx++) {
        const opt = filteredOptions[idx]
        if (!opt) continue
        console.log(renderItem(opt, idx))
      }
    }

    // Initial render
    console.log(`${colors.cyan}?${colors.reset} ${question}`)
    console.log(
      `${colors.gray}  (↑↓/jk arrows, Space toggle, 'a' all, 'n' none, / search, Enter confirm, 'q' quit)${colors.reset}`
    )
    console.log(
      `${colors.gray}  Selected: ${colors.cyan}${checked.size}${colors.gray}/${options.length}${colors.reset}`
    )
    console.log('')

    const { start, end } = getVisibleRange()
    for (let idx = start; idx < end; idx++) {
      const opt = filteredOptions[idx]
      if (!opt) continue
      console.log(renderItem(opt, idx))
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

      // Handle search mode
      if (searchMode) {
        if (keyStr === '\u001B') {
          searchMode = false
          searchQuery = ''
          filteredOptions = options
          selectedIndex = 0
          scrollOffset = 0
          renderMenu()
          return
        }

        if (keyStr === ' ') {
          const opt = filteredOptions[selectedIndex]
          if (opt) {
            if (checked.has(opt.value)) {
              checked.delete(opt.value)
            } else {
              checked.add(opt.value)
            }
          }
          renderMenu()
          return
        }

        if (keyStr === '\r' || keyStr === '\n') {
          cleanup()
          resolve([...checked])
          return
        }

        if (keyStr === '\u007F' || keyStr === '\b') {
          searchQuery = searchQuery.slice(0, -1)
          filteredOptions = filterOptions(searchQuery)
          selectedIndex = 0
          scrollOffset = 0
          renderMenu()
          return
        }

        if (keyStr === '\u001B[A' || keyStr === 'k') {
          selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : filteredOptions.length - 1
          renderMenu()
          return
        }

        if (keyStr === '\u001B[B' || keyStr === 'j') {
          selectedIndex = selectedIndex < filteredOptions.length - 1 ? selectedIndex + 1 : 0
          renderMenu()
          return
        }

        // Printable characters
        if (keyStr.length === 1) {
          const code = keyStr.codePointAt(0) ?? 0
          if (code >= 32 && code <= 126) {
            searchQuery += keyStr
            filteredOptions = filterOptions(searchQuery)
            selectedIndex = 0
            scrollOffset = 0
            renderMenu()
            return
          }
        }

        return
      }

      // Normal navigation mode
      switch (keyStr) {
        case '/': {
          searchMode = true
          renderMenu()
          break
        }
        case '\u001B[A':
        case 'k': {
          selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : filteredOptions.length - 1
          renderMenu()
          break
        }
        case '\u001B[B':
        case 'j': {
          selectedIndex = selectedIndex < filteredOptions.length - 1 ? selectedIndex + 1 : 0
          renderMenu()
          break
        }
        case ' ': {
          // Toggle current item
          const opt = filteredOptions[selectedIndex]
          if (opt) {
            if (checked.has(opt.value)) {
              checked.delete(opt.value)
            } else {
              checked.add(opt.value)
            }
          }
          renderMenu()
          break
        }
        case 'a':
        case 'A': {
          // Select all
          for (const opt of options) {
            checked.add(opt.value)
          }
          renderMenu()
          break
        }
        case 'n':
        case 'N': {
          // Deselect all
          checked.clear()
          renderMenu()
          break
        }
        case '\r':
        case '\n': {
          cleanup()
          resolve([...checked])
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
            `${colors.gray}  (↑↓/jk arrows, Space toggle, 'a' all, 'n' none, / search, Enter confirm, 'q' quit)${colors.reset}`
          )
          console.log(
            `${colors.gray}  Selected: ${colors.cyan}${checked.size}${colors.gray}/${options.length}${colors.reset}`
          )
          console.log('')

          const { start, end } = getVisibleRange()
          for (let idx = start; idx < end; idx++) {
            const opt = filteredOptions[idx]
            if (!opt) continue
            console.log(renderItem(opt, idx))
          }
          break
        }
      }
    }

    currentDataListener = onKeypress
    process.stdin.on('data', onKeypress)
  })
}
