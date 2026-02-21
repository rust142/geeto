/**
 * Abort workflow
 * Detect and abort in-progress git operations (merge, rebase, cherry-pick, revert)
 */

import fs from 'node:fs'
import path from 'node:path'

import { confirm } from '../cli/input.js'
import { select } from '../cli/menu.js'
import { colors } from '../utils/colors.js'
import { exec, execSilent } from '../utils/exec.js'
import { log } from '../utils/logging.js'

type InProgressOp = {
  type: 'merge' | 'rebase' | 'cherry-pick' | 'revert'
  label: string
  abortCmd: string
  indicator: string
}

/**
 * Get the .git directory path (handles worktrees)
 */
const getGitDir = (): string => {
  try {
    return execSilent('git rev-parse --git-dir').trim()
  } catch {
    return '.git'
  }
}

/**
 * Detect all in-progress git operations
 */
const detectInProgressOps = (): InProgressOp[] => {
  const gitDir = getGitDir()
  const ops: InProgressOp[] = []

  // Merge in progress — .git/MERGE_HEAD exists
  const mergeHead = path.join(gitDir, 'MERGE_HEAD')
  if (fs.existsSync(mergeHead)) {
    ops.push({
      type: 'merge',
      label: 'Merge',
      abortCmd: 'git merge --abort',
      indicator: 'MERGE_HEAD',
    })
  }

  // Rebase in progress — .git/rebase-merge/ or .git/rebase-apply/ exists
  const rebaseMerge = path.join(gitDir, 'rebase-merge')
  const rebaseApply = path.join(gitDir, 'rebase-apply')
  if (fs.existsSync(rebaseMerge) || fs.existsSync(rebaseApply)) {
    ops.push({
      type: 'rebase',
      label: 'Rebase',
      abortCmd: 'git rebase --abort',
      indicator: fs.existsSync(rebaseMerge) ? 'rebase-merge/' : 'rebase-apply/',
    })
  }

  // Cherry-pick in progress — .git/CHERRY_PICK_HEAD exists
  const cherryHead = path.join(gitDir, 'CHERRY_PICK_HEAD')
  if (fs.existsSync(cherryHead)) {
    ops.push({
      type: 'cherry-pick',
      label: 'Cherry-pick',
      abortCmd: 'git cherry-pick --abort',
      indicator: 'CHERRY_PICK_HEAD',
    })
  }

  // Revert in progress — .git/REVERT_HEAD exists
  const revertHead = path.join(gitDir, 'REVERT_HEAD')
  if (fs.existsSync(revertHead)) {
    ops.push({
      type: 'revert',
      label: 'Revert',
      abortCmd: 'git revert --abort',
      indicator: 'REVERT_HEAD',
    })
  }

  return ops
}

/**
 * Handle the abort workflow
 */
export const handleAbort = async (): Promise<void> => {
  const C = colors.cyan
  const R = colors.reset
  const G = colors.green
  const Y = colors.yellow
  const GR = colors.gray

  console.log('')
  console.log(`  ${C}⚡ Abort In-Progress Operation${R}`)
  console.log(`  ${GR}${'─'.repeat(35)}${R}`)
  console.log('')

  const ops = detectInProgressOps()

  if (ops.length === 0) {
    log.success('No in-progress operation detected. Nothing to abort.')
    console.log('')
    console.log(`  ${GR}Checked: merge, rebase, cherry-pick, revert${R}`)
    console.log('')
    return
  }

  // Show detected operations
  console.log(`  ${Y}Detected in-progress operation${ops.length > 1 ? 's' : ''}:${R}`)
  console.log('')
  for (const op of ops) {
    console.log(`    ${C}●${R} ${op.label}  ${GR}(${op.indicator})${R}`)
  }
  console.log('')

  let selected: InProgressOp

  if (ops.length === 1) {
    selected = ops[0] as InProgressOp
  } else {
    // Multiple operations — let user choose
    const choice = await select(
      'Which operation to abort?',
      ops.map((op) => ({
        label: `${op.label}  ${GR}→ ${op.abortCmd}${R}`,
        value: op.type,
      }))
    )

    const found = ops.find((op) => op.type === choice)
    if (!found) {
      log.warn('Cancelled.')
      return
    }
    selected = found
  }

  // Show what will happen
  console.log(`  ${GR}Command: ${selected.abortCmd}${R}`)
  console.log('')

  const ok = confirm(`Abort ${selected.label.toLowerCase()}?`, true)
  if (!ok) {
    log.warn('Cancelled.')
    return
  }

  try {
    console.log('')
    const spinner = log.spinner()
    spinner.start(`Aborting ${selected.label.toLowerCase()}...`)
    exec(selected.abortCmd, true)
    spinner.succeed(`${selected.label} aborted successfully`)

    // Show current state after abort
    try {
      const branch = execSilent('git rev-parse --abbrev-ref HEAD').trim()
      const status = execSilent('git status --short').trim()
      console.log(`  ${GR}Current branch: ${G}${branch}${R}`)
      if (status) {
        const fileCount = status.split('\n').filter(Boolean).length
        const plural = fileCount === 1 ? '' : 's'
        console.log(`  ${GR}Working tree: ${Y}${fileCount} changed file${plural}${R}`)
      } else {
        console.log(`  ${GR}Working tree: ${G}clean${R}`)
      }
    } catch {
      // Non-critical, ignore
    }
    console.log('')
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    log.error(`Failed to abort ${selected.label.toLowerCase()}: ${msg}`)
    console.log('')
    console.log(`  ${GR}Try running manually: ${C}${selected.abortCmd}${R}`)
    console.log('')
  }
}
