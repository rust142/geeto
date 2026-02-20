import type { GeetoState } from '../types/index.js'

import { handleCommitWorkflow } from './commit.js'
import { confirm, ProgressBar } from '../cli/input.js'
import { select } from '../cli/menu.js'
import { STEP } from '../core/constants.js'
import { colors } from '../utils/colors.js'
import { getStepProgress } from '../utils/display.js'
import { exec, execAsync } from '../utils/exec.js'
import { safeCheckout, safeMerge } from '../utils/git-errors.js'
import { getCurrentBranch, pushWithRetry } from '../utils/git.js'
import { log } from '../utils/logging.js'
import { saveState } from '../utils/state.js'

/** Extract a user-friendly message from a push error. */
function describePushError(error: unknown): string {
  const stderr =
    (error as { stderr?: string })?.stderr ?? (error as Error)?.message ?? String(error)
  const lower = stderr.toLowerCase()

  if (
    lower.includes('non-fast-forward') ||
    lower.includes('tip of your current branch is behind')
  ) {
    return (
      'Your local branch is behind the remote. Run `git pull` (or `git pull --rebase`)' +
      ' to integrate remote changes, then try again.'
    )
  }
  if (lower.includes('permission denied') || lower.includes('403')) {
    return 'Permission denied. Check that you have write access to this repository.'
  }
  if (
    lower.includes('authentication failed') ||
    lower.includes('http basic: access denied') ||
    lower.includes('could not read from remote')
  ) {
    return 'Authentication failed. Verify your SSH key, credential helper, or personal access token.'
  }
  if (lower.includes('does not appear to be a git repository')) {
    return "Remote 'origin' is not configured. Add a remote with `git remote add origin <url>`."
  }
  // Fallback: show first meaningful line of stderr
  const firstLine = stderr.split('\n').find((l: string) => l.trim() && !l.startsWith('hint:'))
  return firstLine?.trim() ?? 'Push failed. Run `git push` manually for details.'
}

export async function handlePush(
  state: GeetoState,
  opts?: { suppressStep?: boolean; suppressLogs?: boolean; force?: boolean }
): Promise<void> {
  if (state.step < STEP.PUSHED || opts?.force) {
    if (!opts?.suppressStep) {
      log.step(`Step 4: Push to Remote  ${getStepProgress(4)}`)
    }

    let shouldPush: boolean
    if (opts?.suppressLogs) {
      // For startAt flags, auto push without confirm
      shouldPush = true
    } else {
      shouldPush = confirm(`Push ${getCurrentBranch()} to origin?`)
    }

    if (shouldPush) {
      if (opts?.suppressLogs) {
        const progressBar = new ProgressBar(100, 'Pushing to remote')

        // Perform push silently to avoid interleaving git progress output
        let progress = 0
        const interval = setInterval(() => {
          progress = Math.min(95, progress + Math.max(1, Math.floor(Math.random() * 6)))
          progressBar.update(progress)
        }, 250)
        console.log('')

        try {
          // Check if remote branch exists; if not, treat as commits to push
          let hasCommitsToPush = false
          try {
            const remoteRef = exec(
              `git ls-remote --heads origin "${getCurrentBranch()}"`,
              true
            ).trim()
            if (remoteRef) {
              const commitsAhead = exec(
                `git rev-list HEAD...origin/"${getCurrentBranch()}" --count`,
                true
              ).trim()
              hasCommitsToPush = commitsAhead !== '0' && commitsAhead !== ''
            } else {
              // remote branch doesn't exist yet
              hasCommitsToPush = true
            }
          } catch {
            // If any of the checks fail, assume there are commits to push
            hasCommitsToPush = true
          }

          await execAsync(`git push -u origin "${getCurrentBranch()}"`, true)
          clearInterval(interval)
          progressBar.update(100)
          progressBar.complete()
          console.log('')

          if (hasCommitsToPush) {
            log.success(`Pushed ${getCurrentBranch()} to remote`)
          }
        } catch (error) {
          progressBar.complete()
          console.log('')
          log.error(describePushError(error))
          throw error
        }
      } else {
        // Push without progress bar

        const progressBar = new ProgressBar(100, 'Pushing to remote')

        // Perform push while updating progress bar
        let progress = 0
        const interval = setInterval(() => {
          progress = Math.min(95, progress + Math.max(1, Math.floor(Math.random() * 6)))
          progressBar.update(progress)
        }, 250)

        try {
          // Check if remote branch exists; if not, treat as commits to push
          let hasCommitsToPush = false
          try {
            const remoteRef = exec(
              `git ls-remote --heads origin "${getCurrentBranch()}"`,
              true
            ).trim()
            if (remoteRef) {
              const commitsAhead = exec(
                `git rev-list HEAD...origin/"${getCurrentBranch()}" --count`,
                true
              ).trim()
              hasCommitsToPush = commitsAhead !== '0' && commitsAhead !== ''
            } else {
              // remote branch doesn't exist yet
              hasCommitsToPush = true
            }
          } catch {
            // If any of the checks fail, assume there are commits to push
            hasCommitsToPush = true
          }

          await execAsync(`git push -u origin "${getCurrentBranch()}"`, true)
          clearInterval(interval)
          progressBar.update(100)
          progressBar.complete()
          console.log('')

          if (hasCommitsToPush) {
            log.success(`Pushed ${getCurrentBranch()} to remote`)
          }
        } catch (error) {
          progressBar.complete()
          console.log('')
          log.error(describePushError(error))
          throw error
        }
      }
    }

    state.step = STEP.PUSHED
    saveState(state)
  } else {
    // If push was explicitly skipped earlier, don't print "already done" messages
    if (!state.skippedPush && !opts?.suppressLogs) {
      log.success(`Push already done: ${state.workingBranch}`)
    }
  }
}

