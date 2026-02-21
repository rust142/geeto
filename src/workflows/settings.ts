/**
 * Settings workflow - handles all settings menu interactions
 */

import { existsSync, unlinkSync } from 'node:fs'
import path from 'node:path'

import { askQuestion, confirm } from '../cli/input.js'
import { select } from '../cli/menu.js'
import { colors } from '../utils/colors.js'
import {
  getBranchStrategyConfig,
  getProtectedBranches,
  hasGeminiConfig,
  hasTrelloConfig,
  saveBranchStrategyConfig,
} from '../utils/config.js'
import { log } from '../utils/logging.js'

const configDirPath = () => path.join(process.cwd(), '.geeto')

const configFilePath = (name: string) => path.join(configDirPath(), `${name}.toml`)

const removeConfigFile = (name: string): boolean => {
  const p = configFilePath(name)
  if (existsSync(p)) {
    unlinkSync(p)
    return true
  }
  return false
}

const runInteractiveSetup = async (name: 'trello' | 'openrouter' | 'gemini') => {
  if (name === 'trello') {
    const { setupTrelloConfigInteractive } = await import('../core/trello-setup.js')
    const trelloSetupSuccess = setupTrelloConfigInteractive()
    if (trelloSetupSuccess) {
      log.success('Trello integration configured!')
    } else {
      log.warn('Trello setup failed or cancelled.')
    }
    return
  }

  if (name === 'gemini') {
    const { setupGeminiConfigInteractive } = await import('../core/gemini-setup.js')
    const geminiSetupSuccess = setupGeminiConfigInteractive()
    if (geminiSetupSuccess) {
      log.success('Gemini AI integration configured!')
    } else {
      log.warn('Gemini setup failed or cancelled.')
    }
    return
  }

  const { setupOpenRouterConfigInteractive } = await import('../core/openrouter-setup.js')
  const openRouterSetupSuccess = setupOpenRouterConfigInteractive()
  if (openRouterSetupSuccess) {
    log.success('OpenRouter integration configured!')
  } else {
    log.warn('OpenRouter setup failed or cancelled.')
  }
}

const handleSeparatorSetting = async (): Promise<boolean | void> => {
  const separatorChoice = await select('Choose branch name separator:', [
    { label: 'Hyphen (kebab-case): my-branch-name', value: 'hyphen' },
    { label: 'Underscore (snake_case): my_branch_name', value: 'underscore' },
    { label: 'Back to settings menu', value: 'back' },
  ])

  if (separatorChoice === 'back') {
    return true
  }

  const separator = separatorChoice === 'hyphen' ? '-' : '_'
  const config = getBranchStrategyConfig()
  if (config) {
    config.separator = separator
    saveBranchStrategyConfig(config)
  } else {
    saveBranchStrategyConfig({ separator })
  }

  log.success(`Branch separator set to: ${separator === '-' ? 'hyphen (-)' : 'underscore (_)'} `)
  // Explicitly return false to indicate "do not go back" to caller
  return false
}

/**
 * Handle protected branches configuration
 */
const handleProtectedBranchesSetting = async (): Promise<boolean | void> => {
  const currentProtected = getProtectedBranches()

  console.log('')
  log.info(
    `Current protected branches: ${colors.cyan}${currentProtected.join(', ')}${colors.reset}`
  )
  console.log(`${colors.gray}  (These branches are excluded from cleanup)${colors.reset}`)
  console.log('')

  const action = await select('What would you like to do?', [
    { label: 'Add branches', value: 'add' },
    { label: 'Reset to defaults', value: 'reset' },
    { label: 'Back to settings menu', value: 'back' },
  ])

  if (action === 'back') {
    return true
  }

  const config = getBranchStrategyConfig()

  if (action === 'reset') {
    if (config) {
      config.protectedBranches = undefined
      saveBranchStrategyConfig(config)
    }
    log.success('Protected branches reset to defaults: main, master, development, develop, dev')
    return false
  }

  // Add branches
  const input = askQuestion('Enter branch names to protect (comma separated): ')
  const newBranches = input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  if (newBranches.length === 0) {
    log.warn('No branches entered.')
    return false
  }

  // Merge with existing custom branches
  const existingCustom = config?.protectedBranches ?? []
  const merged = [...new Set([...existingCustom, ...newBranches])]

  if (config) {
    config.protectedBranches = merged
    saveBranchStrategyConfig(config)
  } else {
    saveBranchStrategyConfig({ separator: '-', protectedBranches: merged })
  }

  const allProtected = getProtectedBranches()
  const updatedList = `${colors.cyan}${allProtected.join(', ')}${colors.reset}`
  log.success(`Protected branches updated: ${updatedList}`)
  return false
}

