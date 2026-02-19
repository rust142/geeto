/**
 * Comprehensive git error handling utilities
 * Handles common git operation failures with user-friendly recovery options
 */

import { colors } from './colors.js'
import { exec, execAsync, execSilent } from './exec.js'
import { log } from './logging.js'
import { confirm } from '../cli/input.js'
import { select } from '../cli/menu.js'

/**
 * Check if there are uncommitted changes in the working directory
 */
export const hasUncommittedChanges = (): boolean => {
  try {
    const status = execSilent('git status --porcelain')
    return status.trim().length > 0
  } catch {
    return false
  }
}

/**
 * Check if there's a merge in progress
 */
export const isMergeInProgress = (): boolean => {
  try {
    execSilent('git rev-parse -q --verify MERGE_HEAD')
    return true
  } catch {
    return false
  }
}

/**
 * Check if there's a rebase in progress
 */
export const isRebaseInProgress = (): boolean => {
  try {
    const gitDir = execSilent('git rev-parse --git-dir')
    const rebaseDir = `${gitDir}/rebase-merge`
    const rebaseApply = `${gitDir}/rebase-apply`
    execSilent(`test -d "${rebaseDir}" || test -d "${rebaseApply}"`)
    return true
  } catch {
    return false
  }
}

/**
 * Handle uncommitted changes before checkout
 * Offers user options: stash, commit, force checkout, or cancel
 */
export const handleUncommittedChangesBeforeCheckout = async (
  context?: string
): Promise<'proceed' | 'cancel' | 'commit-needed'> => {
  if (!hasUncommittedChanges()) {
    return 'proceed'
  }

  console.log('')
  log.warn('You have uncommitted changes that would be overwritten by checkout.')
  if (context) {
    console.log('')
    log.info(context)
  }
  console.log('')

  // Show list of uncommitted files
  const status = execSilent('git status --porcelain')
  const files = status.split('\n').filter(Boolean).slice(0, 10)
  console.log(`${colors.cyan}Uncommitted files:${colors.reset}`)
  for (const file of files) {
    console.log(`  ${file}`)
  }
  if (status.split('\n').filter(Boolean).length > 10) {
    console.log(`  ... and ${status.split('\n').filter(Boolean).length - 10} more`)
  }
  console.log('')

  const choice = await select('How would you like to proceed?', [
    { label: 'Stash changes and checkout', value: 'stash' },
    { label: 'Commit changes first', value: 'commit' },
    { label: 'Force checkout (discard changes)', value: 'force' },
    { label: 'Cancel checkout', value: 'cancel' },
  ])

  switch (choice) {
    case 'stash': {
      try {
        exec('git stash push -m "Geeto auto-stash before checkout"')
        log.success('Changes stashed. You can restore them later with: git stash pop')
        return 'proceed'
      } catch {
        log.error('Failed to stash changes')
        return 'cancel'
      }
    }
    case 'commit': {
      // Stage all changes and signal that commit workflow should be triggered
      try {
        exec('git add -A')
        log.info('Changes staged. Entering commit workflow...')
        return 'commit-needed'
      } catch {
        log.error('Failed to stage changes')
        return 'cancel'
      }
    }
    case 'force': {
      const confirmForce = confirm(
        `${colors.red}Warning: This will discard all uncommitted changes. Continue?${colors.reset}`
      )
      if (confirmForce) {
        return 'proceed'
      }
      return 'cancel'
    }
    default: {
      log.info('Checkout cancelled')
      return 'cancel'
    }
  }
}

/**
 * Safe git checkout with error handling
 */
