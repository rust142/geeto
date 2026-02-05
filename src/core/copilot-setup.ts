/**
 * GitHub Copilot CLI setup helper (moved from `setup.ts`)
 */

import os from 'node:os'

import { findBestCopilotBinary, MIN_COPILOT_VERSION, parseParts } from '../api/copilot-sdk.js'
import { confirm } from '../cli/input.js'
import { select } from '../cli/menu.js'
import { ensureGeetoIgnored } from '../utils/config.js'
import { commandExists, exec } from '../utils/exec.js'
import { log } from '../utils/logging.js'

/**
 * Check Copilot CLI version and warn if outdated.
 * Uses shared utility from copilot-sdk.ts.
 */
export const checkCopilotVersion = (): boolean => {
  const best = findBestCopilotBinary()

  if (!best) {
    return false
  }

  const currentNum = parseParts(best.version)
  const minNum = parseParts(MIN_COPILOT_VERSION)

  if (currentNum < minNum) {
    log.error(
      `Copilot CLI version ${best.version} is outdated. Minimum required: ${MIN_COPILOT_VERSION}`
    )
    log.info('The Copilot SDK requires CLI version 0.0.400+ for session/server support.')
    log.info('Please upgrade with: sudo npm install -g @github/copilot')
    log.info('Or visit: https://github.com/github/copilot-cli/releases')
    return false
  }

  // Update PATH so CopilotClient can find the newest binary
  const binDir = best.path.slice(0, best.path.lastIndexOf('/'))
  if (!process.env.PATH?.startsWith(binDir)) {
    process.env.PATH = `${binDir}:${process.env.PATH}`
  }

  return true
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
      installCommand = `curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg &&
        sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg &&
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null &&
        sudo apt update &&
        sudo apt install gh -y`
    }
  } else if (platform === 'win32') {
    if (commandExists('winget')) {
      installCommand = 'winget install --id GitHub.cli'
    } else if (commandExists('choco')) {
      installCommand = 'choco install gh'
    } else {
      installCommand = `powershell -Command "Invoke-WebRequest -Uri https://cli.github.com/packages/rpm/gh-cli.repo -OutFile /etc/yum.repos.d/gh-cli.repo &&
        yum install gh -y"`
    }
  } else {
    // Linux
    installCommand = `curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg &&
      sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg &&
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null &&
      sudo apt update &&
      sudo apt install gh -y`
  }

  if (installCommand) {
    const spinner = log.spinner()
    spinner.start('Installing GitHub CLI...')
    try {
      exec(installCommand, true)
      spinner.stop()
      log.success('GitHub CLI installed successfully')

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
      spinner.stop()
      log.error(`Failed to install GitHub CLI: ${error}`)
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
 * Interactive installer and authenticator for GitHub Copilot CLI
 */
export const setupGitHubCopilotInteractive = async (): Promise<boolean> => {
  const platform = os.platform()

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

  // Now check/setup Copilot CLI
  // Check if Copilot CLI is available
  const copilotAvailable = commandExists('copilot')

  if (copilotAvailable) {
    // Note about premium models that may require enablement.
    log.success('GitHub Copilot ready to use')

    checkCopilotVersion()

    ensureGeetoIgnored()
    return true
  }

  // Show informational text only if we reach installer flow
  log.info('GitHub Copilot CLI allows local AI workflows via the copilot command-line tool.')
  log.info('This helper will attempt to install and/or authenticate the Copilot CLI for you.')

  const shouldSetup = confirm('Setup GitHub Copilot CLI now?')
  if (!shouldSetup) {
    return false
  }

  let installOptions: Array<{ label: string; value: string }> = []
  let installCommand = ''

  if (platform === 'win32') {
    installOptions = [
      { label: 'Download from GitHub releases (manual)', value: 'download' },
      { label: 'npm: npm install -g @github/copilot', value: 'npm' },
      { label: 'Winget: winget install GitHub.Copilot', value: 'winget' },
    ]
  } else if (platform === 'darwin') {
    installOptions = [
      { label: 'Homebrew: brew install copilot-cli', value: 'brew' },
      { label: 'npm: npm install -g @github/copilot', value: 'npm' },
      { label: 'Curl installer: curl -fsSL https://gh.io/copilot-install | bash', value: 'curl' },
      { label: 'Download from GitHub releases (manual)', value: 'download' },
    ]
  } else {
    installOptions = [
      { label: 'Download from GitHub releases (manual)', value: 'download' },
      { label: 'npm: npm install -g @github/copilot', value: 'npm' },
      { label: 'Curl installer: curl -fsSL https://gh.io/copilot-install | bash', value: 'curl' },
    ]
  }

  const choice = await select('Choose GitHub Copilot CLI installation method:', installOptions)

  switch (choice) {
    case 'download': {
      log.info('Please download and install GitHub Copilot CLI from:')
      log.info('  https://github.com/github/copilot-cli/releases')
      log.info('Then restart this setup.\n')
      return false
    }
    case 'npm': {
      if (!commandExists('npm')) {
        log.error('npm not found. Please install Node.js first.')
        return false
      }
      installCommand = 'npm install -g @github/copilot'
      break
    }
    case 'winget': {
      if (!commandExists('winget')) {
        log.error('Winget not found. Please install Windows Package Manager first.')
        return false
      }
      installCommand = 'winget install GitHub.Copilot'
      break
    }
    case 'brew': {
      if (!commandExists('brew')) {
        log.error('Homebrew not found. Please install Homebrew first.')
        return false
      }
      installCommand = 'brew install copilot-cli'
      break
    }
    case 'curl': {
      installCommand = 'curl -fsSL https://gh.io/copilot-install | bash'
      break
    }
    default: {
      break
    }
  }

  if (installCommand) {
    log.info(`Installing GitHub Copilot CLI with: ${installCommand}`)
    try {
      exec(installCommand)
      log.success('GitHub Copilot CLI installed successfully!')

      // Add npm global bin to PATH if npm was used
      if (choice === 'npm') {
        if (platform === 'win32') {
          const npmBinPath = String.raw`${os.homedir()}\\AppData\\Roaming\\npm`
          if (!process.env.PATH?.includes(npmBinPath)) {
            process.env.PATH = `${process.env.PATH};${npmBinPath}`
            log.info('Added npm global bin to PATH')
          }
        } else {
          const possibleNpmPaths = [
            '/usr/local/bin',
            '/usr/bin',
            String.raw`${os.homedir()}/.npm-global/bin`,
          ]
          let npmPathAdded = false
          for (const npmPath of possibleNpmPaths) {
            if (!process.env.PATH?.includes(npmPath)) {
              process.env.PATH = `${process.env.PATH}:${npmPath}`
              npmPathAdded = true
            }
          }
          if (npmPathAdded) {
            log.info('Added npm paths to PATH')
          }
        }
      }

      // For brew, add brew paths
      if (choice === 'brew') {
        const brewPaths = ['/opt/homebrew/bin', '/usr/local/bin']
        let brewPathAdded = false
        for (const brewPath of brewPaths) {
          if (!process.env.PATH?.includes(brewPath)) {
            process.env.PATH = `${process.env.PATH}:${brewPath}`
            brewPathAdded = true
          }
        }
        if (brewPathAdded) {
          log.info('Added Homebrew paths to PATH')
        }
      }

      // Re-check availability via CLI or SDK-managed client
      let copilotNowAvailable = commandExists('copilot')
      try {
        const sdk = await import('../api/copilot-sdk.js')
        if (sdk && typeof sdk.isAvailable === 'function') {
          copilotNowAvailable = copilotNowAvailable || (await sdk.isAvailable())
        }
      } catch {
        // ignore
      }

      if (!copilotNowAvailable) {
        throw new Error('GitHub Copilot CLI command not found after installation')
      }

      log.info('GitHub Copilot CLI is ready to use!')

      checkCopilotVersion()

      ensureGeetoIgnored()

      return true
    } catch (error) {
      log.error(`Failed to install GitHub Copilot CLI: ${error}`)
      log.info('You can try installing manually:')
      log.info('  npm install -g @github/copilot')
      log.info('Or visit: https://github.com/github/copilot-cli')
      return false
    }
  }

  // Check if Copilot CLI is working after installation
  try {
    exec('copilot --version', true)
    log.success('GitHub Copilot CLI configured and ready to use')

    checkCopilotVersion()
    ensureGeetoIgnored()
    return true
  } catch {
    // CLI not working
  }

  return false
}
