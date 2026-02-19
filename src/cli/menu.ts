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

    /**
     * Strip ANSI escape codes to get visible text length
     */
    const stripAnsi = (str: string): string =>
      str.replaceAll(/\u001B\[\d*;?\d*m|\u001B\]8;;[^\u0007]*\u0007/g, '')

    const renderItem = (opt: SelectOption, idx: number) => {
      const prefix = idx === selectedIndex ? `${colors.cyan}❯${colors.reset}` : ' '

      // Truncate label to terminal width
      const cols = process.stdout.columns || 80
      const prefixLen = 2 // "❯ "
      const maxLabelLen = cols - prefixLen - 1
      const visibleLabel = stripAnsi(opt.label)
      let displayLabel: string
      if (visibleLabel.length > maxLabelLen && maxLabelLen > 3) {
        const truncated = visibleLabel.slice(0, maxLabelLen - 1) + '…'
        displayLabel =
          idx === selectedIndex
            ? `${colors.cyan}${colors.bright}${truncated}${colors.reset}`
            : `${colors.gray}${truncated}${colors.reset}`
      } else {
        displayLabel =
          idx === selectedIndex
            ? `${colors.cyan}${colors.bright}${opt.label}${colors.reset}`
            : `${colors.gray}${opt.label}${colors.reset}`
      }
      return `${prefix} ${displayLabel}`
    }

    // Track rendered line count for accurate clearing
    let lastRenderedLines = 0

    const renderMenu = () => {
      const { start, end } = getVisibleRange()

      // If search mode, cursor is on the search input line (no newline)
      if (searchMode) {
        process.stdout.write('\u001B[2K\r') // Clear current search input line
      }

      // Clear previous render
      for (let i = 0; i < lastRenderedLines; i++) {
        process.stdout.write('\u001B[1A\u001B[2K')
      }

      let linesRendered = 0

      console.log('') // Blank line
      linesRendered++

      for (let idx = start; idx < end; idx++) {
        const opt = filteredOptions[idx]
        if (!opt) continue
        console.log(renderItem(opt, idx))
        linesRendered++
      }

      // Hint + search at bottom
      console.log('') // Separator
      linesRendered++
      const hintText = searchMode
        ? `  (Esc cancel search, Enter select)`
        : `  (↑↓/jk arrows, / search, Enter select, 'c' clear, 'q' quit)`
      console.log(`${colors.gray}${hintText}${colors.reset}`)
      linesRendered++

      if (searchMode) {
        process.stdout.write(`${colors.cyan}/ search:${colors.reset} ${searchQuery}`)
      }

      lastRenderedLines = linesRendered
    }

    // Initial render (question + items + hint)
    console.log(`${colors.cyan}?${colors.reset} ${question}`)
    {
      let initLines = 0
      console.log('') // Blank line
      initLines++

      const { start, end } = getVisibleRange()
      for (let idx = start; idx < end; idx++) {
        const opt = filteredOptions[idx]
        if (!opt) continue
        console.log(renderItem(opt, idx))
        initLines++
      }

      // Hint at bottom
      console.log('')
      initLines++
      console.log(
        `${colors.gray}  (↑↓/jk arrows, / search, Enter select, 'c' clear, 'q' quit)${colors.reset}`
      )
      initLines++
      lastRenderedLines = initLines
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
          let clearLines = 0
          console.log('')
          clearLines++

          const { start, end } = getVisibleRange()
          for (let idx = start; idx < end; idx++) {
            const opt = filteredOptions[idx]
            if (!opt) continue
            console.log(renderItem(opt, idx))
            clearLines++
          }
          console.log('')
          clearLines++
          console.log(
            `${colors.gray}  (↑↓/jk arrows, / search, Enter select, 'c' clear, 'q' quit)${colors.reset}`
          )
          clearLines++
          lastRenderedLines = clearLines
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
    let rangeMode = false
    let searchQuery = ''
    let rangeQuery = ''
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

    /**
     * Strip ANSI escape codes to get visible text length
     */
    const stripAnsi = (str: string): string =>
      str.replaceAll(/\u001B\[\d*;?\d*m|\u001B\]8;;[^\u0007]*\u0007/g, '')

    const renderItem = (opt: SelectOption, idx: number) => {
      const cursor = idx === selectedIndex ? `${colors.cyan}❯${colors.reset}` : ' '
      const box = checked.has(opt.value)
        ? `${colors.green}◉${colors.reset}`
        : `${colors.gray}○${colors.reset}`
      // Show 1-based number for quick range selection
      const num = `${colors.gray}${String(idx + 1).padStart(2, ' ')}${colors.reset}`

      // Truncate label to fit terminal width
      const cols = process.stdout.columns || 80
      const prefixLen = 5 + Math.max(2, String(idx + 1).length) // "❯ ◉ XX "
      const maxLabelLen = cols - prefixLen - 1
      const visibleLabel = stripAnsi(opt.label)
      let displayLabel = opt.label
      if (visibleLabel.length > maxLabelLen && maxLabelLen > 3) {
        // Truncate the visible text and re-apply color
        const truncated = visibleLabel.slice(0, maxLabelLen - 1) + '…'
        displayLabel =
          idx === selectedIndex
            ? `${colors.cyan}${colors.bright}${truncated}${colors.reset}`
            : `${colors.gray}${truncated}${colors.reset}`
      } else {
        displayLabel =
          idx === selectedIndex
            ? `${colors.cyan}${colors.bright}${opt.label}${colors.reset}`
            : `${colors.gray}${opt.label}${colors.reset}`
      }
      return `${cursor} ${box} ${num} ${displayLabel}`
    }

    // Track how many lines the previous render produced (for accurate clearing)
    let lastRenderedLines = 0

    const renderMenu = () => {
      const { start, end } = getVisibleRange()

      // If range mode, cursor is on the range input line (no newline was written)
      // First clear current line, then go up for the rest
      if (rangeMode) {
        process.stdout.write('\u001B[2K\r') // Clear current range input line
      }

      // Clear exactly the number of lines the PREVIOUS render produced
      for (let i = 0; i < lastRenderedLines; i++) {
        process.stdout.write('\u001B[1A\u001B[2K')
      }

      let linesRendered = 0

      if (searchMode) {
        console.log(`${colors.cyan}/ search:${colors.reset} ${searchQuery}`)
        linesRendered++
      }

      // Count line
      console.log(
        `${colors.gray}  Selected: ${colors.cyan}${checked.size}${colors.gray}/${options.length}${colors.reset}`
      )
      linesRendered++

      console.log('') // Blank line
      linesRendered++

      for (let idx = start; idx < end; idx++) {
        const opt = filteredOptions[idx]
        if (!opt) continue
        console.log(renderItem(opt, idx))
        linesRendered++
      }

      console.log('') // Separator before hint
      linesRendered++

      // Hint line at bottom
      const hintText = rangeMode
        ? `  (Type numbers: "1 3 5" or "1-10", Enter apply, Esc cancel)`
        : searchMode
          ? `  (Esc cancel search, Space toggle, Enter confirm)`
          : `  (↑↓/jk Space toggle, 'a' all, 'n' none, '#' range, / search, Enter confirm, 'q' quit)`
      console.log(`${colors.gray}${hintText}${colors.reset}`)
      linesRendered++

      // Range input at the very bottom (no newline so cursor stays at end)
      if (rangeMode) {
        process.stdout.write(`${colors.cyan}# range:${colors.reset} ${rangeQuery}`)
      }

      lastRenderedLines = linesRendered
    }

    // Initial render
    console.log(`${colors.cyan}?${colors.reset} ${question}`)
    {
      let initLines = 0
      console.log(
        `${colors.gray}  Selected: ${colors.cyan}${checked.size}${colors.gray}/${options.length}${colors.reset}`
      )
      initLines++
      console.log('')
      initLines++

      const { start, end } = getVisibleRange()
      for (let idx = start; idx < end; idx++) {
        const opt = filteredOptions[idx]
        if (!opt) continue
        console.log(renderItem(opt, idx))
        initLines++
      }

      // Hint at bottom
      console.log('')
      initLines++
      console.log(
        `${colors.gray}  (↑↓/jk Space toggle, 'a' all, 'n' none, '#' range, / search, Enter confirm, 'q' quit)${colors.reset}`
      )
      initLines++
      lastRenderedLines = initLines
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

    /**
     * Parse range input like "1 3 5" or "1-10" or "1-5 8 10-12"
     * Returns 0-based indices
     */
    const parseRangeInput = (input: string): number[] => {
      const indices: number[] = []
      const parts = input.trim().split(/[\s,]+/)
      for (const part of parts) {
        if (part.includes('-')) {
          const rangeParts = part.split('-').map((s) => Number.parseInt(s.trim(), 10))
          const rangeStart = rangeParts[0]
          const rangeEnd = rangeParts[1]
          if (
            rangeStart !== undefined &&
            rangeEnd !== undefined &&
            !Number.isNaN(rangeStart) &&
            !Number.isNaN(rangeEnd) &&
            rangeStart > 0 &&
            rangeEnd <= options.length
          ) {
            for (let i = rangeStart - 1; i < rangeEnd; i++) {
              if (!indices.includes(i)) indices.push(i)
            }
          }
        } else {
          const num = Number.parseInt(part, 10)
          if (!Number.isNaN(num) && num > 0 && num <= options.length) {
            const idx = num - 1
            if (!indices.includes(idx)) indices.push(idx)
          }
        }
      }
      return indices
    }

    const onKeypress = (key: Buffer) => {
      const keyStr = key.toString()

      // Handle range mode
      if (rangeMode) {
        if (keyStr === '\u001B') {
          // Escape - cancel range mode
          rangeMode = false
          rangeQuery = ''
          renderMenu()
          return
        }

        if (keyStr === '\r' || keyStr === '\n') {
          // Apply range selection
          const indices = parseRangeInput(rangeQuery)
          for (const idx of indices) {
            const opt = options[idx]
            if (opt) checked.add(opt.value)
          }
          rangeMode = false
          rangeQuery = ''
          renderMenu()
          return
        }

        if (keyStr === '\u007F' || keyStr === '\b') {
          rangeQuery = rangeQuery.slice(0, -1)
          renderMenu()
          return
        }

        // Allow digits, spaces, dashes, commas
        if (keyStr.length === 1 && /[\d\s\-,]/.test(keyStr)) {
          rangeQuery += keyStr
          renderMenu()
          return
        }

        return
      }

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
        case '#': {
          rangeMode = true
          renderMenu()
          break
        }
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
          let clearLines = 0
          console.log(
            `${colors.gray}  Selected: ${colors.cyan}${checked.size}${colors.gray}/${options.length}${colors.reset}`
          )
          clearLines++
          console.log('')
          clearLines++

          const { start, end } = getVisibleRange()
          for (let idx = start; idx < end; idx++) {
            const opt = filteredOptions[idx]
            if (!opt) continue
            console.log(renderItem(opt, idx))
            clearLines++
          }
          console.log('')
          clearLines++
          console.log(
            `${colors.gray}  (↑↓/jk Space toggle, 'a' all, 'n' none, '#' range, / search, Enter confirm, 'q' quit)${colors.reset}`
          )
          clearLines++
          lastRenderedLines = clearLines
          break
        }
      }
    }

    currentDataListener = onKeypress
    process.stdin.on('data', onKeypress)
  })
}
