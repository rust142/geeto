/**
 * OpenRouter integration setup
 */

import fs from 'node:fs'
import path from 'node:path'

import { askQuestion, confirm } from '../cli/input.js'
import { GLOBAL_GEETO_DIR, resolveConfigPath } from '../utils/config.js'
import { openBrowser } from '../utils/exec.js'
import { log } from '../utils/logging.js'

/**
 * Setup OpenRouter config interactively
 */
export const setupOpenRouterConfigInteractive = (): boolean => {
  try {
    if (fs.existsSync(resolveConfigPath('openrouter.toml'))) return true
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
  log.info(
    'The OpenRouter API key will be saved to .geeto/openrouter.toml (or ~/.geeto/ globally).'
  )

  const shouldSetup = confirm('Setup OpenRouter integration now?')
  if (!shouldSetup) return false

  const openKeyPage = confirm('Open OpenRouter API key page in your browser?')
  if (openKeyPage) {
    const opened = openBrowser('https://openrouter.ai/keys')
    if (opened) {
      log.success('Opened API key page in your browser')
    } else {
      log.warn('Could not open browser\u2014please visit https://openrouter.ai/keys manually')
    }
  }

  if (process.stdin.isTTY) process.stdin.setRawMode(false)

  const openrouterKey = askQuestion('Enter OpenRouter API Key: ').trim()
  if (!openrouterKey) {
    log.warn('No API key provided. OpenRouter setup cancelled.')
    return false
  }

  if (!openrouterKey.startsWith('sk-or-')) {
    log.warn('API key format looks unusual (expected: starts with "sk-or-").')
    log.info('Saving anyway\u2014if authentication fails, re-run setup with a valid key.')
  }

  const configDir = GLOBAL_GEETO_DIR
  const configPath = path.join(configDir, 'openrouter.toml')

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
    fs.writeFileSync(configPath, configContent, 'utf8')
    log.success(`OpenRouter config saved to: ${configPath}`)

    try {
      const modelFile = path.join(configDir, 'openrouter-model.json')
      const defaultModels = [
        { label: 'Claude Sonnet 4', value: 'anthropic/claude-sonnet-4' },
        { label: 'Claude Haiku 4.5', value: 'anthropic/claude-haiku-4.5' },
        { label: 'GPT-4o', value: 'openai/gpt-4o' },
        { label: 'GPT-4.1', value: 'openai/gpt-4.1' },
        { label: 'GPT-5 Mini', value: 'openai/gpt-5-mini' },
        { label: 'Gemini 2.5 Flash', value: 'google/gemini-2.5-flash' },
      ]
      fs.writeFileSync(modelFile, JSON.stringify(defaultModels, null, 2), 'utf8')
      log.info(`Saved recommended OpenRouter models to: ${modelFile}`)
    } catch {
      /* ignore model file write failures */
    }

    return true
  } catch (error) {
    log.error(`Failed to save config: ${(error as Error).message}`)
    return false
  }
}
