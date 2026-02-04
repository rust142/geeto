/**
 * GitHub Copilot CLI setup helper (moved from `setup.ts`)
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { confirm } from '../cli/input.js'
import { select } from '../cli/menu.js'
import { ensureGeetoIgnored } from '../utils/config.js'
import { commandExists, exec } from '../utils/exec.js'
import { log } from '../utils/logging.js'

// Minimum Copilot CLI version required for SDK compatibility (--acp/--server support)
const MIN_COPILOT_VERSION = '0.0.400'

// Cache file path for storing copilot binary info
const CACHE_FILE = path.join(os.homedir(), '.cache', 'geeto', 'copilot-bin.json')
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

interface CopilotBinCache {
  path: string
  version: string
  timestamp: number
}

/**
 * Parse version string to numeric value for comparison.
 * Returns null if parsing fails.
 */
const parseVersion = (ver: string): number | null => {
  const parts = ver.split('.').map((n) => Number.parseInt(n, 10))
  if (parts.some((p) => Number.isNaN(p))) {
    return null
  }
  while (parts.length < 3) {
    parts.push(0)
  }
  const [major = 0, minor = 0, patch = 0] = parts
  return major * 1_000_000 + minor * 1_000 + patch
}

/**
 * Read cached copilot binary info from file.
 */
const readCache = (): CopilotBinCache | null => {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) as CopilotBinCache
    // Check if cache is still valid (within TTL and binary still exists)
    if (Date.now() - data.timestamp < CACHE_TTL_MS && fs.existsSync(data.path)) {
      return data
    }
  } catch {
    // ignore
  }
  return null
}

/**
 * Write copilot binary info to cache file.
 */
const writeCache = (info: { path: string; version: string }): void => {
  try {
    const cacheDir = path.dirname(CACHE_FILE)
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true })
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ ...info, timestamp: Date.now() }))
  } catch {
    // ignore cache write failures
  }
}

/**
 * Get version from a specific copilot binary path.
 */
const getVersionFromPath = (binPath: string): string | null => {
  try {
    const verOut = exec(`"${binPath}" --version`, true)
    const m = verOut.match(/(\d+\.\d+\.\d+)/)
    return m?.[1] ?? null
  } catch {
    return null
  }
}

/**
 * Find the best (newest) copilot binary from known locations.
 * Uses file-based caching to avoid slow exec calls on every startup.
 */
const findBestCopilotBinary = (): { path: string; version: string } | null => {
  const minNum = parseVersion(MIN_COPILOT_VERSION) ?? 0

  // Super fast path: check cache first
  const cached = readCache()
  if (cached && (parseVersion(cached.version) ?? 0) >= minNum) {
    return { path: cached.path, version: cached.version }
  }

  // Check PATH first (most common case)
  try {
    const pathBin = exec('which copilot', true).trim()
    if (pathBin && fs.existsSync(pathBin)) {
      const ver = getVersionFromPath(pathBin)
      if (ver) {
        const num = parseVersion(ver) ?? 0
        if (num >= minNum) {
          const result = { path: pathBin, version: ver }
          writeCache(result)
          return result
        }
      }
    }
  } catch {
    // ignore, will check other locations
  }

  // PATH version is outdated or not found - scan known locations
  const home = os.homedir()
  const knownPaths = [
    '/usr/local/bin/copilot',
    '/usr/bin/copilot',
    path.join(home, '.config/Code/User/globalStorage/github.copilot-chat/copilotCli/copilot'),
    path.join(home, '.npm-global/bin/copilot'),
    path.join(home, '.local/bin/copilot'),
  ]

  for (const binPath of knownPaths) {
    if (fs.existsSync(binPath)) {
      const ver = getVersionFromPath(binPath)
      if (ver) {
        const num = parseVersion(ver) ?? 0
        if (num >= minNum) {
          const result = { path: binPath, version: ver }
          writeCache(result)
          return result
        }
      }
    }
  }

  return null
}

/**
 * Check Copilot CLI version and warn if outdated.
 * Automatically finds the newest copilot binary to bypass PATH cache issues.
 * Returns true if version is compatible, false otherwise.
 */
export const checkCopilotVersion = (): boolean => {
  const best = findBestCopilotBinary()

  if (!best) {
    // No copilot binary found anywhere
    return false
  }

  const currentNum = parseVersion(best.version)
  const minNum = parseVersion(MIN_COPILOT_VERSION)

  if (currentNum === null || minNum === null) {
    return false
  }

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
  const binDir = path.dirname(best.path)
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
