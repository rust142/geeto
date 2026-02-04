/** Main workflow for the Geeto CLI. */

import path from 'node:path'
import type { CopilotModel } from '../api/copilot.js'
import type { GeminiModel } from '../api/gemini.js'
import type { OpenRouterModel } from '../api/openrouter.js'
import type { GeetoState } from '../types/index.js'

import { handleAIProviderSelection } from './ai-provider.js'
import { showAuthorTools } from './author.js'
import { handleBranchCreationWorkflow } from './branch.js'
import { handleCommitWorkflow } from './commit.js'
import { handleCleanup, handleMerge, handlePush } from './main-steps.js'
import { showSettingsMenu } from './settings.js'
import { closeInput, confirm } from '../cli/input.js'
import { select } from '../cli/menu.js'
import { STEP, TASK_PLATFORMS } from '../core/constants.js'
import { colors } from '../utils/colors.js'
import {
  DEFAULT_GEMINI_MODEL,
  getTrelloConfig,
  hasSkippedTrelloPrompt,
  hasTrelloConfig,
  setSkipTrelloPrompt,
} from '../utils/config.js'
import { exec } from '../utils/exec.js'
import { getChangedFiles, getCurrentBranch, getStagedFiles } from '../utils/git.js'
import { log } from '../utils/logging.js'
import { loadState, preserveProviderState, saveState } from '../utils/state.js'
import { formatTimestampLocale } from '../utils/time.js'

const getStepName = (step: number): string => {
  switch (step) {
    case STEP.STAGED: {
      return 'Staging completed'
    }
    case STEP.BRANCH_CREATED: {
      return 'Branch created'
    }
    case STEP.COMMITTED: {
      return 'Commit completed'
    }
    case STEP.PUSHED: {
      return 'Push completed'
    }
    case STEP.MERGED: {
      return 'Merge completed'
    }
    case STEP.CLEANUP: {
      return 'Cleanup'
    }
    default: {
      return 'Unknown'
    }
  }
}

const displayCurrentProviderStatus = async (): Promise<void> => {
  const spinner = log.spinner()
  spinner.start('Loading git information...')

  // Get git user and remote info for display
  let gitUser = { name: '', email: '' }
  let remoteUrl = ''
  let upstream = ''
  try {
    const utils = await import('../utils/exec.js')
    gitUser.name = utils.exec('git config user.name', true).trim()
    gitUser.email = utils.exec('git config user.email', true).trim()
  } catch {
    gitUser = { name: '', email: '' }
  }
  try {
    const utils = await import('../utils/exec.js')
    remoteUrl = utils.exec('git remote get-url origin', true).trim()
  } catch {
    remoteUrl = ''
  }
  try {
    const utils = await import('../utils/exec.js')
    upstream = utils.exec('git rev-parse --abbrev-ref --symbolic-full-name @{u}', true).trim()
  } catch {
    upstream = ''
  }

  // Trello board id if configured
  const trelloConfig = getTrelloConfig()

  spinner.stop()

  console.log(
    `${colors.cyan}┌─ Git Information ───────────────────────────────────────┐${colors.reset}`
  )

  if (gitUser) {
    console.log(
      `${colors.cyan}│${colors.reset} Username: ${colors.cyan}${gitUser.name}${colors.reset}`
    )
    console.log(
      `${colors.cyan}│${colors.reset} Email: ${colors.cyan}${gitUser.email}${colors.reset}`
    )
  }
  if (remoteUrl) {
    console.log(`${colors.cyan}│${colors.reset} Remote: ${colors.cyan}${remoteUrl}${colors.reset}`)
  }
  if (upstream) {
    console.log(
      `${colors.cyan}│${colors.reset} Remote branch: ${colors.cyan}${upstream}${colors.reset}`
    )
  }
  if (trelloConfig.boardId) {
    console.log(
      `${colors.cyan}│${colors.reset} Trello board: ${colors.cyan}${trelloConfig.boardId}${colors.reset}`
    )
  }

  // Only show git-related info in this box (provider/model are shown in Resume Status)

  console.log(
    `${colors.cyan}└─────────────────────────────────────────────────────────┘${colors.reset}`
  )
  // Header now shows Git info only
}

