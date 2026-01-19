/**
 * Git command utilities
 */

import type { FreeModel } from '../types'

import { execGit, execSilent } from './exec.js'

/**
 * Get display name for AI provider
 */
export function getAIProviderDisplayName(aiProvider: string): string {
  switch (aiProvider) {
    case 'gemini': {
      return 'Gemini AI'
    }
    case 'copilot': {
      return 'GitHub Copilot'
    }
    default: {
      return 'OpenRouter'
    }
  }
}

/**
 * Generate branch name from title using the specified AI provider
 */
export async function generateBranchNameFromTitleWithProvider(
  aiProvider: string,
  title: string,
  correction?: string,
  copilotModel?: 'claude-haiku-4.5' | 'gpt-5',
  openrouterModel?: FreeModel
): Promise<string | null> {
  switch (aiProvider) {
    case 'gemini': {
      const { generateBranchNameFromTitle } = await import('../api/gemini.js')
      return generateBranchNameFromTitle(title, correction)
    }
    case 'copilot': {
      const { generateBranchNameFromTitle } = await import('../api/copilot.js')
      return generateBranchNameFromTitle(title, correction, copilotModel)
    }
    default: {
      const { generateBranchNameFromTitle } = await import('../api/openrouter.js')
      return generateBranchNameFromTitle(title, correction, openrouterModel)
    }
  }
}

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
  const status = execSilent('git diff --cached --name-only')
  return status.split('\n').filter(Boolean)
}

/**
 * Generate branch name suggestions based on staged files
 */
