import type { CopilotModel } from '../api/copilot.js'
import type { GeminiModel } from '../api/gemini.js'
import type { OpenRouterModel } from '../api/openrouter.js'

import { DEFAULT_GEMINI_MODEL } from './config.js'
import { isContextLimitFailure, isTransientAIFailure } from './git-ai-errors.js'
import { ScrambleProgress } from './scramble.js'
import { log } from '../utils/logging.js'

// Re-export error detection functions for backward compatibility
export { isContextLimitFailure, isTransientAIFailure }

// execGit not needed here

/** Return the canonical string value for a model (object or string) */
export function getModelValue(
  m?: CopilotModel | OpenRouterModel | GeminiModel | string
): string | undefined {
  if (!m) {
    return undefined
  }
  if (typeof m === 'string') {
    return m
  }
  // model objects expose a `value` property in our menus
  return (m as unknown as { value?: string }).value
}

/** Return a friendly provider name. */
export function getAIProviderDisplayName(aiProvider: string): string {
  switch (aiProvider) {
    case 'gemini': {
      return 'Gemini'
    }
    case 'copilot': {
      return 'GitHub (Recommended)'
    }
    case 'openrouter': {
      return 'OpenRouter'
    }
    default: {
      return 'Manual'
    }
  }
}

/** Short provider name for brief displays. */
export function getAIProviderShortName(aiProvider: string): string {
  switch (aiProvider) {
    case 'gemini': {
      return 'Gemini'
    }
    case 'copilot': {
      return 'Copilot'
    }
    case 'openrouter': {
      return 'OpenRouter'
    }
    default: {
      return 'Manual'
    }
  }
}

/** Return the model to show for a provider. */
export function getModelDisplayName(aiProvider: string, model?: string): string {
  if (aiProvider === 'gemini') {
    // don't rely on config-stored model; prefer explicit model param then default
    return model ?? DEFAULT_GEMINI_MODEL
  }

  if (!model) {
    return ''
  }

  return model
}

/** Ask the right provider to generate a branch-name suffix. */
export async function generateBranchNameWithProvider(
  aiProvider: string,
  title: string,
  correction?: string,
  copilotModel?: CopilotModel,
  openrouterModel?: OpenRouterModel,
  geminiModel?: GeminiModel
): Promise<string | null> {
  switch (aiProvider) {
    case 'gemini': {
      const { generateBranchName } = await import('../api/gemini.js')
      return generateBranchName(title, correction, geminiModel as GeminiModel)
    }
    case 'copilot': {
      const { generateBranchName } = await import('../api/copilot.js')
      return generateBranchName(title, correction, copilotModel)
    }
    default: {
      const { generateBranchName } = await import('../api/openrouter.js')
      return generateBranchName(title, correction, openrouterModel)
    }
  }
}

export async function generateReleaseNotesWithProvider(
  aiProvider: string,
  commits: string,
  language: 'en' | 'id',
  correction?: string,
  copilotModel?: CopilotModel,
  openrouterModel?: OpenRouterModel,
  geminiModel?: GeminiModel
): Promise<string | null> {
  switch (aiProvider) {
    case 'gemini': {
      const { generateReleaseNotes } = await import('../api/gemini.js')
      return generateReleaseNotes(commits, language, correction, geminiModel as GeminiModel)
    }
    case 'copilot': {
      const { generateReleaseNotes } = await import('../api/copilot.js')
      return generateReleaseNotes(commits, language, correction, copilotModel)
    }
    default: {
      const { generateReleaseNotes } = await import('../api/openrouter.js')
      return generateReleaseNotes(commits, language, correction, openrouterModel)
    }
  }
}

/** Send a raw text prompt to the configured AI provider and return the response. */
export async function generateTextWithProvider(
  aiProvider: string,
  prompt: string,
  copilotModel?: CopilotModel,
  openrouterModel?: OpenRouterModel,
  geminiModel?: GeminiModel
): Promise<string | null> {
  switch (aiProvider) {
    case 'gemini': {
      const { generateText } = await import('../api/gemini.js')
      return generateText(prompt, geminiModel as GeminiModel)
    }
    case 'copilot': {
      const { generateText } = await import('../api/copilot.js')
      return generateText(prompt, copilotModel)
    }
    default: {
      const { generateText } = await import('../api/openrouter.js')
      return generateText(prompt, openrouterModel)
    }
  }
}

