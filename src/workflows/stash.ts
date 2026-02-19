/**
 * Interactive stash manager
 * List, apply, pop, drop, and create stashes with diff preview
 */

import { askQuestion, confirm } from '../cli/input.js'
import { select } from '../cli/menu.js'
import { colors } from '../utils/colors.js'
import { exec, execSilent } from '../utils/exec.js'
import { getCurrentBranch } from '../utils/git.js'
import { log } from '../utils/logging.js'

interface StashEntry {
  index: number
  ref: string
  branch: string
  message: string
  date: string
}

/**
 * Parse stash list into structured entries
 */
const getStashList = (): StashEntry[] => {
  try {
    const output = execSilent('git stash list --format="%gd|%gs|%cr"').trim()
    if (!output) return []

    return output
      .split('\n')
      .filter(Boolean)
      .map((line, i) => {
        const parts = line.split('|')
        const ref = parts[0] ?? `stash@{${i}}`
        const rawMsg = parts[1] ?? ''
        const date = parts[2] ?? ''

        // Parse "WIP on branch: ..." or "On branch: message"
        const branchMatch = rawMsg.match(/(?:WIP on|On) ([^:]+):?\s*(.*)/)
        const branch = branchMatch?.[1] ?? ''
        const message = branchMatch?.[2]?.trim() ?? rawMsg

        return { index: i, ref, branch, message, date }
      })
  } catch {
    return []
  }
}

/**
 * Get diff stats for a stash
 */
const getStashDiff = (ref: string): string => {
  try {
    return execSilent(`git stash show ${ref} --stat`).trim()
  } catch {
    return ''
  }
}

/**
 * Get full diff for a stash
 */
const getStashFullDiff = (ref: string): string => {
  try {
    return execSilent(`git stash show ${ref} -p --color=always`).trim()
  } catch {
    return ''
  }
}

/**
 * Render stash list with elegant UI
 */
const renderStashList = (stashes: StashEntry[]): void => {
  for (const [i, stash] of stashes.entries()) {
    const connector = i === stashes.length - 1 ? '╰' : '├'
    const pipe = i === stashes.length - 1 ? ' ' : '│'

    const indexStr = `${colors.yellow}${stash.ref}${colors.reset}`
    const branchStr = stash.branch
      ? ` ${colors.gray}on${colors.reset} ${colors.green}${stash.branch}${colors.reset}`
      : ''
    const msgStr = stash.message
      ? ` ${colors.bright}${stash.message}${colors.reset}`
      : ` ${colors.gray}(no message)${colors.reset}`

    console.log(`  ${colors.gray}${connector}─${colors.reset} ${indexStr}${branchStr}${msgStr}`)
    console.log(
      `  ${colors.gray}${pipe}${colors.reset}   ${colors.gray}${stash.date}${colors.reset}`
    )

    if (i < stashes.length - 1) {
      console.log(`  ${colors.gray}│${colors.reset}`)
    }
  }
}

/**
 * Handle creating a new stash
 */
const handleStashCreate = async (): Promise<void> => {
  // Check if there are changes to stash
  const status = execSilent('git status --porcelain').trim()
  if (!status) {
    log.warn('Nothing to stash. Working tree is clean.')
    return
  }

  // Show what will be stashed
  log.info('Changes to stash:')
  const lines = status.split('\n').filter(Boolean)
  for (const line of lines) {
    const code = line.slice(0, 2)
    const file = line.slice(3)
    let icon: string = colors.gray
    if (code.includes('M')) icon = colors.yellow
    if (code.includes('A') || code.includes('?')) icon = colors.green
    if (code.includes('D')) icon = colors.red
    console.log(`  ${icon}${code}${colors.reset} ${file}`)
  }
  console.log('')

  // Stash type
  const stashType = await select('Stash type:', [
    { label: 'Stash tracked files only', value: 'default' },
    { label: 'Stash including untracked files', value: 'untracked' },
    { label: 'Stash everything (including ignored)', value: 'all' },
    { label: 'Cancel', value: 'cancel' },
  ])

  if (stashType === 'cancel') return

  // Optional message
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false)
  }
  const message = askQuestion('Stash message (optional): ').trim()

  const spinner = log.spinner()
  spinner.start('Stashing changes...')

  try {
    let cmd = 'git stash push'
    if (stashType === 'untracked') cmd += ' --include-untracked'
    if (stashType === 'all') cmd += ' --all'
    if (message) cmd += ` -m "${message}"`

    exec(cmd, true)
    spinner.succeed('Changes stashed!')
  } catch {
    spinner.fail('Failed to stash')
  }
}

/**
 * Handle stash action (apply, pop, drop, show)
 */
