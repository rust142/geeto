/**
 * Groq integration setup
 */

import fs from 'node:fs'

import { askQuestion, confirm } from '../cli/input.js'
import { ensureGeetoIgnored, getGroqConfigPath } from '../utils/config.js'
import { openBrowser } from '../utils/exec.js'
import { log } from '../utils/logging.js'

export const setupGroqConfigInteractive = (): boolean => {
  const configPath = getGroqConfigPath()
  try {
    if (fs.existsSync(configPath)) {
      return true
    }
  } catch {
    // fall through to interactive setup
  }

  log.info('Groq provides free access to fast LLM models (Llama, Gemma, Mixtral).\n')
  log.info('Get your free API key at: https://console.groq.com/keys')
  log.info(`Config will be saved to: ${configPath}\n`)

  const shouldSetup = confirm('Setup Groq integration now?')
  if (!shouldSetup) return false

  const openKeyPage = confirm('Open Groq API key page in your browser?')
  if (openKeyPage) {
    const opened = openBrowser('https://console.groq.com/keys')
    if (!opened) log.warn('Could not open browser — visit https://console.groq.com/keys manually')
  }

  if (process.stdin.isTTY) process.stdin.setRawMode(false)

  const apiKey = askQuestion('Enter Groq API Key: ').trim()
  if (!apiKey) {
    log.warn('No API key provided. Groq setup cancelled.')
    return false
  }

  if (!apiKey.startsWith('gsk_')) {
    log.warn('API key format looks unusual (expected: starts with "gsk_").')
    log.info('Saving anyway — if authentication fails, re-run setup with a valid key.')
  }

  ensureGeetoIgnored()

  const dir = configPath.slice(0, configPath.lastIndexOf('/'))
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  } catch (error) {
    log.error(`Failed to create config directory: ${(error as Error).message}`)
    return false
  }

  const content = `# Geeto Groq Configuration
# Generated on ${new Date().toISOString()}
# Free API key from https://console.groq.com/keys

api_key = "${apiKey}"
`

  try {
    fs.writeFileSync(configPath, content, 'utf8')
    log.success(`Groq config saved to: ${configPath}`)
    return true
  } catch (error) {
    log.error(`Failed to save config: ${(error as Error).message}`)
    return false
  }
}
