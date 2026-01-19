/**
 * Branch creation workflow - handles AI-powered branch naming
 */

import type { GeetoState } from '../types'

import {
  fetchTrelloCards,
  fetchTrelloLists,
  generateBranchNameFromTrelloTitle,
} from '../api/trello'
import { askQuestion, confirm, select } from '../cli'
import { STEP } from '../core/constants'
import { exec, log, saveState } from '../utils'
import { getBranchStrategyConfig, hasTrelloConfig, saveBranchStrategyConfig } from '../utils/config'
import { branchExists, getBranchPrefix, handleBranchNaming, validateBranchName } from '../utils/git'
import { generateBranchNameFromTitleWithProvider, getAIProviderDisplayName } from '../utils/git.js'

export const handleBranchCreationWorkflow = async (state: GeetoState): Promise<string> => {
  log.step('Step 2: Create Branch')

  const defaultPrefix = getBranchPrefix(state.currentBranch)

  const createNewBranch = confirm('Create new branch?')

  // Initialize variables that need to be accessible throughout the function
  let branchConfig = getBranchStrategyConfig()
  let separator: '-' | '_' = branchConfig?.separator ?? '-'
  let selectedNamingStrategy: 'title-full' | 'title-ai' | 'ai' | 'manual' = 'ai'
  const selectedTrelloList = ''
  let workingBranch = ''
  let trelloCardId = ''

  if (createNewBranch) {
    // Check if separator is configured, if not, prompt user to choose
    if (!branchConfig?.separator) {
      log.info('\nFirst time creating a branch in this project!')
      log.info('Please choose your preferred branch name separator:\n')

      const separatorChoice = await select('Choose branch name separator:', [
        { label: 'Kebab-case (hyphen): my-branch-name', value: 'kebab' },
        { label: 'Snake_case (underscore): my_branch_name', value: 'snake' },
      ])

      separator = separatorChoice === 'kebab' ? '-' : '_'

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
              // Check if Trello is configured
              if (!hasTrelloConfig()) {
                log.info('No Trello configuration found. Setting up Trello integration...')
                // Import and run trello setup
                const { setupTrelloConfigInteractive } = await import('../core/trello-setup')
                const setupSuccess = setupTrelloConfigInteractive()
                if (setupSuccess) {
                  log.success('Trello integration configured!')
                  // Now Trello is configured, continue with Trello logic
                } else {
                  log.warn('Trello setup failed or cancelled.')
                  branchMenuShown = false
                  continue
                }
              }

              log.info('🔍 Checking Trello for tasks...')

              // First, fetch and select list
              const trelloLists = await fetchTrelloLists()

              if (trelloLists.length === 0) {
                log.warn('No Trello lists found on board')
                continue
              }

              // Loop for list selection
              let listSelected = false

              while (!listSelected) {
                // Ask user to select a list first
                const lastUsedListId = branchConfig?.lastTrelloList

                const listOptions = [
                  ...trelloLists.map((list) => ({
                    label:
                      list.id === lastUsedListId ? `${list.name} ⭐ Last used` : `${list.name}`,
                    value: list.id,
                  })),
                  { label: 'All lists (no filter)', value: 'all' },
                  { label: 'Back to branch menu', value: 'back-menu' },
                ]

                const selectedListId = await select('Select Trello list:', listOptions)

                if (selectedListId === 'back-menu') {
                  // Go back to branch menu
                  branchMenuShown = false
                  listSelected = true
                  break
                }

                // Save the selected list preference
                if (selectedListId !== 'all') {
                  const currentStrategy = getBranchStrategyConfig()
                  saveBranchStrategyConfig({
                    separator,
                    lastNamingStrategy: currentStrategy?.lastNamingStrategy,
                    lastTrelloList: selectedListId,
                  })
                }

                const filterListId = selectedListId === 'all' ? undefined : selectedListId
                const trelloCards = await fetchTrelloCards(filterListId)

                if (trelloCards.length === 0) {
                  log.warn('No cards found in selected list')
                  // Loop back to list selection
                } else {
                  // Loop for card selection and naming strategy
                  let cardSelected = false

                  while (!cardSelected) {
                    const trelloOptions = [
                      ...trelloCards.slice(0, 15).map((card) => {
                        const branchPreview = generateBranchNameFromTrelloTitle(
                          card.name,
                          card.shortLink,
                          separator
                        )
                        return {
                          label: `${branchPreview}`,
                          value: JSON.stringify({ id: card.shortLink, title: card.name }),
                        }
                      }),
                      { label: 'Back to branch menu', value: 'back-menu' },
                    ]

                    const selectedCard = await select('Select Trello card:', trelloOptions)

                    if (selectedCard === 'back-menu') {
                      // Go back to branch menu
                      branchMenuShown = false
                      cardSelected = true
                      listSelected = true
                      break
                    }

                    if (selectedCard === 'skip') {
                      // Skip Trello entirely
                      cardSelected = true
                      listSelected = true
                      break
                    }

                    const cardData = JSON.parse(selectedCard) as { id: string; title: string }
                    trelloCardId = cardData.id
                    log.success(`Linked to Trello card ${trelloCardId}`)

                    // Loop for naming strategy
                    let namingSelected = false

                    while (!namingSelected) {
                      // Ask for naming strategy
                      const namingChoice = await select('Branch naming strategy:', [
                        {
                          label: 'Use Trello title (full)',
                          value: 'title-full',
                        },
                        {
                          label: 'Use Trello title (AI shortened)',
                          value: 'title-ai',
                        },
                        { label: 'Back to card selection', value: 'back' },
                      ])

                      if (namingChoice === 'back') {
                        // Go back to card selection
                        break
                      }

                      switch (namingChoice) {
                        case 'title-full': {
                          // Use full Trello title directly
                          const branchSuffix = generateBranchNameFromTrelloTitle(
                            cardData.title,
                            cardData.id,
                            separator
                          )
                          workingBranch = `${defaultPrefix}#${branchSuffix}`
                          log.success(`Branch name: ${workingBranch}`)

                          // Create the branch
                          if (workingBranch && workingBranch !== state.currentBranch) {
                            // Validate branch name
                            const validation = validateBranchName(workingBranch)
                            if (!validation.valid) {
                              log.error(`Invalid branch name: ${validation.reason}`)
                              branchMenuShown = false
                              continue
                            }

                            // Check if branch already exists
                            if (branchExists(workingBranch)) {
                              log.error(`Branch '${workingBranch}' already exists locally`)
                              branchMenuShown = false
                              continue
                            }

                            log.info(`Creating branch: ${workingBranch}`)
                            exec(`git checkout -b "${workingBranch}"`)
                            log.success(`Branch created: ${workingBranch}`)
                          }

                          selectedNamingStrategy = 'title-full'
                          state.workingBranch = workingBranch
                          state.step = STEP.BRANCH_CREATED
                          saveState(state)
                          branchFlowComplete = true
                          break
                        }
                        case 'title-ai': {
                          // Use AI to shorten Trello title
                          let correction = ''
                          let shouldContinue = true

                          while (shouldContinue) {
                            const aiProvider = state.aiProvider ?? 'gemini'
                            log.ai(
                              `Generating short branch name from Trello title using ${getAIProviderDisplayName(aiProvider)}...`
                            )
                            const aiSuffix = await generateBranchNameFromTitleWithProvider(
                              aiProvider,
                              cardData.title,
                              correction,
                              state.copilotModel,
                              state.openrouterModel
                            )

                            if (!aiSuffix) {
                              log.warn('AI generation failed, using manual input')
                              const customName = askQuestion('Enter branch name: ')
                              workingBranch = `${defaultPrefix}${trelloCardId}${separator}${customName}`
                              shouldContinue = false
                              break
                            }

                            const cleanSuffix = aiSuffix
                              .replaceAll(/[^\w-]/gi, separator)
                              .replace(separator === '-' ? /-+/g : /_+/g, separator)
                              .replace(separator === '-' ? /^-|-$/g : /^_|_$/g, '')
                              .toLowerCase()

                            workingBranch = `${defaultPrefix}${trelloCardId}${separator}${cleanSuffix}`
                            log.ai(`Suggested: ${workingBranch}`)

                            const acceptChoice = await select('Accept this branch name?', [
                              { label: 'Yes, use it', value: 'accept' },
                              { label: 'Regenerate', value: 'regenerate' },
                              { label: 'Correct AI (give feedback)', value: 'correct' },
                              { label: 'Edit manually', value: 'edit' },
                              { label: 'Back to card selection', value: 'back' },
                            ])

                            switch (acceptChoice) {
                              case 'accept': {
                                shouldContinue = false
                                break
                              }
                              case 'regenerate': {
                                correction = ''
                                break
                              }
                              case 'correct': {
                                correction = askQuestion('What should be different? ')
                                break
                              }
                              case 'edit': {
                                const edited = askQuestion(`Edit branch (${workingBranch}): `)
                                workingBranch = edited || workingBranch
                                shouldContinue = false
                                break
                              }
                              case 'back': {
                                // Reset and go back to card selection
                                workingBranch = ''
                                shouldContinue = false
                                namingSelected = false
                                break
                              }
                            }
                          }

                          // If user went back, don't create branch yet
                          if (workingBranch) {
                            // Create the branch
                            if (workingBranch !== state.currentBranch) {
                              log.info(`Creating branch: ${workingBranch}`)
                              exec(`git checkout -b "${workingBranch}"`)
                              log.success(`Branch created: ${workingBranch}`)
                            }

                            selectedNamingStrategy = 'title-ai'
                            state.workingBranch = workingBranch
                            state.step = STEP.BRANCH_CREATED
                            saveState(state)
                            branchFlowComplete = true
                          }
                          break
                        }
                      }

                      // Check if branch was created
                      if (workingBranch && state.step === STEP.BRANCH_CREATED) {
                        namingSelected = true
                        cardSelected = true
                        listSelected = true
                      }
                    }
                  }
                }
              }

              break
            }
            case 'ai': {
              // Use AI branch naming
              const namingResult = await handleBranchNaming(
                defaultPrefix,
                separator,
                '', // trelloCardId
                state.stagedFiles,
                state.currentBranch,
                state.aiProvider ?? 'gemini',
                state.aiProvider === 'copilot' ? state.copilotModel : undefined
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
                state.step = STEP.BRANCH_CREATED
                saveState(state)
                branchFlowComplete = true
              }
              break
            }
            case 'custom': {
              const customPrefix = getBranchPrefix(state.currentBranch)
              workingBranch = askQuestion('Enter branch name:', `${customPrefix}new-feature`)

              // Create the branch
              if (workingBranch && workingBranch !== state.currentBranch) {
                // Validate branch name
                const validation = validateBranchName(workingBranch)
                if (!validation.valid) {
                  log.error(`Invalid branch name: ${validation.reason}`)
                  continue
                }

                // Check if branch already exists
                try {
                  exec(`git show-ref --verify --quiet refs/heads/${workingBranch}`)
                  log.error(`Branch '${workingBranch}' already exists locally`)
                  continue
                } catch {
                  // Branch doesn't exist, create it
                }

                log.info(`Creating branch: ${workingBranch}`)
                exec(`git checkout -b "${workingBranch}"`)
                log.success(`Branch created: ${workingBranch}`)
              }

              selectedNamingStrategy = 'manual'
              state.workingBranch = workingBranch
              state.step = STEP.BRANCH_CREATED
              saveState(state)
              branchFlowComplete = true
              break
            }
          }

          break // Exit separator loop
        }
      }
    }
  } else {
    // User chose not to create new branch, use current branch
    workingBranch = state.currentBranch
    log.info(`Using current branch: ${workingBranch}`)
  }

  // Only mark branch creation step complete if a branch was actually created
  if (workingBranch && state.step < STEP.BRANCH_CREATED) {
    state.step = STEP.BRANCH_CREATED
  }

  saveState(state)

  // Save branch strategy config
  saveBranchStrategyConfig({
    separator: separator ?? branchConfig?.separator ?? '-',
    lastNamingStrategy: selectedNamingStrategy,
    lastTrelloList: selectedTrelloList ?? branchConfig?.lastTrelloList,
  })

  return workingBranch ?? state.currentBranch
}
