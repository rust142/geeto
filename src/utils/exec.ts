/**
 * Command execution utilities
 */

import { execSync } from 'node:child_process'

import { log } from './logging.js'

/**
 * Execute a command and return the trimmed output
 */
export const exec = (command: string, silent = false): string => {
  try {
    const result = execSync(command, { encoding: 'utf8', stdio: silent ? 'pipe' : 'inherit' })
    return result?.trim() || ''
  } catch (error) {
    if (!silent) {
      log.error(`Error executing: ${command}`)
    }
    throw error
  }
}

/**
 * Execute a git command that may return exit code 1 (like git diff when there are changes)
 */
export const execGit = (command: string, silent = false): string => {
  try {
    const result = execSync(command, { encoding: 'utf8', stdio: silent ? 'pipe' : 'inherit' })
    return result?.trim() || ''
  } catch (error) {
    // For git commands, exit code 1 is often not an error (e.g., git diff when there are changes)
    const execError = error as { status?: number }
    if (execError.status === 1 && command.includes('git diff')) {
      // Return empty string for git diff when there are no changes to diff
      return ''
    }
    if (!silent) {
      log.error(`Error executing: ${command}`)
    }
    throw error
  }
}

/**
 * Execute a command silently and return the trimmed output
 */
export const execSilent = (command: string): string => {
  return exec(command, true)
}

/**
 * Check if a command exists (cross-platform)
 */
export const commandExists = (command: string): boolean => {
  const platform = process.platform
  const checkCommand = platform === 'win32' ? 'where' : 'which'
  try {
    execSilent(`${checkCommand} ${command}`)
    return true
  } catch {
    return false
  }
}
