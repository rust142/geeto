/** Helper functions extracted from main.ts to reduce function size. */

import type { CopilotModel } from '../api/copilot.js'
import type { GeminiModel } from '../api/gemini.js'
import type { OpenRouterModel } from '../api/openrouter.js'
import type { GeetoState } from '../types/index.js'

import { handleAIProviderSelection } from './ai-provider.js'
import { confirm } from '../cli/input.js'
import { multiSelect, select } from '../cli/menu.js'
import { STEP, TASK_PLATFORMS } from '../core/constants.js'
import { colors } from '../utils/colors.js'
import {
  DEFAULT_GEMINI_MODEL,
  hasSkippedTrelloPrompt,
  hasTrelloConfig,
  setSkipTrelloPrompt,
} from '../utils/config.js'
import {
  buildFileSelectOptions,
  displayChangedFiles,
  displayCurrentProviderStatus,
  displayStagedFiles,
  getStepName,
  getStepProgress,
} from '../utils/display.js'
import { exec } from '../utils/exec.js'
import {
  getChangedFiles,
  getChangedFilesWithStatus,
  getCurrentBranch,
  getStagedFiles,
} from '../utils/git.js'
import { log } from '../utils/logging.js'
import { loadState, preserveProviderState, saveState } from '../utils/state.js'
import { formatTimestampLocale } from '../utils/time.js'

// --- Types ---

export type MainOpts = {
  startAt?: 'commit' | 'merge' | 'branch' | 'stage' | 'push'
  fresh?: boolean
  resume?: boolean
  stageAll?: boolean
}

export interface CheckpointResult {
  aiProvider: 'gemini' | 'copilot' | 'openrouter' | 'manual'
  copilotModel?: CopilotModel
  openrouterModel?: OpenRouterModel
  geminiModel?: GeminiModel
  shouldResume: boolean
  suppressStagingDoneMessage: boolean
  savedState: GeetoState | null
}

// --- Functions ---

/**
 * Load saved checkpoint and resolve AI provider configuration.
 * Handles resume/fresh/cancel choices and AI provider selection.
 */
export async function resolveCheckpointAndProvider(
  opts: MainOpts | undefined,
  suppressLogs: boolean
): Promise<CheckpointResult> {
  const savedState = loadState()
  let aiProvider: CheckpointResult['aiProvider']
  let copilotModel: CopilotModel | undefined
  let openrouterModel: OpenRouterModel | undefined
  let geminiModel: GeminiModel | undefined
  let shouldResume = false
  let suppressStagingDoneMessage = false

  if (savedState) {
    if (!suppressLogs) {
      const formattedTimestamp = formatTimestampLocale(savedState.timestamp)
      log.warn(`Found saved checkpoint from: ${formattedTimestamp}`)
      const stepName = getStepName(savedState.step)
      if (stepName !== 'Unknown') {
        log.info(`Last step: ${stepName}`)
      }
    }

    const actualCurrentBranch = getCurrentBranch()
    const displayedWorking =
      actualCurrentBranch || savedState.workingBranch || savedState.currentBranch || 'unknown'
    log.info(`Working branch: ${colors.cyan}${displayedWorking}${colors.reset}`)

    let resumeChoice: string
    if (opts?.fresh) {
      resumeChoice = 'fresh'
    } else if (opts?.resume === true || opts?.startAt) {
      resumeChoice = 'resume'
    } else {
      await new Promise((resolve) => setTimeout(resolve, 80))

      const isFinished = savedState.step >= STEP.CLEANUP
      if (isFinished) {
        log.info('Checkpoint already complete — starting fresh...')
        resumeChoice = 'fresh'
      } else {
        const choices = [
          { label: 'Resume from checkpoint', value: 'resume' },
          { label: 'Start fresh (discard checkpoint)', value: 'fresh' },
          { label: 'Cancel', value: 'cancel' },
        ]
        resumeChoice = await select('What would you like to do?', choices)
      }
    }

    switch (opts?.startAt) {
      case 'commit': {
        savedState.step = Math.max(savedState.step, STEP.BRANCH_CREATED)
        if (!suppressLogs) log.info('Auto-start: commit')
        break
      }
      case 'merge': {
        savedState.step = Math.max(savedState.step, STEP.PUSHED)
        if (!suppressLogs) log.info('Auto-start: merge')
        break
      }
      case 'branch': {
        savedState.step = Math.max(savedState.step, STEP.STAGED)
        if (!suppressLogs) log.info('Auto-start: branch')
        break
      }
      case 'stage': {
        savedState.step = Math.max(savedState.step, STEP.INIT)
        if (!suppressLogs) log.info('Auto-start: stage')
        break
      }
      case 'push': {
        savedState.step = Math.max(savedState.step, STEP.COMMITTED)
        if (!suppressLogs) log.info('Auto-start: push')
        break
      }
    }

    if (resumeChoice === 'resume') {
      shouldResume = true
      suppressStagingDoneMessage = savedState.step >= STEP.STAGED

      if (savedState.aiProvider) {
        aiProvider = savedState.aiProvider
        copilotModel = savedState.copilotModel
        openrouterModel = savedState.openrouterModel
        geminiModel = savedState.geminiModel
      } else {
        const aiSelection = await handleAIProviderSelection()
        aiProvider = aiSelection.aiProvider
        copilotModel = aiSelection.copilotModel
        openrouterModel = aiSelection.openrouterModel
        geminiModel = aiSelection.geminiModel
      }

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
        const resumeStepName = getStepName(savedState.step)
        if (resumeStepName !== 'Unknown') {
          console.log(
            `${colors.cyan}│${colors.reset} Resuming from: ${colors.cyan}${resumeStepName}${colors.reset}`
          )
        }
        console.log(
          `${colors.cyan}└─────────────────────────────────────────────────────────┘${colors.reset}`
        )
      }

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
              aiProvider = 'gemini'
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

      if (savedState.aiProvider) {
        aiProvider = savedState.aiProvider
        copilotModel = savedState.copilotModel
        openrouterModel = savedState.openrouterModel
        geminiModel = savedState.geminiModel
      } else {
        const aiSelection = await handleAIProviderSelection()
        aiProvider = aiSelection.aiProvider
        copilotModel = aiSelection.copilotModel
        openrouterModel = aiSelection.openrouterModel
        geminiModel = aiSelection.geminiModel
      }

      displayCurrentProviderStatus()
    } else {
      process.exit(0)
    }
  } else {
    const aiSelection = await handleAIProviderSelection()
    aiProvider = aiSelection.aiProvider
    copilotModel = aiSelection.copilotModel
    openrouterModel = aiSelection.openrouterModel
    geminiModel = aiSelection.geminiModel
    displayCurrentProviderStatus()
  }

  return {
    aiProvider,
    copilotModel,
    openrouterModel,
    geminiModel,
    shouldResume,
    suppressStagingDoneMessage,
    savedState,
  }
}

