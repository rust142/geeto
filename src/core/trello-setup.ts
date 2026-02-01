/**
 * Trello integration setup
 */

import fs from 'node:fs'

import { askQuestion, confirm } from '../cli/input.js'
import { ensureGeetoIgnored, getTrelloConfigPath } from '../utils/config.js'
import { log } from '../utils/logging.js'

/**
 * Setup Trello config interactively
 */
export const setupTrelloConfigInteractive = (): boolean => {
  log.info('Trello integration is not configured for this project.\n')

  log.info('To enable Trello task linking, you need:')
  log.info('  1. API Key from: https://trello.com/app-key')
  log.info('  2. Token (we will generate URL for you)')
  log.info('  3. Board ID (from board URL: trello.com/b/{BOARD_ID}/)\n')

  const shouldSetup = confirm('Setup Trello integration now?')
  if (!shouldSetup) {
    return false
  }

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false)
  }

  const apiKey = askQuestion('Enter Trello API Key: ').trim()
  if (!apiKey) {
    log.error('API Key is required')
    return false
  }

  const tokenUrl = `https://trello.com/1/authorize?expiration=never&name=Geeto&scope=read,write&response_type=token&key=${apiKey}`
  log.info(`Open this URL to get your token:`)
  log.info(`${tokenUrl}\n`)

  const token = askQuestion('Enter Trello Token (after authorizing): ').trim()
  if (!token) {
    log.error('Token is required')
    return false
  }

  const boardId = askQuestion('Enter Trello Board ID: ').trim()
  if (!boardId) {
    log.error('Board ID is required')
    return false
  }

  const path = getTrelloConfigPath()
  const configDir = path.slice(0, path.lastIndexOf('/'))

  // Ensure .geeto is in .gitignore
  ensureGeetoIgnored()

  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
      log.success(`Created config directory: ${configDir}`)
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    log.error(`Failed to create config directory: ${msg}`)
    return false
  }

  const configContent = `# Geeto Trello Configuration
# Generated on ${new Date().toISOString()}

api_key = "${apiKey}"
token = "${token}"
board_id = "${boardId}"
`

  try {
    fs.writeFileSync(path, configContent, 'utf8')
    log.success(`Trello config saved to: ${path}`)
    return true
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    log.error(`Failed to save config: ${msg}`)
    return false
  }
}
