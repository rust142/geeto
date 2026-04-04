/**
 * Copilot setup helper — ensures GitHub CLI is installed and authenticated.
 *
 * Since Geeto now uses the Copilot REST API directly (no Copilot CLI binary
 * needed), setup only requires: 1) gh CLI installed, 2) gh auth login done.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { confirm } from '../cli/input.js'
import { select } from '../cli/menu.js'
import { ensureGeetoIgnored } from '../utils/config.js'
import { commandExists, exec } from '../utils/exec.js'
import { log } from '../utils/logging.js'
import { getGhCliInstallCommand, getLinuxDistro } from '../utils/platform.js'

/** Save recommended default Copilot models if no model file exists */
const saveDefaultCopilotModels = (): void => {
  try {
    const outDir = path.join(process.cwd(), '.geeto')
    const modelFile = path.join(outDir, 'copilot-model.json')
    if (fs.existsSync(modelFile)) return // Already has saved models

    const defaultModels = [
      { label: 'Claude Sonnet 4', value: 'claude-sonnet-4' },
      { label: 'Claude Haiku 4.5', value: 'claude-haiku-4.5' },
      { label: 'GPT-4.1', value: 'gpt-4.1' },
      { label: 'GPT-5 Mini', value: 'gpt-5-mini' },
    ]

    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(modelFile, JSON.stringify(defaultModels, null, 2), 'utf8')
    log.info('Saved recommended Copilot models to .geeto/copilot-model.json')
  } catch {
    /* ignore */
  }
}

// Helper: Setup GitHub CLI if needed
const setupGitHubCLI = (): boolean => {
  const platform = os.platform()

  // Check if GitHub CLI is already installed
  if (commandExists('gh')) {
    return true
  }

  log.info('GitHub CLI not found. Installing GitHub CLI...')

  let installCommand = ''
  if (platform === 'darwin') {
    if (commandExists('brew')) {
      installCommand = 'brew install gh'
    } else {
      log.warn('Homebrew not found. Please install GitHub CLI manually:')
      log.info('  Option 1: Install Homebrew first → https://brew.sh')
      log.info('  Option 2: Download .pkg installer → https://cli.github.com')
      log.info('  Option 3: conda install gh --channel conda-forge')
      return false
    }
  } else if (platform === 'win32') {
    if (commandExists('winget')) {
      installCommand = 'winget install --id GitHub.cli'
    } else if (commandExists('choco')) {
      installCommand = 'choco install gh'
    } else if (commandExists('scoop')) {
      installCommand = 'scoop install gh'
    } else {
      log.warn('No supported package manager found (winget, choco, scoop).')
      log.info('Please install GitHub CLI manually from: https://cli.github.com')
      log.info('Or install a package manager:')
      log.info('  winget: Built into Windows 10/11 (update App Installer from Store)')
      log.info('  scoop: https://scoop.sh')
      log.info('  choco: https://chocolatey.org')
      return false
    }
  } else {
    // Linux — auto-detect distro for correct package manager
    const autoCommand = getGhCliInstallCommand()
    if (autoCommand) {
      installCommand = autoCommand
    } else {
      const distro = getLinuxDistro()
      log.warn(`Unsupported Linux distribution${distro === 'unknown' ? '' : ` (${distro})`}.`)
      log.info('Please install GitHub CLI manually from: https://cli.github.com/packages')
      log.info(
        'Or try: curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg'
      )
      return false
    }
  }

  if (installCommand) {
    const spinner = log.spinner()
    spinner.start('Installing GitHub CLI...')
    try {
      exec(installCommand, true)
      spinner.succeed('GitHub CLI installed successfully')

      // Windows-specific: Add gh to PATH if not found after install
      if (platform === 'win32' && !commandExists('gh')) {
        log.info('Adding GitHub CLI to PATH...')
        let ghPath = ''
        try {
          // Common installation paths for gh on Windows
          const ghPaths = [
            'C:\\Program Files\\GitHub CLI\\',
            'C:\\Program Files (x86)\\GitHub CLI\\',
            `${process.env.LOCALAPPDATA}\\Programs\\GitHub CLI\\`,
          ]

          for (const p of ghPaths) {
            try {
              // Check if gh.exe exists in this path
              const checkCmd = `powershell -Command "Test-Path '${p}gh.exe'"`
              const exists = exec(checkCmd, true).trim()
              if (exists === 'True') {
                ghPath = p
                break
              }
            } catch {
              continue
            }
          }

          if (ghPath) {
            // Add to User PATH permanently and refresh current session
            const addPathCmd = `powershell -Command "$currentPath = [Environment]::GetEnvironmentVariable('PATH', 'User'); if ($currentPath -notlike '*${ghPath}*') { [Environment]::SetEnvironmentVariable('PATH', $currentPath + ';${ghPath}', 'User'); $env:PATH = [Environment]::GetEnvironmentVariable('PATH', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('PATH', 'User') }"`
            exec(addPathCmd, true)

            // Also update current process PATH
            if (!process.env.PATH?.includes(ghPath)) {
              process.env.PATH = `${process.env.PATH};${ghPath}`
            }

            log.success('GitHub CLI added to PATH')
          } else {
            log.warn(
              'Could not find GitHub CLI installation path. You may need to add it to PATH manually.'
            )
          }
        } catch (error) {
          log.warn(`Failed to add gh to PATH: ${error}`)
          if (ghPath) {
            log.info(`Please add this path to your PATH environment variable manually:`)
            log.info(`  ${ghPath}`)
            log.info('Then restart your terminal to apply changes.')
          } else {
            log.info('Please find the GitHub CLI installation path and add it to PATH manually.')
            log.info('Common locations: C:\\Program Files\\GitHub CLI\\')
          }
        }
      }

      return true
    } catch (error) {
      spinner.fail(`Failed to install GitHub CLI: ${error}`)
      log.info('Please install GitHub CLI manually from: https://cli.github.com')
      if (platform === 'win32') {
        log.info('After installation, you may need to add it to PATH manually.')
        log.info('Common installation path: C:\\Program Files\\GitHub CLI\\')
        log.info('Or check: C:\\Program Files (x86)\\GitHub CLI\\')
      }
      return false
    }
  }

  return false
}