/**
 * Prompt for task management platform integration (Trello).
 */
export async function setupTaskPlatform(opts: MainOpts | undefined): Promise<void> {
  let selectedPlatform: 'trello' | 'none' = 'none'

  if (hasTrelloConfig()) {
    selectedPlatform = 'trello'
    if (!opts?.startAt) {
      log.success('Trello platform configured')
    }
  } else {
    if (hasSkippedTrelloPrompt()) {
      log.info('Trello integration not configured (previously skipped).')
    } else {
      const wantTaskIntegration = confirm('Integrate with task management platform?')

      if (wantTaskIntegration) {
        const enabledPlatforms = TASK_PLATFORMS.filter((p) => p.enabled)

        if (enabledPlatforms.length > 0) {
          const platformOptions = [
            ...enabledPlatforms.map((p) => ({ label: p.name, value: p.value })),
            { label: 'Skip integration', value: 'none' },
          ]

          selectedPlatform = (await select('Select task management platform:', platformOptions)) as
            | 'trello'
            | 'none'
        }

        if (selectedPlatform === 'trello' && !hasTrelloConfig()) {
          const trelloSpinner = log.spinner()
          trelloSpinner.start('Setting up Trello...')
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
        setSkipTrelloPrompt()
      }
    }
  }
}

/**
 * Handle file staging step: show changed files, let user stage them.
 */
export async function handleStagingStep(
  state: GeetoState,
  opts: MainOpts | undefined,
  suppressLogs: boolean,
  suppressStagingDoneMessage: boolean
): Promise<void> {
  if (state.step < STEP.STAGED) {
    const changedFiles = getChangedFiles()
    const changedWithStatus = getChangedFilesWithStatus()

    console.log('')
    log.info(`Branch: ${colors.cyan}${state.currentBranch}${colors.reset}`)

    if (changedFiles.length === 0) {
      log.info(`Changed files: ${colors.gray}none${colors.reset}`)
      if (!opts?.stageAll) {
        log.info('No changes detected, continuing...')
      }
    } else {
      log.info(`Changed files: ${colors.bright}${changedFiles.length}${colors.reset}`)
      console.log('')
      displayChangedFiles(changedWithStatus)

      if (!suppressLogs) {
        log.step(`Step 1: Stage Changes  ${getStepProgress(1)}`)
      }

      let stageChoice: 'all' | 'select' | 'skip' | 'cancel'
      if (opts?.stageAll) {
        stageChoice = 'all'
        if (!suppressLogs) {
          log.info('Auto-staging all changes (from CLI flag)')
        }
      } else {
        stageChoice = (await select('What to stage?', [
          { label: 'Stage all changes', value: 'all' },
          { label: 'Select files to stage', value: 'select' },
          { label: 'Already staged', value: 'skip' },
          { label: 'Cancel', value: 'cancel' },
        ])) as 'all' | 'select' | 'skip' | 'cancel'
      }

      switch (stageChoice) {
        case 'all': {
          exec('git add -A')
          log.success('All changes staged')
          break
        }
        case 'select': {
          const fileOptions = buildFileSelectOptions(changedWithStatus)
          const selectedFiles = await multiSelect('Select files to stage:', fileOptions)
          if (selectedFiles.length > 0) {
            for (const file of selectedFiles) {
              exec(`git add "${file}"`, true)
            }
            log.success(`Staged ${selectedFiles.length} files`)
          } else {
            log.info('No files selected')
          }
          break
        }
        case 'cancel': {
          log.warn('Cancelled.')
          process.exit(0)
        }
        // 'skip' intentionally falls through to stagedFiles check below
      }

      const stagedFiles = getStagedFiles()
      if (stagedFiles.length === 0) {
        log.error('No staged files!')
        process.exit(0)
      }

      if (stagedFiles.length > 0) {
        state.step = STEP.STAGED
        saveState(state)
        console.log('')
        log.success(`Staged ${colors.bright}${stagedFiles.length}${colors.reset} files`)
        displayStagedFiles(stagedFiles)
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
}
