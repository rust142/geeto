import { log } from '../utils/logging.js'

/**
 * Check and setup gemini API + API key
 */
export const ensureGemini = async (): Promise<boolean> => {
  // Delegate interactive setup to dedicated file
  try {
    const mod = await import('./gemini-setup.js')
    if (typeof mod.setupGeminiConfigInteractive === 'function') {
      return mod.setupGeminiConfigInteractive()
    }
  } catch {
    log.warn(
      'Gemini setup helper not available; please run setup manually or ensure gemini-setup is present'
    )
  }

  return false
}

/**
 * Check and setup Copilot CLI
 */
export const ensureGitHubCopilot = async (): Promise<boolean> => {
  try {
    const mod = await import('./copilot-setup.js')
    if (typeof mod.setupGitHubCopilotInteractive === 'function') {
      return mod.setupGitHubCopilotInteractive()
    }
  } catch {
    log.warn('Copilot setup helper not available, falling back to inline setup')
  }

  // Fallback: cannot perform interactive setup because helper is missing
  log.warn('Unable to run Copilot setup helper.')
  log.info('Authenticate: copilot auth')
  return false
}

/**
 * Check and setup OpenRouter API key
 */
export const ensureOpenRouter = async (): Promise<boolean> => {
  try {
    const mod = await import('./openrouter-setup.js')
    if (typeof mod.setupOpenRouterConfigInteractive === 'function') {
      return mod.setupOpenRouterConfigInteractive()
    }
  } catch {
    log.warn(
      'OpenRouter setup helper not available; please run setup manually or ensure openrouter-setup is present'
    )
  }
  return false
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
 * Unified AI provider setup function
 */
export const ensureAIProvider = async (
  aiProvider: 'gemini' | 'copilot' | 'openrouter'
): Promise<boolean> => {
  switch (aiProvider) {
    case 'gemini': {
      return ensureGemini()
    }
    case 'copilot': {
      return ensureGitHubCopilot()
    }
    case 'openrouter': {
      return ensureOpenRouter()
    }
    default: {
      log.error(`Unknown AI provider: ${aiProvider}`)
      return false
    }
  }
}