export const safeCheckout = async (
  branchName: string,
  options?: { create?: boolean; force?: boolean; context?: string }
): Promise<{ success: boolean; error?: string; commitNeeded?: boolean }> => {
  try {
    // For creating new branch or force checkout, proceed directly
    if (options?.create || options?.force) {
      const cmd = options.create
        ? `git checkout -b "${branchName}"`
        : `git checkout -f "${branchName}"`
      exec(cmd, true)
      return { success: true }
    }

    // Try checkout first - git will allow it if changes don't conflict
    try {
      exec(`git checkout "${branchName}"`, true)
      return { success: true }
    } catch (checkoutError) {
      const checkoutErrMsg =
        checkoutError instanceof Error ? checkoutError.message : String(checkoutError)

      // If checkout failed due to uncommitted changes that would be overwritten, ask user
      if (
        checkoutErrMsg.includes('would be overwritten') ||
        checkoutErrMsg.includes('Your local changes')
      ) {
        // Try checkout with -m flag (three-way merge) first
        console.log('')
        log.info('Trying checkout with merge (-m flag)...')
        try {
          exec(`git checkout -m "${branchName}"`, true)

          // Check if merge resulted in conflicts
          const status = execSilent('git status --porcelain')
          const hasConflicts =
            status.includes('UU ') || status.includes('AA ') || status.includes('DD ')

          if (hasConflicts) {
            // Conflicts detected - ask user what to do
            console.log('')
            log.warn('Checkout with merge resulted in conflicts.')
            console.log('')

            // Show conflicted files
            const conflictedFiles = status
              .split('\n')
              .filter(
                (line) => line.includes('UU ') || line.includes('AA ') || line.includes('DD ')
              )
              .slice(0, 10)

            console.log(`${colors.red}Conflicted files:${colors.reset}`)
            for (const file of conflictedFiles) {
              console.log(`  ${file}`)
            }
            console.log('')

            const conflictChoice = await select('What would you like to do?', [
              { label: 'Resolve conflicts manually (stay on this branch)', value: 'resolve' },
              { label: 'Abort and go back to selection', value: 'abort' },
            ])

            if (conflictChoice === 'abort') {
              // Abort the merge checkout
              try {
                exec('git merge --abort', true)
              } catch {
                // If merge --abort fails, try checkout --merge --abort
                try {
                  exec('git checkout --merge --abort', true)
                } catch {
                  // Last resort: hard reset to clean state
                  exec('git reset --merge', true)
                }
              }
              log.info('Merge checkout aborted')
              return { success: false, error: 'Merge conflict - aborted by user' }
            }

            // User chose to resolve manually
            log.info('Resolve conflicts and commit when ready.')
            log.info('  1. Edit conflicted files')
            log.info('  2. Stage resolved files: git add <files>')
            log.info('  3. Commit: git commit')
            return { success: true } // Consider it successful since user is on target branch
          }

          // No conflicts - checkout with merge succeeded
          log.success(`Checked out to ${branchName} with uncommitted changes merged`)
          return { success: true }
        } catch {
          // -m flag failed for reasons other than conflict (e.g., can't three-way merge)
          // Fall back to original menu
          log.warn('Checkout with merge not possible')
          console.log('')
        }

        // Show the interactive menu for handling uncommitted changes
        const canProceed = await handleUncommittedChangesBeforeCheckout(options?.context)
        if (canProceed === 'cancel') {
          return { success: false, error: 'Cancelled by user' }
        }
        if (canProceed === 'commit-needed') {
          return { success: false, commitNeeded: true, error: 'Commit required before checkout' }
        }

        // User chose stash or force - retry checkout
        exec(`git checkout "${branchName}"`, true)
        return { success: true }
      }

      // Other checkout errors - propagate them
      throw checkoutError
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)

    // Parse specific error types
    if (errMsg.includes('did not match any file(s) known to git')) {
      return { success: false, error: `Branch '${branchName}' does not exist` }
    }
    if (errMsg.includes('already exists')) {
      return { success: false, error: `Branch '${branchName}' already exists` }
    }

    return { success: false, error: errMsg }
  }
}

/**
 * Handle merge conflicts
 */
export const handleMergeConflicts = async (): Promise<'resolved' | 'abort' | 'manual'> => {
  console.log('')
  log.error('Merge conflict detected!')
  console.log('')

  // List conflicted files
  try {
    const conflicted = execSilent('git diff --name-only --diff-filter=U')
    const files = conflicted.split('\n').filter(Boolean)

    console.log(`${colors.red}Conflicted files:${colors.reset}`)
    for (const file of files) {
      console.log(`  ${colors.red}✗${colors.reset} ${file}`)
    }
    console.log('')
  } catch {
    // Ignore error in listing conflicts
  }

  const choice = await select('How would you like to resolve the conflict?', [
    { label: 'Abort merge (go back to previous state)', value: 'abort' },
    { label: 'Resolve manually (I will fix conflicts and continue)', value: 'manual' },
  ])

  if (choice === 'abort') {
    try {
      exec('git merge --abort')
      log.info('Merge aborted. Repository restored to previous state.')
      return 'abort'
    } catch {
      log.error('Failed to abort merge')
      return 'manual'
    }
  }

  return 'manual'
}

/**
 * Safe git merge with error handling
 */