// Sync OpenRouter models (fetch & persist detailed + simple lists)
const syncOpenRouterModels = async (): Promise<void> => {
  try {
    // Dynamically import SDK wrapper
    let sdkModule: unknown = null
    try {
      sdkModule = await import('../api/openrouter-sdk.js')
    } catch {
      log.warn('OpenRouter SDK unavailable; cannot get live sample models from SDK.')
      // Fall back to existing persisted-file behavior
    }

    const sdk = sdkModule as { getAvailableModelChoices?: () => Promise<unknown> }
    const fs = await import('node:fs')
    const outDir = path.join(process.cwd(), '.geeto')
    await fs.promises.mkdir(outDir, { recursive: true })

    if (sdk && typeof sdk.getAvailableModelChoices === 'function') {
      try {
        const detailed = (await sdk.getAvailableModelChoices()) as Array<
          Record<string, unknown>
        > | null
        if (Array.isArray(detailed) && detailed.length > 0) {
          // Persist detailed sync file
          const syncFile = path.join(outDir, 'openrouter-model-live-sample.json')
          await fs.promises.writeFile(syncFile, JSON.stringify(detailed, null, 2))

          // Persist simplified file used by getOpenRouterModels
          type SimpleModel = { name?: string; label?: string; value?: string }
          const filtered = detailed.filter(
            (d) =>
              (d.value as string) === 'microsoft/wizardlm-2-8x22b' ||
              (d.value as string) === 'allenai/olmo-3-32b-think' ||
              (d.value as string) === 'allenai/molmo-2-8b' ||
              (d.value as string) === 'meta-llama/llama-3.2-3b-instruct' ||
              (d.value as string) === 'anthropic/claude-sonnet-4.5' ||
              (d.value as string) === 'anthropic/claude-sonnet-4' ||
              (d.value as string) === 'anthropic/claude-haiku-4.5' ||
              (d.value as string) === 'openai/gpt-5' ||
              (d.value as string) === 'openai/gpt-5.2-codex'
          ) as SimpleModel[]

          // Renumber auto-numbered labels sequentially

          const hasAutoNumber = filtered.some((d: SimpleModel) =>
            /^\s*\d+\./.test(String(d.label ?? d.name ?? d.value))
          )

          const simple = filtered.map((d: SimpleModel, idx: number) => {
            const rawLabel = String(d.label ?? d.name ?? d.value)
            const label = hasAutoNumber
              ? rawLabel.replace(/^\s*\d+\.\s*/, `${idx + 1}. `)
              : rawLabel
            return {
              label,
              value: d.value,
            }
          })

          const modelFile = path.join(outDir, 'openrouter-model.json')
          await fs.promises.writeFile(modelFile, JSON.stringify(simple, null, 2))

          log.info(
            `Synced ${detailed.length} OpenRouter model(s) to .geeto/openrouter-model.json ` +
              '(and _live-sample.json).'
          )
          return
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error)
        log.warn(`Failed to fetch OpenRouter models from SDK: ${msg}`)
      }
    }

    // SDK unavailable or no models; fall back to persisted file/guidance
    const modelFilePath = path.join(outDir, 'openrouter-model.json')
    if (fs.existsSync(modelFilePath)) {
      try {
        const raw = fs.readFileSync(modelFilePath, 'utf8')
        const parsed = JSON.parse(raw) as Array<{ label?: string; value?: string }>
        if (Array.isArray(parsed) && parsed.length > 0) {
          log.info(`Found ${parsed.length} OpenRouter model(s) in .geeto/openrouter-model.json:`)
          for (const m of parsed) {
            log.info(` - ${m.label ?? m.value ?? JSON.stringify(m)}`)
          }
          log.info(
            'No new sync performed; using existing persisted OpenRouter model configuration.'
          )
          return
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error)
        log.warn(`Could not read OpenRouter model config: ${msg}`)
      }
    }

    log.info('No OpenRouter model configuration found and no SDK sync possible.')
    log.info('Run the sync again after installing/configuring the OpenRouter SDK to fetch models.')
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    log.warn(`OpenRouter model sync failed: ${msg}`)
  }
}

