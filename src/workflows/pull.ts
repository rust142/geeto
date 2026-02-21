/**
 * Pull workflow
 * Interactive git pull with strategy selection and remote awareness
 */

import { confirm } from '../cli/input.js'
import { select } from '../cli/menu.js'
import { colors } from '../utils/colors.js'
import { exec, execAsync, execSilent } from '../utils/exec.js'
import { getCurrentBranch } from '../utils/git.js'
import { log } from '../utils/logging.js'
import { ScrambleProgress } from '../utils/scramble.js'

/**
 * Get list of configured remotes
 */
const getRemotes = (): string[] => {
  try {
    return execSilent('git remote').trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Get tracking info for current branch
 */
const getTrackingInfo = (): { remote: string; branch: string } | null => {
  try {
    const upstream = execSilent('git rev-parse --abbrev-ref @{upstream}').trim()
    if (!upstream) return null
    const [remote, ...branchParts] = upstream.split('/')
    return { remote: remote ?? 'origin', branch: branchParts.join('/') }
  } catch {
    return null
  }
}

/**
 * Get ahead/behind count relative to upstream
 */
const getAheadBehind = (): { ahead: number; behind: number } | null => {
  try {
    const output = execSilent('git rev-list --left-right --count HEAD...@{upstream}').trim()
    const [ahead, behind] = output.split('\t').map(Number)
    return { ahead: ahead ?? 0, behind: behind ?? 0 }
  } catch {
    return null
  }
}

/**
 * Check if working tree is dirty
 */
const hasUncommittedChanges = (): boolean => {
  try {
    const status = execSilent('git status --porcelain').trim()
    return status.length > 0
  } catch {
    return false
  }
}

/**
 * Handle the pull workflow
 */
export const handlePull = async (): Promise<void> => {
  const C = colors.cyan
  const R = colors.reset
  const G = colors.green
  const Y = colors.yellow
  const GR = colors.gray
  const RED = colors.red

  console.log('')
  console.log(`  ${C}⬇ Git Pull${R}`)
  console.log(`  ${GR}${'─'.repeat(35)}${R}`)
  console.log('')

  const currentBranch = getCurrentBranch()
  const remotes = getRemotes()

  if (remotes.length === 0) {
    log.error('No remotes configured.')
    console.log(`  ${GR}Add a remote: git remote add origin <url>${R}`)
    console.log('')
    return
  }

  // Show current state
  console.log(`  ${GR}Branch:${R}  ${G}${currentBranch}${R}`)

  const tracking = getTrackingInfo()
  if (tracking) {
    console.log(`  ${GR}Tracks:${R}  ${C}${tracking.remote}/${tracking.branch}${R}`)
  } else {
    console.log(`  ${GR}Tracks:${R}  ${Y}(no upstream)${R}`)
  }

  // Fetch to get latest state
  console.log('')
  const fetchSpinner = log.spinner()
  fetchSpinner.start('Fetching latest from remote...')
  try {
    const fetchRemote = tracking?.remote ?? 'origin'
    await execAsync(`git fetch ${fetchRemote} --quiet`, true)
    fetchSpinner.succeed('Fetched latest from remote')
  } catch {
    fetchSpinner.fail('Could not fetch from remote')
    log.warn('Continuing with local info...')
  }

  const counts = getAheadBehind()
  if (counts) {
    const { ahead, behind } = counts
    if (behind === 0 && ahead === 0) {
      console.log('')
      log.success('Already up to date.')
      console.log('')
      return
    }
    if (behind === 0) {
      console.log('')
      log.info(`Already up to date (${ahead} commit${ahead === 1 ? '' : 's'} ahead).`)
      console.log('')
      return
    }
    console.log(
      `  ${GR}Status:${R}  ${behind > 0 ? `${RED}${behind} behind${R}` : ''}` +
        `${ahead > 0 && behind > 0 ? '  ' : ''}` +
        `${ahead > 0 ? `${G}${ahead} ahead${R}` : ''}`
    )
  }

  // Warn about uncommitted changes
  const dirty = hasUncommittedChanges()
  if (dirty) {
    console.log('')
    console.log(`  ${Y}⚠ You have uncommitted changes.${R}`)
    console.log(`  ${GR}Pull may fail if there are conflicts with local changes.${R}`)
  }

  console.log('')

  // Choose remote (if multiple)
  let remote = tracking?.remote ?? 'origin'
  if (remotes.length > 1) {
    remote = await select(
      'Pull from which remote?',
      remotes.map((r) => ({
        label: `${r}${r === tracking?.remote ? `  ${GR}(tracking)${R}` : ''}`,
        value: r,
      }))
    )
  }

  // Choose strategy
  const strategy = await select('Pull strategy:', [
    {
      label: `Merge  ${GR}(default — preserves history)${R}`,
      value: 'merge',
    },
    {
      label: `Rebase  ${GR}(linear history — replays commits on top)${R}`,
      value: 'rebase',
    },
    {
      label: `Fast-forward only  ${GR}(fails if diverged)${R}`,
      value: 'ff-only',
    },
  ])

  // Build the pull command
  let pullCmd = `git pull ${remote} ${currentBranch}`
  switch (strategy) {
    case 'rebase': {
      pullCmd = `git pull --rebase ${remote} ${currentBranch}`
      break
    }
    case 'ff-only': {
      pullCmd = `git pull --ff-only ${remote} ${currentBranch}`
      break
    }
  }

  // Stash if dirty and user wants
  let stashed = false
  if (dirty) {
    const useStash = confirm('Stash uncommitted changes before pull?', true)
    if (useStash) {
      try {
        exec('git stash push -m "geeto: auto-stash before pull"', true)
        stashed = true
        log.info('Changes stashed.')
      } catch {
        log.warn('Failed to stash changes. Proceeding anyway...')
      }
    }
  }

  // Execute pull
  console.log('')
  const pullProgress = new ScrambleProgress()
  pullProgress.start([
    `fetching remote refs from ${remote}...`,
    'downloading objects...',
    'resolving deltas...',
    `merging ${remote}/${currentBranch}...`,
  ])

  try {
    const result = await execAsync(pullCmd, true)
    pullProgress.succeed('Pull completed successfully')

    if (result.stdout.trim()) {
      console.log(result.stdout)
    }
  } catch (error) {
    pullProgress.fail('Pull failed')
    const msg = error instanceof Error ? error.message : String(error)

    if (msg.includes('CONFLICT') || msg.includes('conflict')) {
      console.log('')
      log.error('Merge conflicts detected!')
      console.log(`  ${GR}Resolve conflicts, then:${R}`)
      if (strategy === 'rebase') {
        console.log(`    ${C}git rebase --continue${R}  ${GR}(after resolving)${R}`)
        console.log(`    ${C}git rebase --abort${R}     ${GR}(to cancel)${R}`)
      } else {
        console.log(`    ${C}git add <files>${R}        ${GR}(mark resolved)${R}`)
        console.log(`    ${C}git commit${R}             ${GR}(complete merge)${R}`)
        console.log(`    ${C}git merge --abort${R}      ${GR}(to cancel)${R}`)
      }
      console.log('')
      console.log(`  ${GR}Or use: ${C}geeto --abort${R}`)
    } else {
      log.error(`Pull failed: ${msg}`)
    }

    // Restore stash if we stashed
    if (stashed) {
      console.log('')
      const restore = confirm('Restore stashed changes?', true)
      if (restore) {
        try {
          exec('git stash pop', true)
          log.info('Stashed changes restored.')
        } catch {
          log.warn('Could not auto-restore stash. Run: git stash pop')
        }
      }
    }
    console.log('')
    return
  }

  // Restore stash after successful pull
  if (stashed) {
    try {
      exec('git stash pop', true)
      log.info('Stashed changes restored.')
    } catch {
      log.warn('Could not auto-restore stash (may have conflicts). Run: git stash pop')
    }
  }

  // Show summary
  console.log('')
  try {
    const logOutput = execSilent('git log --oneline -3').trim()
    if (logOutput) {
      console.log(`  ${GR}Latest commits:${R}`)
      for (const line of logOutput.split('\n')) {
        console.log(`    ${GR}${line}${R}`)
      }
    }
  } catch {
    // Non-critical
  }
  console.log('')
}
