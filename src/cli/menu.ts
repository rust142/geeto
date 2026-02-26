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

      // Scroll indicator: items above
      const above = start
      if (above > 0) {
        console.log(`${colors.gray}  ↑ ${above} more above${colors.reset}`)
        linesRendered++
      }

      console.log('') // Blank line
      linesRendered++

      for (let idx = start; idx < end; idx++) {
        const opt = filteredOptions[idx]
        if (!opt) continue
        console.log(renderItem(opt, idx))
        linesRendered++
      }

      // Scroll indicator: items below
      const below = filteredOptions.length - end
      if (below > 0) {
        console.log('')
        linesRendered++
        console.log(`${colors.gray}  ↓ ${below} more below${colors.reset}`)
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

      const { start, end } = getVisibleRange()

      // Scroll indicator: items above
      const above = start
      if (above > 0) {
        console.log(`${colors.gray}  ↑ ${above} more above${colors.reset}`)
        initLines++
      }

      console.log('') // Blank line
      initLines++

      for (let idx = start; idx < end; idx++) {
        const opt = filteredOptions[idx]
        if (!opt) continue
        console.log(renderItem(opt, idx))
        initLines++
      }

      // Scroll indicator: items below
      const below = filteredOptions.length - end
      if (below > 0) {
        console.log('')
        initLines++
        console.log(`${colors.gray}  ↓ ${below} more below${colors.reset}`)
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

          const { start, end } = getVisibleRange()

          const aboveC = start
          if (aboveC > 0) {
            console.log(`${colors.gray}  ↑ ${aboveC} more above${colors.reset}`)
            clearLines++
          }

          console.log('')
          clearLines++

          for (let idx = start; idx < end; idx++) {
            const opt = filteredOptions[idx]
            if (!opt) continue
            console.log(renderItem(opt, idx))
            clearLines++
          }

          const belowC = filteredOptions.length - end
          if (belowC > 0) {
            console.log('')
            clearLines++
            console.log(`${colors.gray}  ↓ ${belowC} more below${colors.reset}`)
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
    // Skip initial disabled items (but allow group headers with children)
    while (
      selectedIndex < options.length &&
      options[selectedIndex]?.disabled &&
      !options[selectedIndex]?.children
    ) {
      selectedIndex++
    }
    const maxVisibleItems = 15
    let scrollOffset = 0
    let searchMode = false
    let rangeMode = false
    let searchQuery = ''
    let rangeQuery = ''
    let filteredOptions = options
    const checked = new Set<string>()
    const totalSelectable = options.filter((o) => !o.disabled && !o.children).length

    /** Group header values to filter out from results */
    const groupValues = new Set(options.filter((o) => o.children).map((o) => o.value))

    /** Get checked values excluding group header values */
    const getResult = () => [...checked].filter((v) => !groupValues.has(v))

    /** Skip over disabled items when navigating (group headers with children are NOT skipped) */
    const skipDisabled = (dir: 1 | -1): void => {
      while (
        filteredOptions[selectedIndex]?.disabled &&
        !filteredOptions[selectedIndex]?.children &&
        selectedIndex >= 0 &&
        selectedIndex < filteredOptions.length
      ) {
        selectedIndex += dir
      }
      // Clamp
      if (selectedIndex < 0) selectedIndex = 0
      if (selectedIndex >= filteredOptions.length) selectedIndex = filteredOptions.length - 1
      // If still on disabled (and not a group header), find nearest enabled
      if (filteredOptions[selectedIndex]?.disabled && !filteredOptions[selectedIndex]?.children) {
        const idx = filteredOptions.findIndex(
          (o) => !o.disabled || (o.children && o.children.length > 0)
        )
        if (idx !== -1) selectedIndex = idx
      }
    }

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
      // Group header (folder) — selectable, toggles children
      if (opt.children && opt.children.length > 0) {
        const checkedCount = opt.children.filter((v) => checked.has(v)).length
        const total = opt.children.length
        const cursor = idx === selectedIndex ? `${colors.cyan}❯${colors.reset}` : ' '
        let box: string
        if (checkedCount === total) {
          box = `${colors.green}◉${colors.reset}`
        } else if (checkedCount > 0) {
          box = `${colors.yellow}◐${colors.reset}`
        } else {
          box = `${colors.gray}○${colors.reset}`
        }
        const label =
          idx === selectedIndex
            ? `${colors.cyan}${colors.bright}${opt.label}${colors.reset}`
            : `${colors.bright}${opt.label}${colors.reset}`
        return `${cursor} ${box} ${label}`
      }

      // Disabled items are non-interactive separators
      if (opt.disabled) {
        return `  ${colors.bright}${opt.label}${colors.reset}`
      }
      const cursor = idx === selectedIndex ? `${colors.cyan}❯${colors.reset}` : ' '
      const box = checked.has(opt.value)
        ? `${colors.green}◉${colors.reset}`
        : `${colors.gray}○${colors.reset}`

      // Truncate label to fit terminal width
      const cols = process.stdout.columns || 80
      const prefixLen = 5 // "❯ ◉ "
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
      return `${cursor} ${box} ${displayLabel}`
    }

    const renderMenu = () => {
      const { start, end } = getVisibleRange()

      // Restore cursor to right after question line and clear everything below
      process.stdout.write('\u001B8\u001B[J')

      if (searchMode) {
        console.log(`${colors.cyan}/ search:${colors.reset} ${searchQuery}`)
      }

      console.log(
        `${colors.gray}  Selected: ${colors.cyan}${checked.size}${colors.gray}/${totalSelectable}${colors.reset}`
      )

      // Scroll indicator: items above
      const above = start
      if (above > 0) {
        console.log(`${colors.gray}  ↑ ${above} more above${colors.reset}`)
      }

      console.log('') // Blank line

      for (let idx = start; idx < end; idx++) {
        const opt = filteredOptions[idx]
        if (!opt) continue
        console.log(renderItem(opt, idx))
      }

      // Scroll indicator: items below
      const below = filteredOptions.length - end
      if (below > 0) {
        console.log('')
        console.log(`${colors.gray}  ↓ ${below} more below${colors.reset}`)
      }

      console.log('') // Separator before hint

      // Hint line at bottom
      const hintText = rangeMode
        ? `  (Type numbers: "1 3 5" or "1-10", Enter apply, Esc cancel)`
        : searchMode
          ? `  (Esc cancel search, Space toggle, Enter confirm)`
          : `  (↑↓/jk Space toggle, 'a' all, 'n' none, '#' range, / search, Enter confirm, 'q' quit)`
      console.log(`${colors.gray}${hintText}${colors.reset}`)

      // Range input at the very bottom (no newline so cursor stays at end)
      if (rangeMode) {
        process.stdout.write(`${colors.cyan}# range:${colors.reset} ${rangeQuery}`)
      }
    }

    // Print question line and save cursor position (DEC save)
    console.log(`${colors.cyan}?${colors.reset} ${question}`)
    process.stdout.write('\u001B7')

    // Initial render
    renderMenu()

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
          if (opt && !opt.disabled) {
            if (opt.children && opt.children.length > 0) {
              const allChecked = opt.children.every((v) => checked.has(v))
              if (allChecked) {
                for (const v of opt.children) checked.delete(v)
              } else {
                for (const v of opt.children) checked.add(v)
              }
            } else {
              if (checked.has(opt.value)) {
                checked.delete(opt.value)
              } else {
                checked.add(opt.value)
              }
            }
          }
          renderMenu()
          return
        }

        if (keyStr === '\r' || keyStr === '\n') {
          cleanup()
          resolve(getResult())
          return
        }

        if (keyStr === '\u007F' || keyStr === '\b') {
          searchQuery = searchQuery.slice(0, -1)
          filteredOptions = filterOptions(searchQuery)
          selectedIndex = 0
          skipDisabled(1)
          scrollOffset = 0
          renderMenu()
          return
        }

        if (keyStr === '\u001B[A' || keyStr === 'k') {
          selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : filteredOptions.length - 1
          skipDisabled(-1)
          renderMenu()
          return
        }

        if (keyStr === '\u001B[B' || keyStr === 'j') {
          selectedIndex = selectedIndex < filteredOptions.length - 1 ? selectedIndex + 1 : 0
          skipDisabled(1)
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
          skipDisabled(-1)
          renderMenu()
          break
        }
        case '\u001B[B':
        case 'j': {
          selectedIndex = selectedIndex < filteredOptions.length - 1 ? selectedIndex + 1 : 0
          skipDisabled(1)
          renderMenu()
          break
        }
        case ' ': {
          // Toggle current item (skip disabled)
          const opt = filteredOptions[selectedIndex]
          if (opt && !opt.disabled) {
            if (opt.children && opt.children.length > 0) {
              // Group header: toggle all children
              const allChecked = opt.children.every((v) => checked.has(v))
              if (allChecked) {
                for (const v of opt.children) checked.delete(v)
              } else {
                for (const v of opt.children) checked.add(v)
              }
            } else {
              if (checked.has(opt.value)) {
                checked.delete(opt.value)
              } else {
                checked.add(opt.value)
              }
            }
          }
          renderMenu()
          break
        }
        case 'a':
        case 'A': {
          // Select all (only non-disabled, non-group-header)
          for (const opt of options) {
            if (!opt.disabled && !opt.children) checked.add(opt.value)
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
          resolve(getResult())
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
          process.stdout.write('\u001B7') // Re-save cursor after clear
          renderMenu()
          break
        }
      }
    }

    currentDataListener = onKeypress
    process.stdin.on('data', onKeypress)
  })
}
