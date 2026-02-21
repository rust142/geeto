/**
 * Dry-run mode utilities.
 * When enabled, mutating git/API commands are logged instead of executed.
 */

import { colors } from './colors.js'

let dryRunEnabled = false
const collectedCommands: string[] = []

/** Enable or disable dry-run mode globally. */
export const setDryRun = (enabled: boolean): void => {
  dryRunEnabled = enabled
}

/** Check whether dry-run mode is active. */
export const isDryRun = (): boolean => dryRunEnabled

/** Log a command that would have been executed in dry-run mode. */
export const logDryRun = (command: string): void => {
  collectedCommands.push(command)
  console.log(
    `\n${colors.yellow}⚡ [DRY-RUN]${colors.reset} Would run: ${colors.gray}${command}${colors.reset}\n`
  )
}

/** Get all collected dry-run commands. */
export const getDryRunCommands = (): readonly string[] => collectedCommands

/** Print the dry-run banner at the start of execution. */
export const printDryRunBanner = (): void => {
  console.log('')
  console.log(
    `  ${colors.yellow}${colors.bright}⚡ DRY-RUN MODE${colors.reset}  ${colors.gray}— no changes will be made${colors.reset}`
  )
  console.log('')
}

/** Print a summary of all commands that would have been executed. */
export const printDryRunSummary = (): void => {
  if (collectedCommands.length === 0) {
    console.log(
      `\n${colors.yellow}⚡${colors.reset} ${colors.gray}No mutating commands were triggered in this workflow.${colors.reset}`
    )
    return
  }
  console.log(`\n${colors.yellow}${colors.bright}⚡ DRY-RUN SUMMARY${colors.reset}`)
  console.log(`${colors.gray}${'─'.repeat(58)}${colors.reset}`)
  for (const [i, cmd] of collectedCommands.entries()) {
    console.log(`  ${colors.yellow}${i + 1}.${colors.reset} ${cmd}`)
  }
  console.log(`${colors.gray}${'─'.repeat(58)}${colors.reset}`)
  console.log(
    `  ${colors.gray}Total: ${collectedCommands.length} command(s) skipped${colors.reset}\n`
  )
}

/** Regex patterns for read-only git commands. */
const READ_ONLY_PATTERNS = [
  /^git\s+status/,
  /^git\s+log\b/,
  /^git\s+diff\b/,
  /^git\s+rev-parse/,
  /^git\s+branch$/,
  /^git\s+branch\s+--/,
  /^git\s+branch\s+-[arvl]/,
  /^git\s+remote/,
  /^git\s+fetch/,
  /^git\s+config/,
  /^git\s+reflog/,
  /^git\s+show\b/,
  /^git\s+describe/,
  /^git\s+ls-files/,
  /^git\s+ls-remote/,
  /^git\s+cat-file/,
  /^git\s+name-rev/,
  /^git\s+rev-list/,
  /^git\s+for-each-ref/,
  /^git\s+shortlog/,
  /^git\s+symbolic-ref/,
  /^git\s+merge-base/,
  /^git\s+stash\s+list/,
]

/** Mutating git branch operations. */
const MUTATING_BRANCH_PATTERNS = [
  /^git\s+branch\s+-[dDmMcC]/,
  /^git\s+branch\s+--delete/,
  /^git\s+branch\s+--move/,
  /^git\s+branch\s+--copy/,
  /^git\s+branch\s+--set-upstream/,
  /^git\s+branch\s+--unset-upstream/,
]

/** Check if a command is read-only (safe to execute in dry-run mode). */
export const isReadOnlyCommand = (command: string): boolean => {
  const trimmed = command.trim()
  return READ_ONLY_PATTERNS.some((pattern) => pattern.test(trimmed))
}

/** Check if a command is a mutating command that should be skipped in dry-run. */
export const isMutatingCommand = (command: string): boolean => {
  const trimmed = command.trim()
  // git branch needs special handling — most flags are read-only
  if (/^git\s+branch\b/.test(trimmed)) {
    return MUTATING_BRANCH_PATTERNS.some((p) => p.test(trimmed))
  }
  // If it's a git command but not read-only, it's mutating
  if (/^git\s+/.test(trimmed)) {
    return !isReadOnlyCommand(trimmed)
  }
  // GitHub CLI mutating commands
  if (/^gh\s+(pr\s+create|issue\s+create|repo\s+edit|release\s+create)/.test(trimmed)) {
    return true
  }
  // open/xdg-open (browser) — skip in dry-run
  if (/^(open|start|xdg-open)\s+/.test(trimmed)) {
    return true
  }
  return false
}
