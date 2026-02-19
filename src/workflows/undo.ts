/**
 * Undo Last Action workflow
 * Safely revert the last git operation
 */

import { confirm } from '../cli/input.js'
import { select } from '../cli/menu.js'
import { colors } from '../utils/colors.js'
import { exec, execSilent } from '../utils/exec.js'
import { getCurrentBranch } from '../utils/git.js'
import { log } from '../utils/logging.js'

/**
 * Detect what the last action was using reflog
 */
const detectLastAction = (): {
  type: string
  description: string
  reflogEntry: string
  hash: string
  prevHash: string
} | null => {
  try {
    const sep = '<<GTO>>'
    const output = execSilent(`git reflog -2 --format="%H${sep}%gd${sep}%gs"`).trim()
    if (!output) return null

    const lines = output.split('\n').filter(Boolean)
    if (lines.length === 0) return null

    const current = lines[0]?.split(sep) ?? []
    const prev = lines[1]?.split(sep) ?? []

    const hash = current[0] ?? ''
    const prevHash = prev[0] ?? ''
    const reflogEntry = current[1] ?? ''
    const actionStr = current[2] ?? ''

    let type = 'unknown'
    let description = actionStr

    if (actionStr.startsWith('commit:')) {
      type = 'commit'
      description = `Commit: ${actionStr.replace('commit: ', '')}`
    } else if (actionStr.startsWith('commit (amend):')) {
      type = 'amend'
      description = `Amend: ${actionStr.replace('commit (amend): ', '')}`
    } else if (actionStr.startsWith('commit (merge):')) {
      type = 'merge-commit'
      description = `Merge commit: ${actionStr.replace('commit (merge): ', '')}`
    } else if (actionStr.startsWith('merge')) {
      type = 'merge'
      description = `Merge: ${actionStr}`
    } else if (actionStr.startsWith('checkout:')) {
      type = 'checkout'
      description = `Checkout: ${actionStr.replace('checkout: ', '')}`
    } else if (actionStr.startsWith('pull')) {
      type = 'pull'
      description = `Pull: ${actionStr}`
    } else if (actionStr.startsWith('rebase')) {
      type = 'rebase'
      description = `Rebase: ${actionStr}`
    } else if (actionStr.startsWith('reset:')) {
      type = 'reset'
      description = `Reset: ${actionStr}`
    } else if (actionStr.startsWith('cherry-pick:')) {
      type = 'cherry-pick'
      description = `Cherry-pick: ${actionStr.replace('cherry-pick: ', '')}`
    } else if (actionStr.startsWith('Branch:')) {
      type = 'branch'
      description = actionStr
    }

    return { type, description, reflogEntry, hash, prevHash }
  } catch {
    return null
  }
}

/**
 * Get short hash
 */
const shortHash = (hash: string): string => hash.slice(0, 7)

/**
 * Interactive undo last action
 */
export const handleUndo = async (): Promise<void> => {
  log.banner()
  log.step(`${colors.cyan}Undo Last Action${colors.reset}\n`)

  const branch = getCurrentBranch()
  const lastAction = detectLastAction()

  if (!lastAction) {
    log.warn('No action found in reflog to undo.')
    return
  }

  // Show what happened
  const line = '─'.repeat(56)
  console.log(`${colors.cyan}┌${line}┐${colors.reset}`)
  console.log(
    `${colors.cyan}│${colors.reset} ${colors.bright}Last action on ${colors.green}${branch}${colors.reset}`
  )
  console.log(`${colors.cyan}├${line}┤${colors.reset}`)
  console.log(
    `${colors.cyan}│${colors.reset} ${colors.yellow}${shortHash(lastAction.hash)}${colors.reset} ${colors.bright}${lastAction.description}${colors.reset}`
  )
  console.log(
    `${colors.cyan}│${colors.reset} ${colors.gray}Previous: ${shortHash(lastAction.prevHash)}${colors.reset}`
  )
  console.log(`${colors.cyan}└${line}┘${colors.reset}`)

  // Offer undo options based on action type
  console.log('')

  switch (lastAction.type) {
    case 'commit': {
      await undoCommit(lastAction.prevHash)
      break
    }
    case 'amend': {
      await undoAmend(lastAction.prevHash)
      break
    }
    case 'merge':
    case 'merge-commit': {
      await undoMerge()
      break
    }
    case 'checkout': {
      undoCheckout(lastAction.description)
      break
    }
    case 'pull': {
      await undoPull(lastAction.prevHash)
      break
    }
    case 'rebase': {
      await undoRebase(lastAction.prevHash)
      break
    }
    case 'reset': {
      undoReset(lastAction.prevHash)
      break
    }
    case 'cherry-pick': {
      await undoCommit(lastAction.prevHash)
      break
    }
    default: {
      await undoGeneric(lastAction.prevHash)
    }
  }
}