// Helper: Check if GitHub CLI is authenticated
const isGitHubAuthenticated = (): boolean => {
  try {
    exec('gh auth status', true)
    return true
  } catch {
    return false
  }
}

// Helper: Get authenticated GitHub username via gh
const getGitHubUsername = (): string | null => {
  try {
    const out = exec('gh api user --jq .login', true)
    return out?.trim() || null
  } catch {
    return null
  }
}

// Helper: Authenticate with GitHub CLI
const authenticateGitHub = async (): Promise<boolean> => {
  const authOptions = [
    { label: 'Already authenticated with GitHub CLI (skip auth)', value: 'already' },
    { label: 'Authenticate now (opens browser for GitHub OAuth)', value: 'auth' },
    { label: 'Skip for now (authenticate later)', value: 'skip' },
  ]

  const authChoice = await select('Is GitHub CLI already authenticated?', authOptions)

  if (authChoice === 'auth') {
    log.info('Starting GitHub authentication...')
    log.info('This will open your browser for GitHub OAuth.')
    try {
      exec('gh auth login')
      log.success('Authentication process started!')
      await new Promise((resolve) => setTimeout(resolve, 2000))
      if (isGitHubAuthenticated()) {
        log.success('GitHub authenticated successfully')
        return true
      } else {
        log.warn('Authentication may not have completed yet. Please finish in browser.')
        return false
      }
    } catch (error) {
      log.error(`Authentication failed: ${error}`)
      return false
    }
  } else if (authChoice === 'skip') {
    log.info('Skipping authentication for now. You can run `gh auth login` later.')
    return false
  }
  // If 'already', assume it's authenticated
  return true
}

/**
 * Check Copilot API access by testing token against the models endpoint.
 */
const checkCopilotAPIAccess = async (): Promise<boolean> => {
  try {
    const sdk = await import('../api/copilot-sdk.js')
    return await sdk.isAvailable()
  } catch {
    return false
  }
}

/**
 * Interactive setup for Copilot AI provider.
 *
 * Since v0.8.0, Geeto uses the Copilot REST API directly.
 * Setup only requires GitHub CLI authenticated — no Copilot CLI binary needed.
 */
export const setupGitHubCopilotInteractive = async (): Promise<boolean> => {
  // Ensure GitHub CLI is installed (install automatically if needed)
  const ghInstalled = setupGitHubCLI()
  if (!ghInstalled) {
    log.warn('GitHub CLI installation failed. Cannot proceed with Copilot setup.')
    return false
  }

  // Check if already authenticated
  if (isGitHubAuthenticated()) {
    const user = getGitHubUsername()
    if (user) {
      log.info(`GitHub authenticated as: ${user}`)
    } else {
      log.success('GitHub authenticated')
    }
  } else {
    // Need to authenticate
    const ghAuthenticated = await authenticateGitHub()
    if (!ghAuthenticated) {
      return false
    }
  }

  // Verify Copilot API access (requires active Copilot subscription)
  const spinner = log.spinner()
  spinner.start('Checking Copilot API access...')

  const apiOk = await checkCopilotAPIAccess()
  if (apiOk) {
    spinner.succeed('Copilot API accessible')
  } else {
    spinner.fail('Copilot API not accessible')
    log.gap()
    log.info('This may mean:')
    log.info('  • Your GitHub account needs an active Copilot subscription')
    log.info('  • Visit: https://github.com/features/copilot/plans')

    const shouldContinue = confirm('Continue setup anyway? (models can be configured manually)')
    if (!shouldContinue) {
      return false
    }
  }

  ensureGeetoIgnored()
  saveDefaultCopilotModels()

  log.success('Copilot ready to use')
  return true
}