export const safeMerge = async (
  sourceBranch: string,
  options?: { noFf?: boolean; squash?: boolean }
): Promise<{ success: boolean; conflict?: boolean; error?: string }> => {
  try {
    // Check if merge/rebase is already in progress
    if (isMergeInProgress()) {
      log.error('A merge is already in progress. Please resolve it first.')
      return { success: false, error: 'Merge already in progress' }
    }

    if (isRebaseInProgress()) {
      log.error('A rebase is in progress. Please finish it first.')
      return { success: false, error: 'Rebase in progress' }
    }

    // Build merge command
    let cmd = `git merge ${sourceBranch}`
    if (options?.noFf) {
      cmd += ' --no-ff'
    }
    if (options?.squash) {
      cmd += ' --squash'
    }

    exec(cmd)
    return { success: true }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)

    // Check if it's a merge conflict
    if (
      errMsg.includes('CONFLICT') ||
      errMsg.includes('Automatic merge failed') ||
      isMergeInProgress()
    ) {
      const resolution = await handleMergeConflicts()

      if (resolution === 'abort') {
        return { success: false, conflict: true, error: 'Merge conflict - aborted by user' }
      }

      // User chose manual resolution
      log.info('Waiting for you to resolve conflicts...')
      log.info('After resolving:')
      log.info('  1. Stage resolved files: git add <files>')
      log.info('  2. Complete merge: git commit')
      log.info('  3. Or abort: git merge --abort')

      return { success: false, conflict: true, error: 'Merge conflict - manual resolution needed' }
    }

    return { success: false, error: errMsg }
  }
}

/**
 * Handle push authentication errors
 */
const handlePushAuthError = async (): Promise<'retry' | 'cancel'> => {
  console.log('')
  log.error('Authentication failed for push operation')
  console.log('')
  log.info('Common solutions:')
  log.info('  1. Check your git credentials (username/password or SSH key)')
  log.info('  2. For HTTPS: Ensure your PAT/password is correct')
  log.info('  3. For SSH: Ensure your SSH key is added to your git provider')
  log.info('  4. Check network connectivity')
  console.log('')

  const choice = await select('What would you like to do?', [
    { label: 'Retry push', value: 'retry' },
    { label: 'Cancel push', value: 'cancel' },
  ])

  return choice as 'retry' | 'cancel'
}

/**
 * Handle push rejected (non-fast-forward) errors
 */
const handlePushRejected = async (): Promise<'pull' | 'force' | 'cancel'> => {
  console.log('')
  log.error(`Push rejected: Updates were rejected because the remote contains work you don't have.`)
  console.log('')
  log.info('This usually happens when:')
  log.info('  • Someone else pushed to the same branch')
  log.info('  • You rebased or amended commits that were already pushed')
  console.log('')

  const choice = await select('How would you like to proceed?', [
    { label: 'Pull and merge remote changes first', value: 'pull' },
    { label: 'Force push (overwrite remote - dangerous!)', value: 'force' },
    { label: 'Cancel push', value: 'cancel' },
  ])

  if (choice === 'force') {
    const confirmForce = confirm(
      `${colors.red}Warning: Force push will overwrite remote history. Continue?${colors.reset}`
    )
    if (!confirmForce) {
      return 'cancel'
    }
  }

  return choice as 'pull' | 'force' | 'cancel'
}

/**
 * Safe git push with comprehensive error handling
 */
export const safePush = async (
  branchName?: string,
  options?: { setUpstream?: boolean; force?: boolean }
): Promise<{ success: boolean; error?: string }> => {
  const branch = branchName ?? execSilent('git branch --show-current')

  let cmd = `git push`
  if (options?.setUpstream) {
    cmd += ` -u origin "${branch}"`
  }
  if (options?.force) {
    cmd += ' --force'
  }

  let retries = 0
  const maxRetries = 3

  while (retries < maxRetries) {
    try {
      await execAsync(cmd, false)
      return { success: true }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)

      // Authentication error
      if (
        errMsg.includes('Authentication failed') ||
        errMsg.includes('Permission denied') ||
        errMsg.includes('Could not read from remote') ||
        errMsg.includes('fatal: unable to access')
      ) {
        const action = await handlePushAuthError()
        if (action === 'cancel') {
          return { success: false, error: 'Authentication failed - cancelled by user' }
        }
        retries++
        continue
      }

      // Push rejected (non-fast-forward)
      if (
        errMsg.includes('rejected') ||
        errMsg.includes('non-fast-forward') ||
        errMsg.includes('Updates were rejected')
      ) {
        const action = await handlePushRejected()

        if (action === 'cancel') {
          return { success: false, error: 'Push rejected - cancelled by user' }
        }

        if (action === 'force') {
          return safePush(branchName, { ...options, force: true })
        }

        if (action === 'pull') {
          try {
            // Try to pull with rebase
            log.info('Pulling remote changes...')
            exec(`git pull --rebase origin "${branch}"`)
            log.success('Successfully pulled and rebased')
            // Retry push after successful pull
            retries++
            continue
          } catch {
            log.error('Failed to pull remote changes')
            return { success: false, error: 'Pull failed after rejected push' }
          }
        }
      }

      // Network error
      if (
        errMsg.includes('Could not resolve host') ||
        errMsg.includes('Failed to connect') ||
        errMsg.includes('Connection timed out')
      ) {
        log.error('Network error during push')
        const retry = confirm('Network error. Retry push?')
        if (!retry) {
          return { success: false, error: 'Network error - cancelled by user' }
        }
        retries++
        continue
      }

      // No upstream branch
      if (errMsg.includes('no upstream branch') || errMsg.includes('has no upstream branch')) {
        log.info('No upstream branch configured. Setting up...')
        return safePush(branchName, { ...options, setUpstream: true })
      }

      // Unknown error
      log.error(`Push failed: ${errMsg}`)
      return { success: false, error: errMsg }
    }
  }

  return { success: false, error: 'Push failed after maximum retries' }
}

