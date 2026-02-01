/**
 * GitHub Copilot CLI setup helper (moved from `setup.ts`)
 */

import os from 'node:os'

import { confirm } from '../cli/input.js'
import { select } from '../cli/menu.js'
import { ensureGeetoIgnored } from '../utils/config.js'
import { commandExists, exec } from '../utils/exec.js'
import { log } from '../utils/logging.js'

// Helper: Check Copilot version and warn if outdated
export const checkCopilotVersion = (): void => {
  try {
    // Check CLI availability
    try {
      exec('copilot --version', true)
      // log.info('GitHub Copilot CLI available')
      return
    } catch {
      // CLI not available
    }

    const verOut = exec('copilot --version', true)
    const m = verOut.match(/v?(\d+\.\d+\.\d+)/)
    const ver = m?.[1]
    if (ver) {
      const current = ver.split('.').map((n) => Number.parseInt(n, 10))
      while (current.length < 3) {
        current.push(0)
      }
      const major = current[0] ?? 0
      const minor = current[1] ?? 0
      const patch = current[2] ?? 0
      const currentNum = major * 1_000_000 + minor * 1_000 + patch
      const minNum = 0 * 1e6 + 0 * 1e3 + 382
      if (currentNum < minNum) {
        log.warn(
          'Detected Copilot CLI version is older than v0.0.382 — the latest Copilot models (GPT-5.2-Codex) are only supported on v0.0.382 and above. See: https://github.com/github/copilot-cli/releases'
        )
      } else {
        log.info(`GitHub Copilot CLI version: v${ver}`)
      }
    }
  } catch {
    // ignore version parse errors
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
    try {
      exec(installCommand)
      return true
    } catch (error) {
      log.error(`Failed to install GitHub CLI: ${error}`)
      log.info('Please install GitHub CLI manually from: https://cli.github.com')
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