const handleModelResetSetting = async (): Promise<boolean | void> => {
  const resetChoice = await select('Sync model configurations (non-destructive):', [
    { label: 'Sync only OpenRouter models', value: 'openrouter' },
    { label: 'Back to settings menu', value: 'back' },
  ])

  if (resetChoice === 'back') {
    return true
  }

  try {
    if (resetChoice === 'openrouter') {
      log.info('⏳ Syncing OpenRouter models...')
      await syncOpenRouterModels()
    }

    log.success('Model sync completed!')
  } catch (error) {
    log.error(`Model sync failed: ${error}`)
  }

  // Explicitly return false when leaving handler without going back
  return false
}

/**
 * Change provider/model (interactive)
 */
const handleChangeModelSetting = async (): Promise<boolean | void> => {
  const { chooseModelForProvider } = await import('../utils/git-ai.js')
  const provOptions = [
    { label: 'Gemini', value: 'gemini' },
    { label: 'Copilot', value: 'copilot' },
    { label: 'OpenRouter', value: 'openrouter' },
    { label: 'Back to settings menu', value: 'back' },
  ]

  const chosenProv = await select('Choose provider to change model for:', provOptions)
  if (chosenProv === 'back') {
    // User explicitly asked to go back to settings menu
    return true
  }

  const picked = await chooseModelForProvider(
    chosenProv as 'gemini' | 'copilot' | 'openrouter',
    undefined,
    'Back to settings menu'
  )
  if (picked === 'back') {
    log.info('Model change cancelled.')
    return true
  }
  if (picked === undefined) {
    log.warn('Provider setup not available; cannot change model.')
    return false
  }

  // Persist choice into checkpoint state so it is used next run
  const stateModule = await import('../utils/state.js')
  const { loadState, saveState } = stateModule
  const existing = loadState()
  const now = new Date().toISOString()

  const base = existing ?? {
    step: 0,
    workingBranch: '',
    targetBranch: '',
    currentBranch: '',
    timestamp: now,
    aiProvider: chosenProv as 'gemini' | 'copilot' | 'openrouter' | 'manual',
    copilotModel: undefined,
    openrouterModel: undefined,
    geminiModel: undefined,
  }

  base.aiProvider = chosenProv as 'gemini' | 'copilot' | 'openrouter' | 'manual'

  switch (chosenProv) {
    case 'copilot': {
      base.copilotModel = picked as string
      base.openrouterModel = undefined
      base.geminiModel = undefined
      break
    }
    case 'openrouter': {
      base.openrouterModel = picked as string
      base.copilotModel = undefined
      base.geminiModel = undefined
      break
    }
    case 'gemini': {
      base.geminiModel = picked as string
      base.copilotModel = undefined
      base.openrouterModel = undefined
      break
    }
    default: {
      break
    }
  }

  base.timestamp = now

  saveState(base)
  const providerLabel =
    chosenProv === 'copilot' ? 'Copilot' : chosenProv === 'gemini' ? 'Gemini' : 'OpenRouter'
  log.success(`Set ${providerLabel} model to: ${picked}`)
  // Done; do not go back to settings menu
  return false
}
const handleGeminiSetting = async (): Promise<boolean | void> => {
  const hasConfig = hasGeminiConfig()

  if (!hasConfig) {
    const spinner = log.spinner()
    spinner.start('Setting up Gemini AI integration...')
    await runInteractiveSetup('gemini')
    spinner.stop()
    return false
  }

  const action = await select(
    'Gemini AI integration is already configured. What would you like to do?',
    [
      { label: 'Reconfigure (replace existing config)', value: 'reconfigure' },
      { label: 'Remove configuration', value: 'remove' },
      { label: 'Back to settings menu', value: 'back' },
    ]
  )

  if (action === 'reconfigure') {
    log.info('Reconfiguring Gemini AI integration...')
    if (removeConfigFile('gemini')) {
      log.info('Cleared existing Gemini configuration')
    }

    const { setupGeminiConfigInteractive } = await import('../core/gemini-setup.js')
    const setupSuccess = setupGeminiConfigInteractive()
    if (setupSuccess) {
      log.success('Gemini AI integration reconfigured!')
    } else {
      log.warn('Gemini setup failed or cancelled.')
    }
  } else if (action === 'remove') {
    const confirmRemove = confirm('Are you sure you want to remove Gemini configuration?')
    if (confirmRemove) {
      if (removeConfigFile('gemini')) {
        log.success('Gemini configuration removed!')
      } else {
        log.warn('Failed to remove Gemini configuration.')
      }
    }
  }
  if (action === 'back') {
    return true
  }

  // Completed without returning to settings menu
  return false
}