const handleStashAction = async (stash: StashEntry): Promise<'back' | 'done'> => {
  // Show diff stats for context
  const diffStats = getStashDiff(stash.ref)

  console.log('')
  const line = '─'.repeat(56)
  console.log(`${colors.cyan}┌${line}┐${colors.reset}`)
  console.log(
    `${colors.cyan}│${colors.reset} ${colors.yellow}${stash.ref}${colors.reset}` +
      (stash.branch ? ` on ${colors.green}${stash.branch}${colors.reset}` : '')
  )
  if (stash.message) {
    console.log(`${colors.cyan}│${colors.reset} ${colors.bright}${stash.message}${colors.reset}`)
  }
  console.log(`${colors.cyan}├${line}┤${colors.reset}`)
  if (diffStats) {
    for (const diffLine of diffStats.split('\n')) {
      console.log(`${colors.cyan}│${colors.reset} ${diffLine}`)
    }
  }
  console.log(`${colors.cyan}└${line}┘${colors.reset}`)

  const action = await select('Action:', [
    { label: `${colors.green}Apply${colors.reset} — restore changes, keep stash`, value: 'apply' },
    { label: `${colors.yellow}Pop${colors.reset} — restore changes, remove stash`, value: 'pop' },
    {
      label: `${colors.cyan}Show diff${colors.reset} — view full changes`,
      value: 'diff',
    },
    { label: `${colors.red}Drop${colors.reset} — delete this stash`, value: 'drop' },
    { label: 'Back', value: 'back' },
  ])

  switch (action) {
    case 'apply': {
      const spinner = log.spinner()
      spinner.start('Applying stash...')
      try {
        exec(`git stash apply ${stash.ref}`, true)
        spinner.succeed('Stash applied! (stash kept)')
      } catch {
        spinner.fail('Failed to apply — possible conflicts')
        log.info('Resolve conflicts manually.')
      }
      return 'done'
    }
    case 'pop': {
      const spinner = log.spinner()
      spinner.start('Popping stash...')
      try {
        exec(`git stash pop ${stash.ref}`, true)
        spinner.succeed('Stash popped! (stash removed)')
      } catch {
        spinner.fail('Failed to pop — possible conflicts')
        log.info('Resolve conflicts manually. Stash is kept.')
      }
      return 'done'
    }
    case 'diff': {
      const fullDiff = getStashFullDiff(stash.ref)
      if (fullDiff) {
        console.log('')
        console.log(fullDiff)
      } else {
        log.warn('No diff available.')
      }
      console.log('')
      return handleStashAction(stash)
    }
    case 'drop': {
      const sure = confirm(`Delete ${stash.ref}? This cannot be undone.`)
      if (sure) {
        try {
          exec(`git stash drop ${stash.ref}`, true)
          log.success(`${stash.ref} dropped.`)
        } catch {
          log.error('Failed to drop stash.')
        }
      }
      return 'done'
    }
    default: {
      return 'back'
    }
  }
}

/**
 * Interactive stash manager
 */
export const handleStash = async (): Promise<void> => {
  log.banner()
  log.step(`${colors.cyan}Stash Manager${colors.reset}\n`)

  const current = getCurrentBranch()
  log.info(`Branch: ${colors.green}${current}${colors.reset}\n`)

  let keepGoing = true

  while (keepGoing) {
    const stashes = getStashList()
    const hasChanges = execSilent('git status --porcelain').trim() !== ''

    // Main menu
    const menuOptions = []

    if (hasChanges) {
      menuOptions.push({
        label: `${colors.green}+ New stash${colors.reset} — save current changes`,
        value: 'new',
      })
    }

    if (stashes.length > 0) {
      menuOptions.push(
        {
          label: `${colors.cyan}📋 View stashes${colors.reset} (${stashes.length})`,
          value: 'list',
        },
        {
          label: `${colors.yellow}⚡ Quick pop${colors.reset} — pop latest stash`,
          value: 'quick-pop',
        },
        {
          label: `${colors.red}🗑  Clear all${colors.reset} — drop all stashes`,
          value: 'clear',
        }
      )
    }

    menuOptions.push({ label: 'Exit', value: 'exit' })

    if (stashes.length === 0 && !hasChanges) {
      log.info('No stashes and no changes to stash.')
      console.log(`${colors.gray}  Nothing to do here! 🧹${colors.reset}\n`)
      return
    }

    if (stashes.length > 0) {
      // Show quick overview
      console.log(`  ${colors.gray}╭── Stashes (${stashes.length}) ──${colors.reset}`)
      console.log(`  ${colors.gray}│${colors.reset}`)
      renderStashList(stashes)
      console.log('')
    }

    const choice = await select('Action:', menuOptions)

    switch (choice) {
      case 'new': {
        await handleStashCreate()
        console.log('')
        break
      }
      case 'list': {
        // Let user pick a stash to act on
        const stashOptions = stashes.map((s) => {
          const msg = s.message || '(no message)'
          const branch = s.branch ? ` ${colors.gray}on ${s.branch}${colors.reset}` : ''
          return {
            label:
              `${colors.yellow}${s.ref}${colors.reset}${branch}` +
              ` ${colors.bright}${msg}${colors.reset}` +
              ` ${colors.gray}(${s.date})${colors.reset}`,
            value: String(s.index),
          }
        })
        stashOptions.push({ label: 'Back', value: 'back' })

        const picked = await select('Select stash:', stashOptions)
        if (picked === 'back') {
          console.log('')
          break
        }

        const idx = Number.parseInt(picked ?? '0', 10)
        const target = stashes[idx]
        if (target) {
          const result = await handleStashAction(target)
          if (result === 'done') {
            console.log('')
          }
        }
        break
      }
      case 'quick-pop': {
        const spinner = log.spinner()
        spinner.start('Popping latest stash...')
        try {
          exec('git stash pop', true)
          spinner.succeed('Latest stash popped!')
        } catch {
          spinner.fail('Failed to pop — possible conflicts')
        }
        console.log('')
        break
      }
      case 'clear': {
        const sure = confirm(`Drop ALL ${stashes.length} stashes? This cannot be undone.`)
        if (sure) {
          try {
            exec('git stash clear', true)
            log.success('All stashes cleared.')
          } catch {
            log.error('Failed to clear stashes.')
          }
        }
        console.log('')
        break
      }
      default: {
        keepGoing = false
        break
      }
    }
  }

  console.log('')
}