export async function handleMerge(
  state: GeetoState,
  opts?: { suppressStep?: boolean; suppressLogs?: boolean }
): Promise<string> {
  // Return the feature branch name used for later cleanup
  if (state.step < STEP.MERGED) {
    if (!opts?.suppressStep) {
      log.step(`Step 5: Merge to Target  ${getStepProgress(5)}`)
    }

    const featureBranch = getCurrentBranch()

    // Gather local branches and offer them as merge targets (exclude current branch)
    const rawBranches = exec('git for-each-ref --format="%(refname:short)" refs/heads', true)
      .split(/\r?\n/)
      .map((b) => b.trim())
      .filter(Boolean)

    // Exclude the current (feature) branch and feature-style branches (containing '#' or '/') from merge targets
    const branches = rawBranches.filter(
      (b) => b !== featureBranch && !b.includes('#') && !b.includes('/')
    )

    // Sort branches to prioritize canonical targets: development, develop, dev, then main/master, then others
    const priorityOrder = ['development', 'develop', 'dev', 'main', 'master']
    branches.sort((a, b) => {
      const wa = priorityOrder.includes(a) ? priorityOrder.indexOf(a) : priorityOrder.length
      const wb = priorityOrder.includes(b) ? priorityOrder.indexOf(b) : priorityOrder.length
      if (wa !== wb) {
        return wa - wb
      }
      return a.localeCompare(b)
    })

    // If 'development' already exists or we're currently on 'development', don't offer to create it
    const developmentPresent =
      rawBranches.includes('development') || featureBranch === 'development'

    // Build select options: list local branches (excluding current), and an option to create 'development' if missing
    const options = branches.map((b) => ({ label: b, value: b }))
    if (!developmentPresent) {
      options.unshift({ label: "Create 'development' branch", value: 'create_development' })
    }
    options.push({ label: 'Cancel', value: 'cancel' })

    console.log('')
    const chosen = await select('Choose target branch for merge:', options)

    if (chosen === 'cancel') {
      log.warn('Merge cancelled.')
      process.exit(0)
    }

    let targetBranch = chosen

    // Handle create development flow
    if (chosen === 'create_development') {
      // Determine sensible base branch to create from (exclude current feature branch)
      const preferredBases = ['develop', 'development', 'main', 'master']
      const base = preferredBases.find((b) => rawBranches.includes(b)) ?? featureBranch

      const confirmCreate = confirm(`Create 'development' from '${base}'?`)
      if (!confirmCreate) {
        log.warn('Create development cancelled.')
        return featureBranch
      }

      const createResult = await safeCheckout('development', { create: true })
      if (!createResult.success) {
        log.error(`Failed to create branch 'development': ${createResult.error}`)
        return featureBranch
      }
      log.success(`Branch 'development' created from ${base}`)
      targetBranch = 'development'
    }

    const shouldMerge = confirm(`Merge ${featureBranch} into ${targetBranch}?`)

    if (shouldMerge) {
      const mergeType = await select('How to merge?', [
        { label: 'Merge --no-ff (preserve history)', value: 'merge-no-ff' },
        { label: 'Squash and merge --no-ff', value: 'squash' },
      ])

      // Safe checkout to target branch with uncommitted changes handling
      let checkoutResult = await safeCheckout(targetBranch, {
        context: `To merge, we need to switch to '${targetBranch}'. Commit your changes in '${featureBranch}' first.`,
      })

      // If user chose to commit first, trigger commit workflow then retry checkout
      if (checkoutResult.commitNeeded) {
        console.log('')
        log.info(`Committing changes in '${featureBranch}' before merge...`)
        console.log('')

        await handleCommitWorkflow(state, { suppressStep: true, suppressConfirm: false })

        console.log('')
        log.info('Retrying checkout to target branch...')

        // Retry checkout after commit - will auto-handle any remaining conflicts
        checkoutResult = await safeCheckout(targetBranch, { force: false })
      }

      if (!checkoutResult.success) {
        log.error(`Failed to checkout ${targetBranch}: ${checkoutResult.error}`)
        return featureBranch
      }

      if (mergeType === 'merge-no-ff') {
        const mergeResult = await safeMerge(featureBranch, { noFf: true })
        if (!mergeResult.success) {
          if (mergeResult.conflict) {
            log.error('Merge aborted due to conflicts. Please resolve manually if needed.')
          } else {
            log.error(`Merge failed: ${mergeResult.error}`)
          }
          // Switch back to feature branch
          await safeCheckout(featureBranch)
          return featureBranch
        }
        log.success(
          `${colors.cyan}${featureBranch}${colors.reset} → merged into ${colors.cyan}${targetBranch}${colors.reset}`
        )
      } else {
        // Squash commits on feature branch first
        const commitCount = Number.parseInt(
          exec(`git rev-list --count ${featureBranch} ^${targetBranch}`, true).trim()
        )
        if (commitCount > 1) {
          exec(`git reset --soft HEAD~${commitCount - 1}`)
          exec('git commit --amend --no-edit --no-verify')
        }
        const mergeResult = await safeMerge(featureBranch, { noFf: true })
        if (!mergeResult.success) {
          if (mergeResult.conflict) {
            log.error('Merge aborted due to conflicts. Please resolve manually if needed.')
          } else {
            log.error(`Merge failed: ${mergeResult.error}`)
          }
          // Switch back to feature branch
          await safeCheckout(featureBranch)
          return featureBranch
        }
        log.success(
          `${colors.cyan}${featureBranch}${colors.reset} → squashed & merged into ${colors.cyan}${targetBranch}${colors.reset}`
        )
      }

      console.log('')
      // Push the updated target branch back to remote
      const shouldPushTarget = confirm(`Push ${targetBranch} to origin?`)
      if (shouldPushTarget) {
        // Provide visible push progress by allowing git to print progress to terminal
        console.log('')
        // Get remote URL silently for a nicer message
        let remoteUrl = ''
        try {
          remoteUrl = exec('git remote get-url origin', true)
        } catch {
          /* ignore */
        }
        if (remoteUrl) {
          // remote URL available for push
        } else {
          // push to default remote
        }

        console.log('')
        const progressBar = new ProgressBar(100, `Pushing ${targetBranch} to remote`)

        // Perform push while updating progress bar
        let progress = 0
        const interval = setInterval(() => {
          progress = Math.min(95, progress + Math.max(1, Math.floor(Math.random() * 6)))
          progressBar.update(progress)
        }, 250)
        try {
          // Check if remote branch exists; if not, treat as commits to push
          let hasCommitsToPush = false
          try {
            const remoteRef = exec(
              `git ls-remote --heads origin "${getCurrentBranch()}"`,
              true
            ).trim()
            if (remoteRef) {
              const commitsAhead = exec(
                `git rev-list HEAD...origin/"${getCurrentBranch()}" --count`,
                true
              ).trim()
              hasCommitsToPush = commitsAhead !== '0' && commitsAhead !== ''
            } else {
              // remote branch doesn't exist yet
              hasCommitsToPush = true
            }
          } catch {
            // If any of the checks fail, assume there are commits to push
            hasCommitsToPush = true
          }

          await execAsync(`git push -u origin "${getCurrentBranch()}"`, true)
          clearInterval(interval)
          progressBar.update(100)
          progressBar.complete()
          console.log('')

          if (hasCommitsToPush) {
            log.success(`Pushed ${getCurrentBranch()} to remote`)
          } else {
            log.info(`Branch ${getCurrentBranch()} is already up to date with remote`)
          }
        } catch (error) {
          progressBar.complete()
          console.log('')
          log.error(describePushError(error))
          throw error
        }
      }
    }

    state.targetBranch = targetBranch
    state.step = STEP.MERGED
    saveState(state)

    return featureBranch
  }

  if (!opts?.suppressLogs) {
    log.info(`✓ Merge already done to: ${state.targetBranch}`)
  }
  return state.targetBranch || getCurrentBranch()
}

