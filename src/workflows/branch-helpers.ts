import type { CopilotModel } from '../api/copilot.js'
import type { GeminiModel } from '../api/gemini.js'
import type { OpenRouterModel } from '../api/openrouter.js'
import type { BranchStrategyConfig, GeetoState } from '../types/index.js'

import { createBranch, promptManualBranch } from './branch-utils.js'
import {
  fetchTrelloCards,
  fetchTrelloLists,
  generateBranchNameFromTrelloTitle,
} from '../api/trello.js'
import { askQuestion } from '../cli/input.js'
import { select } from '../cli/menu.js'
import { STEP } from '../core/constants.js'
import { colors } from '../utils/colors.js'
import {
  DEFAULT_GEMINI_MODEL,
  getBranchStrategyConfig,
  hasTrelloConfig,
  saveBranchStrategyConfig,
} from '../utils/config.js'
import { chooseModelForProvider } from '../utils/git-ai.js'
import {
  generateBranchNameWithProvider,
  getAIProviderShortName,
  getModelDisplayName,
  interactiveAIFallback,
  isContextLimitFailure,
  isTransientAIFailure,
} from '../utils/git.js'
import { log } from '../utils/logging.js'
import { saveState } from '../utils/state.js'

export interface TrelloCaseResult {
  workingBranch?: string
  selectedNamingStrategy?: 'title-full' | 'title-ai' | 'ai' | 'manual'
  branchFlowComplete: boolean
  branchMenuShown: boolean
}

