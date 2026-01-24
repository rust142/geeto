/**
 * GitHub Copilot CLI setup helper (moved from `setup.ts`)
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { commandExists, exec } from '../utils/exec.js'
import { log } from '../utils/logging.js'
import { ensureGeetoIgnored } from '../utils/config.js'
import { select } from '../cli/menu.js'
import { confirm } from '../cli/input.js'

// Default Copilot models list
const models = [
  { label: 'Claude Sonnet 4.5 (default)', value: 'claude-sonnet-4.5' },
  { label: 'Claude Haiku 4.5', value: 'claude-haiku-4.5' },
  { label: 'Claude Opus 4.5', value: 'claude-opus-4.5' },
  { label: 'Claude Sonnet 4', value: 'claude-sonnet-4' },
  {
    label: 'GPT-5.2-Codex (requires enablement) (latest version)',
    value: 'gpt-5.2-codex',
  },
  {
    label: 'GPT-5.1-Codex-Max (requires enablement)',
    value: 'gpt-5.1-codex-max',
  },
  { label: 'GPT-5.1-Codex', value: 'gpt-5.1-codex' },
  { label: 'GPT-5.2 (requires enablement)', value: 'gpt-5.2' },
  { label: 'GPT-5.1', value: 'gpt-5.1' },
  { label: 'GPT-5', value: 'gpt-5' },
  {
    label: 'GPT-5.1-Codex-Mini (requires enablement)',
    value: 'gpt-5.1-codex-mini',
  },
  { label: 'GPT-5 mini', value: 'gpt-5-mini' },
  { label: 'GPT-4.1', value: 'gpt-4.1' },
  { label: 'Gemini 3 Pro (Preview)', value: 'gemini-3-pro-preview' },
]

// Helper: Check Copilot version and warn if outdated
const checkCopilotVersion = (): void => {
  try {
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
      const minNum = 0 * 1e6 + 0 * 1e3 + 393
      if (currentNum < minNum) {
        log.warn(
          'Detected Copilot CLI version is older than v0.0.393 — the latest Copilot models are only supported on v0.0.393 and above. See: https://github.com/github/copilot-cli/releases'
        )
      }
    }
  } catch {
    // ignore version parse errors
  }
}

// Helper: Write default models if missing
const writeDefaultModelsIfMissing = (): void => {
  try {
    ensureGeetoIgnored()
    const outDir = path.join(process.cwd(), '.geeto')
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true })
    }
    const modelFilePath = path.join(outDir, 'copilot-model.json')
    if (fs.existsSync(modelFilePath)) {
      log.info(
        `Copilot model file already exists, skipping: ${path.join('.geeto', 'copilot-model.json')}`
      )
    } else {
      fs.writeFileSync(modelFilePath, JSON.stringify(models, null, 2), 'utf8')
      log.info(`Wrote default Copilot model list to: ${path.join('.geeto', 'copilot-model.json')}`)
    }
  } catch {
    /* ignore */
  }
}

// Helper: Setup GitHub CLI if needed
const setupGitHubCLI = (): boolean => {
  const platform = os.platform()

  // Check if GitHub CLI is already installed
  if (commandExists('gh')) {
    log.info('GitHub CLI already installed')
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
      log.success('GitHub CLI installed successfully!')
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
        log.success('GitHub CLI authenticated successfully')
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
    log.success('GitHub CLI already authenticated')
  } else {
    // Need to authenticate
    const ghAuthenticated = await authenticateGitHub()
    if (!ghAuthenticated) {
      return false
    }
  }

  // Now check/setup Copilot CLI
  if (commandExists('copilot')) {
    log.success('GitHub Copilot CLI already installed and ready to use')
    checkCopilotVersion()
    writeDefaultModelsIfMissing()
    return true
  }

  // Show informational text only if we reach installer flow
  log.info('GitHub Copilot CLI allows local AI workflows via the copilot command-line tool.')
  log.info('This helper will attempt to install and/or authenticate the Copilot CLI for you.')
  log.info(
    `This helper may write a default model list to: ${path.join('.geeto', 'copilot-model.json')} (only if missing). Copilot CLI uses local authentication; no API key is stored by Geeto.`
  )

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
          const npmBinPath = `${os.homedir()}\\AppData\\Roaming\\npm`
          if (!process.env.PATH?.includes(npmBinPath)) {
            process.env.PATH = `${process.env.PATH};${npmBinPath}`
            log.info('Added npm global bin to PATH')
          }
        } else {
          const possibleNpmPaths = ['/usr/local/bin', '/usr/bin', `${os.homedir()}/.npm-global/bin`]
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

      if (!commandExists('copilot')) {
        throw new Error('GitHub Copilot CLI command not found after installation')
      }

      log.info('GitHub Copilot CLI is ready to use!')
      checkCopilotVersion()
      writeDefaultModelsIfMissing()

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
    exec('copilot --help', true)
    log.success('GitHub Copilot CLI configured and ready to use')
    checkCopilotVersion()
    writeDefaultModelsIfMissing()

    return true
  } catch {
    // Try to find copilot in npm global bin if not in PATH
    if (commandExists('npm')) {
      try {
        const npmBinPath = path.join(exec('npm config get prefix', true).trim(), 'bin')
        const copilotCmd = platform === 'win32' ? 'copilot.cmd' : 'copilot'
        const copilotPath = path.join(npmBinPath, copilotCmd)
        if (fs.existsSync(copilotPath)) {
          log.warn('GitHub Copilot CLI installed but not in PATH!')
          log.info('Add this to your PATH or restart your terminal:')
          log.info(`  ${npmBinPath}`)
          log.info('')
          log.info('Or run copilot directly:')
          log.info(`  "${copilotPath}" --help`)
          return false
        }
      } catch {
        // Ignore npm prefix check errors
      }
    }

    log.warn('GitHub Copilot CLI may not be working properly')
    log.info('You can try running: copilot --help')
    log.info('Or reinstall with: npm install -g @github/copilot')
    return false
  }
}
