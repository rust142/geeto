import { askQuestion } from '../cli/input.js'
import { colors } from '../utils/colors.js'
import { exec } from '../utils/exec.js'
import {
  branchExists,
  getBranchPrefix,
  isContextLimitFailure,
  validateBranchName,
} from '../utils/git.js'
import { log } from '../utils/logging.js'

/**
 * Prompt the user for a manual branch name until valid.
 */
export function promptManualBranch(curBranch: string): string {
  const customPrefix = getBranchPrefix(curBranch)
  let valid = false
  let name = ''
  while (!valid) {
    name = askQuestion('Enter branch name:', `${customPrefix}new-feature`)
    const validation = validateBranchName(name)
    if (validation.valid) {
      valid = true
    } else {
      log.error(`Invalid branch name: ${validation.reason}`)
    }
  }
  return name
}

/**
 * Create a branch if valid and not existing. Returns true when created.
 */
export const createBranch = (name: string, currentBranch: string): boolean => {
  if (!name || name === currentBranch) {
    return false
  }

  const validation = validateBranchName(name)
  if (!validation.valid) {
    log.error(`Invalid branch name: ${validation.reason}`)
    return false
  }

  if (branchExists(name)) {
    log.error(`Branch '${name}' already exists locally`)
    return false
  }

  // Reject branch names that look like AI context/token-limit error messages
  const low = String(name).toLowerCase()
  if (
    isContextLimitFailure(low) ||
    low.includes('token') ||
    low.includes('context') ||
    low.includes('requested') ||
    low.includes('maximum') ||
    low.includes('middle-out')
  ) {
    log.error(
      'Proposed branch name looks like an AI error message; please regenerate or choose a different model/provider'
    )
    return false
  }

  log.info(`Creating branch: ${name}`)
  exec(`git checkout -b "${name}"`)
  log.success(`Branch created: ${colors.cyan}${name}${colors.reset}`)
  return true
}
