/**
 * Git command execution utilities
 */

import { exec } from './exec.js'

/** Execute git command with error handling */
export function gitExec(command: string, silent = false): string {
  const fullCommand = command.startsWith('git ') ? command : `git ${command}`
  return exec(fullCommand, silent)
}

/** Check if we're in a git repository */
export function isGitRepository(): boolean {
  try {
    gitExec('rev-parse --is-inside-work-tree', true)
    return true
  } catch {
    return false
  }
}

/** Get git config value */
export function getGitConfig(key: string): string {
  try {
    return gitExec(`config ${key}`, true).trim()
  } catch {
    return ''
  }
}

/** Set git config value */
export function setGitConfig(key: string, value: string): void {
  gitExec(`config ${key} "${value}"`)
}

/** Get git user info */
export function getGitUser(): { name: string; email: string } {
  return {
    name: getGitConfig('user.name'),
    email: getGitConfig('user.email'),
  }
}

/** Get remote URL */
export function getRemoteUrl(remote = 'origin'): string {
  try {
    return gitExec(`remote get-url ${remote}`, true).trim()
  } catch {
    return ''
  }
}

/** Get upstream branch */
export function getUpstreamBranch(): string {
  try {
    return gitExec('rev-parse --abbrev-ref --symbolic-full-name @{u}', true).trim()
  } catch {
    return ''
  }
}
