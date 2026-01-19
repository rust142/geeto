/**
 * Main workflow - orchestrates the entire Geeto workflow
 */

import type { FreeModel, GeetoState } from '../types'

import { handleAIProviderSelection } from './ai-provider'
import { handleBranchCreationWorkflow } from './branch'
import { handleCommitWorkflow } from './commit'
import { showSettingsMenu } from './settings'

import { confirm, ProgressBar, select } from '../cli'
import { STEP, TASK_PLATFORMS } from '../core/constants'
import {
  clearState,
  exec,
  getChangedFiles,
  getCurrentBranch,
  getStagedFiles,
  loadState,
  log,
  saveState,
} from '../utils'
import { hasTrelloConfig } from '../utils/config'

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

export const main = async (): Promise<void> => {
  try {
    log.banner()

    // Settings menu
    const initialChoice = await select('Welcome to Geeto! What would you like to do?', [
      { label: 'Start new workflow', value: 'start' },
      { label: 'Settings', value: 'settings' },
      { label: 'Exit', value: 'exit' },
    ])

    if (initialChoice === 'exit') {
      log.info('Goodbye!')
      throw new Error('User exited')
    }

    if (initialChoice === 'settings') {
      await showSettingsMenu()
      // After settings, go back to main menu
      return main()
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
    let aiProvider: 'gemini' | 'copilot' | 'openrouter'
    let copilotModel: 'claude-haiku-4.5' | 'gpt-5' | undefined
    let openrouterModel: FreeModel | undefined
    let shouldResume = false

    if (savedState) {
      log.warn(`Found saved checkpoint from: ${savedState.timestamp}`)
      log.info(`Last step: ${getStepName(savedState.step)}`)
      log.info(`Working branch: ${savedState.workingBranch}`)

      const resumeChoice = await select('What would you like to do?', [
        { label: 'Resume from checkpoint', value: 'resume' },
        { label: 'Start fresh (discard checkpoint)', value: 'fresh' },
        { label: 'Cancel', value: 'cancel' },
      ])

      if (resumeChoice === 'resume') {
        shouldResume = true
        // Use saved AI provider and model
        aiProvider = savedState.aiProvider ?? 'gemini'
        copilotModel = savedState.copilotModel
        openrouterModel = savedState.openrouterModel
        log.info(`Resuming previous session with ${aiProvider} provider`)
        if (copilotModel) {
          log.info(`Copilot Model set to: ${copilotModel}`)
        }

        // Verify AI provider setup is still valid
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
      } else if (resumeChoice === 'fresh') {
        clearState()
        log.info('Starting fresh...')

        // Choose AI Provider
        const aiSelection = await handleAIProviderSelection()
        aiProvider = aiSelection.aiProvider
        copilotModel = aiSelection.copilotModel
        openrouterModel = aiSelection.openrouterModel
      } else {
        process.exit(0)
      }
    } else {
      // No saved state, choose AI provider fresh
      const aiSelection = await handleAIProviderSelection()
      aiProvider = aiSelection.aiProvider
      copilotModel = aiSelection.copilotModel
      openrouterModel = aiSelection.openrouterModel
    }

    let state: GeetoState = {
      step: STEP.INIT,
      workingBranch: '',
      targetBranch: '',
      currentBranch: getCurrentBranch(),
      stagedFiles: [],
      timestamp: new Date().toISOString(),
      aiProvider,
      copilotModel,
      openrouterModel,
    }

    if (shouldResume && savedState) {
      state = savedState
      log.info(`Resuming from step: ${getStepName(state.step)}`)
    }

    const currentBranch = savedState ? state.currentBranch : getCurrentBranch()
    if (!savedState) {
      state.currentBranch = currentBranch
    }

    // Use currentBranch as fallback if workingBranch is empty
    let workingBranch = savedState ? (state.workingBranch ?? state.currentBranch) : currentBranch

    // Ask about task management platform integration
    let selectedPlatform: 'trello' | 'none' = 'none'

    // Auto-detect configured platforms
    if (hasTrelloConfig()) {
      selectedPlatform = 'trello'
      log.success('Trello platform configured ✓')
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

          selectedPlatform = (await select('Select task management platform:', platformOptions)) as
            | 'trello'
            | 'none'
        }

        // Setup selected platform if needed
        if (selectedPlatform === 'trello' && !hasTrelloConfig()) {
          log.info('Setting up Trello integration...')
          const { setupTrelloConfigInteractive } = await import('../core/trello-setup')
          setupTrelloConfigInteractive()
          log.success('Trello integration configured!')
        }
        // Future: Add setup for other platforms here
      }
    }

    // STEP 1: Stage changes
    if (state.step < STEP.STAGED) {
      const changedFiles = getChangedFiles()

      log.info(`Current branch: ${state.currentBranch}`)
      log.info(`Changed files: ${changedFiles.length}`)

      if (changedFiles.length === 0) {
        log.warn('No changes detected!')
        process.exit(0)
      }

      console.log('\nChanged files:')
      for (const file of changedFiles) {
        console.log(`  ${file}`)
      }

      log.step('Step 1: Stage Changes')

      const stageChoice = await select('What to stage?', [
        { label: 'Stage all changes', value: 'all' },
        { label: 'Stage tracked files only', value: 'tracked' },
        { label: 'Already staged', value: 'skip' },
        { label: 'Cancel', value: 'cancel' },
      ])

      switch (stageChoice) {
        case 'all': {
          exec('git add -A')
          log.success('All changes staged')

          break
        }
        case 'tracked': {
          exec('git add -u')
          log.success('Tracked files staged')

          break
        }
        case 'cancel': {
          log.warn('Cancelled.')
          process.exit(0)

          break
        }
        // No default
      }

      const stagedFiles = getStagedFiles()
      if (stagedFiles.length === 0) {
        log.error('No staged files!')
        process.exit(0)
      }

      state.stagedFiles = stagedFiles
      state.step = STEP.STAGED
      saveState(state)

      console.log('\nStaged files:')
      for (const file of stagedFiles) {
        console.log(`  + ${file}`)
      }
    } else {
      log.info(`✓ Staging already done (${state.stagedFiles.length} files)`)
    }

    // STEP 2: Create branch
    if (state.step < STEP.BRANCH_CREATED) {
      const branchName = await handleBranchCreationWorkflow(state)
      state.workingBranch = branchName
      state.step = STEP.BRANCH_CREATED
      saveState(state)
    } else {
      workingBranch = state.workingBranch ?? state.currentBranch ?? currentBranch
      if (!state.workingBranch) {
        state.workingBranch = workingBranch
        saveState(state)
      }
      log.info(`✓ Branch already created: ${workingBranch}`)
    }

    // STEP 3: Commit
    if (state.step < STEP.COMMITTED) {
      await handleCommitWorkflow(state)
      state.step = STEP.COMMITTED
      saveState(state)
    } else {
      log.info('✓ Commit already done')
    }

    // STEP 4: Push
    if (state.step < STEP.PUSHED) {
      log.step('Step 4: Push to Remote')

      const shouldPush = confirm(`Push ${workingBranch} to origin?`)

      if (shouldPush) {
        const progressBar = new ProgressBar(3, 'Pushing to remote')
        progressBar.update(0)

        // Check if remote exists
        progressBar.update(1)
        exec('git remote get-url origin')

        // Push the branch
        progressBar.update(2)
        exec(`git push -u origin "${workingBranch}"`)

        progressBar.complete()
        log.success('Pushed to remote')
      }

      state.step = STEP.PUSHED
      saveState(state)
    } else {
      log.info(`✓ Push already done: ${state.workingBranch}`)
    }

    // STEP 5: Merge (simplified)
    if (state.step < STEP.MERGED) {
      const targetBranch = 'development'

      if (workingBranch === targetBranch) {
        log.info('✓ No new branch created, skipping merge step')
        state.step = STEP.MERGED
        saveState(state)
      } else {
        log.step('Step 5: Merge to Target Branch')

        const shouldMerge = confirm(`Merge ${workingBranch} into ${targetBranch}?`)

        if (shouldMerge) {
          exec(`git checkout ${targetBranch}`)
          exec(`git merge ${workingBranch}`)
          log.success(`Merged ${workingBranch} into ${targetBranch}`)
        }

        state.targetBranch = targetBranch
        state.step = STEP.MERGED
        saveState(state)
      }
    } else {
      log.info(`✓ Merge already done to: ${state.targetBranch}`)
    }

    // STEP 6: Cleanup (simplified)
    if (state.step < STEP.CLEANUP) {
      log.step('Step 6: Cleanup')

      if (
        workingBranch &&
        workingBranch !== state.targetBranch &&
        workingBranch !== state.currentBranch
      ) {
        const deleteAnswer = confirm(`Delete branch '${workingBranch}'?`)
        if (deleteAnswer) {
          exec(`git branch -d ${workingBranch}`)
          log.success(`Branch '${workingBranch}' deleted`)
          
          // Also delete remote branch if it exists
          try {
            exec(`git push origin --delete ${workingBranch}`, true)
            log.success(`Remote branch '${workingBranch}' deleted`)
          } catch {
            // Remote branch might not exist, ignore error
          }
        }
      }

      state.step = STEP.CLEANUP
      saveState(state)
    }

    clearState()
    console.log(`\n✅ Git flow complete!\n`)
    return undefined
  } catch (error) {
    if (error instanceof Error) {
      log.error(error.message)
    } else {
      log.error('Unknown error occurred')
    }
    throw new Error('Application error')
  }
}
