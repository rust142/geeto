/**
 * Configuration file management
 */

import type {
  BranchStrategyConfig,
  GeminiConfig,
  OpenRouterConfig,
  TrelloConfig,
} from '../types/index.js'

import fs from 'node:fs'
import os from 'node:os'

import { log } from './logging.js'

/**
 * Ensure .geeto folder is ignored in .gitignore
 */
export const ensureGeetoIgnored = (): void => {
  const gitignorePath = '.gitignore'

  try {
    let gitignoreContent = ''

    // Read existing .gitignore if it exists
    if (fs.existsSync(gitignorePath)) {
      gitignoreContent = fs.readFileSync(gitignorePath, 'utf8')
    }

    // Check if .geeto is already ignored
    if (!gitignoreContent.includes('.geeto')) {
      // Add .geeto to the end of .gitignore
      if (gitignoreContent && !gitignoreContent.endsWith('\n')) {
        gitignoreContent += '\n'
      }
      gitignoreContent += '\n# Geeto state files\n'
      gitignoreContent += '.geeto\n'
      log.info('Added .geeto to .gitignore')
    }

    // Check if geeto* is already ignored
    if (!gitignoreContent.includes('geeto*')) {
      // Add geeto* to the end of .gitignore
      if (gitignoreContent && !gitignoreContent.endsWith('\n')) {
        gitignoreContent += '\n'
      }
      gitignoreContent += 'geeto*\n'
      log.info('Added geeto* to .gitignore')
    }

    // Write back to .gitignore only if we made changes
    const originalContent = fs.existsSync(gitignorePath)
      ? fs.readFileSync(gitignorePath, 'utf8')
      : ''
    if (gitignoreContent !== originalContent) {
      fs.writeFileSync(gitignorePath, gitignoreContent, 'utf8')
    }
  } catch (error) {
    log.warn(`Could not update .gitignore: ${(error as Error).message}`)
  }
}

/**
 * Get path to Gemini config (project-local)
 */
export const getGeminiConfigPath = (): string => {
  return '.geeto/gemini.toml'
}

/**
 * Get path to Trello config (project-local)
 */
export const getTrelloConfigPath = (): string => {
  return '.geeto/trello.toml'
}

/**
 * Get path to branch strategy config (project-local)
 */
export const getBranchStrategyConfigPath = (): string => {
  return '.geeto/branch-strategy.toml'
}

const GEMINI_CONFIG_PATH = getGeminiConfigPath()
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'

/**
 * Read Gemini config from project-local `.geeto/gemini.toml`.
 * Expected format:
 * api_key = "YOUR_API_KEY"
 */
export const getGeminiConfig = (): GeminiConfig => {
  try {
    if (fs.existsSync(GEMINI_CONFIG_PATH)) {
      const content = fs.readFileSync(GEMINI_CONFIG_PATH, 'utf8')
      // Look for gemini_api_key first, fall back to api_key or apiKey for compatibility
      const apiKey = content.match(/gemini_api_key\s*=\s*["']([^"']+)["']/)
      const apiKeyMatch = content.match(/api_key\s*=\s*["']([^"']+)["']/)
      const apiKeyAlt = content.match(/apiKey\s*=\s*["']([^"']+)["']/)
      return {
        apiKey: apiKey?.[1] ?? apiKeyMatch?.[1] ?? apiKeyAlt?.[1] ?? '',
      }
    }
  } catch {
    // Ignore errors
  }
  return { apiKey: '' }
}

/**
 * Get Gemini API key
 */
export const getGeminiApiKey = (): string => {
  return getGeminiConfig().apiKey
}

/**
 * Check if Gemini is configured (has API key)
 */
export const hasGeminiConfig = (): boolean => {
  const config = getGeminiConfig()
  return !!(config.apiKey && config.apiKey.trim().length > 0)
}

/**
 * Read Trello config from project-local config file
 */
export const getTrelloConfig = (): TrelloConfig => {
  try {
    const path = getTrelloConfigPath()
    if (fs.existsSync(path)) {
      const content = fs.readFileSync(path, 'utf8')
      const apiKeyMatch = content.match(/api_key\s*=\s*["']([^"']+)["']/)
      const tokenMatch = content.match(/token\s*=\s*["']([^"']+)["']/)
      const boardIdMatch = content.match(/board_id\s*=\s*["']([^"']+)["']/)
      return {
        apiKey: apiKeyMatch?.[1] ?? '',
        token: tokenMatch?.[1] ?? '',
        boardId: boardIdMatch?.[1] ?? '',
      }
    }
  } catch {
    // Ignore errors
  }
  return { apiKey: '', token: '', boardId: '' }
}

/**
 * Check if Trello is configured (has all required fields)
 */
export const hasTrelloConfig = (): boolean => {
  const config = getTrelloConfig()
  return !!(config.apiKey && config.token && config.boardId)
}

/**
 * Get path to OpenRouter config (project-local)
 */
export const getOpenRouterConfigPath = (): string => {
  return '.geeto/openrouter.toml'
}

