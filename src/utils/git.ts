/** Git helpers */

import { exec, execSilent } from './exec.js'
import {
  generateBranchNameWithProvider,
  getAIProviderDisplayName,
  getAIProviderShortName,
  getModelDisplayName,
  interactiveAIFallback,
  isContextLimitFailure,
  isTransientAIFailure,
} from './git-ai.js'
import { log } from './logging.js'
import { askQuestion, confirm } from '../cli/input.js'

export {
  generateBranchNameWithProvider,
  getAIProviderDisplayName,
  getAIProviderShortName,
  getModelDisplayName,
  interactiveAIFallback,
  isTransientAIFailure,
  isContextLimitFailure,
}

export { handleBranchNaming } from './branch-naming.js'

/**
 * Check if branch exists locally
 */
export const branchExists = (branchName: string): boolean => {
  try {
    execSilent(`git show-ref --verify --quiet refs/heads/${branchName}`)
    return true
  } catch {
    return false
  }
}

/**
 * Check if remote branch exists
 */
export const remoteBranchExists = (branchName: string): boolean => {
  try {
    execSilent(`git ls-remote --exit-code --heads origin ${branchName}`)
    return true
  } catch {
    return false
  }
}

/**
 * Validate branch name format
 */
export const validateBranchName = (branchName: string): { valid: boolean; reason?: string } => {
  if (!branchName || branchName.trim() === '') {
    return { valid: false, reason: 'Branch name cannot be empty' }
  }

  if (branchName.length > 255) {
    return { valid: false, reason: 'Branch name too long (max 255 characters)' }
  }

  // Check for invalid characters
  const invalidChars = /[ *:?[\\^~]/
  if (invalidChars.test(branchName)) {
    return { valid: false, reason: 'Branch name contains invalid characters' }
  }

  // Check for reserved names
  const reservedNames = ['HEAD', 'ORIG_HEAD', 'FETCH_HEAD', 'MERGE_HEAD', 'CHERRY_PICK_HEAD']
  if (reservedNames.includes(branchName.toUpperCase())) {
    return { valid: false, reason: 'Branch name is reserved by Git' }
  }

  // Check for names that start or end with certain patterns
  if (
    branchName.startsWith('.') ||
    branchName.endsWith('.') ||
    branchName.startsWith('/') ||
    branchName.endsWith('/') ||
    branchName.includes('..') ||
    branchName.includes('@{')
  ) {
    return { valid: false, reason: 'Branch name has invalid format' }
  }

  return { valid: true }
}

/**
 * Get the current branch name
 */
export const getCurrentBranch = (): string => {
  return execSilent('git branch --show-current')
}

/**
 * Get all local branches
 */
export const getLocalBranches = (): string[] => {
  const branches = execSilent('git branch --format="%(refname:short)"')
  return branches.split('\n').filter(Boolean)
}

/**
 * Get changed files (unstaged + untracked)
 */
export const getChangedFiles = (): string[] => {
  const status = execSilent('git status --porcelain')
  return status
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3))
}

/**
 * Get staged files
 */
export const getStagedFiles = (): string[] => {
  const status = execSilent('git diff --name-only --cached')
  return status.split('\n').filter(Boolean)
}

/**
 * Get recommended prefix separator based on existing branches
 */
export const getRecommendedPrefixSeparator = (): '/' | '#' => {
  try {
    const branches = getLocalBranches()
    let slashCount = 0
    let hashCount = 0

    for (const branch of branches) {
      if (branch.includes('/')) {
        slashCount++
      }
      if (branch.includes('#')) {
        hashCount++
      }
    }

    return hashCount >= slashCount ? '#' : '/'
  } catch {
    return '#'
  }
}

/**
 * Generate branch name suggestions based on staged files
 */
