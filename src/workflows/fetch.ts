/**
 * Fetch workflow
 * Fetch latest changes from remote with status overview
 */

import { select } from '../cli/menu.js'
import { colors } from '../utils/colors.js'
import { exec, execSilent } from '../utils/exec.js'
import { getCurrentBranch } from '../utils/git.js'
import { log } from '../utils/logging.js'

/**
 * Get configured remotes
 */
const getRemotes = (): string[] => {
  try {
    return execSilent('git remote').trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Handle the fetch workflow
 */
export const handleFetch = async (): Promise<void> => {
  const C = colors.cyan
  const R = colors.reset
  const G = colors.green
  const GR = colors.gray
  const RED = colors.red

  console.log('')
  console.log(`  ${C}📡 Git Fetch${R}`)
  console.log(`  ${GR}${'─'.repeat(35)}${R}`)
  console.log('')

  const remotes = getRemotes()
  const currentBranch = getCurrentBranch()

  if (remotes.length === 0) {
    log.error('No remotes configured.')
    console.log(`  ${GR}Add a remote: git remote add origin <url>${R}`)
    console.log('')
    return
  }

  // Choose what to fetch
  const mode = await select('Fetch mode:', [
    {
      label: `All remotes  ${GR}(--all)${R}`,
      value: 'all',
    },
    {
      label: `All + prune stale  ${GR}(--all --prune)${R}`,
      value: 'all-prune',
    },
    ...(remotes.length > 1
      ? [
          {
            label: `Specific remote`,
            value: 'pick',
          },
        ]
      : []),
  ])

  let fetchCmd: string

  if (mode === 'pick') {
    const remote = await select(
      'Fetch from which remote?',
      remotes.map((r) => ({ label: r, value: r }))
    )
    fetchCmd = `git fetch ${remote}`
  } else if (mode === 'all-prune') {
    fetchCmd = 'git fetch --all --prune'
  } else {
    fetchCmd = 'git fetch --all'
  }

  console.log('')
  console.log(`  ${GR}Running: ${fetchCmd}${R}`)
  console.log('')

  try {
    exec(fetchCmd, false)
    log.success('Fetch completed.')
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    log.error(`Fetch failed: ${msg}`)
    console.log('')
    return
  }

  // Show ahead/behind after fetch
  console.log('')
  try {
    const upstreamCheck = execSilent('git rev-parse --abbrev-ref @{upstream}').trim()
    if (upstreamCheck) {
      const output = execSilent('git rev-list --left-right --count HEAD...@{upstream}').trim()
      const [ahead, behind] = output.split('\t').map(Number)

      console.log(`  ${GR}Branch:${R}   ${G}${currentBranch}${R}`)
      console.log(`  ${GR}Upstream:${R} ${C}${upstreamCheck}${R}`)

      if ((ahead ?? 0) === 0 && (behind ?? 0) === 0) {
        console.log(`  ${GR}Status:${R}   ${G}Up to date${R}`)
      } else {
        const parts: string[] = []
        if ((behind ?? 0) > 0) parts.push(`${RED}${behind} behind${R}`)
        if ((ahead ?? 0) > 0) parts.push(`${G}${ahead} ahead${R}`)
        console.log(`  ${GR}Status:${R}   ${parts.join('  ')}`)
      }

      if ((behind ?? 0) > 0) {
        console.log('')
        console.log(`  ${GR}Use ${C}geeto --pull${R} ${GR}to pull changes${R}`)
      }
    }
  } catch {
    // No upstream or error — non-critical
    console.log(`  ${GR}Branch ${G}${currentBranch}${R} ${GR}has no upstream tracking.${R}`)
  }
  console.log('')
}
