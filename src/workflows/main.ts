/** Main workflow for the Geeto CLI. */

import type { GeetoState } from '../types/index.js'
import type { MainOpts } from './main-helpers.js'

import { handleBranchCreationWorkflow } from './branch.js'
import { handleCommitWorkflow } from './commit.js'
import {
  handleStagingStep,
  resolveCheckpointAndProvider,
  setupTaskPlatform,
} from './main-helpers.js'
import { handleCleanup, handleMerge, handlePush } from './main-steps.js'
import { showSettingsMenu } from './settings.js'
import { closeInput, confirm } from '../cli/input.js'
import { select } from '../cli/menu.js'
import { STEP } from '../core/constants.js'
import { colors } from '../utils/colors.js'
import { displayCompletionSummary, displayCurrentProviderStatus } from '../utils/display.js'
import { isDryRun } from '../utils/dry-run.js'
import { exec } from '../utils/exec.js'
import { getCurrentBranch, getStagedFiles } from '../utils/git.js'
import { log } from '../utils/logging.js'
import { loadState, preserveProviderState, saveState } from '../utils/state.js'

export const main = async (opts?: MainOpts): Promise<void> => {
  try {
    log.banner()

    // Try to load saved state to show current provider status
    const spinner = log.spinner()
    spinner.start('Initializing...')
    const initialSavedState = loadState()
    spinner.stop()

    if (initialSavedState?.aiProvider) {
      // If there's a saved checkpoint, avoid duplicating the configured model
      // in the 'Current AI Setup' box since the resume flow will show it.
      displayCurrentProviderStatus()
    }

    const suppressLogs = !!opts?.startAt

    if (opts?.startAt) {
      log.info(`Starting at → ${colors.cyan}${opts.startAt}${colors.reset}`)
    }

    // Settings menu (loop so sub-menus can return here via Escape/back)
    let initialChoice: string
    if (opts?.startAt) {
      initialChoice = 'start'
    } else {
      while (true) {
        initialChoice = await select('Welcome to Geeto! What would you like to do?', [
          { label: 'Start new workflow', value: 'start' },
          { label: 'Trello tasks', value: 'trello' },
          { label: 'Settings', value: 'settings' },
          { label: 'Exit', value: 'exit' },
        ])

        if (initialChoice === 'exit' || initialChoice === 'back') {
          log.info('Goodbye!')
          return
        }

        if (initialChoice === 'settings') {
          await showSettingsMenu()
          continue
        }

        if (initialChoice === 'trello') {
          const { showTrelloMenu } = await import('./trello-menu.js')
          await showTrelloMenu()
          continue
        }

        // 'start' or any other value — break out of loop to continue workflow
        break
      }
    }

    // Check git repo first
    try {
      exec('git rev-parse --is-inside-work-tree', true)
    } catch {
      log.error('Not a git repository!')
      process.exit(1)
    }

    // Resolve AI provider and checkpoint state
    const {
      aiProvider,
      copilotModel,
      openrouterModel,
      geminiModel,
      shouldResume,
      suppressStagingDoneMessage,
      savedState,
    } = await resolveCheckpointAndProvider(opts, suppressLogs)
    // Determine actual current branch and staged files at startup
    const actualBranch = getCurrentBranch()

    let state: GeetoState = {
      step: STEP.INIT,
      workingBranch: '',
      targetBranch: '',
      currentBranch: actualBranch,
      timestamp: new Date().toISOString(),
      aiProvider,
      copilotModel,
      openrouterModel,
      geminiModel,
    }

    if (shouldResume && savedState) {
      // If actual branch equals saved working branch, resume from the saved step.
      const savedBranch = savedState.currentBranch ?? ''
      if (savedBranch && savedBranch !== actualBranch) {
        // Branch changed since last run — silently reset workflow state
        state = {
          ...savedState,
          step: STEP.INIT,
          workingBranch: actualBranch,
          currentBranch: actualBranch,
          // Preserve provider selection from new selection or savedState
          aiProvider,
          copilotModel,
          openrouterModel,
          geminiModel,
        }
        saveState(state)
      } else {
        // Resume but refresh current branch and staged files from git
        state = {
          ...savedState,
          currentBranch: actualBranch,
          // Preserve provider selection from new selection or savedState
          aiProvider,
          copilotModel,
          openrouterModel,
          geminiModel,
        }
        // Save state if provider info was just selected
        if (!savedState.aiProvider && aiProvider) {
          saveState(state)
        }
      }
    }

    // Save state immediately to persist provider selection for fresh starts and new state
    if (!shouldResume) {
      saveState(state)
    }

    // Use currentBranch as fallback if workingBranch is empty
    let workingBranch = state.workingBranch ?? state.currentBranch ?? actualBranch
    let featureBranch = ''

    // If startAt override was provided, adjust the initial step so the workflow
    // begins at the requested stage (commit/merge/branch).
    switch (opts?.startAt) {
      case 'commit': {
        // Start at branch-created so commit flow will run
        state.step = STEP.BRANCH_CREATED
        if (!suppressLogs) {
          log.info('Starting at commit step (skipping earlier steps)')
        }
        break
      }
      case 'merge': {
        // Mark as pushed so merge flow will run while push is skipped
        state.step = STEP.PUSHED
        if (!suppressLogs) {
          log.info('Starting at merge step (skipping earlier steps)')
        }
        break
      }
      case 'branch': {
        // Mark as staged so branch flow will run while staging is skipped
        state.step = STEP.STAGED
        if (!suppressLogs) {
          log.info('Starting at branch step (skipping earlier steps)')
        }
        break
      }
      case 'stage': {
        // Start from init so staging flow will run
        state.step = STEP.INIT
        if (!suppressLogs) {
          log.info('Starting at stage step (skipping earlier steps)')
        }
        break
      }
      case 'push': {
        // Mark as committed so push flow will run while earlier steps are skipped
        state.step = STEP.COMMITTED
        if (!suppressLogs) {
          log.info('Starting at push step (skipping earlier steps)')
        }
        break
      }
    }

    // Validate working branch (skip if in detached HEAD)
    if (!workingBranch || workingBranch.trim() === '') {
      try {
        // Try to get current branch again
        const retryBranch = getCurrentBranch()
        if (retryBranch && retryBranch.trim() !== '') {
          workingBranch = retryBranch
          state.currentBranch = retryBranch
        } else {
          log.warn('Unable to determine current branch (possibly detached HEAD). Using fallback.')
          workingBranch = 'detached-head'
          state.currentBranch = workingBranch
        }
      } catch {
        log.warn('Unable to determine current branch. Using fallback.')
        workingBranch = 'unknown-branch'
        state.currentBranch = workingBranch
      }
    }

    // Task management platform integration
    await setupTaskPlatform(opts)

    // STEP 1: Stage changes
    await handleStagingStep(state, opts, suppressLogs, suppressStagingDoneMessage)

    // STEP 2: Create branch
    if (state.step < STEP.BRANCH_CREATED) {
      const suppressConfirm = !!opts?.startAt && opts.startAt !== 'stage'

      // When running with CLI flags (except --stage), show a compact staged preview
      if (opts?.startAt && opts.startAt !== 'stage') {
        const stagedPreview = getStagedFiles()
        if (stagedPreview.length > 0) {
          log.info(`Staged: ${colors.cyan}${stagedPreview.length} files${colors.reset}`)
        }
      }

      const { branchName, created } = await handleBranchCreationWorkflow(state, {
        suppressStep: !!opts?.startAt,
        suppressConfirm,
      })
      // handleBranchCreationWorkflow returns { branchName, created }
      state.workingBranch = branchName
      if (created) {
        state.step = STEP.BRANCH_CREATED
        state.currentBranch = branchName
      }
      saveState(state)
    } else {
      workingBranch = state.workingBranch ?? state.currentBranch ?? actualBranch
      if (!state.workingBranch) {
        state.workingBranch = workingBranch
        saveState(state)
      }
      if (!suppressLogs) {
        log.success(`Branch already created: ${colors.cyan}${workingBranch}${colors.reset}`)
      }
    }

    // Dry-run: exit after branch step
    if (isDryRun() && opts?.startAt === 'branch') return

    // STEP 3: Commit
    if (state.step < STEP.COMMITTED) {
      // Refresh staged files from git in real-time. The staging step is
      // optional and only helps the user; commits must always verify the
      // current staged files from git so external changes are respected.
      const liveStaged = getStagedFiles()

      // When invoked via CLI flags (except --stage), show a compact staged preview
      if (opts?.startAt && opts.startAt !== 'stage' && liveStaged.length > 0) {
        log.info(`Staged: ${colors.cyan}${liveStaged.length} files${colors.reset}`)
      }

      if (liveStaged.length === 0) {
        console.log('')
        log.warn('No staged files found at commit time. Aborting.')
        process.exit(0)
      }

      if (!state.skippedCommit) {
        await handleCommitWorkflow(state, {
          suppressStep: !!opts?.startAt,
          suppressConfirm: false,
        })
        state.step = STEP.COMMITTED
        saveState(state)
      }
    } else {
      // If commit was explicitly skipped earlier, don't print "already done" messages
      if (!state.skippedCommit && !suppressLogs) {
        log.success('Commit already done')
      }
    }

    // Dry-run: exit after commit step
    if (isDryRun() && opts?.startAt === 'commit') return

    // STEP 4: Push — ask user before pushing in interactive mode
    if (opts?.startAt) {
      // Non-interactive: only push automatically if starting at push
      if (opts.startAt === 'push') {
        await handlePush(state, { suppressStep: true, suppressLogs })
      } else if (opts.startAt === 'merge') {
        // intentionally skip push prompt here; merge step will validate push status
      } else {
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
        const currentBranch = state.workingBranch || getCurrentBranch()
        console.log('')
        const wantPush = confirm(`Push ${currentBranch} to origin now?`)
        if (wantPush) {
          await handlePush(state, { suppressStep: !!opts?.startAt, suppressLogs: true })
        } else {
          log.info('Skipping push as per user request')
        }
      }
    } else {
      // Interactive: ask before pushing
      const currentBranch = state.workingBranch || getCurrentBranch()
      console.log('')
      // For safety, default NO to avoid accidental pushes on Enter
      const wantPush = confirm(`Push ${currentBranch} to origin now?`)
      if (wantPush) {
        // We already confirmed, so suppress further confirm inside handlePush
        await handlePush(state, { suppressStep: false, suppressLogs: true })
      } else {
        log.info('Skipping push as per user request')
      }
    }

    // Dry-run: exit after push step
    if (isDryRun() && opts?.startAt === 'push') return

    // STEP 5: Merge (simplified)
    // If the current branch has commits that are not pushed, ask the user to push
    const branchToCheck = state.workingBranch || getCurrentBranch()
    try {
      let hasCommitsToPush = false
      try {
        const remoteRef = exec(`git ls-remote --heads origin "${branchToCheck}"`, true).trim()
        if (remoteRef) {
          const commitsAhead = exec(
            `git rev-list HEAD...origin/"${branchToCheck}" --count`,
            true
          ).trim()
          hasCommitsToPush = commitsAhead !== '0' && commitsAhead !== ''
        } else {
          hasCommitsToPush = true
        }
      } catch {
        hasCommitsToPush = true
      }

      if (hasCommitsToPush) {
        // Default NO to avoid accidental push; if user declines, abort merge
        console.log('')
        log.info(`Branch ${branchToCheck} has commits not pushed to origin.`)
        await handlePush(state, { suppressStep: false, suppressLogs: false, force: true })
      }
    } catch {
      // On any error checking remote status, be conservative and abort the merge
      log.warn('Could not determine remote push status; aborting merge for safety.')
      return
    }

    featureBranch = await handleMerge(state, { suppressStep: !!opts?.startAt, suppressLogs })

    // Only proceed to cleanup if merge was successful
    if (state.step !== STEP.MERGED) {
      log.warn('Merge was not completed. Skipping cleanup.')
      console.log('\n⚠️  Workflow incomplete. Please resolve any issues and retry.\n')
      try {
        closeInput()
      } catch {
        /* ignore */
      }
      process.exit(1)
    }

    // STEP 6: Cleanup (simplified)
    await handleCleanup(featureBranch, state)

    // Reset state to initial but preserve AI provider settings
    preserveProviderState(state)

    // Display enhanced completion summary
    const stagedFiles = getStagedFiles()
    displayCompletionSummary({
      stagedFiles: stagedFiles.length,
      workingBranch: featureBranch || state.workingBranch,
      targetBranch: state.targetBranch,
    })

    // Close any interactive input resources and exit to ensure the CLI terminates
    try {
      closeInput()
    } catch {
      /* ignore */
    }
    process.exit(0)
  } catch (error) {
    if (error instanceof Error) {
      log.error(error.message)
    } else {
      log.error('Unknown error occurred')
    }
    process.exit(1)
  }
}
