/**
 * Branch creation workflow - handles AI-powered branch naming
 */

import type { CopilotModel } from '../api/copilot.js'
import type { GeminiModel } from '../api/gemini.js'
import type { OpenRouterModel } from '../api/openrouter.js'
import type { GeetoState } from '../types/index.js'

import { handleTrelloCase } from './branch-helpers.js'
import { createBranch, promptManualBranch } from './branch-utils.js'
import { askQuestion, confirm } from '../cli/input.js'
import { select } from '../cli/menu.js'
import { STEP } from '../core/constants.js'
import {
  DEFAULT_GEMINI_MODEL,
  getBranchStrategyConfig,
  saveBranchStrategyConfig,
} from '../utils/config.js'
import { exec, execGit } from '../utils/exec.js'
import {
  getBranchPrefix,
  handleBranchNaming,
  interactiveAIFallback,
  isContextLimitFailure,
} from '../utils/git.js'
import { log } from '../utils/logging.js'
import { saveState } from '../utils/state.js'

export const handleBranchCreationWorkflow = async (
  state: GeetoState,
  opts?: { suppressStep?: boolean; suppressConfirm?: boolean }
): Promise<{ branchName: string; created: boolean }> => {
  if (!opts?.suppressStep) {
    log.step('Step 2: Create Branch')
  }

  const defaultPrefix = getBranchPrefix(state.currentBranch)

  let createNewBranch: boolean
  if (opts?.suppressConfirm) {
    createNewBranch = true
  } else {
    console.log('')
    createNewBranch = confirm('Create new branch?')
  }

  // Initialize variables that need to be accessible throughout the function
  let branchConfig = getBranchStrategyConfig()
  let separator: '-' | '_' = branchConfig?.separator ?? '-'
  let selectedNamingStrategy: 'title-full' | 'title-ai' | 'ai' | 'manual' = 'ai'
  const selectedTrelloList = ''
  let workingBranch = ''
  let wasCreated = false

  if (createNewBranch) {
    // Check if separator is configured, if not, prompt user to choose
    if (!branchConfig?.separator) {
      log.info('Please choose your preferred branch name separator:\n')

      // Offer an automatic detection option based on existing branch history.
      let preDetectedSeparator: '-' | '_' | undefined
      try {
        // Gather branch names from refs
        const localAndRemote = exec(
          'git for-each-ref --format="%(refname:short)" refs/heads refs/remotes',
          true
        )
        const merged = exec(
          'git for-each-ref --format="%(refname:short)" --merged HEAD refs/heads refs/remotes',
          true
        )
        const combined = `${localAndRemote}\n${merged}`
        const branches = [
          ...new Set(
            combined
              .split(/\r?\n/)
              .map((b) => b.trim())
              .filter(Boolean)
          ),
        ]
        // Detect separator by scanning existing branch names
        let hyphenCount = 0
        let underscoreCount = 0
        let hyphenBranchCount = 0
        let underscoreBranchCount = 0
        for (const b of branches) {
          const short = b.split('/').pop() ?? b
          const hasHyphen = /-/.test(short)
          const hasUnderscore = /_/.test(short)
          if (hasHyphen) {
            hyphenBranchCount++
          }
          if (hasUnderscore) {
            underscoreBranchCount++
          }
          hyphenCount += (short.match(/-/g) ?? []).length
          underscoreCount += (short.match(/_/g) ?? []).length
        }

        if (hyphenBranchCount > underscoreBranchCount) {
          preDetectedSeparator = '-'
        } else if (underscoreBranchCount > hyphenBranchCount) {
          preDetectedSeparator = '_'
        } else if (hyphenCount > underscoreCount) {
          preDetectedSeparator = '-'
        } else if (underscoreCount > hyphenCount) {
          preDetectedSeparator = '_'
        }
      } catch {
        // ignore detection errors and fall back to prompt
      }

      const baseOptions = [
        { label: 'Kebab-case (hyphen): my-branch-name', value: 'kebab' },
        { label: 'Snake_case (underscore): my_branch_name', value: 'snake' },
      ]

      // Build separator options (detected first)
      let sepOptions: Array<{ label: string; value: string }> = []

      if (preDetectedSeparator) {
        const label = preDetectedSeparator === '-' ? 'Kebab-case (-)' : 'Snake_case (_)'
        sepOptions.push({ label: `Use detected: ${label}`, value: 'detected' })
      }

      sepOptions = [...sepOptions, ...baseOptions]

      // Ask user to choose: use detected (if available) or manual options
      const separatorChoice = await select('Choose branch name separator:', sepOptions)
      if (separatorChoice === 'detected' && preDetectedSeparator) {
        separator = preDetectedSeparator
      } else {
        separator = separatorChoice === 'kebab' ? '-' : '_'
      }

      // Save the separator choice
      saveBranchStrategyConfig({
        separator,
      })

      log.success(
        `Branch separator set to: ${separator === '-' ? 'kebab-case (-)' : 'snake_case (_)'}`
      )
    }

    // Reload config after potential save
    branchConfig = getBranchStrategyConfig()

    // Outer loop for entire branch creation flow (allows going back from any step)
    let branchFlowComplete = false
    let branchMenuShown = false // Track if branch naming menu has been shown

    while (!branchFlowComplete) {
      // Branch naming menu (separator already selected above)
      if (!branchMenuShown) {
        while (!branchMenuShown) {
          // Now show branch naming strategy menu
          const branchChoice = await select('Branch naming:', [
            { label: 'Link to Trello Card', value: 'trello' },
            { label: 'Generate with AI', value: 'ai' },
            { label: 'Enter custom name', value: 'custom' },
            { label: 'Cancel', value: 'cancel' },
          ])

          if (branchChoice === 'cancel') {
            log.warn('Branch creation cancelled.')
            process.exit(0)
          }

          branchMenuShown = true

          switch (branchChoice) {
            case 'trello': {
              const trelloResult = await handleTrelloCase(
                state,
                branchConfig,
                separator,
                defaultPrefix
              )
              if (trelloResult.branchFlowComplete && trelloResult.workingBranch) {
                selectedNamingStrategy =
                  trelloResult.selectedNamingStrategy ?? selectedNamingStrategy
                workingBranch = trelloResult.workingBranch
                state.workingBranch = workingBranch
                state.currentBranch = workingBranch
                wasCreated = true
                state.step = STEP.BRANCH_CREATED
                saveState(state)
                branchFlowComplete = true
              } else {
                branchMenuShown = trelloResult.branchMenuShown
                continue
              }

              break
            }
            case 'ai': {
              // Use AI branch naming
              let selectedModel: CopilotModel | OpenRouterModel | GeminiModel | undefined
              let providerToUse: 'gemini' | 'copilot' | 'openrouter'
              // If user previously chose manual, ask which AI provider to use now
              if (!state.aiProvider || state.aiProvider === 'manual') {
                const prov = await select('Choose AI provider for branch generation:', [
                  { label: 'Gemini', value: 'gemini' },
                  { label: 'GitHub Copilot (Recommended)', value: 'copilot' },
                  { label: 'OpenRouter', value: 'openrouter' },
                  { label: 'Back to suggested branch selection', value: 'cancel-prov' },
                ])

                if (prov === 'cancel-prov') {
                  branchMenuShown = false
                  continue
                }

                providerToUse = prov as 'gemini' | 'copilot' | 'openrouter'

                // Ensure provider is ready (skip check for manual since user chose an AI provider)
                const { ensureAIProvider } = await import('../core/setup.js')
                const ready = await ensureAIProvider(providerToUse)
                if (!ready) {
                  branchMenuShown = false
                  continue
                }

                state.aiProvider = providerToUse
                saveState(state)
              } else {
                providerToUse = state.aiProvider as 'gemini' | 'copilot' | 'openrouter'
              }
              // Ensure state reflects the provider we'll use for generation
              state.aiProvider = providerToUse
              saveState(state)
              switch (providerToUse) {
                case 'copilot': {
                  selectedModel = state.copilotModel
                  break
                }
                case 'openrouter': {
                  selectedModel = state.openrouterModel
                  break
                }
                case 'gemini': {
                  selectedModel = state.geminiModel
                  break
                }
                // No default
              }

              let correction = ''

              const namingResult = await handleBranchNaming(
                defaultPrefix,
                separator,
                '', // trelloCardId
                state.currentBranch,
                providerToUse,
                selectedModel,
                (provider: 'gemini' | 'copilot' | 'openrouter', model?: string) => {
                  state.aiProvider = provider
                  switch (provider) {
                    case 'copilot': {
                      state.copilotModel = model as CopilotModel
                      break
                    }
                    case 'openrouter': {
                      state.openrouterModel = model as OpenRouterModel
                      break
                    }
                    case 'gemini': {
                      state.geminiModel = model as GeminiModel
                      break
                    }
                    // No default
                  }
                  saveState(state)
                }
              )

              if (namingResult.cancelled) {
                log.warn('Branch creation cancelled.')
                process.exit(0)
              }

              if (namingResult.shouldRestart) {
                branchMenuShown = false
                continue
              } else if (namingResult.workingBranch) {
                workingBranch = namingResult.workingBranch
                selectedNamingStrategy = 'ai'
                state.workingBranch = workingBranch
                state.currentBranch = workingBranch
                wasCreated = true
                state.step = STEP.BRANCH_CREATED
                saveState(state)
                branchFlowComplete = true
              } else {
                // AI failed — try interactive fallback first, then manual
                log.warn('AI generation failed. Trying interactive fallback...')

                const diff = execGit('git diff --cached', true)
                if (!diff?.trim()) {
                  log.warn(
                    'No staged changes found. Cannot generate a branch name from empty diff. Aborting.'
                  )
                  process.exit(0)
                }

                const aiSuffix = await interactiveAIFallback(
                  null,
                  providerToUse,
                  selectedModel ?? state.geminiModel ?? DEFAULT_GEMINI_MODEL,
                  diff,
                  correction,
                  state.currentBranch,
                  (provider: 'gemini' | 'copilot' | 'openrouter', model?: string) => {
                    state.aiProvider = provider
                    switch (provider) {
                      case 'copilot': {
                        state.copilotModel = model as CopilotModel
                        break
                      }
                      case 'openrouter': {
                        state.openrouterModel = model as OpenRouterModel
                        break
                      }
                      case 'gemini': {
                        state.geminiModel = model as GeminiModel
                        break
                      }
                      // No default
                    }
                    saveState(state)
                  }
                )

                if (aiSuffix) {
                  // If the AI returned a context/token-limit failure message, don't use it as a branch name.
                  if (isContextLimitFailure(aiSuffix)) {
                    log.error(
                      'Selected model cannot handle this input due to token/context limits. Please choose a different model or provider.'
                    )
                    // Reset menu so user can pick a different provider/model or manual input
                    branchMenuShown = false
                    continue
                  }
                  const tmp = aiSuffix
                    .replaceAll(/[^A-Za-z0-9]+/g, separator)
                    .replaceAll(/[-_]+/g, separator)
                    .toLowerCase()

                  let cleanSuffix = tmp
                  while (cleanSuffix.startsWith(separator)) {
                    cleanSuffix = cleanSuffix.slice(separator.length)
                  }
                  while (cleanSuffix.endsWith(separator)) {
                    cleanSuffix = cleanSuffix.slice(0, -separator.length)
                  }

                  workingBranch = `${defaultPrefix}${cleanSuffix}`

                  // Create the branch
                  if (createBranch(workingBranch, state.currentBranch)) {
                    selectedNamingStrategy = 'ai'
                    state.workingBranch = workingBranch
                    state.currentBranch = workingBranch
                    wasCreated = true
                    state.step = STEP.BRANCH_CREATED
                    saveState(state)
                    branchFlowComplete = true
                  } else {
                    // If creation failed because branch exists, offer explicit actions
                    const { select: dynamicSelect } = await import('../cli/menu.js')
                    const choice = await dynamicSelect(
                      `Branch '${workingBranch}' already exists. What would you like to do?`,
                      [
                        { label: 'Regenerate branch name', value: 'regenerate' },
                        { label: 'Change model', value: 'change-model' },
                        { label: 'Change AI provider', value: 'change-provider' },
                        { label: 'Edit branch name manually', value: 'edit' },
                        { label: 'Back to branch menu', value: 'back' },
                      ]
                    )

                    switch (choice) {
                      case 'regenerate': {
                        correction = ''
                        branchMenuShown = false
                        continue
                      }
                      case 'change-model': {
                        const currentProv = state.aiProvider ?? 'gemini'
                        if (currentProv === 'copilot') {
                          const cop = await import('../api/copilot.js')
                          const models = await cop.getCopilotModels()
                          const copOptions = models.some((m) => m.value === 'back')
                            ? models
                            : [
                                ...models,
                                { label: 'Back to suggested branch selection', value: 'back' },
                              ]
                          const chosen = await select('Choose Copilot model:', copOptions)
                          if (chosen === 'back') {
                            continue
                          }
                          state.copilotModel = chosen as unknown as CopilotModel
                        } else if (currentProv === 'openrouter') {
                          const or = await import('../api/openrouter.js')
                          const models = await or.getOpenRouterModels()
                          const orOptions = models.some((m) => m.value === 'back')
                            ? models
                            : [
                                ...models,
                                { label: 'Back to suggested branch selection', value: 'back' },
                              ]
                          const chosen = await select('Choose OpenRouter model:', orOptions)
                          if (chosen === 'back') {
                            continue
                          }
                          state.openrouterModel = chosen as unknown as OpenRouterModel
                        } else {
                          const gm = await import('../api/gemini.js')
                          const models = await gm.getGeminiModels()
                          const gmOptions = models.some((m) => m.value === 'back')
                            ? models
                            : [
                                ...models,
                                { label: 'Back to suggested branch selection', value: 'back' },
                              ]
                          const chosen = await select('Choose Gemini model:', gmOptions)
                          if (chosen === 'back') {
                            continue
                          }
                          state.geminiModel = chosen as unknown as GeminiModel
                        }
                        saveState(state)
                        branchMenuShown = false
                        continue
                      }
                      case 'change-provider': {
                        const prov = await select('Choose AI provider:', [
                          { label: 'Gemini', value: 'gemini' },
                          { label: 'GitHub Copilot (Recommended)', value: 'copilot' },
                          { label: 'OpenRouter', value: 'openrouter' },
                          { label: 'Back to suggested branch selection', value: 'cancel-prov' },
                        ])
                        if (prov === 'cancel-prov') {
                          // Return to branch menu without forcing regeneration
                          branchMenuShown = false
                          continue
                        }

                        // Use centralized helper to choose model for the provider
                        const { chooseModelForProvider } = await import('../utils/git-ai.js')
                        const chosen = await chooseModelForProvider(
                          prov as 'gemini' | 'copilot' | 'openrouter',
                          'Choose model:',
                          'Back to suggested branch selection'
                        )

                        if (!chosen) {
                          // setup failed or cancelled
                          continue
                        }
                        if (chosen === 'back') {
                          continue
                        }

                        state.aiProvider = prov as 'gemini' | 'copilot' | 'openrouter'
                        switch (prov) {
                          case 'copilot': {
                            state.copilotModel = chosen as unknown as CopilotModel
                            state.openrouterModel = undefined
                            state.geminiModel = undefined
                            break
                          }
                          case 'openrouter': {
                            state.openrouterModel = chosen as unknown as OpenRouterModel
                            state.copilotModel = undefined
                            state.geminiModel = undefined
                            break
                          }
                          case 'gemini': {
                            state.geminiModel = chosen as unknown as GeminiModel
                            state.copilotModel = undefined
                            state.openrouterModel = undefined
                            break
                          }
                          default: {
                            state.geminiModel = chosen as unknown as GeminiModel
                            state.copilotModel = undefined
                            state.openrouterModel = undefined
                            break
                          }
                        }

                        saveState(state)
                        branchMenuShown = false
                        continue
                      }
                      case 'edit': {
                        const edited = askQuestion('Enter new branch name:')
                        if (!edited) {
                          break
                        }
                        workingBranch = edited
                        if (createBranch(workingBranch, state.currentBranch)) {
                          selectedNamingStrategy = 'manual'
                          state.workingBranch = workingBranch
                          state.currentBranch = workingBranch
                          wasCreated = true
                          state.step = STEP.BRANCH_CREATED
                          saveState(state)
                          branchFlowComplete = true
                        }
                        break
                      }
                      case 'back': {
                        branchMenuShown = false
                        continue
                      }
                    }
                  }
                } else {
                  // Fallback to manual input
                  workingBranch = promptManualBranch(state.currentBranch)
                  if (createBranch(workingBranch, state.currentBranch)) {
                    selectedNamingStrategy = 'manual'
                    state.workingBranch = workingBranch
                    wasCreated = true
                    state.step = STEP.BRANCH_CREATED
                    saveState(state)
                    branchFlowComplete = true
                  }
                }
              }
              break
            }
            case 'custom': {
              workingBranch = promptManualBranch(state.currentBranch)

              if (createBranch(workingBranch, state.currentBranch)) {
                selectedNamingStrategy = 'manual'
                state.workingBranch = workingBranch
                wasCreated = true
                state.step = STEP.BRANCH_CREATED
                saveState(state)
                branchFlowComplete = true
              } else {
                // If creation failed for some reason, return to branch menu
                branchMenuShown = false
                continue
              }

              break
            }
          }

          break // Exit separator loop
        }
      }
    }
  } else {
    // User chose not to create a new branch — ask what to do next
    const choice = await select(
      'You chose not to create a new branch. What would you like to do?',
      [
        { label: 'Step 3: Commit', value: 'commit' },
        { label: 'Step 5: Merge to Target Branch', value: 'merge' },
        { label: 'Cancel', value: 'cancel' },
      ]
    )

    if (choice === 'cancel') {
      log.warn('Cancelled.')
      process.exit(0)
    }

    if (choice === 'merge') {
      // Skip commit and push steps; proceed straight to merge
      state.step = STEP.PUSHED
      state.skippedCommit = true
      state.skippedPush = true
      saveState(state)
      log.info('Skipping commit and push; will proceed directly to merge')
    } else {
      // User chose to proceed to commit on the current branch — mark branch step as complete
      state.step = STEP.BRANCH_CREATED
      // Ensure workingBranch reflects current branch
      state.workingBranch = state.currentBranch
      saveState(state)
      log.info('Proceeding to commit on current branch')
    }

    workingBranch = state.currentBranch
    log.info(`Using current branch: ${workingBranch}`)
  }

  // Only mark branch creation step complete if a branch was actually created
  if (workingBranch && wasCreated && state.step < STEP.BRANCH_CREATED) {
    state.step = STEP.BRANCH_CREATED
    state.currentBranch = workingBranch
  }

  saveState(state)

  // Save branch strategy config
  saveBranchStrategyConfig({
    separator: separator ?? branchConfig?.separator ?? '-',
    lastNamingStrategy: selectedNamingStrategy,
    lastTrelloList: selectedTrelloList ?? branchConfig?.lastTrelloList,
  })

  return { branchName: workingBranch ?? state.currentBranch, created: !!wasCreated }
}
