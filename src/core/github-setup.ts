/**
 * GitHub integration setup
 */

import fs from 'node:fs'

import { askQuestion, confirm } from '../cli/input.js'
import { ensureGeetoIgnored, getGithubConfigPath } from '../utils/config.js'
import { exec } from '../utils/exec.js'
import { log } from '../utils/logging.js'

/**
 * Try to detect GitHub token from `gh` CLI
 */
const detectGhToken = (): string | null => {
  try {
    const token = exec('gh auth token', true).trim()
    if (token?.startsWith('gh')) {
      return token
    }
    // Some tokens don't start with gh (classic PAT)
    if (token && token.length > 20) {
      return token
    }
  } catch {
    // gh CLI not installed or not logged in
  }
  return null
}

/**
 * Setup GitHub config interactively
 */
export const setupGithubConfigInteractive = (): boolean => {
  log.info('GitHub integration is not configured for this project.\n')

  log.info('To enable GitHub features (create PR, issues), you need:')
  log.info('  1. A Personal Access Token (PAT) with repo scope')
  log.info('  2. Or GitHub CLI (gh) already authenticated\n')

  const shouldSetup = confirm('Setup GitHub integration now?')
  if (!shouldSetup) {
    return false
  }

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false)
  }

  // Try auto-detect from gh CLI
  const detectedToken = detectGhToken()
  let token = ''

  if (detectedToken) {
    log.success('Detected GitHub token from `gh` CLI!')
    const useDetected = confirm('Use this token?')
    if (useDetected) {
      token = detectedToken
    }
  }

  if (!token) {
    log.info('Create a token at: https://github.com/settings/tokens')
    log.info('Required scopes: repo (Full control of private repositories)\n')

    // Offer to open the URL
    const openNow = confirm('Open token creation page in your browser?')
    if (openNow) {
      try {
        const platform = process.platform
        let openCmd = 'xdg-open'
        if (platform === 'darwin') openCmd = 'open'
        else if (platform === 'win32') openCmd = 'start ""'

        try {
          exec(`${openCmd} "https://github.com/settings/tokens/new?scopes=repo"`, true)
          log.success('Opened browser')
        } catch {
          log.warn('Could not open browser—please open the URL above manually')
        }
      } catch {
        // ignore
      }
    }

    token = askQuestion('Enter GitHub Personal Access Token: ').trim()
    if (!token) {
      log.error('Token is required')
      return false
    }
  }

  const path = getGithubConfigPath()
  const configDir = path.slice(0, path.lastIndexOf('/'))

  // Ensure .geeto is in .gitignore
  ensureGeetoIgnored()

  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    log.error(`Failed to create config directory: ${msg}`)
    return false
  }

  const configContent = `# Geeto GitHub Configuration
# Generated on ${new Date().toISOString()}

token = "${token}"
`

  try {
    fs.writeFileSync(path, configContent, 'utf8')
    log.success(`GitHub config saved to: ${path}`)
    return true
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    log.error(`Failed to save config: ${msg}`)
    return false
  }
}
