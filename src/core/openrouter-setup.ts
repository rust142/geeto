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
  log.info('OpenRouter integration is not configured for this project.\n')

  log.info('OpenRouter provides access to various AI models through a single API key.')
  log.info('Some models are free, while others may require credits from your OpenRouter account.')
  log.info(
    'Note: Even models marked as "free" may require account verification or limited credits.'
  )
  log.info('Supported models include: Llama, Mistral, Gemma, WizardLM, and many more.')
  log.info('\nYou need an OpenRouter API key to use this service.')
  log.info('Visit https://openrouter.ai/ to create an account and get your API key.\n')

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
    return true
  } catch (error) {
    log.error(`Failed to save config: ${(error as Error).message}`)
    return false
  }
}
