/**
 * Structured error message helpers
 */

import { colors } from './colors.js'

export interface ErrorWithHints {
  message: string
  hints?: string[]
  retry?: boolean
}

/**
 * Display a structured error with actionable hints
 */
export function displayError(error: ErrorWithHints): void {
  console.log(`\n${colors.red}✗ ${error.message}${colors.reset}`)

  if (error.hints && error.hints.length > 0) {
    for (const hint of error.hints) {
      console.log(`${colors.yellow}  → ${hint}${colors.reset}`)
    }
  }

  if (error.retry) {
    console.log(`${colors.gray}  ? Try again? (y/n)${colors.reset}`)
  }

  console.log('')
}

/**
 * Common error scenarios with hints
 */
export const ErrorMessages = {
  notGitRepo: (): ErrorWithHints => ({
    message: 'Not a git repository',
    hints: [
      'Initialize git with: git init',
      'Or clone an existing repository',
      'Make sure you are in the correct directory',
    ],
  }),

  noStagedFiles: (): ErrorWithHints => ({
    message: 'No staged files found',
    hints: [
      'Stage your changes with: git add <files>',
      'Or use the staging step in the workflow',
      'Check if there are changes: git status',
    ],
  }),

  pushFailed: (details?: string): ErrorWithHints => ({
    message: details ?? 'Push to remote failed',
    hints: [
      'Check your network connection',
      'Verify remote repository access',
      'Pull latest changes first: git pull',
      'Check git output above for specific error',
    ],
    retry: true,
  }),

  mergeConflict: (): ErrorWithHints => ({
    message: 'Merge conflict detected',
    hints: [
      'Resolve conflicts manually in your editor',
      'Use: git status to see conflicted files',
      'After resolving: git add <files> && git commit',
      'Or abort merge: git merge --abort',
    ],
  }),

  authFailed: (service: string): ErrorWithHints => ({
    message: `${service} authentication failed`,
    hints: [
      `Verify your ${service} credentials`,
      'Check if access token is valid',
      'Run setup again to re-authenticate',
    ],
    retry: true,
  }),

  trelloNotConfigured: (): ErrorWithHints => ({
    message: 'Trello integration not configured',
    hints: [
      'Run setup from Settings menu',
      'Get API key from: https://trello.com/app-key',
      "You'll need both API key and token",
    ],
  }),

  invalidBranchName: (reason: string): ErrorWithHints => ({
    message: `Invalid branch name: ${reason}`,
    hints: [
      'Branch names cannot contain spaces or special characters',
      'Use lowercase letters, numbers, hyphens, and underscores',
      'Follow format: type/description (e.g., feat/add-login)',
    ],
  }),

  branchExists: (branchName: string): ErrorWithHints => ({
    message: `Branch '${branchName}' already exists`,
    hints: [
      'Use a different branch name',
      'Switch to existing branch: git checkout ' + branchName,
      'Delete existing branch: git branch -D ' + branchName,
    ],
  }),

  commitFailed: (reason?: string): ErrorWithHints => ({
    message: reason ?? 'Commit failed',
    hints: [
      'Check if commit hooks are passing',
      'Ensure commit message is not empty',
      'Review git hook errors in output above',
    ],
    retry: true,
  }),
}
