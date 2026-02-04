import type { CopilotModel } from '../api/copilot.js'
import type { GeminiModel } from '../api/gemini.js'
import type { OpenRouterModel } from '../api/openrouter.js'

import { DEFAULT_GEMINI_MODEL } from './config.js'
import { log } from '../utils/logging.js'

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
      return 'GitHub Copilot (Recommended)'
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
      return 'GitHub Copilot'
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

/**
 * Heuristics to detect transient AI errors (rate limits, quota, billing).
 */
export const isTransientAIFailure = (s: string | null | undefined): boolean => {
  // Empty/null isn't considered transient; callers decide whether to fallback
  if (!s) {
    return false
  }

  const low = String(s).toLowerCase()

  // If the assistant returns something that looks like a model name, it's probably not
  if (low.includes('-') || low.includes('_')) {
    const allowed = /^[\d_a-z-]+$/.test(low)
    const hasToken = low.split(/[_-]/).every((t) => t.length > 0)
    if (allowed && hasToken) {
      return false
    }
  }

  if (/rate[\s_-]?limit(ed)?/.test(low)) {
    return true
  }

  if (/quota/.test(low)) {
    return true
  }

  if (/insufficient\s+credit|insufficient\s+credits|out\s+of\s+credits|out_of_credits/.test(low)) {
    return true
  }

  if (/payment\s+required|payment\s+failed|billing/.test(low)) {
    return true
  }

  const subscriptionPattern =
    /subscription\s+required|requires\s+subscription|must\s+upgrade|upgrade\s+required/
  if (subscriptionPattern.test(low)) {
    return true
  }

  if (/not a valid model|model not found|invalid model id|model.*not found/.test(low)) {
    return true
  }

  return false
}

/** Detect errors caused by model/context token length limits. */
export const isContextLimitFailure = (s: string | null | undefined): boolean => {
  if (!s) {
    return false
  }

  const low = String(s).toLowerCase()

  // Common phrases from OpenRouter/Gemini/OpenAI about context length / token limits
  if (low.includes('maximum context length') || low.includes('context length is')) {
    return true
  }

  if (low.includes('requested about') && low.includes('tokens')) {
    return true
  }

  if (low.includes('middle-out')) {
    return true
  }

  if (low.includes('context window') || low.includes('token limit')) {
    return true
  }

  if (low.includes('large') || low.includes('many files')) {
    return true
  }

  // fallback: mention of tokens + too many/too long
  if (
    low.includes('tokens') &&
    (low.includes('too') || low.includes('exceed') || low.includes('exceeded'))
  ) {
    return true
  }

  return false
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
          const spinner = log.spinner()
          spinner.start(
            `Retrying with ${getAIProviderShortName(aiProvider)}${getModelValue(currentModel) ? ` (${getModelValue(currentModel)})` : ''}...`
          )
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
          const spinner = log.spinner()
          spinner.start(
            `Retrying with ${getAIProviderShortName(aiProvider)}${getModelValue(currentModel) ? ` (${getModelValue(currentModel)})` : ''}...`
          )
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
          const spinner = log.spinner()
          spinner.start(
            `Retrying with ${getAIProviderShortName(aiProvider)}${getModelValue(currentModel) ? ` (${getModelValue(currentModel)})` : ''}...`
          )
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
        const spinner = log.spinner()
        spinner.start(
          `${isCommit ? 'Generating commit message' : 'Generating branch name'} with Gemini (${chosen})...`
        )

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
        const spinner = log.spinner()
        spinner.start(
          `${isCommit ? 'Generating commit message' : 'Generating branch name'} with GitHub Copilot (${chosen})...`
        )

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
        const spinner = log.spinner()
        spinner.start(
          `${isCommit ? 'Generating commit message' : 'Generating branch name'} with OpenRouter (${chosen})...`
        )

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
        const spinner = log.spinner()
        spinner.start(
          `${isCommit ? 'Generating commit message' : 'Generating branch name'} with Gemini (${chosenModel})...`
        )

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
        const spinner = log.spinner()
        spinner.start(
          `${isCommit ? 'Generating commit message' : 'Generating branch name'} with GitHub Copilot (${chosen})...`
        )

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
        const spinner = log.spinner()
        spinner.start(
          `${isCommit ? 'Generating commit message' : 'Generating branch name'} with OpenRouter (${chosen})...`
        )

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
  const options = models.some((m) => m.value === 'back')
    ? models
    : [...models, { label: backLabel ?? 'Back', value: 'back' }]
  const { select } = await import('../cli/menu.js')
  const chosen = await select(prompt ?? 'Choose Gemini model:', options)
  return chosen as string | 'back'
}