/**
 * Interactive fallback menu when AI generation fails.
 */
export async function interactiveAIFallback(
  currentSuffix: string | null,
  aiProvider: 'gemini' | 'copilot' | 'openrouter',
  model: CopilotModel | OpenRouterModel | GeminiModel | string,
  diff: string,
  correction: string,
  _currentBranch: string,
  updateModel: (
    provider: 'gemini' | 'copilot' | 'openrouter',
    model?: CopilotModel | OpenRouterModel | GeminiModel | string
  ) => void,
  isCommit: boolean = false
): Promise<string | null> {
  const { select } = await import('../cli/menu.js')

  const isTransientFailure = isTransientAIFailure

  let aiSuffix = currentSuffix
  const failedModels = new Set<string>()
  // track the current model (may be a string or a provider-specific model object)
  let currentModel: CopilotModel | OpenRouterModel | GeminiModel | string | undefined = model

  // Loop until manual pick or non-rate result
  while (true) {
    // If we have a valid suffix (not a failure), return it
    if (aiSuffix && !isTransientFailure(aiSuffix)) {
      return aiSuffix
    }

    // aiSuffix is null/transient — show interactive alternatives menu
    let choices = [
      {
        label: `Try a different ${getAIProviderShortName(aiProvider)} model`,
        value: 'different-model',
      },
      { label: 'Try a different AI provider', value: 'different-provider' },
      { label: 'Manual input', value: 'manual' },
    ]

    // If this failure is due to context/token limits, prefer forcing the user
    // to pick a different model or provider (retrying the same model won't help).
    const contextLimit = isContextLimitFailure(aiSuffix)
    if (contextLimit && typeof currentModel === 'string') {
      // mark the current model string as failed to avoid reselecting it
      failedModels.add(currentModel)
    }

    if (aiSuffix && isTransientFailure(aiSuffix)) {
      // Decide whether to show "Try a different <provider> model".
      // Hide it when there are no alternative models left or when the
      // failure clearly indicates provider-wide quota exhaustion.
      const low = String(aiSuffix).toLowerCase()
      let showDifferentModel = true

      // If message clearly indicates quota or subscription problem, don't offer model switch
      if (
        low.includes('quota') ||
        low.includes('no quota') ||
        low.includes('quota_exceeded') ||
        low.includes('insufficient') ||
        low.includes('payment') ||
        /subscription/.test(low)
      ) {
        showDifferentModel = false
      } else {
        // Otherwise, check whether there are alternative models available
        switch (aiProvider) {
          case 'gemini': {
            const gem = await import('../api/gemini.js')
            const models = await gem.getGeminiModels()
            // Always offer all models (do not hide models marked as failed)
            const available = models as Array<{ label: string; value: string }>
            if (available.length === 0) {
              showDifferentModel = false
            }
            break
          }
          case 'copilot': {
            const cop = await import('../api/copilot.js')
            const models = await cop.getCopilotModels()
            // Always offer all models (do not hide models marked as failed)
            const available = models
            if (available.length === 0) {
              showDifferentModel = false
            }
            break
          }
          case 'openrouter': {
            const open = await import('../api/openrouter.js')
            const models = await open.getOpenRouterModels()
            // Always offer all models (do not hide models marked as failed)
            const available = models
            if (available.length === 0) {
              showDifferentModel = false
            }
            break
          }
          default: {
            break
          }
        }
      }

      choices = [
        {
          label: `Try again with ${getAIProviderShortName(aiProvider)}${getModelValue(currentModel) ? ` (${getModelValue(currentModel)})` : ''} model`,
          value: 'retry-current',
        },
        ...(showDifferentModel
          ? [
              {
                label: `Try a different ${getAIProviderShortName(aiProvider)} model`,
                value: 'different-model',
              },
            ]
          : []),
        { label: 'Try a different AI provider', value: 'different-provider' },
        { label: 'Manual input', value: 'manual' },
      ]
    }

    // Use short provider name and show a context-aware prompt
    const shortName = getAIProviderShortName(aiProvider)

    // Detect network/connectivity style failures so we can offer a retry
    const lowForNetwork = aiSuffix ? String(aiSuffix).toLowerCase() : ''
    const isNetworkError =
      aiSuffix === null ||
      aiSuffix === undefined ||
      lowForNetwork.includes('unable to connect') ||
      lowForNetwork.includes('failed to fetch') ||
      lowForNetwork.includes('network') ||
      lowForNetwork.includes('connection') ||
      /enotfound|econnrefused|timeout/.test(lowForNetwork)

    if (isNetworkError) {
      // Offer a retry with the current provider/model as the first choice
      choices = [
        {
          label: `Try again with current ${getAIProviderShortName(aiProvider)}${getModelValue(currentModel) ? ` (${getModelValue(currentModel)})` : ''} model`,
          value: 'retry-current',
        },
        ...choices,
      ]
    }

    let promptMsg: string
    if (aiSuffix === null || aiSuffix === undefined) {
      promptMsg = `${shortName}${getModelValue(currentModel) ? ` (${getModelValue(currentModel)})` : ''} returned no suggestion. What would you like to do?`
    } else {
      const low = String(aiSuffix).toLowerCase()
      if (
        low.includes('rate') ||
        low.includes('quota') ||
        low.includes('insufficient') ||
        low.includes('payment') ||
        /subscription/.test(low)
      ) {
        // Rate/quota/subscription style problems
        promptMsg = `${shortName}${getModelValue(currentModel) ? ` (${getModelValue(currentModel)})` : ''} is limited (rate/quota). What would you like to do?`
      } else {
        // Generic fallback message
        promptMsg = `${shortName}${getModelValue(currentModel) ? ` (${getModelValue(currentModel)})` : ''} returned: ${aiSuffix}. What would you like to do?`
      }
    }

    const pick = await select(promptMsg, choices)

    if (pick === 'manual') {
      return null
    }

    if (pick === 'retry-current') {
      // Re-run generation with the same provider and model
      switch (aiProvider) {
        case 'gemini': {
          const gem = await import('../api/gemini.js')
          const { generateBranchName, generateCommitMessage } = gem
          const spinner = new ScrambleProgress()
          spinner.start([
            `retrying with ${getAIProviderShortName(aiProvider)}${getModelValue(currentModel) ? ` (${getModelValue(currentModel)})` : ''}...`,
          ])
          if (isCommit) {
            const res = await generateCommitMessage(
              diff || 'Code changes',
              correction,
              currentModel as GeminiModel
            )
            aiSuffix = res
          } else {
            const res = await generateBranchName(
              diff || 'Code changes',
              correction,
              currentModel as GeminiModel
            )
            aiSuffix = res
          }
          spinner.stop()
          break
        }
        case 'copilot': {
          const cop = await import('../api/copilot.js')
          const { generateBranchName, generateCommitMessage } = cop
          const spinner = new ScrambleProgress()
          spinner.start([
            `retrying with ${getAIProviderShortName(aiProvider)}${getModelValue(currentModel) ? ` (${getModelValue(currentModel)})` : ''}...`,
          ])
          if (isCommit) {
            const res = await generateCommitMessage(
              diff || 'Code changes',
              correction,
              currentModel as CopilotModel
            )
            aiSuffix = res
          } else {
            const res = await generateBranchName(
              diff || 'Code changes',
              correction,
              currentModel as CopilotModel
            )
            aiSuffix = res
          }
          spinner.stop()
          break
        }
        case 'openrouter': {
          const or = await import('../api/openrouter.js')
          const { generateBranchName, generateCommitMessage } = or
          const spinner = new ScrambleProgress()
          spinner.start([
            `retrying with ${getAIProviderShortName(aiProvider)}${getModelValue(currentModel) ? ` (${getModelValue(currentModel)})` : ''}...`,
          ])
          if (isCommit) {
            const res = await generateCommitMessage(
              diff || 'Code changes',
              correction,
              currentModel as OpenRouterModel
            )
            aiSuffix = res
          } else {
            const res = await generateBranchName(
              diff || 'Code changes',
              correction,
              currentModel as OpenRouterModel
            )
            aiSuffix = res
          }
          spinner.stop()
          break
        }
        default: {
          break
        }
      }

      // If retry produced a transient failure, record it to avoid immediate reselection
      if (isTransientFailure(aiSuffix) && typeof currentModel === 'string') {
        failedModels.add(currentModel)
      }

      continue
    }

    if (pick === 'different-model') {
      if (aiProvider === 'gemini') {
        const gem = await import('../api/gemini.js')
        const { generateBranchName, generateCommitMessage, getGeminiModels } = gem
        const models = await getGeminiModels()
        const gemOptions = models.some((m) => m.value === 'back')
          ? models
          : [...models, { label: 'Back to try again model selection', value: 'back' }]
        const chosen = await select('Choose a different Gemini model:', gemOptions)
        if (chosen === 'back') {
          continue // Go back to try again model selection
        }
        // user already selected a model from the menu — apply it immediately
        currentModel = chosen as GeminiModel
        updateModel?.('gemini', chosen as GeminiModel)
        const spinner = new ScrambleProgress()
        spinner.start([
          `${isCommit ? 'generating commit message' : 'generating branch name'} with Gemini (${chosen})...`,
        ])

        if (isCommit) {
          const res = await generateCommitMessage(diff, correction, chosen as GeminiModel)
          aiSuffix = res
        } else {
          const res = await generateBranchName(
            diff || 'Code changes',
            correction,
            chosen as GeminiModel
          )
          aiSuffix = res
        }
        spinner.stop()
        if (isTransientFailure(aiSuffix)) {
          failedModels.add(chosen as string)
        }
        continue
      }

      if (aiProvider === 'copilot') {
        const cop = await import('../api/copilot.js')
        const { generateBranchName, generateCommitMessage, getCopilotModels } = cop
        const models = await getCopilotModels()
        const copOptions = models.some((m) => m.value === 'back')
          ? models
          : [...models, { label: 'Back to try again model selection', value: 'back' }]
        const chosen = await select('Choose a different Copilot model:', copOptions)
        if (chosen === 'back') {
          continue // Go back to try again model selection
        }
        // user already selected a model from the menu — apply it immediately
        currentModel = chosen as CopilotModel
        updateModel?.('copilot', chosen as CopilotModel)
        const spinner = new ScrambleProgress()
        spinner.start([
          `${isCommit ? 'generating commit message' : 'generating branch name'} with GitHub (${chosen})...`,
        ])

        if (isCommit) {
          const res = await generateCommitMessage(diff, correction, chosen as CopilotModel)
          aiSuffix = res
        } else {
          const res = await generateBranchName(diff, correction, chosen as CopilotModel)
          aiSuffix = res
        }
        spinner.stop()
        if (isTransientFailure(aiSuffix)) {
          failedModels.add(chosen as string)
        }
        continue
      }

      if (aiProvider === 'openrouter') {
        const or = await import('../api/openrouter.js')
        const { generateBranchName, generateCommitMessage, getOpenRouterModels } = or
        const models = await getOpenRouterModels()
        const orOptions = models.some((m) => m.value === 'back')
          ? models
          : [...models, { label: 'Back to try again model selection', value: 'back' }]
        const chosen = await select('Choose a different OpenRouter model:', orOptions)
        if (chosen === 'back') {
          continue // Go back to try again model selection
        }
        // user already selected a model from the menu — apply it immediately
        currentModel = chosen as OpenRouterModel
        updateModel?.('openrouter', chosen as OpenRouterModel)
        const spinner = new ScrambleProgress()
        spinner.start([
          `${isCommit ? 'generating commit message' : 'generating branch name'} with OpenRouter (${chosen})...`,
        ])

        if (isCommit) {
          const res = await generateCommitMessage(diff, correction, chosen as OpenRouterModel)
          aiSuffix = res
        } else {
          const res = await generateBranchName(
            diff || 'Code changes',
            correction,
            chosen as OpenRouterModel
          )

          aiSuffix = res
        }
        if (isTransientFailure(aiSuffix)) {
          failedModels.add(chosen as string)
        }
        continue
      }
    }

    if (pick === 'different-provider') {
      const providers = ['gemini', 'copilot', 'openrouter'].filter((p) => p !== aiProvider)
      const providerOptions = providers.map((p) => ({
        label: getAIProviderDisplayName(p),
        value: p,
      }))
      const provOptionsWithBack = providerOptions.some((p) => p.value === 'back')
        ? providerOptions
        : [...providerOptions, { label: 'Back to try again model selection', value: 'back' }]
      const pickProv = await select('Choose AI provider:', provOptionsWithBack)
      if (pickProv === 'back') {
        continue // return to try-again model selection
      }

      if (pickProv === 'gemini') {
        // user selected Gemini provider — allow model choice and apply immediately
        log.info(`Selected AI Provider: Gemini`)
        const { ensureAIProvider } = await import('../core/setup.js')
        const geminiReady = await ensureAIProvider('gemini')
        if (!geminiReady) {
          continue
        }
        const gem = await import('../api/gemini.js')
        const models = await gem.getGeminiModels()
        const gemOptions = models.some((m) => m.value === 'back')
          ? models
          : [...models, { label: 'Back to try again model selection', value: 'back' }]
        const chosenModel = await select('Choose Gemini model:', gemOptions)
        if (chosenModel === 'back') {
          continue // Go back to try again model selection
        }
        // set active provider + model for subsequent retries
        aiProvider = 'gemini'
        currentModel = chosenModel as GeminiModel
        updateModel?.('gemini', chosenModel as GeminiModel)
        const spinner = new ScrambleProgress()
        spinner.start([
          `${isCommit ? 'generating commit message' : 'generating branch name'} with Gemini (${chosenModel})...`,
        ])

        if (isCommit) {
          // Use built-in Gemini API for commit generation
          const res = await gem.generateCommitMessage(diff, correction, chosenModel as GeminiModel)
          aiSuffix = res
        } else {
          const res = await gem.generateBranchName(diff, correction, chosenModel as GeminiModel)
          aiSuffix = res
        }
        spinner.stop()
      } else if (pickProv === 'copilot') {
        log.info(`Selected AI Provider: Copilot`)
        const { ensureAIProvider } = await import('../core/setup.js')
        const copilotReady = await ensureAIProvider('copilot')
        if (!copilotReady) {
          continue
        }
        const cop = await import('../api/copilot.js')
        const { getCopilotModels, generateBranchName, generateCommitMessage } = cop
        const models = await getCopilotModels()
        const copOptions = models.some((m) => m.value === 'back')
          ? models
          : [...models, { label: 'Back to try again model selection', value: 'back' }]
        const chosen = await select('Choose Copilot model:', copOptions)
        if (chosen === 'back') {
          continue // Go back to try again model selection
        }

        // user already selected a model from the menu — apply it immediately
        aiProvider = 'copilot'
        currentModel = chosen as CopilotModel
        updateModel?.('copilot', chosen as CopilotModel)
        const spinner = new ScrambleProgress()
        spinner.start([
          `${isCommit ? 'generating commit message' : 'generating branch name'} with GitHub (${chosen})...`,
        ])

        if (isCommit) {
          const res = await generateCommitMessage(diff, correction, chosen as CopilotModel)
          aiSuffix = res
        } else {
          const res = await generateBranchName(diff, correction, chosen as CopilotModel)
          aiSuffix = res
        }
        spinner.stop()
      } else {
        log.info(`Selected AI Provider: OpenRouter`)
        const { ensureAIProvider } = await import('../core/setup.js')
        const openrouterReady = await ensureAIProvider('openrouter')
        if (!openrouterReady) {
          continue
        }
        const or = await import('../api/openrouter.js')
        const { generateBranchName, generateCommitMessage, getOpenRouterModels } = or
        const models = await getOpenRouterModels()
        const orOptions = models.some((m) => m.value === 'back')
          ? models
          : [...models, { label: 'Back to try again model selection', value: 'back' }]
        const chosen = await select('Choose OpenRouter Model:', orOptions)
        if (chosen === 'back') {
          continue // Go back to try again model selection
        }
        // user already selected a model from the menu — apply it immediately
        aiProvider = 'openrouter'
        currentModel = chosen as OpenRouterModel
        updateModel?.('openrouter', chosen as OpenRouterModel)
        const spinner = new ScrambleProgress()
        spinner.start([
          `${isCommit ? 'generating commit message' : 'generating branch name'} with OpenRouter (${chosen})...`,
        ])

        if (isCommit) {
          const res = await generateCommitMessage(diff, correction, chosen as OpenRouterModel)
          aiSuffix = res
        } else {
          const res = await generateBranchName(diff, correction, chosen as OpenRouterModel)
          aiSuffix = res
        }
        spinner.stop()
      }

      continue
    }
  }
}