export const generateBranchSuggestions = (stagedFiles: string[], prefix: string): string[] => {
  const suggestions: string[] = []
  const recommendedSeparator = getRecommendedPrefixSeparator()

  if (stagedFiles.length === 0) {
    suggestions.push(
      `${prefix}${recommendedSeparator}update`,
      `${prefix}${recommendedSeparator}fix`,
      `${prefix}${recommendedSeparator}feature`
    )
    return suggestions
  }

  // Analyze file extensions and paths for suggestions
  const fileTypes = stagedFiles.map((file) => {
    const ext = file.split('.').pop()?.toLowerCase()
    const pathParts = file.split('/')
    const mainDir = pathParts.length > 1 ? pathParts[0] : ''

    return { ext, mainDir, filename: pathParts.at(-1) }
  })

  // Common patterns
  const hasTests = fileTypes.some(
    (f) => f.filename && (f.filename.includes('test') || f.filename.includes('spec'))
  )
  const hasConfig = fileTypes.some(
    (f) => f.filename && (f.filename.includes('config') || f.filename.includes('package'))
  )
  const hasDocs = fileTypes.some(
    (f) =>
      f.ext === 'md' ||
      (f.filename && (f.filename.includes('readme') || f.filename.includes('doc')))
  )
  const hasStyles = fileTypes.some((f) => ['css', 'scss', 'less', 'styl'].includes(f.ext ?? ''))
  const hasScripts = fileTypes.some((f) =>
    ['js', 'ts', 'py', 'rb', 'php', 'java', 'go'].includes(f.ext ?? '')
  )

  // Generate suggestions based on file types with recommended separator
  if (hasTests) {
    suggestions.push(
      `${prefix}${recommendedSeparator}test-update`,
      `${prefix}${recommendedSeparator}test-fix`
    )
  }

  if (hasConfig) {
    suggestions.push(
      `${prefix}${recommendedSeparator}config-update`,
      `${prefix}${recommendedSeparator}deps-update`
    )
  }

  if (hasDocs) {
    suggestions.push(
      `${prefix}${recommendedSeparator}docs-update`,
      `${prefix}${recommendedSeparator}readme-update`
    )
  }

  if (hasStyles) {
    suggestions.push(
      `${prefix}${recommendedSeparator}style-update`,
      `${prefix}${recommendedSeparator}ui-fix`
    )
  }

  if (hasScripts) {
    suggestions.push(
      `${prefix}${recommendedSeparator}feature`,
      `${prefix}${recommendedSeparator}bug-fix`
    )
  }

  // Fallback suggestions
  if (suggestions.length === 0) {
    suggestions.push(
      `${prefix}${recommendedSeparator}update`,
      `${prefix}${recommendedSeparator}fix`,
      `${prefix}${recommendedSeparator}feature`
    )
  }

  // Add some generic suggestions
  suggestions.push(
    `${prefix}${recommendedSeparator}refactor`,
    `${prefix}${recommendedSeparator}chore`
  )

  return [...new Set(suggestions)] // Remove duplicates
}

/**
 * Get branch prefix based on current branch (smart auto-detection)
 */
export const getBranchPrefix = (currentBranch: string): string => {
  // First, try to extract prefix from current branch name
  const slashIndex = currentBranch.indexOf('/')
  const hashIndex = currentBranch.indexOf('#')

  if (slashIndex > 0) {
    // Extract prefix before first slash (e.g., "dev/login" → "dev/")
    const prefix = currentBranch.slice(0, Math.max(0, slashIndex + 1))
    return prefix
  }

  if (hashIndex > 0) {
    // Extract prefix before first hash (e.g., "dev#auth" → "dev#")
    const prefix = currentBranch.slice(0, Math.max(0, hashIndex + 1))
    return prefix
  }

  // Fallback to mapping for common branch names
  const recommendedSeparator = getRecommendedPrefixSeparator()
  const branchMappings: Record<string, string> = {
    development: `dev${recommendedSeparator}`,
    develop: `dev${recommendedSeparator}`,
    dev: `dev${recommendedSeparator}`,
    main: `release${recommendedSeparator}`,
    master: `release${recommendedSeparator}`,
    staging: `stage${recommendedSeparator}`,
    production: `hotfix${recommendedSeparator}`,
    prod: `hotfix${recommendedSeparator}`,
    testing: `test${recommendedSeparator}`,
    test: `test${recommendedSeparator}`,
    qa: `qa${recommendedSeparator}`,
    feature: `feat${recommendedSeparator}`,
    features: `feat${recommendedSeparator}`,
    bugfix: `fix${recommendedSeparator}`,
    hotfix: `hotfix${recommendedSeparator}`,
    release: `release${recommendedSeparator}`,
  }

  return branchMappings[currentBranch.toLowerCase()] ?? `dev${recommendedSeparator}`
}

/**
 * Push wrapper with authentication retry loop.
 * Keeps prompting the user to retry if authentication fails so the user can update credentials externally.
 */
export const pushWithRetry = (cmd: string, silent: boolean = true): void => {
  for (let attempt = 0; ; attempt++) {
    try {
      exec(cmd, silent)
      return
    } catch (error) {
      const msg = String(error)
      const lower = msg.toLowerCase()
      const isAuth =
        lower.includes('authentication failed') ||
        lower.includes('http basic: access denied') ||
        lower.includes('fatal: authentication failed') ||
        lower.includes('remote:')

      if (isAuth) {
        // Inform user and allow retry
        log.error(
          'Push failed due to authentication. Check your credentials (use SSH or a Personal Access Token).'
        )
        log.info(
          'If you updated credentials (SSH key, credential helper, or PAT), select Retry to try again.'
        )

        const retry = confirm('Retry push?')
        if (!retry) {
          throw error
        }

        // Optionally allow the user to enter a token to set for this session
        const setToken = confirm('Would you like to enter a personal access token to try with?')
        if (setToken) {
          const token = askQuestion('Enter token (will be used only for this run): ').trim()
          if (token) {
            // Store into env for this process; users should prefer credential helpers for persistence
            process.env.GITHUB_TOKEN = token
            process.env.COPILOT_TOKEN = token
          }
        }

        // Loop to retry after user action
        continue
      }

      // Non-auth error: rethrow
      throw error
    }
  }
}

/**
 * Branch naming result interface
 */
export interface BranchNamingResult {
  workingBranch: string
  shouldRestart: boolean
  cancelled: boolean
}