/**
 * Safe git commit with error handling
 */
export const safeCommit = async (
  message: string,
  options?: { amend?: boolean; noVerify?: boolean }
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Check if there's a merge in progress
    if (isMergeInProgress()) {
      // For merge commits, allow commit without message check
      let cmd = 'git commit'
      if (options?.noVerify) {
        cmd += ' --no-verify'
      }
      if (!message || message.trim() === '') {
        cmd += ' --no-edit'
      } else {
        const escapedMessage = message.replaceAll('"', String.raw`\\"`)
        cmd += ` -m "${escapedMessage}"`
      }
      exec(cmd)
      return { success: true }
    }

    // Check if there are staged changes
    const stagedFiles = execSilent('git diff --name-only --cached')
    if (!stagedFiles.trim() && !options?.amend) {
      log.warn('No staged changes to commit')
      const choice = await select('What would you like to do?', [
        { label: 'Stage all changes and commit', value: 'stage-all' },
        { label: 'Cancel commit', value: 'cancel' },
      ])

      if (choice === 'cancel') {
        return { success: false, error: 'No staged changes - cancelled by user' }
      }

      // Stage all changes
      exec('git add -A')
    }

    // Build commit command
    let cmd = 'git commit'
    if (message && message.trim() !== '') {
      const escapedMessage = message.replaceAll('"', String.raw`\\"`)
      cmd += ` -m "${escapedMessage}"`
    }
    if (options?.amend) {
      cmd += ' --amend'
    }
    if (options?.noVerify) {
      cmd += ' --no-verify'
    }

    exec(cmd)
    return { success: true }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)

    // Pre-commit hook failed
    if (errMsg.includes('pre-commit hook failed') || errMsg.includes('hook declined')) {
      log.error('Pre-commit hook failed')
      const skipHook = confirm('Skip pre-commit hooks and commit anyway?')
      if (skipHook) {
        return safeCommit(message, { ...options, noVerify: true })
      }
      return { success: false, error: 'Pre-commit hook failed - cancelled by user' }
    }

    return { success: false, error: errMsg }
  }
}

/**
 * Safe git pull with error handling
 */
export const safePull = async (
  remote: string = 'origin',
  branch?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Check for uncommitted changes
    if (hasUncommittedChanges()) {
      log.warn('You have uncommitted changes')
      const choice = await select('How would you like to proceed?', [
        { label: 'Stash changes and pull', value: 'stash' },
        { label: 'Cancel pull', value: 'cancel' },
      ])

      if (choice === 'cancel') {
        return { success: false, error: 'Uncommitted changes - cancelled by user' }
      }

      exec('git stash push -m "Geeto auto-stash before pull"')
      log.success('Changes stashed')
    }

    const branchArg = branch ? ` ${branch}` : ''
    await execAsync(`git pull ${remote}${branchArg}`, false)

    // If we stashed, ask if user wants to pop
    try {
      const stashList = execSilent('git stash list')
      if (stashList.includes('Geeto auto-stash before pull')) {
        const popStash = confirm('Pull complete. Pop stashed changes?')
        if (popStash) {
          exec('git stash pop')
          log.success('Stashed changes restored')
        }
      }
    } catch {
      // Ignore stash errors
    }

    return { success: true }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)

    // Merge conflict during pull
    if (errMsg.includes('CONFLICT') || errMsg.includes('Automatic merge failed')) {
      const resolution = await handleMergeConflicts()
      if (resolution === 'abort') {
        return { success: false, error: 'Pull conflict - aborted by user' }
      }
      return { success: false, error: 'Pull conflict - manual resolution needed' }
    }

    // Authentication error
    if (errMsg.includes('Authentication failed') || errMsg.includes('Permission denied')) {
      log.error('Authentication failed during pull')
      return { success: false, error: 'Authentication failed' }
    }

    // Network error
    if (errMsg.includes('Could not resolve host') || errMsg.includes('Failed to connect')) {
      log.error('Network error during pull')
      return { success: false, error: 'Network error' }
    }

    return { success: false, error: errMsg }
  }
}