/**
 * Undo a commit
 */
const undoCommit = async (_prevHash: string): Promise<void> => {
  const action = await select('How to undo this commit?', [
    {
      label: 'Soft reset — keep changes staged',
      value: 'soft',
    },
    {
      label: 'Mixed reset — keep changes unstaged',
      value: 'mixed',
    },
    {
      label: 'Hard reset — discard changes completely',
      value: 'hard',
    },
    { label: 'Cancel', value: 'cancel' },
  ])

  if (action === 'cancel') return

  if (action === 'hard') {
    log.warn('This will permanently discard your changes!')
    const sure = confirm('Are you sure?')
    if (!sure) return
  }

  const flag = action === 'soft' ? '--soft' : action === 'hard' ? '--hard' : '--mixed'

  const spinner = log.spinner()
  spinner.start('Undoing commit...')
  try {
    exec(`git reset ${flag} HEAD~1`, true)
    spinner.succeed(`Commit undone (${action} reset)`)
    showCurrentState()
  } catch {
    spinner.fail('Failed to undo commit')
  }
}

/**
 * Undo an amend
 */
const undoAmend = async (prevHash: string): Promise<void> => {
  log.info('This will restore the commit to its state before the amend.')
  console.log(`  ${colors.gray}Target: ${shortHash(prevHash)}${colors.reset}`)

  const action = await select('How to undo the amend?', [
    {
      label: 'Soft reset — restore pre-amend state, keep changes staged',
      value: 'soft',
    },
    {
      label: 'Mixed reset — restore pre-amend state, keep changes unstaged',
      value: 'mixed',
    },
    { label: 'Cancel', value: 'cancel' },
  ])

  if (action === 'cancel') return

  const flag = action === 'soft' ? '--soft' : '--mixed'

  const spinner = log.spinner()
  spinner.start('Undoing amend...')
  try {
    exec(`git reset ${flag} ${prevHash}`, true)
    spinner.succeed('Amend undone!')
    showCurrentState()
  } catch {
    spinner.fail('Failed to undo amend')
  }
}

/**
 * Undo a merge
 */
const undoMerge = async (): Promise<void> => {
  const action = await select('How to undo this merge?', [
    {
      label: 'Abort merge — if merge is still in progress',
      value: 'abort',
    },
    {
      label: 'Reset merge commit — undo completed merge',
      value: 'reset',
    },
    {
      label: 'Revert merge — create a new commit that reverses the merge',
      value: 'revert',
    },
    { label: 'Cancel', value: 'cancel' },
  ])

  if (action === 'cancel') return

  const spinner = log.spinner()

  if (action === 'abort') {
    spinner.start('Aborting merge...')
    try {
      exec('git merge --abort', true)
      spinner.succeed('Merge aborted!')
    } catch {
      spinner.fail('No merge in progress to abort')
    }
    return
  }

  if (action === 'reset') {
    log.warn('This will discard the merge commit!')
    const sure = confirm('Are you sure?')
    if (!sure) return

    spinner.start('Resetting merge...')
    try {
      exec('git reset --hard HEAD~1', true)
      spinner.succeed('Merge commit undone!')
      showCurrentState()
    } catch {
      spinner.fail('Failed to reset merge')
    }
    return
  }

  if (action === 'revert') {
    spinner.start('Reverting merge...')
    try {
      exec('git revert -m 1 HEAD', true)
      spinner.succeed('Merge reverted with new commit!')
      showCurrentState()
    } catch {
      spinner.fail('Failed to revert merge')
    }
  }
}

/**
 * Undo a checkout
 */
const undoCheckout = (description: string): void => {
  // Parse the checkout description to find the previous branch
  const match = description.match(/moving from (.+?) to (.+)/)
  const fromBranch = match?.[1] ?? ''

  if (!fromBranch) {
    log.warn('Could not determine previous branch.')
    log.info(`Try: ${colors.cyan}git checkout -${colors.reset}`)
    return
  }

  log.info(`Switch back to ${colors.green}${fromBranch}${colors.reset}?`)
  const doIt = confirm('Proceed?')
  if (!doIt) return

  const spinner = log.spinner()
  spinner.start(`Switching to ${fromBranch}...`)
  try {
    exec(`git checkout ${fromBranch}`, true)
    spinner.succeed(`Switched back to ${fromBranch}`)
  } catch {
    spinner.fail(`Failed to switch to ${fromBranch}`)
  }
}

/**
 * Undo a pull
 */
