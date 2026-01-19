/**
 * Settings workflow - handles all settings menu interactions
 */

import { existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

import { confirm, select } from '../cli'
import { log } from '../utils'
import { getBranchStrategyConfig, hasTrelloConfig, saveBranchStrategyConfig } from '../utils/config'

export const showSettingsMenu = async () => {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    log.info('\nSettings Menu\n')

    const settingChoice = await select('Choose a setting to configure:', [
      { label: 'Branch separator (hyphen/underscore)', value: 'separator' },
      { label: 'Trello integration setup', value: 'trello' },
      { label: 'OpenRouter AI setup', value: 'openrouter' },
      { label: 'Back to main menu', value: 'back' },
    ])

    if (settingChoice === 'back') {
      break
    }

    if (settingChoice === 'separator') {
      const separatorChoice = await select('Choose branch name separator:', [
        { label: 'Hyphen (kebab-case): my-branch-name', value: 'hyphen' },
        { label: 'Underscore (snake_case): my_branch_name', value: 'underscore' },
        { label: 'Back to settings menu', value: 'back' },
      ])

      if (separatorChoice === 'back') {
        continue
      }

      const separator = separatorChoice === 'hyphen' ? '-' : '_'
      const config = getBranchStrategyConfig()
      if (config) {
        config.separator = separator
        saveBranchStrategyConfig(config)
        log.success(
          `Branch separator set to: ${separator === '-' ? 'hyphen (-)' : 'underscore (_)'}`
        )
      } else {
        // Create new config if doesn't exist
        saveBranchStrategyConfig({
          separator,
        })
        log.success(
          `Branch separator set to: ${separator === '-' ? 'hyphen (-)' : 'underscore (_)'}`
        )
      }
    }

    if (settingChoice === 'trello') {
      const hasConfig = hasTrelloConfig()

      if (hasConfig) {
        const action = await select(
          'Trello integration is already configured. What would you like to do?',
          [
            { label: 'Reconfigure (replace existing config)', value: 'reconfigure' },
            { label: 'Remove configuration', value: 'remove' },
            { label: 'Back to settings menu', value: 'back' },
          ]
        )

        if (action === 'reconfigure') {
          log.info('Reconfiguring Trello integration...')
          // Clear existing config first
          const configDir = join(process.cwd(), '.geeto')
          const trelloConfigPath = join(configDir, 'trello.toml')

          if (existsSync(trelloConfigPath)) {
            unlinkSync(trelloConfigPath)
            log.info('Cleared existing Trello configuration')
          }

          // Setup new config
          const { setupTrelloConfigInteractive } = await import('../core/trello-setup')
          setupTrelloConfigInteractive()
          log.success('Trello integration reconfigured!')
        } else if (action === 'remove') {
          const confirmRemove = confirm('Are you sure you want to remove Trello configuration?')
          if (confirmRemove) {
            const configDir = join(process.cwd(), '.geeto')
            const trelloConfigPath = join(configDir, 'trello.toml')

            if (existsSync(trelloConfigPath)) {
              unlinkSync(trelloConfigPath)
              log.success('Trello configuration removed!')
            } else {
              log.info('No Trello configuration found to remove')
            }
          }
        }
        // If 'back', just continue to next iteration
      } else {
        log.info('No Trello configuration found. Setting up Trello integration...')
        // Import and run trello setup
        const { setupTrelloConfigInteractive } = await import('../core/trello-setup')
        setupTrelloConfigInteractive()
        log.success('Trello integration configured!')
      }
    }

    if (settingChoice === 'openrouter') {
      const { hasOpenRouterConfig } = await import('../utils/config.js')

      const hasConfig = hasOpenRouterConfig()

      if (hasConfig) {
        const action = await select(
          'OpenRouter integration is already configured. What would you like to do?',
          [
            { label: 'Reconfigure (replace existing config)', value: 'reconfigure' },
            { label: 'Remove configuration', value: 'remove' },
            { label: 'Back to settings menu', value: 'back' },
          ]
        )

        if (action === 'reconfigure') {
          log.info('Reconfiguring OpenRouter integration...')
          // Clear existing config first
          const configDir = join(process.cwd(), '.geeto')
          const openrouterConfigPath = join(configDir, 'openrouter.toml')

          if (existsSync(openrouterConfigPath)) {
            unlinkSync(openrouterConfigPath)
            log.info('Cleared existing OpenRouter configuration')
          }

          // Setup new config
          const { setupOpenRouterConfigInteractive } = await import('../core/openrouter-setup')
          setupOpenRouterConfigInteractive()
          log.success('OpenRouter integration reconfigured!')
        } else if (action === 'remove') {
          const confirmRemove = confirm('Are you sure you want to remove OpenRouter configuration?')
          if (confirmRemove) {
            const configDir = join(process.cwd(), '.geeto')
            const openrouterConfigPath = join(configDir, 'openrouter.toml')

            if (existsSync(openrouterConfigPath)) {
              unlinkSync(openrouterConfigPath)
              log.success('OpenRouter configuration removed!')
            } else {
              log.info('No OpenRouter configuration found to remove')
            }
          }
        }
        // If 'back', just continue to next iteration
      } else {
        log.info('No OpenRouter configuration found. Setting up OpenRouter integration...')
        // Import and run openrouter setup
        const { setupOpenRouterConfigInteractive } = await import('../core/openrouter-setup')
        setupOpenRouterConfigInteractive()
        log.success('OpenRouter integration configured!')
      }
    }

    // Ask if user wants to continue with settings
    const continueSettings = confirm('Configure another setting?')
    if (!continueSettings) {
      break
    }
  }
}
