import type { GeetoState } from '../types/index.js'

import { confirm, ProgressBar } from '../cli/input.js'
import { STEP } from '../core/constants.js'
import { exec } from '../utils/exec.js'
import { log } from '../utils/logging.js'
import { getCurrentBranch, pushWithRetry } from '../utils/git.js'
import { saveState } from '../utils/state.js'
import { select } from '../cli/menu.js'

export function handlePush(
  state: GeetoState,
  opts?: { suppressStep?: boolean; suppressLogs?: boolean, force?: boolean }
): void {
  if (state.step < STEP.PUSHED || opts?.force) {
    if (!opts?.suppressStep) {
      log.step('Step 4: Push to Remote')
    }
    if (!opts?.suppressLogs) {
      log.info(`Current branch: ${getCurrentBranch()}`)
    }

    let shouldPush: boolean
    if (opts?.suppressLogs) {
      // For startAt flags, auto push without confirm
      shouldPush = true
    } else {
      shouldPush = confirm(`Push ${getCurrentBranch()} to origin?`)
    }

    if (shouldPush) {
      // Get remote URL silently and show a tidy status line
      let remoteUrl = ''
      try {
        remoteUrl = exec('git remote get-url origin', true)
      } catch {
        // ignore
      }

      if (opts?.suppressLogs) {
        console.log('')
        const progressBar = new ProgressBar(2, 'Pushing to remote')
        progressBar.update(0)

        // Perform push silently to avoid interleaving git progress output
        progressBar.update(1)
        try {
          // Check if remote branch exists; if not, treat as commits to push
          let hasCommitsToPush = false
          try {
            const remoteRef = exec(`git ls-remote --heads origin "${getCurrentBranch()}"`, true).trim()
            if (!remoteRef) {
              // remote branch doesn't exist yet
              hasCommitsToPush = true
            } else {
              const commitsAhead = exec(
                `git rev-list HEAD...origin/"${getCurrentBranch()}" --count`,
                true
              ).trim()
              hasCommitsToPush = commitsAhead !== '0' && commitsAhead !== ''
            }
          } catch {
            // If any of the checks fail, assume there are commits to push
            hasCommitsToPush = true
          }

          exec(`git push -u origin "${getCurrentBranch()}"`, true)
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
          log.error('Push failed; see git output for details')
          throw error
        }
      } else {
        // Show remote info compactly
        if (remoteUrl) {
          log.info(`Pushing to: ${remoteUrl}`)
        }

        console.log('')
        const progressBar = new ProgressBar(2, 'Pushing to remote')
        progressBar.update(0)

        // Perform push silently to avoid interleaving git progress output
        progressBar.update(1)
        try {
          // Check if remote branch exists; if not, treat as commits to push
          let hasCommitsToPush = false
          try {
            const remoteRef = exec(`git ls-remote --heads origin "${getCurrentBranch()}"`, true).trim()
            if (!remoteRef) {
              // remote branch doesn't exist yet
              hasCommitsToPush = true
            } else {
              const commitsAhead = exec(
                `git rev-list HEAD...origin/"${getCurrentBranch()}" --count`,
                true
              ).trim()
              hasCommitsToPush = commitsAhead !== '0' && commitsAhead !== ''
            }
          } catch {
            // If any of the checks fail, assume there are commits to push
            hasCommitsToPush = true
          }

          exec(`git push -u origin "${getCurrentBranch()}"`, true)
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
          log.error('Push failed; see git output for details')
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
      log.step('Step 5: Merge to Target Branch')
    }
    if (!opts?.suppressLogs) {
      log.info(`Current branch: ${getCurrentBranch()}`)
    }

    const featureBranch = getCurrentBranch()

    // Gather local branches and offer them as merge targets
    const rawBranches = exec('git for-each-ref --format="%(refname:short)" refs/heads', true)
      .split(/\r?\n/)
      .map((b) => b.trim())
      .filter(Boolean)

    // Sort branches to prioritize canonical targets: development, develop, dev, then main/master, then others
    const priorityOrder = ['development', 'develop', 'dev', 'main', 'master']
    rawBranches.sort((a, b) => {
      const wa = priorityOrder.includes(a) ? priorityOrder.indexOf(a) : priorityOrder.length
      const wb = priorityOrder.includes(b) ? priorityOrder.indexOf(b) : priorityOrder.length
      if (wa !== wb) {
        return wa - wb
      }
      return a.localeCompare(b)
    })

    const targetExists = rawBranches.includes('development')

    // Build select options: list local branches, and an option to create 'development' if missing
    const options = rawBranches.map((b) => ({ label: b, value: b }))
    if (!targetExists) {
      options.unshift({ label: "Create 'development' branch", value: 'create_development' })
    }
    options.push({ label: 'Cancel', value: 'cancel' })

    const chosen = await select('Choose target branch for merge:', options)

    if (chosen === 'cancel') {
      log.warn('Merge cancelled.')
      process.exit(0)
    }

    let targetBranch = chosen

    // Handle create development flow
    if (chosen === 'create_development') {
      // Determine sensible base branch to create from
      const preferredBases = ['develop', 'development', 'main', 'master']
      const base = preferredBases.find((b) => rawBranches.includes(b)) ?? featureBranch

      const confirmCreate = confirm(`Create 'development' from '${base}'?`)
      if (!confirmCreate) {
        log.warn('Create development cancelled.')
        return featureBranch
      }

      exec(`git checkout -b development ${base}`)
      log.success(`Branch 'development' created from ${base}`)
      targetBranch = 'development'
    }

    const shouldMerge = confirm(`Merge ${featureBranch} into ${targetBranch}?`)

    if (shouldMerge) {
      const mergeType = await select('How to merge?', [
        { label: 'Merge --no-ff (preserve history)', value: 'merge-no-ff' },
        { label: 'Squash and merge --no-ff', value: 'squash' },
      ])

      exec(`git checkout ${targetBranch}`)

      if (mergeType === 'merge-no-ff') {
        exec(`git merge --no-ff ${featureBranch}`)
        log.success(`Merged ${featureBranch} into ${targetBranch} with --no-ff`)
      } else {
        // Squash commits on feature branch first
        const commitCount = Number.parseInt(
          exec(`git rev-list --count ${featureBranch} ^${targetBranch}`, true).trim()
        )
        if (commitCount > 1) {
          exec(`git reset --soft HEAD~${commitCount - 1}`)
          exec('git commit --amend --no-edit --no-verify')
        }
        exec(`git merge --no-ff ${featureBranch}`)
        log.success(`Squashed ${featureBranch} and merged into ${targetBranch} with --no-ff`)
      }

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
          log.info(`Pushing ${targetBranch} to: ${remoteUrl}`)
        } else {
          log.info(`Pushing ${targetBranch} to remote`)
        }

        console.log('')
        const progressBar = new ProgressBar(2, `Pushing ${targetBranch} to remote`)

        try {
          // Show a lightweight progress bar while the push runs so the user sees activity
          progressBar.update(0)
          console.log('')

          // Perform push silently to avoid interleaving git progress output
          progressBar.update(1)

          // Run push allowing git to print its own output as well
          pushWithRetry(`git push origin ${targetBranch}`, false)

          progressBar.complete()
          console.log('')
          log.success(`Pushed ${targetBranch} to remote`)
        } catch (err) {
          progressBar.complete()
          console.log('')
          log.error(`Failed to push ${targetBranch} to remote`)
          throw err
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

export function handleCleanup(featureBranch: string, state: GeetoState): void {
  if (state.step < STEP.CLEANUP) {
    log.step('Step 6: Cleanup')
    log.info(`Current branch: ${getCurrentBranch()}`)

    if (featureBranch && featureBranch !== state.targetBranch) {
      // Protect canonical branches from accidental deletion
      const protectedBranches = new Set(['development', 'develop', 'dev'])
      if (protectedBranches.has(featureBranch.toLowerCase())) {
        log.info(`Skipping deletion of protected branch '${featureBranch}'`)
      } else {
        const deleteAnswer = confirm(`Delete branch '${featureBranch}'?`)
        if (deleteAnswer) {
          exec(`git branch -d ${featureBranch}`)

          // Also delete remote branch if it exists
          try {
            pushWithRetry(`git push origin --delete ${featureBranch}`, true)
            log.success(`Remote branch '${featureBranch}' deleted`)
          } catch {
            // Remote branch might not exist, ignore error
          }
        } else {
          // User chose not to delete the feature branch — switch back to it so they can continue working
          try {
            exec(`git checkout "${featureBranch}"`)
            log.info(`Kept branch '${featureBranch}' and switched to it`)
          } catch {
            log.warn(`Could not switch back to branch '${featureBranch}'.`)
          }
        }
      }
    }

    state.step = STEP.CLEANUP
    saveState(state)
  }
}