export async function handleCleanup(featureBranch: string, state: GeetoState): Promise<void> {
  if (state.step < STEP.CLEANUP) {
    log.step(`Step 6: Cleanup  ${getStepProgress(6)}`)

    if (featureBranch && featureBranch !== state.targetBranch) {
      // Protect canonical branches from accidental deletion
      const protectedBranches = new Set(['main', 'master', 'development', 'develop'])
      if (protectedBranches.has(featureBranch.toLowerCase())) {
        log.info(`Skipping deletion of protected branch '${featureBranch}'`)
      } else {
        console.log('')
        const deleteAnswer = confirm(`Delete branch '${featureBranch}'?`)
        if (deleteAnswer) {
          try {
            exec(`git branch -d ${featureBranch}`, true)
            log.success(`Local branch '${featureBranch}' deleted`)

            // Also delete remote branch if it exists
            try {
              pushWithRetry(`git push origin --delete ${featureBranch}`, true)
              log.success(`Remote branch '${featureBranch}' deleted`)
            } catch {
              // Remote branch might not exist, ignore error
            }
          } catch (error) {
            // Branch deletion failed - likely not fully merged
            const errMsg = error instanceof Error ? error.message : String(error)

            if (errMsg.includes('not fully merged') || errMsg.includes('is not yet merged')) {
              console.log('')

              // Check if it's merged to HEAD but not to remote (safe to delete)
              const isMergedToHead =
                errMsg.includes('merged to HEAD') ||
                errMsg.includes('even though it is merged to HEAD')

              if (isMergedToHead) {
                log.info(
                  `Branch '${featureBranch}' is merged locally but remote is not updated yet.`
                )
                log.info('This is safe to delete since changes are already in your target branch.')
              } else {
                log.warn(`Branch '${featureBranch}' is not fully merged.`)
              }

              const forceDeleteChoice = await select('What would you like to do?', [
                {
                  label: isMergedToHead
                    ? 'Delete (safe - already merged)'
                    : 'Force delete anyway (git branch -D)',
                  value: 'force',
                },
                { label: 'Keep the branch', value: 'keep' },
              ])

              if (forceDeleteChoice === 'force') {
                try {
                  exec(`git branch -D ${featureBranch}`, true)
                  log.success(`Local branch '${featureBranch}' deleted`)

                  // Also delete remote branch if it exists
                  try {
                    pushWithRetry(`git push origin --delete ${featureBranch}`, true)
                    log.success(`Remote branch '${featureBranch}' deleted`)
                  } catch {
                    // Remote branch might not exist, ignore error
                  }
                } catch (forceError) {
                  log.error(`Failed to delete branch: ${forceError}`)
                }
              } else {
                log.info(`Kept branch '${featureBranch}'`)
              }
            } else {
              // Unknown error
              log.error(`Failed to delete branch: ${errMsg}`)
            }
          }
        } else {
          // User chose not to delete the feature branch — switch back to it so they can continue working
          const checkoutResult = await safeCheckout(featureBranch)
          if (checkoutResult.success) {
            log.info(`Kept branch '${featureBranch}' and switched to it`)
          } else {
            log.warn(`Could not switch back to branch '${featureBranch}': ${checkoutResult.error}`)
          }
        }
      }
    }

    state.step = STEP.CLEANUP
    saveState(state)
  }
}
