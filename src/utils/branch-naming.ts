import type { CopilotModel } from '../api/copilot.js'
import type { GeminiModel } from '../api/gemini.js'
import type { OpenRouterModel } from '../api/openrouter.js'

import { execGit } from './exec.js'
import { getChangedFiles } from './git.js'

export interface BranchNamingResult {
  workingBranch: string
  shouldRestart: boolean
  cancelled: boolean
}

export const handleBranchNaming = async (
  defaultPrefix: string,
  separator: '-' | '_',
  trelloCardId: string,
  currentBranch: string,
  aiProvider: 'gemini' | 'copilot' | 'openrouter' = 'gemini',
  model?: CopilotModel | OpenRouterModel | GeminiModel,
  updateModel?: (
    provider: 'gemini' | 'copilot' | 'openrouter',
    model?: CopilotModel | OpenRouterModel | GeminiModel
  ) => void
): Promise<BranchNamingResult> => {
  const { askQuestion } = await import('../cli/input.js')
  const { select } = await import('../cli/menu.js')
  const { exec } = await import('./exec.js')
  const { log } = await import('./logging.js')
  const { colors } = await import('./colors.js')

  const result: BranchNamingResult = {
    workingBranch: '',
    shouldRestart: false,
    cancelled: false,
  }

  let diff = execGit('git diff --cached', true)
  // If there are no staged changes, offer to stage
  if (!diff?.trim()) {
    const changedFiles = getChangedFiles()
    if (changedFiles.length === 0) {
      log.warn('No changes found. Cannot generate a branch name. Aborting.')
      result.cancelled = true
      return result
    }

    const stageChoice = (await select('What to stage?', [
      { label: 'Stage all changes', value: 'all' },
      { label: 'Already staged', value: 'skip' },
      { label: 'Continue without staging', value: 'without' },
      { label: 'Cancel', value: 'cancel' },
    ])) as 'all' | 'skip' | 'without' | 'cancel'

    switch (stageChoice) {
      case 'all': {
        exec('git add -A')
        log.success('All changes staged')
        console.log('')

        diff = execGit('git diff --cached', true)
        if (!diff?.trim()) {
          log.error('Still no staged changes after staging. Aborting.')
          result.cancelled = true
          return result
        }
        break
      }
      case 'without':
      case 'cancel': {
        log.warn('Cancelled.')
        result.cancelled = true
        return result
      }
      case 'skip': {
        // Re-check if there are actually staged changes
        diff = execGit('git diff --cached', true)
        if (!diff?.trim()) {
          log.error('No staged changes found. Aborting.')
          result.cancelled = true
          return result
        }
        break
      }
    }
  }
  let correction = ''
  let aiSuffix: string | null = null
  let skipRegenerate = false

  // Loop until branch name accepted
  while (true) {
    const {
      getModelDisplayName,
      getAIProviderShortName,
      interactiveAIFallback,
      isTransientAIFailure,
      isContextLimitFailure,
      chooseModelForProvider,
    } = await import('./git-ai.js')

    const modelDisplay = getModelDisplayName(aiProvider, model)

    // Separate this AI generation log from prior output so it stands alone
    if (correction) {
      console.log('')
    }

    const spinner = log.spinner()
    spinner.start(
      `Generating branch name with ${getAIProviderShortName(aiProvider)}${modelDisplay ? ` (${modelDisplay})` : ''}...`
    )

    // Only call provider to regenerate when not skipping (e.g., user selected Back)
    if (skipRegenerate) {
      // consume the skip once - will reuse existing aiSuffix
      skipRegenerate = false
      spinner.stop()
    } else {
      aiSuffix = null
      try {
        switch (aiProvider) {
          case 'gemini': {
            const { generateBranchName } = await import('../api/gemini.js')
            const word = diff
            aiSuffix = await generateBranchName(word, correction, model as GeminiModel)
            break
          }
          case 'copilot': {
            const { generateBranchName } = await import('../api/copilot.js')
            const word = diff
            aiSuffix = await generateBranchName(word, correction, model as CopilotModel)
            break
          }
          case 'openrouter': {
            const { generateBranchName } = await import('../api/openrouter.js')
            const word = diff
            aiSuffix = await generateBranchName(word, correction, model as OpenRouterModel)

            break
          }
        }
        spinner.stop()
      } catch (error) {
        spinner.stop()
        throw error
      }
    }

    if (!aiSuffix || isTransientAIFailure(aiSuffix) || isContextLimitFailure(aiSuffix)) {
      const safeUpdate = (provider: 'gemini' | 'copilot' | 'openrouter', modelStr?: string) => {
        if (updateModel) {
          // forward to provided updater (cast since caller may use narrower model types)
          updateModel(provider, modelStr as unknown as CopilotModel | OpenRouterModel | GeminiModel)
        }
      }

      aiSuffix = await interactiveAIFallback(
        aiSuffix,
        aiProvider ?? 'gemini',
        model as CopilotModel | OpenRouterModel | GeminiModel,
        diff,
        correction,
        currentBranch,
        safeUpdate
      )

      if (aiSuffix === null) {
        const { getBranchPrefix, validateBranchName } = await import('./git.js')
        const customPrefix = getBranchPrefix(currentBranch)
        let valid = false
        while (!valid) {
          result.workingBranch = askQuestion('Enter branch name:', `${customPrefix}new-feature`)
          const validation = validateBranchName(result.workingBranch)
          if (validation.valid) {
            valid = true
          } else {
            log.error(`Invalid branch name: ${validation.reason}`)
          }
        }
        break
      }
    }

    const cleanSuffix = aiSuffix
      .toLowerCase()
      .replaceAll(/\W+/g, separator)
      .replace(separator === '-' ? /-+/g : /_+/g, separator)
      .replace(separator === '-' ? /^-|-$/g : /^_|_$/g, '')
      .trim()

    const incompletePatterns =
      separator === '-'
        ? ['-and', '-or', '-with', '-for', '-the', '-a', '-an', '-in', '-on', '-at', '-to', '-of']
        : ['_and', '_or', '_with', '_for', '_the', '_a', '_an', '_in', '_on', '_at', '_to', '_of']
    // Treat trailing prepositions as incomplete
    const extraIncomplete =
      separator === '-'
        ? ['-from', '-via', '-using', '-per', '-by']
        : ['_from', '_via', '_using', '_per', '_by']
    incompletePatterns.push(...extraIncomplete)
    const seemsIncomplete = incompletePatterns.some((pattern) => cleanSuffix.endsWith(pattern))

    if (seemsIncomplete) {
      log.warn(
        `AI response seems incomplete (ends with "${cleanSuffix.slice(-4)}"), regenerating...`
      )
      correction = 'Generate a complete branch name without truncation'
      continue
    }

    const currentSuggestion = trelloCardId
      ? `${defaultPrefix}${trelloCardId}${separator}${cleanSuffix}`
      : `${defaultPrefix}${cleanSuffix}`

    const contextLimitDetected = isContextLimitFailure(aiSuffix)

    if (!contextLimitDetected) {
      log.ai(`Suggested: ${colors.cyan}${colors.bright}${currentSuggestion}${colors.reset}`)
      log.info(
        'Incorrect Suggestion? check .geeto/last-ai-suggestion.json (possible AI/context limit).\n'
      )
    }

    if (contextLimitDetected) {
      // Force user to change model/provider or edit manually; don't allow accepting this suggestion
      const acceptAi = await select(
        'This model cannot process the input due to token/context limits. Please choose a different model or provider:',
        [
          {
            label: `Try again with ${getAIProviderShortName(aiProvider)}${modelDisplay ? ` (${modelDisplay})` : ''} model`,
            value: 'try-same',
          },
          { label: 'Change model', value: 'change-model' },
          { label: 'Change AI provider', value: 'change-provider' },
          { label: 'Edit manually', value: 'edit' },
          { label: 'Back to branch menu', value: 'back' },
        ]
      )

      switch (acceptAi) {
        case 'try-same': {
          // Attempt to retry generation with the same provider/model
          correction = ''
          continue
        }
        case 'change-model': {
          // change only the current provider's model — use centralized helper
          const provKey = (aiProvider ?? 'gemini') as 'gemini' | 'copilot' | 'openrouter' | string
          const provider = (provKey === 'manual' ? 'gemini' : provKey) as
            | 'gemini'
            | 'copilot'
            | 'openrouter'
          const chosen = await chooseModelForProvider(
            provider,
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
          updateModel?.(provider, chosen as unknown as CopilotModel | OpenRouterModel | GeminiModel)
          model = chosen as unknown as CopilotModel | OpenRouterModel | GeminiModel
          correction = ''
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
            // User chose the contextual "Back" option — don't regenerate, return to previous menu
            skipRegenerate = true
            continue
          }
          // Centralized provider/model selection helper
          const chosen = await chooseModelForProvider(
            prov as 'gemini' | 'copilot' | 'openrouter',
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
          if (prov === 'copilot') {
            updateModel?.('copilot', chosen as unknown as CopilotModel)
            aiProvider = 'copilot'
            model = chosen as unknown as CopilotModel
          } else if (prov === 'openrouter') {
            updateModel?.('openrouter', chosen as unknown as OpenRouterModel)
            aiProvider = 'openrouter'
            model = chosen as unknown as OpenRouterModel
          } else {
            updateModel?.('gemini', chosen as unknown as GeminiModel)
            aiProvider = 'gemini'
            model = chosen as unknown as GeminiModel
          }
          correction = ''
          continue
        }
        case 'edit': {
          const edited = askQuestion(`Edit branch (${currentSuggestion}): `)
          result.workingBranch = edited ?? currentSuggestion
          break
        }
        case 'back': {
          result.shouldRestart = true
          break
        }
      }
    } else {
      const acceptAi = await select('Accept this branch name?', [
        { label: 'Yes, use it', value: 'accept' },
        { label: 'Regenerate', value: 'regenerate' },
        { label: 'Correct AI (give feedback)', value: 'correct' },
        { label: 'Change model', value: 'change-model' },
        { label: 'Change AI provider', value: 'change-provider' },
        { label: 'Edit manually', value: 'edit' },
        { label: 'Back to branch menu', value: 'back' },
      ])

      switch (acceptAi) {
        case 'accept': {
          result.workingBranch = currentSuggestion
          break
        }
        case 'regenerate': {
          correction = ''
          continue
        }
        case 'correct': {
          correction = askQuestion(
            'Provide corrections for the AI (e.g., prefer kebab-case, shorten subject): '
          )
          continue
        }
        case 'change-model': {
          // change only the current provider's model
          const currentProv = aiProvider ?? 'gemini'
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
            updateModel?.('copilot', chosen as unknown as CopilotModel)
            model = chosen as unknown as CopilotModel
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
            updateModel?.('openrouter', chosen as unknown as OpenRouterModel)
            model = chosen as unknown as OpenRouterModel
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
            updateModel?.('gemini', chosen as unknown as GeminiModel)
            model = chosen as unknown as GeminiModel
          }
          correction = ''
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
            // User chose the contextual "Back" option — don't regenerate, return to previous menu
            skipRegenerate = true
            continue
          }

          // Centralized provider/model selection helper
          const chosen = await chooseModelForProvider(
            prov as 'gemini' | 'copilot' | 'openrouter',
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
          if (prov === 'copilot') {
            updateModel?.('copilot', chosen as unknown as CopilotModel)
            aiProvider = 'copilot'
            model = chosen as unknown as CopilotModel
          } else if (prov === 'openrouter') {
            updateModel?.('openrouter', chosen as unknown as OpenRouterModel)
            aiProvider = 'openrouter'
            model = chosen as unknown as OpenRouterModel
          } else {
            updateModel?.('gemini', chosen as unknown as GeminiModel)
            aiProvider = 'gemini'
            model = chosen as unknown as GeminiModel
          }
          correction = ''
          continue
        }
        case 'edit': {
          const edited = askQuestion(`Edit branch (${currentSuggestion}): `)
          result.workingBranch = edited || currentSuggestion
          break
        }
        case 'back': {
          result.shouldRestart = true
          break
        }
      }
    }

    if (result.workingBranch || result.shouldRestart) {
      break
    }
  }

  if (result.workingBranch && result.workingBranch !== currentBranch) {
    const { validateBranchName } = await import('./git.js')
    const validation = validateBranchName(result.workingBranch)
    if (!validation.valid) {
      log.error(`Invalid branch name: ${validation.reason}`)
      result.workingBranch = ''
      return result
    }

    const { branchExists } = await import('./git.js')
    if (branchExists(result.workingBranch)) {
      log.error(`Branch '${result.workingBranch}' already exists locally`)
      result.workingBranch = ''
      return result
    }

    log.info(`Creating branch: ${result.workingBranch}`)
    exec(`git checkout -b "${result.workingBranch}"`, true)
    log.success(`Branch created: ${result.workingBranch}`)
  }

  return result
}

export default handleBranchNaming
