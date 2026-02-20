/**
 * Status workflow
 * Pretty git status with colored output and context info
 */

import fs from 'node:fs'
import path from 'node:path'

import { colors } from '../utils/colors.js'
import { statusBadge } from '../utils/display.js'
import { execSilent } from '../utils/exec.js'
import { getCurrentBranch } from '../utils/git.js'
import { log } from '../utils/logging.js'

/**
 * Get tracking upstream info
 */
const getUpstreamInfo = (): { upstream: string; ahead: number; behind: number } | null => {
  try {
    const upstream = execSilent('git rev-parse --abbrev-ref @{upstream}').trim()
    if (!upstream) return null
    const output = execSilent('git rev-list --left-right --count HEAD...@{upstream}').trim()
    const [ahead, behind] = output.split('\t').map(Number)
    return { upstream, ahead: ahead ?? 0, behind: behind ?? 0 }
  } catch {
    return null
  }
}

/**
 * Detect in-progress operations
 */
const detectOngoingOps = (): string[] => {
  const ops: string[] = []
  try {
    const gitDir = execSilent('git rev-parse --git-dir').trim()

    if (fs.existsSync(path.join(gitDir, 'MERGE_HEAD'))) ops.push('merge')
    if (
      fs.existsSync(path.join(gitDir, 'rebase-merge')) ||
      fs.existsSync(path.join(gitDir, 'rebase-apply'))
    )
      ops.push('rebase')
    if (fs.existsSync(path.join(gitDir, 'CHERRY_PICK_HEAD'))) ops.push('cherry-pick')
    if (fs.existsSync(path.join(gitDir, 'REVERT_HEAD'))) ops.push('revert')
    if (fs.existsSync(path.join(gitDir, 'BISECT_LOG'))) ops.push('bisect')
  } catch {
    // Ignore
  }
  return ops
}

/**
 * Handle the status workflow
 */
export const handleStatus = (): void => {
  const C = colors.cyan
  const R = colors.reset
  const G = colors.green
  const Y = colors.yellow
  const GR = colors.gray
  const RED = colors.red

  console.log('')
  console.log(`  ${C}📋 Git Status${R}`)
  console.log(`  ${GR}${'─'.repeat(35)}${R}`)
  console.log('')

  // Branch info
  const branch = getCurrentBranch()
  console.log(`  ${GR}Branch:${R}    ${G}${branch}${R}`)

  // Upstream info
  const upstream = getUpstreamInfo()
  if (upstream) {
    console.log(`  ${GR}Upstream:${R}  ${C}${upstream.upstream}${R}`)
    const parts: string[] = []
    if (upstream.behind > 0) parts.push(`${RED}${upstream.behind} behind${R}`)
    if (upstream.ahead > 0) parts.push(`${G}${upstream.ahead} ahead${R}`)
    if (parts.length > 0) {
      console.log(`  ${GR}Sync:${R}      ${parts.join('  ')}`)
    } else {
      console.log(`  ${GR}Sync:${R}      ${G}up to date${R}`)
    }
  } else {
    console.log(`  ${GR}Upstream:${R}  ${Y}(none)${R}`)
  }

  // Ongoing operations
  const ongoing = detectOngoingOps()
  if (ongoing.length > 0) {
    console.log(
      `  ${GR}Active:${R}    ${RED}${ongoing.join(', ')} in progress${R}  ${GR}(use geeto --abort)${R}`
    )
  }

  console.log('')

  // Porcelain status
  let statusOutput: string
  try {
    statusOutput = execSilent('git status --porcelain=v1').trim()
  } catch {
    log.error('Failed to get git status.')
    console.log('')
    return
  }

  if (!statusOutput) {
    log.success('Working tree clean — nothing to commit.')
    console.log('')
    return
  }

  // Parse and categorize
  const staged: string[] = []
  const unstaged: string[] = []
  const untracked: string[] = []

  for (const line of statusOutput.split('\n')) {
    if (!line || line.length < 3) continue
    const xy = line.slice(0, 2)
    const file = line.slice(3)

    const x = xy[0] ?? ' '
    const y = xy[1] ?? ' '

    if (x === '?' && y === '?') {
      untracked.push(file)
    } else {
      if (x !== ' ' && x !== '?') {
        staged.push(`${statusBadge(xy)} ${file}`)
      }
      if (y !== ' ' && y !== '?') {
        unstaged.push(`${statusBadge(xy)} ${file}`)
      }
    }
  }

  // Display staged
  if (staged.length > 0) {
    console.log(`  ${G}Staged (${staged.length}):${R}`)
    for (const item of staged) {
      console.log(`    ${item}`)
    }
    console.log('')
  }

  // Display unstaged
  if (unstaged.length > 0) {
    console.log(`  ${Y}Modified (${unstaged.length}):${R}`)
    for (const item of unstaged) {
      console.log(`    ${item}`)
    }
    console.log('')
  }

  // Display untracked
  if (untracked.length > 0) {
    console.log(`  ${RED}Untracked (${untracked.length}):${R}`)
    for (const file of untracked) {
      console.log(`    ${GR}?${R} ${file}`)
    }
    console.log('')
  }

  // Summary line
  const total = staged.length + unstaged.length + untracked.length
  console.log(
    `  ${GR}Total: ${total} file${total === 1 ? '' : 's'}` +
      ` (${G}${staged.length} staged${R}${GR},` +
      ` ${Y}${unstaged.length} modified${R}${GR},` +
      ` ${RED}${untracked.length} untracked${R}${GR})${R}`
  )
  console.log('')
}
