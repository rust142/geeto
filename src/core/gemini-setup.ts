/**
 * Gemini integration setup
 */

import fs from 'node:fs'

import { askQuestion, confirm } from '../cli/input.js'
import { ensureGeetoIgnored, getGeminiConfigPath } from '../utils/config.js'
import { openBrowser } from '../utils/exec.js'
import { log } from '../utils/logging.js'

/**
 * Setup Gemini config interactively
 */
export const setupGeminiConfigInteractive = (): boolean => {
  const configPath = getGeminiConfigPath()
  // If config already exists, nothing to do
  try {
    if (fs.existsSync(configPath)) {
      log.success('Gemini API configuration is ready!')
      return true
    }
  } catch {
    // fall through to interactive setup
  }

  log.info('Gemini integration is not configured for this project.\n')

  log.info('Google Gemini provides several models with different cost/latency trade-offs.')
  log.info('Geeto will prompt you to choose a model interactively when using Gemini.')
  log.info(
    'This setup only stores a project-local API key (gemini_api_key) — model selection is interactive and persisted in workflow state.'
  )
  log.info(`The Gemini API key will be saved to: ${getGeminiConfigPath()}`)
  log.info(
    'You need a Gemini API key to use this service. Get one from: https://aistudio.google.com/apikey\n'
  )

  const shouldSetup = confirm('Setup Gemini integration now?')
  if (!shouldSetup) {
    return false
  }

  // Offer to open the API key page
  const openKeyPage = confirm('Open Gemini API key page in your browser?')
  if (openKeyPage) {
    const opened = openBrowser('https://aistudio.google.com/apikey')
    if (opened) {
      log.success('Opened API key page in your browser')
    } else {
      log.warn('Could not open browser\u2014please visit the URL above manually')
    }
  }

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false)
  }

  const geminiKey = askQuestion('Enter Gemini API Key: ').trim()

  if (!geminiKey) {
    log.warn('No API key provided. Gemini setup cancelled.')
    return false
  }

  // Soft validation: warn if key format looks unexpected
  if (!geminiKey.startsWith('AI') || geminiKey.length < 30) {
    log.warn('API key format looks unusual (expected: starts with "AI", 30+ chars).')
    log.info('Saving anyway\u2014if authentication fails, re-run setup with a valid key.')
  }

  const path = getGeminiConfigPath()
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

  const configContent =
    `# Geeto Gemini Configuration\n# Generated on ${new Date().toISOString()}\n# Store only the project-local Gemini API key\n\n` +
    `gemini_api_key = "${geminiKey}"\n`

  try {
    fs.writeFileSync(configPath, configContent, 'utf8')
    log.success(`Gemini config saved to: ${configPath}`)

    // Write default gemini-model.json so users have model choices available
    try {
      const modelFile = `${configDir}/gemini-model.json`
      const defaultModels = [
        { label: 'Gemini 2.0 Flash', value: 'gemini-2.0-flash' },
        { label: 'Gemini 2.5 Flash Lite', value: 'gemini-2.5-flash-lite' },
        { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
        { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' },
      ]

      if (!fs.existsSync(modelFile)) {
        fs.writeFileSync(modelFile, JSON.stringify(defaultModels, null, 2), 'utf8')
        log.info(`Wrote default Gemini model list to: ${modelFile}`)
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
