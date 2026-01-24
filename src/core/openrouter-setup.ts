/**
 * OpenRouter integration setup
 */

import fs from 'node:fs'

import { askQuestion, confirm } from '../cli/input.js'
import { ensureGeetoIgnored, getOpenRouterConfigPath } from '../utils/config.js'
import { log } from '../utils/logging.js'

/**
 * Setup OpenRouter config interactively
 */
export const setupOpenRouterConfigInteractive = (): boolean => {
  const configPath = getOpenRouterConfigPath()
  // If config already exists, nothing to do
  try {
    if (fs.existsSync(configPath)) {
      log.success('OpenRouter API configuration is ready!')
      return true
    }
  } catch {
    // fall through to interactive setup
  }

  log.info('OpenRouter integration is not configured for this project.\n')

  log.info('OpenRouter provides access to various AI models through a single API key.')
  log.info('Some models are free, while others may require credits from your OpenRouter account.')
  log.info(
    'Note: Even models marked as "free" may require account verification or limited credits.'
  )
  log.info('Supported models include: Llama, Mistral, Gemma, WizardLM, and many more.')
  log.info('You need an OpenRouter API key to use this service.')
  log.info('Visit https://openrouter.ai/ to create an account and get your API key.\n')
  log.info(`The OpenRouter API key will be saved to: ${getOpenRouterConfigPath()}`)

  const shouldSetup = confirm('Setup OpenRouter integration now?')
  if (!shouldSetup) {
    return false
  }

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false)
  }

  const openrouterKey = askQuestion('Enter OpenRouter API Key: ').trim()

  if (!openrouterKey) {
    log.warn('No API key provided. OpenRouter setup cancelled.')
    return false
  }

  const path = getOpenRouterConfigPath()
  const configDir = path.slice(0, path.lastIndexOf('/'))

  // Ensure .geeto is in .gitignore
  ensureGeetoIgnored()

  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
      log.success(`Created config directory: ${configDir}`)
    }
  } catch (error) {
    log.error(`Failed to create config directory: ${(error as Error).message}`)
    return false
  }

  const configContent = `# Geeto OpenRouter Configuration
# Generated on ${new Date().toISOString()}
# API key for OpenRouter (access to multiple free AI models)

openrouter_api_key = "${openrouterKey}"
`

  try {
    fs.writeFileSync(path, configContent, 'utf8')
    log.success(`OpenRouter config saved to: ${path}`)

    // Write a default OpenRouter model list so users have options
    try {
      const modelFile = `${configDir}/openrouter-model.json`
      const defaultModels = [
        {
          label: 'WizardLM 2 8x22B (microsoft/wizardlm-2-8x22b)',
          value: 'microsoft/wizardlm-2-8x22b',
        },
        {
          label: 'Olmo 3.1 32B (allenai/olmo-3.1-32b-instruct)',
          value: 'allenai/olmo-3.1-32b-instruct',
        },
        { label: 'Molmo2 8B (allenai/molmo-2-8b:free)', value: 'allenai/molmo-2-8b:free' },
        {
          label: 'Llama 3.2 3B (meta-llama/llama-3.2-3b-instruct:free)',
          value: 'meta-llama/llama-3.2-3b-instruct:free',
        },
        {
          label: 'Claude Sonnet 4.5 (anthropic/claude-sonnet-4.5)',
          value: 'anthropic/claude-sonnet-4.5',
        },
        {
          label: 'Claude Sonnet 4 (anthropic/claude-sonnet-4)',
          value: 'anthropic/claude-sonnet-4',
        },
        {
          label: 'Claude 4.5 Haiku (anthropic/claude-4.5-haiku)',
          value: 'anthropic/claude-4.5-haiku',
        },
        { label: 'GPT-5 (openai/gpt-5)', value: 'openai/gpt-5' },
        { label: 'GPT-5.2-Codex (openai/gpt-5.2-codex)', value: 'openai/gpt-5.2-codex' },
      ]
      if (fs.existsSync(modelFile)) {
        log.info(`OpenRouter model file already exists, skipping: ${modelFile}`)
      } else {
        fs.writeFileSync(modelFile, JSON.stringify(defaultModels, null, 2), 'utf8')
        log.info(`Wrote default OpenRouter model list to: ${modelFile}`)
      }
    } catch {
      /* ignore model file write failures */
    }

    return true
  } catch (error) {
    log.error(`Failed to save config: ${(error as Error).message}`)
    return false
  }
}