export async function handleTrelloCase(
  state: GeetoState,
  branchConfig: BranchStrategyConfig | null,
  separator: '-' | '_',
  defaultPrefix: string
): Promise<TrelloCaseResult> {
  // Returns result explaining what to do next for the branch workflow
  if (!hasTrelloConfig()) {
    const spinner = log.spinner()
    spinner.start('Setting up Trello integration...')
    const { setupTrelloConfigInteractive } = await import('../core/trello-setup.js')
    const setupSuccess = setupTrelloConfigInteractive()
    spinner.stop()
    if (!setupSuccess) {
      log.warn('Trello setup failed or cancelled.')
      return { branchFlowComplete: false, branchMenuShown: false }
    }
    log.success('Trello integration configured!')
  }

  const spinner = log.spinner()
  spinner.start('Checking Trello for tasks...')

  const trelloLists = await fetchTrelloLists()
  spinner.stop()
  if (trelloLists.length === 0) {
    log.warn('No Trello lists found on board')
    return { branchFlowComplete: false, branchMenuShown: false }
  }

  // List selection
  const lastUsedListId = branchConfig?.lastTrelloList as string | undefined
  const listOptions = [
    ...trelloLists.map((list) => ({
      label: list.id === lastUsedListId ? `${list.name} ⭐ Last used` : `${list.name}`,
      value: list.id,
    })),
    { label: 'All lists (no filter)', value: 'all' },
    { label: 'Back to branch menu', value: 'back-menu' },
  ]

  const selectedListId = await select('Select Trello list:', listOptions)
  if (selectedListId === 'back-menu') {
    return { branchFlowComplete: false, branchMenuShown: false }
  }

  if (selectedListId !== 'all') {
    const currentStrategy = getBranchStrategyConfig()
    saveBranchStrategyConfig({
      separator,
      lastNamingStrategy: currentStrategy?.lastNamingStrategy,
      lastTrelloList: selectedListId,
    })
  }

  const filterListId = selectedListId === 'all' ? undefined : selectedListId
  const cardSpinner = log.spinner()
  cardSpinner.start('Loading Trello cards...')
  const trelloCards = await fetchTrelloCards(filterListId)
  cardSpinner.stop()

  if (trelloCards.length === 0) {
    log.warn('No cards found in selected list')
    return { branchFlowComplete: false, branchMenuShown: false }
  }

  // Card selection and naming
  const trelloOptions = [
    ...trelloCards.slice(0, 15).map((card) => {
      const branchPreview = generateBranchNameFromTrelloTitle(card.name, card.shortLink, separator)
      return {
        label: `${defaultPrefix}${branchPreview}`,
        value: JSON.stringify({ id: card.shortLink, title: card.name }),
      }
    }),
    { label: 'Back to branch menu', value: 'back-menu' },
  ]

  const selectedCard = await select('Select Trello card:', trelloOptions)
  if (selectedCard === 'back-menu') {
    return { branchFlowComplete: false, branchMenuShown: false }
  }

  const cardData = JSON.parse(selectedCard) as { id: string; title: string }
  const trelloCardId = cardData.id
  log.success(`Linked to Trello card ${trelloCardId}`)

  // Naming strategy selection for the card
  const namingChoice = await select('Branch naming strategy:', [
    { label: 'Use Trello title (full)', value: 'title-full' },
    { label: 'Use Trello title (AI shortened)', value: 'title-ai' },
    { label: 'Use Trello title (AI shortened + English)', value: 'title-ai-en' },
    { label: 'Back to card selection', value: 'back' },
  ])

  if (namingChoice === 'back') {
    return { branchFlowComplete: false, branchMenuShown: false }
  }

  if (namingChoice === 'title-full') {
    const branchSuffix = generateBranchNameFromTrelloTitle(cardData.title, cardData.id, separator)
    const workingBranch = `${defaultPrefix}${branchSuffix}`
    log.success(`Branch name: ${colors.cyan}${workingBranch}${colors.reset}`)
    if (await createBranch(workingBranch, state.currentBranch)) {
      state.workingBranch = workingBranch
      state.step = STEP.BRANCH_CREATED
      saveState(state)
      return {
        workingBranch,
        selectedNamingStrategy: 'title-full',
        branchFlowComplete: true,
        branchMenuShown: true,
      }
    }

    return { branchFlowComplete: false, branchMenuShown: false }
  }

  // title-ai or title-ai-en: use AI to shorten Trello title (optionally translate to English first)
  const shouldTranslateToEnglish = namingChoice === 'title-ai-en'

  // First, ensure AI provider is configured
  if (!state.aiProvider) {
    log.warn('No AI provider configured yet.')
    const providerChoice = await select('Choose AI provider:', [
      { label: 'Gemini', value: 'gemini' },
      { label: 'GitHub Copilot (Recommended)', value: 'copilot' },
      { label: 'OpenRouter', value: 'openrouter' },
      { label: 'Back to naming strategy', value: 'back' },
    ])

    if (providerChoice === 'back') {
      return { branchFlowComplete: false, branchMenuShown: false }
    }

    const chosenProvider = providerChoice as 'gemini' | 'copilot' | 'openrouter'

    // Let user choose model for the selected provider
    const chosenModel = await chooseModelForProvider(
      chosenProvider,
      'Choose model:',
      'Back to provider selection'
    )

    if (!chosenModel || chosenModel === 'back') {
      return { branchFlowComplete: false, branchMenuShown: false }
    }

    // Save selected provider and model to state
    state.aiProvider = chosenProvider
    if (chosenProvider === 'copilot') {
      state.copilotModel = chosenModel as CopilotModel
    } else if (chosenProvider === 'openrouter') {
      state.openrouterModel = chosenModel as OpenRouterModel
    } else {
      state.geminiModel = chosenModel as GeminiModel
    }
    saveState(state)
    log.success(`AI provider set to ${getAIProviderShortName(chosenProvider)}`)
  }

  let correction = ''
  let aiSuffix: string | null = null
  let skipRegenerate = false

  while (true) {
    const aiProvider = state.aiProvider as 'gemini' | 'copilot' | 'openrouter'
    let modelParam: CopilotModel | OpenRouterModel | GeminiModel
    if (aiProvider === 'copilot') {
      modelParam = state.copilotModel as CopilotModel
    } else if (aiProvider === 'openrouter') {
      modelParam = state.openrouterModel as OpenRouterModel
    } else {
      modelParam = (state.geminiModel ?? DEFAULT_GEMINI_MODEL) as GeminiModel
    }

    let model: string | undefined
    if (aiProvider === 'copilot') {
      model = state.copilotModel as unknown as string
    } else if (aiProvider === 'openrouter') {
      model = state.openrouterModel as unknown as string
    } else {
      model = (state.geminiModel as unknown as string) ?? DEFAULT_GEMINI_MODEL
    }
    const modelDisplay = getModelDisplayName(aiProvider, model)
    const spinner = log.spinner()

    let titleToProcess = cardData.title

    // Step 1: Translate to English if requested
    if (shouldTranslateToEnglish && !skipRegenerate) {
      spinner.start(
        `Translating to English using ${getAIProviderShortName(aiProvider)}${
          modelDisplay ? ` (${modelDisplay})` : ''
        }...`
      )

      const translatedTitle = await generateBranchNameWithProvider(
        aiProvider,
        `Translate this to English (keep it concise): "${cardData.title}"`,
        '',
        state.copilotModel,
        state.openrouterModel,
        state.geminiModel
      )

      if (
        translatedTitle &&
        !isTransientAIFailure(translatedTitle) &&
        !isContextLimitFailure(translatedTitle)
      ) {
        titleToProcess = translatedTitle
        spinner.stop()
        log.info(`Translated: ${colors.cyan}${titleToProcess}${colors.reset}`)
      } else {
        spinner.stop()
        log.warn('Translation failed, using original title')
      }
    }

    // Step 2: Generate short branch name
    spinner.start(
      `Generating short branch name using ${getAIProviderShortName(aiProvider)}${
        modelDisplay ? ` (${modelDisplay})` : ''
      }...`
    )

    if (skipRegenerate) {
      // consume skip once and reuse previous aiSuffix
      skipRegenerate = false
      spinner.stop()
    } else {
      aiSuffix = await generateBranchNameWithProvider(
        aiProvider,
        titleToProcess,
        correction,
        state.copilotModel,
        state.openrouterModel,
        state.geminiModel
      )
      spinner.stop()
    }

    if (!aiSuffix || isTransientAIFailure(aiSuffix) || isContextLimitFailure(aiSuffix)) {
      aiSuffix = await interactiveAIFallback(
        aiSuffix,
        aiProvider,
        modelParam,
        cardData.title,
        correction,
        state.currentBranch,
        (provider: 'gemini' | 'copilot' | 'openrouter', selectedModel?: string) => {
          state.aiProvider = provider
          if (provider === 'copilot') {
            state.copilotModel = selectedModel as CopilotModel
          } else if (provider === 'openrouter') {
            state.openrouterModel = selectedModel as OpenRouterModel
          }
          saveState(state)
        }
      )
    }

    let workingBranch = ''

    if (aiSuffix === null) {
      workingBranch = promptManualBranch(state.currentBranch)
    } else {
      const tmp = aiSuffix
        .replaceAll(/[^A-Za-z0-9]+/g, separator)
        .replaceAll(/[-_]+/g, separator)
        .toLowerCase()

      let cleanSuffix = tmp
      while (cleanSuffix.startsWith(separator)) cleanSuffix = cleanSuffix.slice(separator.length)
      while (cleanSuffix.endsWith(separator)) cleanSuffix = cleanSuffix.slice(0, -separator.length)

      workingBranch = `${defaultPrefix}${trelloCardId}${separator}${cleanSuffix}`
      const contextLimitDetected = isContextLimitFailure(aiSuffix)
      if (!contextLimitDetected) {
        log.ai(`Suggested: ${colors.cyan}${colors.bright}${workingBranch}${colors.reset}`)
        log.info(
          'Incorrect Suggestion? check .geeto/last-ai-suggestion.json (possible AI/context limit).\n'
        )
      }
    }

    const contextLimitDetected = isContextLimitFailure(aiSuffix)

    let acceptChoice: string
    if (contextLimitDetected) {
      acceptChoice = await select(
        'This model cannot process the input due to token/context limits. Please choose a different model or provider:',
        [
          {
            label: `Try again with ${getAIProviderShortName(aiProvider)}${model ? ` (${model})` : ''} model`,
            value: 'try-same',
          },
          { label: 'Change model', value: 'change-model' },
          { label: 'Change AI provider', value: 'change-provider' },
          { label: 'Edit manually', value: 'edit' },
          { label: 'Back to card selection', value: 'back' },
        ]
      )
    } else {
      acceptChoice = await select('Accept this branch name?', [
        { label: 'Yes, use it', value: 'accept' },
        { label: 'Regenerate', value: 'regenerate' },
        { label: 'Correct AI (give feedback)', value: 'correct' },
        { label: 'Change model', value: 'change-model' },
        { label: 'Change AI provider', value: 'change-provider' },
        { label: 'Edit manually', value: 'edit' },
        { label: 'Back to card selection', value: 'back' },
      ])
    }

    switch (acceptChoice) {
      case 'accept': {
        // create branch and return
        if (await createBranch(workingBranch, state.currentBranch)) {
          state.workingBranch = workingBranch
          state.step = STEP.BRANCH_CREATED
          saveState(state)
          return {
            workingBranch,
            selectedNamingStrategy: 'title-ai',
            branchFlowComplete: true,
            branchMenuShown: true,
          }
        }
        // creation failed, return to menus
        return { branchFlowComplete: false, branchMenuShown: false }
      }
      case 'try-same': {
        // User requested re-trying with the same provider/model
        correction = ''
        break
      }
      case 'regenerate': {
        correction = ''
        break
      }
      case 'change-provider': {
        // let user pick another provider and optionally pick a model
        const prov = await select('Choose AI provider:', [
          { label: 'Gemini', value: 'gemini' },
          { label: 'GitHub Copilot (Recommended)', value: 'copilot' },
          { label: 'OpenRouter', value: 'openrouter' },
          { label: 'Back to suggested branch selection', value: 'cancel-prov' },
        ])
        if (prov === 'cancel-prov') {
          // User chose contextual back — don't regenerate AI suggestion
          skipRegenerate = true
          continue
        }
        state.aiProvider = prov as 'gemini' | 'copilot' | 'openrouter'

        log.info(`Selected AI Provider: ${getAIProviderShortName(state.aiProvider ?? 'gemini')}`)
        const chosen = await chooseModelForProvider(
          state.aiProvider as 'gemini' | 'copilot' | 'openrouter',
          'Choose model:',
          'Back to suggested branch selection'
        )
        if (!chosen) {
          skipRegenerate = true
          continue
        }
        if (chosen === 'back') {
          skipRegenerate = true
          continue
        }

        switch (prov) {
          case 'copilot': {
            state.copilotModel = chosen as unknown as CopilotModel
            break
          }
          case 'openrouter': {
            state.openrouterModel = chosen as unknown as OpenRouterModel
            break
          }
          case 'gemini': {
            state.geminiModel = chosen as unknown as GeminiModel
            break
          }
          default: {
            break
          }
        }
        saveState(state)
        correction = ''
        break
      }
      case 'change-model': {
        // change only the current provider's model
        const currentProv = state.aiProvider ?? 'gemini'
        if (currentProv === 'copilot') {
          const cop = await import('../api/copilot.js')
          const models = await cop.getCopilotModels()
          const copOptions = models.some((m) => m.value === 'back')
            ? models
            : [...models, { label: 'Back to suggested branch selection', value: 'back' }]
          const chosen = await select('Choose Copilot model:', copOptions)
          if (chosen === 'back') {
            skipRegenerate = true
            continue
          }
          state.copilotModel = chosen as unknown as CopilotModel
        } else if (currentProv === 'openrouter') {
          const or = await import('../api/openrouter.js')
          const models = await or.getOpenRouterModels()
          const orOptions = models.some((m) => m.value === 'back')
            ? models
            : [...models, { label: 'Back to suggested branch selection', value: 'back' }]
          const chosen = await select('Choose OpenRouter model:', orOptions)
          if (chosen === 'back') {
            skipRegenerate = true
            continue
          }
          state.openrouterModel = chosen as unknown as OpenRouterModel
        } else {
          const gm = await import('../api/gemini.js')
          const models = await gm.getGeminiModels()
          const gmOptions = models.some((m) => m.value === 'back')
            ? models
            : [...models, { label: 'Back to suggested branch selection', value: 'back' }]
          const chosen = await select('Choose Gemini model:', gmOptions)
          if (chosen === 'back') {
            skipRegenerate = true
            continue
          }
          state.geminiModel = chosen as unknown as GeminiModel
        }
        saveState(state)
        correction = ''
        break
      }
      case 'correct': {
        correction = askQuestion(
          'Provide corrections for the AI (e.g., shorten, prefer verb tense): ',
          undefined,
          true
        )
        console.log('')
        break
      }
      case 'edit': {
        const edited = askQuestion(`Edit branch (${workingBranch}): `)
        workingBranch = edited || workingBranch
        if (await createBranch(workingBranch, state.currentBranch)) {
          state.workingBranch = workingBranch
          state.step = STEP.BRANCH_CREATED
          saveState(state)
          return {
            workingBranch,
            selectedNamingStrategy: 'title-ai',
            branchFlowComplete: true,
            branchMenuShown: true,
          }
        }
        return { branchFlowComplete: false, branchMenuShown: false }
      }
      case 'back': {
        return { branchFlowComplete: false, branchMenuShown: false }
      }
    }
  }
}