const handleTrelloSetting = async (): Promise<boolean | void> => {
  const hasConfig = hasTrelloConfig()

  if (!hasConfig) {
    await runInteractiveSetup('trello')
    return false
  }

  const action = await select(
    'Trello integration is already configured. What would you like to do?',
    [
      { label: 'Reconfigure (replace existing config)', value: 'reconfigure' },
      { label: 'Remove configuration', value: 'remove' },
      { label: 'Back to settings menu', value: 'back' },
    ]
  )

  if (action === 'reconfigure') {
    log.info('Reconfiguring Trello integration...')
    if (removeConfigFile('trello')) {
      log.info('Cleared existing Trello configuration')
    }

    const { setupTrelloConfigInteractive } = await import('../core/trello-setup.js')
    const setupSuccess = setupTrelloConfigInteractive()
    if (setupSuccess) {
      log.success('Trello integration reconfigured!')
    } else {
      log.warn('Trello setup failed or cancelled.')
    }
  } else if (action === 'remove') {
    const confirmRemove = confirm('Are you sure you want to remove Trello configuration?')
    if (!confirmRemove) {
      return false
    }
    if (removeConfigFile('trello')) {
      log.success('Trello configuration removed!')
    } else {
      log.info('No Trello configuration found to remove')
    }
  }
  if (action === 'back') {
    return true
  }

  // Completed without returning to settings menu
  return false
}

const handleOpenRouterSetting = async (): Promise<boolean | void> => {
  const { hasOpenRouterConfig } = await import('../utils/config.js')
  const hasConfig = hasOpenRouterConfig()

  if (!hasConfig) {
    await runInteractiveSetup('openrouter')
    return false
  }

  const action = await select(
    'OpenRouter integration is already configured. What would you like to do?',
    [
      { label: 'Reconfigure (replace existing config)', value: 'reconfigure' },
      { label: 'Remove configuration', value: 'remove' },
      { label: 'Back to settings menu', value: 'back' },
    ]
  )

  if (action === 'reconfigure') {
    log.info('Reconfiguring OpenRouter integration...')
    if (removeConfigFile('openrouter')) {
      log.info('Cleared existing OpenRouter configuration')
    }
    await runInteractiveSetup('openrouter')
    log.success('OpenRouter integration reconfigured!')
  } else if (action === 'remove') {
    const confirmRemove = confirm('Are you sure you want to remove OpenRouter configuration?')
    if (!confirmRemove) {
      return false
    }
    if (removeConfigFile('openrouter')) {
      log.success('OpenRouter configuration removed!')
    } else {
      log.info('No OpenRouter configuration found to remove')
    }
  }
  if (action === 'back') {
    return true
  }

  // Completed without returning to settings menu
  return false
}

export const showSettingsMenu = async () => {
  while (true) {
    log.info('Settings Menu')

    const settingChoice = await select('Choose a setting to configure:', [
      { label: 'Branch separator (hyphen/underscore)', value: 'separator' },
      { label: 'Protected branches', value: 'protected' },
      { label: 'Sync model configurations (fetch live sample models)', value: 'models' },
      { label: 'Change AI provider / model', value: 'change-model' },
      { label: 'Gemini AI setup', value: 'gemini' },
      { label: 'OpenRouter AI setup', value: 'openrouter' },
      { label: 'Trello integration setup', value: 'trello' },
      { label: 'Back to main menu', value: 'back' },
    ])

    if (settingChoice === 'back') {
      break
    }

    if (settingChoice === 'separator') {
      const back = await handleSeparatorSetting()
      if (back) {
        continue
      }
    }
    if (settingChoice === 'protected') {
      const back = await handleProtectedBranchesSetting()
      if (back) {
        continue
      }
    }
    if (settingChoice === 'models') {
      const back = await handleModelResetSetting()
      if (back) {
        continue
      }
    }
    if (settingChoice === 'change-model') {
      const back = await handleChangeModelSetting()
      if (back) {
        // user chose to go back from within handler — return to settings menu
        continue
      }
    }
    if (settingChoice === 'gemini') {
      const back = await handleGeminiSetting()
      if (back) {
        continue
      }
    }
    if (settingChoice === 'trello') {
      const back = await handleTrelloSetting()
      if (back) {
        continue
      }
    }
    if (settingChoice === 'openrouter') {
      const back = await handleOpenRouterSetting()
      if (back) {
        continue
      }
    }

    console.log('')
    // Ask if user wants to continue with settings
    const continueSettings = confirm('Configure another setting?')
    if (!continueSettings) {
      break
    }
  }
}

export {
  handleSeparatorSetting,
  handleProtectedBranchesSetting,
  handleModelResetSetting,
  handleChangeModelSetting,
  handleGeminiSetting,
  handleOpenRouterSetting,
  handleTrelloSetting,
}
