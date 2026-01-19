/**
 * Gemini commit setup and helpers
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  addGoBinToPath,
  getGeminiApiKey,
  getGeminiConfigPath,
  isGoBinInPath,
} from '../utils/config.js'
import { commandExists, exec } from '../utils/exec.js'
import { log } from '../utils/logging.js'

/**
 * Check and setup geminicommit + API key
 */
export const ensureGeminiCommit = (): boolean => {
  const GEMINI_CONFIG_PATH = getGeminiConfigPath()
  const configExists = fs.existsSync(GEMINI_CONFIG_PATH)

  if (!configExists) {
    log.warn('geminicommit not configured!')

    const hasBinary = commandExists('geminicommit')

    if (!hasBinary) {
      if (!commandExists('go')) {
        const platform = os.platform()
        log.error('Go is not installed. Please install Go first:')

        if (platform === 'win32') {
          log.info('  Download from: https://go.dev/dl/')
          log.info('  Or use package manager:')
          log.info('    choco install golang')
          log.info('    scoop install go')
          log.info('    winget install GoLang.Go')
        } else if (platform === 'darwin') {
          log.info('  brew install go')
        } else {
          log.info('  Download from: https://go.dev/dl/')
          log.info('  Or use package manager:')
          log.info('    sudo apt install golang-go  (Debian/Ubuntu)')
          log.info('    sudo dnf install golang     (Fedora)')
          log.info('    sudo pacman -S go           (Arch)')
        }
        return false
      }

      const platform = os.platform()

      if (platform === 'win32') {
        const goBinPath = `${os.homedir()}\\go\\bin`
        if (!process.env.PATH?.includes(goBinPath)) {
          process.env.PATH = `${process.env.PATH};${goBinPath}`
        }
      } else {
        if (!isGoBinInPath()) {
          log.warn('go/bin is not in PATH')
          addGoBinToPath()
          const goBinPath = `${os.homedir()}/go/bin`
          process.env.PATH = `${process.env.PATH}:${goBinPath}`
        }
      }

      log.info('Installing geminicommit...')
      try {
        exec('go install github.com/tfkhdyt/geminicommit@latest')
        log.success('geminicommit installed!')

        if (platform === 'win32') {
          log.info('If geminicommit command is not found, restart your terminal or add to PATH:')
          log.info(`  %USERPROFILE%\\go\\bin`)
        }
      } catch {
        log.error('Failed to install geminicommit')
        return false
      }
    }

    log.info('Setting up geminicommit config...')
    log.warn('Please run: geminicommit config key set YOUR_API_KEY')
    log.info('Get your API key from: https://aistudio.google.com/apikey')
    return false
  }

  const apiKey = getGeminiApiKey()
  if (!apiKey) {
    log.error('Gemini API key not set in geminicommit config!')
    log.warn('Please run: geminicommit config key set YOUR_API_KEY')
    log.info('Get your API key from: https://aistudio.google.com/apikey')
    return false
  }

  log.success('geminicommit configured ✓')
  return true
}

/**
 * Check and setup GitHub Copilot CLI
 */
export const ensureGitHubCopilot = (): boolean => {
  const platform = os.platform()
  const hasBinary = commandExists('copilot') || commandExists('github-copilot-cli')

  if (!hasBinary) {
    log.warn('GitHub Copilot CLI not installed!')

    log.info('Installing GitHub Copilot CLI...')
    try {
      if (platform === 'win32') {
        // On Windows, prefer npm if available, otherwise try winget
        if (commandExists('npm')) {
          log.info('Installing via npm...')
          exec('npm install -g @githubnext/github-copilot-cli')
        } else if (commandExists('winget')) {
          log.info('Installing via winget...')
          exec('winget install GitHub.Copilot')
        } else {
          throw new Error('Neither npm nor winget available for installation')
        }
      } else {
        // On Unix-like systems, use the curl installer
        exec('curl -fsSL https://gh.io/copilot-install | bash')
      }
      log.success('GitHub Copilot CLI installed!')

      if (platform === 'win32') {
        log.info(
          'If copilot command is not found, restart your terminal or add npm global bin to PATH:'
        )
        log.info('  %APPDATA%\\npm')
      }
    } catch {
      log.error('Failed to install GitHub Copilot CLI')
      log.info('You can install manually:')
      log.info('  npm install -g @githubnext/github-copilot-cli')
      log.info('Or visit: https://github.com/githubnext/github-copilot-cli')
      return false
    }
  }

  // Check if authenticated by trying a simple command
  try {
    exec('copilot --help', true)
    log.success('GitHub Copilot CLI configured ✓')
    return true
  } catch {
    // On Windows, try to find copilot in npm global bin if not in PATH
    if (platform === 'win32' && commandExists('npm')) {
      try {
        const npmBinPath = path.join(exec('npm config get prefix', true).trim(), 'bin')
        const copilotPath = path.join(npmBinPath, platform === 'win32' ? 'copilot.cmd' : 'copilot')
        if (fs.existsSync(copilotPath)) {
          log.warn('GitHub Copilot CLI installed but not in PATH!')
          log.info('Add this to your PATH or restart your terminal:')
          log.info(`  ${npmBinPath}`)
          log.info('')
          log.info('Or run copilot directly:')
          log.info(`  "${copilotPath}" auth`)
          return false
        }
      } catch {
        // Ignore npm prefix check errors
      }
    }

    log.warn('GitHub Copilot CLI not authenticated!')
    log.info('Please authenticate with GitHub:')
    log.info('  github-copilot-cli auth')
    log.info('Or if using the shorter command:')
    log.info('  copilot auth')
    log.info('')
    log.info('Note: You need a GitHub account with Copilot access.')
    return false
  }
}

/**
 * Export Trello setup instructions
 */
export const setupTrelloConfig = (): void => {
  log.info('Trello integration is not configured.')
  log.info('To enable Trello integration, create a config file at:')
  log.info('  .geeto/trello.toml')
  log.info('')
  log.info('With the following content:')
  log.info('  api_key = "YOUR_TRELLO_API_KEY"')
  log.info('  token = "YOUR_TRELLO_TOKEN"')
  log.info('  board_id = "YOUR_TRELLO_BOARD_ID"')
  log.info('')
  log.info('Get your API key from: https://trello.com/app-key')
  log.info('Generate a token by clicking the "Token" link on that page')
  log.info('Find your board ID in the board URL: trello.com/b/{BOARD_ID}/')
}

/**
 * Check and setup OpenRouter API key
 */
export const ensureOpenRouter = async (): Promise<boolean> => {
  const { hasOpenRouterConfig } = await import('../utils/config.js')
  const hasConfig = hasOpenRouterConfig()
  if (!hasConfig) {
    log.warn('No OpenRouter configuration found.')
    log.info('Please run setup to configure API key.')
    return false
  }

  log.success('OpenRouter API configuration is ready!')
  return true
}

/**
 * Unified AI provider setup function
 */
export const ensureAIProvider = async (
  aiProvider: 'gemini' | 'copilot' | 'openrouter'
): Promise<boolean> => {
  switch (aiProvider) {
    case 'gemini': {
      return ensureGeminiCommit()
    }
    case 'copilot': {
      return ensureGitHubCopilot()
    }
    case 'openrouter': {
      return ensureOpenRouter()
    }
    // No default
  }
  return false
}