export const generateBranchSuggestions = (stagedFiles: string[], prefix: string): string[] => {
  const suggestions: string[] = []

  if (stagedFiles.length === 0) {
    suggestions.push(`${prefix}#update`, `${prefix}#fix`, `${prefix}#feature`)
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

  // Generate suggestions based on file types with dev#title format
  if (hasTests) {
    suggestions.push(`${prefix}#test-update`, `${prefix}#test-fix`)
  }

  if (hasConfig) {
    suggestions.push(`${prefix}#config-update`, `${prefix}#deps-update`)
  }

  if (hasDocs) {
    suggestions.push(`${prefix}#docs-update`, `${prefix}#readme-update`)
  }

  if (hasStyles) {
    suggestions.push(`${prefix}#style-update`, `${prefix}#ui-fix`)
  }

  if (hasScripts) {
    suggestions.push(`${prefix}#feature`, `${prefix}#bug-fix`)
  }

  // Fallback suggestions
  if (suggestions.length === 0) {
    suggestions.push(`${prefix}#update`, `${prefix}#fix`, `${prefix}#feature`)
  }

  // Add some generic suggestions
  suggestions.push(`${prefix}#refactor`, `${prefix}#chore`)

  return [...new Set(suggestions)] // Remove duplicates
}
export const getRecommendedSeparator = (): '-' | '_' => {
  try {
    const branches = getLocalBranches()
    let hyphenCount = 0
    let underscoreCount = 0

    for (const branch of branches) {
      const hyphens = (branch.match(/-/g) ?? []).length
      const underscores = (branch.match(/_/g) ?? []).length

      hyphenCount += hyphens
      underscoreCount += underscores
    }

    return underscoreCount > hyphenCount ? '_' : '-'
  } catch {
    return '-'
  }
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
  const branchMappings: Record<string, string> = {
    development: 'dev#',
    develop: 'dev#',
    dev: 'dev#',
    main: 'release#',
    master: 'release#',
    staging: 'stage#',
    production: 'hotfix#',
    prod: 'hotfix#',
    testing: 'test#',
    test: 'test#',
    qa: 'qa#',
    feature: 'feat#',
    features: 'feat#',
    bugfix: 'fix#',
    hotfix: 'hotfix#',
    release: 'release#',
  }

  return branchMappings[currentBranch.toLowerCase()] ?? 'dev#'
}

/**
 * Branch naming result interface
 */
export interface BranchNamingResult {
  workingBranch: string
  shouldRestart: boolean
  cancelled: boolean
}

/**
 * Handle branch naming menu (AI or custom)
 */
export const handleBranchNaming = async (
  defaultPrefix: string,
  separator: '-' | '_',
  trelloCardId: string,
  stagedFiles: string[],
  currentBranch: string,
  aiProvider: 'gemini' | 'copilot' | 'openrouter' = 'gemini',
  model?:
    | 'claude-haiku-4.5'
    | 'claude-1-haiku'
    | 'gpt-5'
    | 'gpt-3.5-turbo'
    | 'claude-haiku-4.5'
    | 'grok-beta'
    | 'mistral-7b'
    | FreeModel
): Promise<BranchNamingResult> => {
  const { askQuestion } = await import('../cli/input.js')
  const { select } = await import('../cli/menu.js')
  const { exec } = await import('./exec.js')
  const { log } = await import('./logging.js')
  const { colors } = await import('./colors.js')

  const result: BranchNamingResult = {
    workingBranch: '',
    shouldRestart: false,
    cancelled: false,
  }

  // This function handles AI branch naming directly
  const diff = execGit('git diff --cached', true)
  let correction = ''

  // Loop until branch name is accepted
  // eslint-disable-next-line no-constant-condition
  while (true) {
    log.ai(`Generating branch name with ${getAIProviderDisplayName(aiProvider)}...`)

    let aiSuffix: string | null = null

    switch (aiProvider) {
      case 'gemini': {
        const { generateBranchName } = await import('../api/gemini.js')
        aiSuffix = await generateBranchName(defaultPrefix, stagedFiles, diff, correction)

        break
      }
      case 'copilot': {
        const { generateBranchNameFromTitle } = await import('../api/copilot.js')
        // For Copilot, we need to create a title from the diff or staged files
        const titleFromDiff =
          stagedFiles.length > 0
            ? `Update ${stagedFiles.slice(0, 3).join(', ')}${stagedFiles.length > 3 ? ' and more' : ''}`
            : 'Code changes'
        aiSuffix = await generateBranchNameFromTitle(
          titleFromDiff,
          correction,
          model as 'claude-haiku-4.5' | 'gpt-5'
        )

        break
      }
      case 'openrouter': {
        const { generateBranchNameFromTitle } = await import('../api/openrouter.js')
        // For OpenRouter, we need to create a title from the diff or staged files
        const titleFromDiff =
          stagedFiles.length > 0
            ? `Update ${stagedFiles.slice(0, 3).join(', ')}${stagedFiles.length > 3 ? ' and more' : ''}`
            : 'Code changes'
        aiSuffix = await generateBranchNameFromTitle(titleFromDiff, correction, model as FreeModel)

        break
      }
      // No default
    }

    if (!aiSuffix) {
      log.warn(
        `${getAIProviderDisplayName(aiProvider)} generation failed, falling back to manual input`
      )
      while (!result.workingBranch || result.workingBranch.trim() === '') {
        result.workingBranch = askQuestion('Enter branch name: ').trim()
        if (!result.workingBranch) {
          log.error('Branch name cannot be empty!')
        }
      }
      break
    }

    log.info(`${getAIProviderDisplayName(aiProvider)} generated: "${aiSuffix}"`)

    const cleanSuffix = aiSuffix
      .toLowerCase()
      .replaceAll(/\W+/g, separator)
      .replace(separator === '-' ? /-+/g : /_+/g, separator)
      .replace(separator === '-' ? /^-|-$/g : /^_|_$/g, '')
      .trim()

    // Check if branch name seems incomplete
    const incompletePatterns =
      separator === '-'
        ? ['-and', '-or', '-with', '-for', '-the', '-a', '-an', '-in', '-on', '-at', '-to', '-of']
        : ['_and', '_or', '_with', '_for', '_the', '_a', '_an', '_in', '_on', '_at', '_to', '_of']
    const seemsIncomplete = incompletePatterns.some((pattern) => cleanSuffix.endsWith(pattern))

    if (seemsIncomplete) {
      log.warn(
        `AI response seems incomplete (ends with "${cleanSuffix.slice(-4)}"), regenerating...`
      )
      correction = 'Generate a complete branch name without truncation'
      continue
    }

    const currentSuggestion = trelloCardId
      ? `${defaultPrefix}${trelloCardId}${separator}${cleanSuffix}`
      : `${defaultPrefix}${cleanSuffix}`

    log.ai(`Suggested: ${colors.cyan}${currentSuggestion}${colors.reset}`)

    const acceptAi = await select('Accept this branch name?', [
      { label: 'Yes, use it', value: 'accept' },
      { label: 'Regenerate', value: 'regenerate' },
      { label: 'Correct AI (give feedback)', value: 'correct' },
      { label: 'Edit manually', value: 'edit' },
      { label: 'Back to branch menu', value: 'back' },
    ])

    switch (acceptAi) {
      case 'accept': {
        result.workingBranch = currentSuggestion
        break
      }
      case 'regenerate': {
        correction = ''
        continue
      }
      case 'correct': {
        correction = askQuestion('What should be different? ')
        continue
      }
      case 'edit': {
        const edited = askQuestion(`Edit branch (${currentSuggestion}): `)
        result.workingBranch = edited || currentSuggestion
        break
      }
      case 'back': {
        result.shouldRestart = true
        break
      }
    }

    if (result.workingBranch || acceptAi === 'back') {
      break
    }
  }

  // Create branch if we have a valid name
  if (result.workingBranch && result.workingBranch !== currentBranch) {
    // Validate branch name
    const validation = validateBranchName(result.workingBranch)
    if (!validation.valid) {
      log.error(`Invalid branch name: ${validation.reason}`)
      result.workingBranch = ''
      return result
    }

    // Check if branch already exists
    if (branchExists(result.workingBranch)) {
      log.error(`Branch '${result.workingBranch}' already exists locally`)
      result.workingBranch = ''
      return result
    }

    log.info(`Creating branch: ${result.workingBranch}`)
    exec(`git checkout -b "${result.workingBranch}"`)
    log.success(`Branch created: ${result.workingBranch}`)
  }

  return result
}