export async function getBranchNameFromDiffUsingProvider(
  provider: 'gemini' | 'copilot' | 'openrouter',
  diff: string,
  correction?: string,
  copilotModel?: CopilotModel,
  openrouterModel?: OpenRouterModel
): Promise<string | null> {
  return generateBranchNameWithProvider(provider, diff, correction, copilotModel, openrouterModel)
}

/**
 * Ensure provider setup and prompt the user to choose a model for that provider.
 * Returns the chosen model value string or 'back' if the user went back, or undefined if setup failed.
 */
export async function chooseModelForProvider(
  provider: 'gemini' | 'copilot' | 'openrouter',
  prompt?: string,
  backLabel?: string
): Promise<string | 'back' | undefined> {
  if (provider === 'copilot') {
    log.info(`Selected AI Provider: Copilot`)

    const { ensureAIProvider } = await import('../core/setup.js')
    const ready = await ensureAIProvider(provider)
    if (!ready) {
      return undefined
    }

    const cop = await import('../api/copilot.js')
    const models = (await cop.getCopilotModels()) as Array<{ label: string; value: string }>

    // Check if no models are available (SDK not installed or not functioning)
    if (models.length === 0) {
      log.warn('⚠ Copilot SDK not available.')
      console.log('')
      log.info('The Copilot CLI is required to use Copilot models.')
      console.log('')

      const { confirm } = await import('../cli/input.js')
      const shouldInstall = confirm('Setup Copilot CLI now?')

      if (shouldInstall) {
        console.log('')
        // Use the comprehensive setup helper instead of manual exec
        const { setupGitHubCopilotInteractive } = await import('../core/copilot-setup.js')
        const setupSuccess = await setupGitHubCopilotInteractive()

        if (setupSuccess) {
          console.log('')
          log.info('Verifying Copilot models...')
          // Re-check if models are now available
          const modelsAfterInstall = (await cop.getCopilotModels()) as Array<{
            label: string
            value: string
          }>
          if (modelsAfterInstall.length > 0) {
            const options = modelsAfterInstall.some((m) => m.value === 'back')
              ? modelsAfterInstall
              : [...modelsAfterInstall, { label: backLabel ?? 'Back', value: 'back' }]
            const { select } = await import('../cli/menu.js')
            const chosen = await select(prompt ?? 'Choose Copilot model:', options)
            return chosen as string | 'back'
          } else {
            log.warn('⚠ Installation completed but models still not available.')
            log.info('You may need to restart your terminal or check your installation.')
            return 'back'
          }
        } else {
          log.info('Setup was not completed. Returning to provider selection.')
          return 'back'
        }
      } else {
        log.info('Setup skipped. Returning to provider selection.')
        return 'back'
      }
    }

    const options = models.some((m) => m.value === 'back')
      ? models
      : [...models, { label: backLabel ?? 'Back', value: 'back' }]
    const { select } = await import('../cli/menu.js')
    const chosen = await select(prompt ?? 'Choose Copilot model:', options)
    return chosen as string | 'back'
  }

  if (provider === 'openrouter') {
    log.info(`Selected AI Provider: OpenRouter`)

    const { ensureAIProvider } = await import('../core/setup.js')
    const ready = await ensureAIProvider(provider)
    if (!ready) {
      return undefined
    }

    const or = await import('../api/openrouter.js')
    const models = (await or.getOpenRouterModels()) as Array<{ label: string; value: string }>

    // Check if no models are available
    if (models.length === 0) {
      log.warn('⚠ No OpenRouter models available.')
      return undefined
    }

    const options = models.some((m) => m.value === 'back')
      ? models
      : [...models, { label: backLabel ?? 'Back', value: 'back' }]
    const { select } = await import('../cli/menu.js')
    const chosen = await select(prompt ?? 'Choose OpenRouter model:', options)
    return chosen as string | 'back'
  }

  // Gemini
  log.info(`Selected AI Provider: Gemini`)

  const { ensureAIProvider } = await import('../core/setup.js')
  const ready = await ensureAIProvider(provider)
  if (!ready) {
    return undefined
  }

  const gm = await import('../api/gemini.js')
  const models = (await gm.getGeminiModels()) as Array<{ label: string; value: string }>

  // Check if no models are available
  if (models.length === 0) {
    log.warn('⚠ No Gemini models available.')
    return undefined
  }

  const options = models.some((m) => m.value === 'back')
    ? models
    : [...models, { label: backLabel ?? 'Back', value: 'back' }]
  const { select } = await import('../cli/menu.js')
  const chosen = await select(prompt ?? 'Choose Gemini model:', options)
  return chosen as string | 'back'
}