export const main = async (opts?: {
  startAt?: 'commit' | 'merge' | 'branch' | 'stage' | 'push'
  fresh?: boolean
  resume?: boolean
  stageAll?: boolean
}): Promise<void> => {
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
      await displayCurrentProviderStatus()
    }

    const suppressLogs = !!opts?.startAt

    if (opts?.startAt) {
      log.info(`Shortcut: starting at step -> ${opts.startAt}`)
    }

    // Settings menu
    const initialChoice = opts?.startAt
      ? 'start'
      : await select('Welcome to Geeto! What would you like to do?', [
          { label: 'Start new workflow', value: 'start' },
          { label: 'About author', value: 'author' },
          { label: 'Settings', value: 'settings' },
          { label: 'Exit', value: 'exit' },
        ])

    if (!opts?.startAt && initialChoice === 'exit') {
      log.info('Goodbye!')
      return
    }

    if (!opts?.startAt && initialChoice === 'settings') {
      await showSettingsMenu()
      // After settings, go back to main menu
      await main()
      return
    }

    if (!opts?.startAt && initialChoice === 'author') {
      await showAuthorTools()
      return
    }

    // Check git repo first
    try {
      exec('git rev-parse --is-inside-work-tree', true)
    } catch {
      log.error('Not a git repository!')
      process.exit(1)
    }

    // Load saved state early
    const savedState = loadState()
    let aiProvider: 'gemini' | 'copilot' | 'openrouter' | 'manual'
    let copilotModel: CopilotModel | undefined
    let openrouterModel: OpenRouterModel | undefined
    let geminiModel: GeminiModel | undefined
    let shouldResume = false
    let suppressStagingDoneMessage = false

    if (savedState) {
      // Format saved checkpoint timestamp using system locale when available.
      const formattedTimestamp = formatTimestampLocale(savedState.timestamp)
      log.warn(`Found saved checkpoint from: ${formattedTimestamp}`)
      log.info(`Last step: ${getStepName(savedState.step)}`)

      // Use the real git branch at startup so manual `git checkout` is reflected
      const actualCurrentBranch = getCurrentBranch()
      const displayedWorking =
        actualCurrentBranch || savedState.workingBranch || savedState.currentBranch || 'unknown'
      log.info(`Working branch: ${colors.cyan}${displayedWorking}${colors.reset}`)

      let resumeChoice: string
      if (opts?.fresh) {
        resumeChoice = 'fresh'
      } else if (opts?.resume === true || opts?.startAt) {
        // Auto-resume without prompt
        resumeChoice = 'resume'
      } else {
        // Avoid accidental immediate acceptance from previous Enter key press
        await new Promise((resolve) => setTimeout(resolve, 80))
        resumeChoice = await select('What would you like to do?', [
          { label: 'Resume from checkpoint', value: 'resume' },
          { label: 'Start fresh (discard checkpoint)', value: 'fresh' },
          { label: 'Cancel', value: 'cancel' },
        ])
      }

      // If startAt provided, ensure the saved checkpoint step is compatible
      switch (opts?.startAt) {
        case 'commit': {
          savedState.step = Math.max(savedState.step, STEP.BRANCH_CREATED)
          if (!suppressLogs) {
            log.info('Auto-start: commit')
          }
          break
        }
        case 'merge': {
          savedState.step = Math.max(savedState.step, STEP.PUSHED)
          if (!suppressLogs) {
            log.info('Auto-start: merge')
          }
          break
        }
        case 'branch': {
          savedState.step = Math.max(savedState.step, STEP.STAGED)
          if (!suppressLogs) {
            log.info('Auto-start: branch')
          }
          break
        }
        case 'stage': {
          savedState.step = Math.max(savedState.step, STEP.INIT)
          if (!suppressLogs) {
            log.info('Auto-start: stage')
          }
          break
        }
        case 'push': {
          savedState.step = Math.max(savedState.step, STEP.COMMITTED)
          if (!suppressLogs) {
            log.info('Auto-start: push')
          }
          break
        }
      }

      if (resumeChoice === 'resume') {
        shouldResume = true
        // When resuming from a checkpoint that already completed staging,
        // avoid duplicating the staged-files summary message later.
        suppressStagingDoneMessage = savedState.step >= STEP.STAGED
        // Use saved AI provider and model
        aiProvider = savedState.aiProvider ?? 'gemini'
        copilotModel = savedState.copilotModel
        openrouterModel = savedState.openrouterModel
        geminiModel = savedState.geminiModel

        // Show a compact resume status box separate from the full "Current AI Setup"
        const gitUtils = await import('../utils/git-ai.js')
        const providerShort = gitUtils.getAIProviderShortName(aiProvider)
        let modelToShow: string | undefined
        if (aiProvider === 'copilot') {
          modelToShow = copilotModel
        } else if (aiProvider === 'openrouter') {
          modelToShow = openrouterModel
        } else {
          modelToShow = geminiModel ?? DEFAULT_GEMINI_MODEL
        }

        if (!opts?.startAt) {
          console.log(
            `${colors.cyan}┌─ Checkpoint Summary ────────────────────────────────────┐${colors.reset}`
          )
          if (aiProvider === 'manual') {
            console.log(
              `${colors.cyan}│${colors.reset} Provider: ${colors.cyan}Manual (manual mode)${colors.reset}`
            )
          } else {
            console.log(
              `${colors.cyan}│${colors.reset} Provider: ${colors.cyan}${providerShort}${colors.reset}`
            )
            if (modelToShow) {
              console.log(
                `${colors.cyan}│${colors.reset} Model: ${colors.cyan}${modelToShow}${colors.reset}`
              )
            }
          }
          console.log(
            `${colors.cyan}│${colors.reset} Resuming from: ${colors.cyan}${getStepName(savedState.step)}${colors.reset}`
          )
          // Show staged files preview
          const currentStaged = getStagedFiles()

          if (currentStaged.length > 0) {
            // Compute overflow count for preview
            const moreCount = Math.max(0, currentStaged.length - 2)
            const more = moreCount > 0 ? ` (+${moreCount} more)` : ''

            // Display staged count (live or checkpoint)
            const shownCount = currentStaged.length
            const stagedLine = `${colors.cyan}│${colors.reset} Staged: ${colors.cyan}${shownCount} files${colors.reset}`
            console.log(stagedLine)
            console.log(
              `${colors.cyan}│${colors.reset} Files: ${colors.cyan}${currentStaged
                .splice(0, 2)
                .map((f) => path.basename(f))
                .join(', ')}${more}${colors.reset}`
            )
          }
          console.log(
            `${colors.cyan}└─────────────────────────────────────────────────────────┘${colors.reset}`
          )
        }

        // Verify AI provider setup is still valid (skip for manual mode)
        if (!opts?.startAt && aiProvider !== 'manual') {
          const { ensureAIProvider } = await import('../core/setup.js')
          const aiReady = await ensureAIProvider(aiProvider)
          if (!aiReady) {
            log.warn(
              `${aiProvider === 'gemini' ? 'Gemini' : 'GitHub Copilot'} setup is no longer valid.`
            )
            const fixSetup = confirm(
              `Fix ${aiProvider === 'gemini' ? 'Gemini' : 'GitHub Copilot'} setup now?`
            )
            if (fixSetup) {
              const setupSuccess = await ensureAIProvider(aiProvider)
              if (!setupSuccess) {
                log.warn(
                  `Could not fix ${aiProvider === 'gemini' ? 'Gemini' : 'GitHub Copilot'} setup. Switching to manual mode.`
                )
                aiProvider = 'gemini' // Keep gemini but will use manual fallback
              }
            } else {
              log.warn(
                `${aiProvider === 'gemini' ? 'Gemini' : 'GitHub Copilot'} setup invalid. Will use manual mode for AI features.`
              )
            }
          }
        }
      } else if (resumeChoice === 'fresh') {
        preserveProviderState(savedState)
        log.info('Starting fresh...')

        // Keep the currently configured provider and model from the saved checkpoint.
        aiProvider = savedState.aiProvider ?? 'gemini'
        copilotModel = savedState.copilotModel
        openrouterModel = savedState.openrouterModel
        geminiModel = savedState.geminiModel

        // Display current provider status (Git info only)
        await displayCurrentProviderStatus()
      } else {
        process.exit(0)
      }
    } else {
      // No saved state, choose AI provider fresh
      if (opts?.startAt) {
        // For startAt flags, use default provider without prompting
        aiProvider = 'gemini'
        geminiModel = DEFAULT_GEMINI_MODEL
        log.info('Using default AI provider (Gemini) for quick start')
      } else {
        const aiSelection = await handleAIProviderSelection()
        aiProvider = aiSelection.aiProvider
        copilotModel = aiSelection.copilotModel
        openrouterModel = aiSelection.openrouterModel
        geminiModel = aiSelection.geminiModel
      }

      // Display current provider status (Git info only)
      await displayCurrentProviderStatus()
    }

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
        log.warn(
          `Branch changed from '${savedBranch}' to '${actualBranch}', resetting workflow state`
        )
        state = {
          ...savedState,
          step: STEP.INIT,
          workingBranch: actualBranch,
          currentBranch: actualBranch,
        }
        saveState(state)
      } else {
        // Resume but refresh current branch and staged files from git
        state = {
          ...savedState,
          currentBranch: actualBranch,
        }
      }
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

    // Ask about task management platform integration
    let selectedPlatform: 'trello' | 'none' = 'none'

    // Auto-detect configured platforms
    if (hasTrelloConfig()) {
      selectedPlatform = 'trello'
      if (!opts?.startAt) {
        log.success('Trello platform configured')
      }
    } else {
      // If user previously skipped Trello setup, don't prompt again here.
      if (hasSkippedTrelloPrompt()) {
        log.info('Trello integration not configured (previously skipped).')
      } else {
        const wantTaskIntegration = confirm('Integrate with task management platform?')

        if (wantTaskIntegration) {
          // Show available platforms
          const enabledPlatforms = TASK_PLATFORMS.filter((p) => p.enabled)

          if (enabledPlatforms.length > 0) {
            // Show selection menu
            const platformOptions = [
              ...enabledPlatforms.map((p) => ({ label: p.name, value: p.value })),
              { label: 'Skip integration', value: 'none' },
            ]

            selectedPlatform = (await select(
              'Select task management platform:',
              platformOptions
            )) as 'trello' | 'none'
          }

          // Setup selected platform if needed
          if (selectedPlatform === 'trello' && !hasTrelloConfig()) {
            const trelloSpinner = log.spinner()
            trelloSpinner.start('Setting up Trello integration...')
            const { setupTrelloConfigInteractive } = await import('../core/trello-setup.js')
            const trelloSetupSuccess = setupTrelloConfigInteractive()
            trelloSpinner.stop()
            if (trelloSetupSuccess) {
              log.success('Trello integration configured!')
            } else {
              log.warn('Trello setup failed or cancelled.')
            }
            console.log('')
          }
        } else {
          // User declined task integration, save skip flag
          setSkipTrelloPrompt()
        }
      }
    }

    // STEP 1: Stage changes
    if (state.step < STEP.STAGED) {
      const changedFiles = getChangedFiles()

      log.info(`Current branch: ${state.currentBranch}`)
      log.info(`Changed files: ${changedFiles.length}`)

      if (changedFiles.length === 0) {
        // No file changes detected — if CLI requested auto-stage, just continue;
        // otherwise prompt the user to continue or cancel.
        if (!opts?.stageAll) {
          const noChangesChoice = await select(
            'No changes detected. How would you like to proceed?',
            [
              { label: 'Continue without staging', value: 'without' },
              { label: 'Cancel', value: 'cancel' },
            ]
          )
          if (noChangesChoice === 'cancel') {
            log.warn('Cancelled.')
            process.exit(0)
          }
        }
      } else {
        console.log('\nChanged files:')
        for (const file of changedFiles) {
          console.log(`  ${file}`)
        }

        if (!suppressLogs) {
          log.step('Step 1: Stage Changes')
        }

        let stageChoice: 'all' | 'skip' | 'without' | 'cancel'
        if (opts?.stageAll) {
          stageChoice = 'all'
          if (!suppressLogs) {
            log.info('Auto-staging all changes (from CLI flag)')
          }
        } else {
          stageChoice = (await select('What to stage?', [
            { label: 'Stage all changes', value: 'all' },
            { label: 'Already staged', value: 'skip' },
            { label: 'Continue without staging', value: 'without' },
            { label: 'Cancel', value: 'cancel' },
          ])) as 'all' | 'skip' | 'without' | 'cancel'
        }

        switch (stageChoice) {
          case 'all': {
            exec('git add -A')
            log.success('All changes staged')
            break
          }
          case 'without': {
            log.info('Continuing without staging')
            break
          }
          case 'cancel': {
            log.warn('Cancelled.')
            process.exit(0)
          }
          // 'skip' intentionally falls through to stagedFiles check below
        }

        const stagedFiles = getStagedFiles()
        // If the user explicitly chose to continue without staging, don't treat
        // an empty staged set as a fatal error here — allow the workflow to
        // continue and re-check staging status right before committing.
        if (stagedFiles.length === 0 && stageChoice !== 'without') {
          log.error('No staged files!')
          process.exit(0)
        }

        // Only mark staging as completed when there are actually staged files.
        if (stagedFiles.length > 0) {
          state.step = STEP.STAGED
          saveState(state)
          console.log('\nStaged files:')
          for (const file of stagedFiles) {
            console.log(`  + ${file}`)
          }
        }
      }
    } else {
      const stagedFiles = getStagedFiles()
      if (suppressStagingDoneMessage) {
        if (!suppressLogs) {
          log.info('Staging previously completed')
        }
      } else {
        log.success(`Staging already done (${stagedFiles.length} files)`)
      }
    }

    // STEP 2: Create branch
    if (state.step < STEP.BRANCH_CREATED) {
      const suppressConfirm = !!opts?.startAt && opts.startAt !== 'stage'
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

    // STEP 3: Commit
    if (state.step < STEP.COMMITTED) {
      // Refresh staged files from git in real-time. The staging step is
      // optional and only helps the user; commits must always verify the
      // current staged files from git so external changes are respected.
      const liveStaged = getStagedFiles()

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

    // STEP 4: Push — ask user before pushing in interactive mode
    if (opts?.startAt) {
      // Non-interactive: only push automatically if starting at push
      if (opts.startAt === 'push') {
        await handlePush(state, { suppressStep: true, suppressLogs })
      } else if (opts.startAt === 'merge') {
        // intentionally skip push prompt here; merge step will validate push status
      } else {
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
          log.info(`Pushing ${getCurrentBranch()} to: ${remoteUrl}`)
        } else {
          log.info(`Pushing ${getCurrentBranch()} to remote`)
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

    // STEP 6: Cleanup (simplified)
    handleCleanup(featureBranch, state)

    console.log(`\n✅ Git flow complete!\n`)
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
    throw new Error('Application error')
  }
}
