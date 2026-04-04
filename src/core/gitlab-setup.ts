/**
 * GitLab integration setup
 */

import fs from 'node:fs'

import { askQuestion, confirm } from '../cli/input.js'
import { ensureGeetoIgnored, getGitlabConfigPath } from '../utils/config.js'
import { exec, openBrowser } from '../utils/exec.js'
import { log } from '../utils/logging.js'

const detectGlabToken = (): string | null => {
  try {
    const token = exec('glab auth token', true).trim()
    if (token?.startsWith('glpat-')) return token
    if (token && token.length > 20) return token
  } catch {}
  return null
}

export const setupGitlabConfigInteractive = (): boolean => {
  log.info('GitLab integration is not configured for this project.\n')
  log.info('To enable GitLab features (create MR, issues), you need:')
  log.info('  1. A Personal Access Token (PAT) with api scope')
  log.info('  2. Or GitLab CLI (glab) already authenticated\n')

  const shouldSetup = confirm('Setup GitLab integration now?')
  if (!shouldSetup) return false

  if (process.stdin.isTTY) process.stdin.setRawMode(false)

  const detectedToken = detectGlabToken()
  let token = ''

  if (detectedToken) {
    log.success('Detected GitLab token from `glab` CLI!')
    const useDetected = confirm('Use this token?')
    if (useDetected) token = detectedToken
  }

  if (!token) {
    log.info('Create a token at: Settings → Access Tokens')
    log.info('Required scopes: api (Full access to the API)\n')
    const openNow = confirm('Open token creation page in your browser?')
    if (openNow) {
      const opened = openBrowser('https://gitlab.com/-/user_settings/personal_access_tokens')
      if (opened) log.success('Opened browser')
      else log.warn('Could not open browser—please open the URL above manually')
    }
    token = askQuestion('Enter GitLab Personal Access Token: ').trim()
    if (!token) {
      log.error('Token is required')
      return false
    }

    const looksValid = token.startsWith('glpat-') || token.length > 20
    if (!looksValid) {
      log.warn('Token format looks unusual')
      log.info('Saving anyway—if authentication fails, re-run setup with a valid token.')
    }
  }

  const instanceUrl =
    askQuestion('GitLab instance URL (press Enter for gitlab.com): ').trim() || 'https://gitlab.com'

  const path = getGitlabConfigPath()
  const configDir = path.slice(0, path.lastIndexOf('/'))
  ensureGeetoIgnored()
  try {
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    log.error(`Failed to create config directory: ${msg}`)
    return false
  }

  const configContent = `# Geeto GitLab Configuration\n# Generated on ${new Date().toISOString()}\n\ntoken = "${token}"\nurl = "${instanceUrl}"\n`
  try {
    fs.writeFileSync(path, configContent, 'utf8')
    log.success(`GitLab config saved to: ${path}`)
    return true
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    log.error(`Failed to save config: ${msg}`)
    return false
  }
}