/**
 * Read OpenRouter config from project-local config file
 */
export const getOpenRouterConfig = (): OpenRouterConfig => {
  try {
    const path = getOpenRouterConfigPath()
    if (fs.existsSync(path)) {
      const content = fs.readFileSync(path, 'utf8')
      const apiKey = content.match(/openrouter_api_key\s*=\s*["']([^"']+)["']/)
      const apiKeyMatch = content.match(/api_key\s*=\s*["']([^"']+)["']/)
      const apiKeyAlt = content.match(/apiKey\s*=\s*["']([^"']+)["']/)
      return {
        apiKey: apiKey?.[1] ?? apiKeyMatch?.[1] ?? apiKeyAlt?.[1] ?? '',
      }
    }
  } catch {
    // Ignore errors
  }
  return { apiKey: '' }
}

/**
 * Check if OpenRouter is configured (has API key)
 */
export const hasOpenRouterConfig = (): boolean => {
  const config = getOpenRouterConfig()
  return !!config.apiKey
}

/**
 * Read branch strategy config
 */
export const getBranchStrategyConfig = (): BranchStrategyConfig | null => {
  try {
    const path = getBranchStrategyConfigPath()
    if (fs.existsSync(path)) {
      const content = fs.readFileSync(path, 'utf8')
      const separatorMatch = content.match(/separator\s*=\s*["']([^"']+)["']/)
      const namingMatch = content.match(/last_naming_strategy\s*=\s*["']([^"']+)["']/)
      const trelloListMatch = content.match(/last_trello_list\s*=\s*["']([^"']+)["']/)

      // Only return config if separator has been explicitly set
      if (separatorMatch) {
        return {
          separator: (separatorMatch?.[1] as '-' | '_') ?? '-',
          lastNamingStrategy: namingMatch?.[1] as
            | 'title-full'
            | 'title-ai'
            | 'ai'
            | 'manual'
            | undefined,
          lastTrelloList: trelloListMatch?.[1],
        }
      }
    }
  } catch {
    // Ignore errors
  }
  return null
}

/**
 * Save branch strategy config
 */
export const saveBranchStrategyConfig = (config: BranchStrategyConfig): void => {
  try {
    // Ensure .geeto is in .gitignore
    ensureGeetoIgnored()

    const path = getBranchStrategyConfigPath()
    const configDir = path.slice(0, path.lastIndexOf('/'))
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }

    const configContent = `# Geeto Branch Strategy Configuration
# Auto-generated on ${new Date().toISOString()}

separator = "${config.separator}"
${config.lastNamingStrategy ? `last_naming_strategy = "${config.lastNamingStrategy}"\n` : ''}${config.lastTrelloList ? `last_trello_list = "${config.lastTrelloList}"\n` : ''}`

    fs.writeFileSync(path, configContent, 'utf8')
  } catch (error) {
    log.warn(`Failed to save branch strategy config: ${(error as Error).message}`)
  }
}

/**
 * Get OS and shell configuration
 */
export const getShellConfig = (): { shell: string; rcFile: string } => {
  const platform = process.platform
  const shell = process.env.SHELL ?? ''

  if (platform === 'win32') {
    return { shell: 'powershell', rcFile: '' }
  }

  if (shell.includes('zsh')) {
    return { shell: 'zsh', rcFile: `${os.homedir()}/.zshrc` }
  }

  return { shell: 'bash', rcFile: `${os.homedir()}/.bashrc` }
}

/**
 * Check if go/bin is in PATH
 */
export const isGoBinInPath = (): boolean => {
  const platform = process.platform
  const pathEnv = process.env.PATH ?? ''

  if (platform === 'win32') {
    const goBin = `${os.homedir()}\\go\\bin`
    return pathEnv.toLowerCase().includes(goBin.toLowerCase())
  } else {
    const goBin = `${os.homedir()}/go/bin`
    return pathEnv.includes(goBin)
  }
}

/**
 * Add go/bin to PATH in shell rc file
 */
export const addGoBinToPath = (): void => {
  const platform = process.platform
  const { rcFile } = getShellConfig()

  if (!rcFile) {
    if (platform === 'win32') {
      log.warn('Windows detected. To permanently add go/bin to PATH:')
      log.info('  1. Press Win + X, select "System"')
      log.info('  2. Click "Advanced system settings"')
      log.info('  3. Click "Environment Variables"')
      log.info('  4. Edit PATH and add: %USERPROFILE%\\go\\bin')
      log.info('  5. Restart your terminal')
    }
    return
  }

  const exportLine = 'export PATH="$PATH:$HOME/go/bin"'

  if (fs.existsSync(rcFile)) {
    const content = fs.readFileSync(rcFile, 'utf8')
    if (content.includes('go/bin')) {
      log.info('go/bin already in PATH config')
      return
    }
  }

  fs.appendFileSync(rcFile, `\n# Added by geeto script\n${exportLine}\n`)
  log.success(`Added go/bin to ${rcFile}`)
  log.warn(`Please run: source ${rcFile}`)
}