const undoPull = async (prevHash: string): Promise<void> => {
  log.info('This will reset to the state before the pull.')
  console.log(`  ${colors.gray}Target: ${shortHash(prevHash)}${colors.reset}`)

  const action = await select('How to undo the pull?', [
    {
      label: 'Hard reset — discard all pulled changes',
      value: 'hard',
    },
    {
      label: 'Mixed reset — keep pulled changes as unstaged',
      value: 'mixed',
    },
    { label: 'Cancel', value: 'cancel' },
  ])

  if (action === 'cancel') return

  if (action === 'hard') {
    log.warn('This will discard all pulled changes!')
    const sure = confirm('Are you sure?')
    if (!sure) return
  }

  const flag = action === 'hard' ? '--hard' : '--mixed'

  const spinner = log.spinner()
  spinner.start('Undoing pull...')
  try {
    exec(`git reset ${flag} ${prevHash}`, true)
    spinner.succeed('Pull undone!')
    showCurrentState()
  } catch {
    spinner.fail('Failed to undo pull')
  }
}

/**
 * Undo a rebase
 */
const undoRebase = async (prevHash: string): Promise<void> => {
  // Check if rebase is still in progress
  try {
    execSilent('git rebase --show-current-patch')
    // Rebase in progress
    const action = await select('Rebase is in progress:', [
      { label: 'Abort rebase — cancel completely', value: 'abort' },
      { label: 'Cancel', value: 'cancel' },
    ])

    if (action === 'cancel') return

    const spinner = log.spinner()
    spinner.start('Aborting rebase...')
    try {
      exec('git rebase --abort', true)
      spinner.succeed('Rebase aborted!')
    } catch {
      spinner.fail('Failed to abort rebase')
    }
    return
  } catch {
    // Not in progress, was completed
  }

  log.info('The rebase has completed. To undo:')
  console.log(
    `  ${colors.gray}Will reset to ${shortHash(prevHash)} (pre-rebase state)${colors.reset}`
  )

  const doIt = confirm('Undo completed rebase?')
  if (!doIt) return

  const spinner = log.spinner()
  spinner.start('Undoing rebase...')
  try {
    exec(`git reset --hard ${prevHash}`, true)
    spinner.succeed('Rebase undone!')
    showCurrentState()
  } catch {
    spinner.fail('Failed to undo rebase')
  }
}

/**
 * Undo a reset
 */
const undoReset = (prevHash: string): void => {
  log.info('This will reverse the reset operation.')
  console.log(`  ${colors.gray}Will restore to ${shortHash(prevHash)}${colors.reset}`)

  const doIt = confirm('Undo the reset?')
  if (!doIt) return

  const spinner = log.spinner()
  spinner.start('Reversing reset...')
  try {
    exec(`git reset --hard ${prevHash}`, true)
    spinner.succeed('Reset reversed!')
    showCurrentState()
  } catch {
    spinner.fail('Failed to reverse reset')
  }
}

/**
 * Generic undo using reflog
 */
const undoGeneric = async (prevHash: string): Promise<void> => {
  log.info('Undo by resetting to previous state in reflog.')
  console.log(`  ${colors.gray}Target: ${shortHash(prevHash)}${colors.reset}`)

  const action = await select('Reset mode:', [
    {
      label: 'Soft — keep all changes staged',
      value: 'soft',
    },
    {
      label: 'Mixed — keep changes as unstaged',
      value: 'mixed',
    },
    {
      label: 'Hard — discard everything',
      value: 'hard',
    },
    { label: 'Cancel', value: 'cancel' },
  ])

  if (action === 'cancel') return

  if (action === 'hard') {
    log.warn('This will discard all changes!')
    const sure = confirm('Are you sure?')
    if (!sure) return
  }

  const flag = action === 'soft' ? '--soft' : action === 'hard' ? '--hard' : '--mixed'

  const spinner = log.spinner()
  spinner.start('Undoing...')
  try {
    exec(`git reset ${flag} ${prevHash}`, true)
    spinner.succeed('Action undone!')
    showCurrentState()
  } catch {
    spinner.fail('Failed to undo action')
  }
}

/**
 * Show current state after undo
 */
const showCurrentState = (): void => {
  try {
    const status = execSilent('git status --short').trim()
    if (status) {
      console.log('')
      log.info('Current working tree:')
      const lines = status.split('\n').slice(0, 10)
      for (const l of lines) {
        console.log(`  ${colors.gray}${l}${colors.reset}`)
      }
      const total = status.split('\n').length
      if (total > 10) {
        console.log(`  ${colors.gray}... and ${total - 10} more${colors.reset}`)
      }
    }
  } catch {
    // ignore
  }
}
