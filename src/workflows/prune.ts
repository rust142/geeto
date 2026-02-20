/**
 * Prune workflow
 * Clean up stale remote-tracking branches
 */

import { confirm } from '../cli/input.js'
import { colors } from '../utils/colors.js'
import { execAsync, execSilent } from '../utils/exec.js'
import { log } from '../utils/logging.js'

/**
 * Get list of stale remote-tracking branches
 */
const getStaleBranches = async (remote: string): Promise<string[]> => {
  try {
    const result = await execAsync(`git remote prune ${remote} --dry-run`, true)
    const output = result.stdout.trim()
    if (!output) return []

    // Parse lines like: * [would prune] origin/feature-x
    return output
      .split('\n')
      .filter((line) => line.includes('[would prune]'))
      .map((line) => line.replace(/.*\[would prune\]\s*/, '').trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

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
 * Handle the prune workflow
 */
export const handlePrune = async (): Promise<void> => {
  const C = colors.cyan
  const R = colors.reset
  const G = colors.green
  const Y = colors.yellow
  const GR = colors.gray
  const RED = colors.red

  console.log('')
  console.log(`  ${C}✂ Prune Remote Branches${R}`)
  console.log(`  ${GR}${'─'.repeat(35)}${R}`)
  console.log('')

  const remotes = getRemotes()

  if (remotes.length === 0) {
    log.error('No remotes configured.')
    console.log('')
    return
  }

  let totalPruned = 0

  for (const remote of remotes) {
    console.log(`  ${GR}Remote:${R} ${C}${remote}${R}`)

    console.log('')
    const scanSpinner = log.spinner()
    scanSpinner.start(`Scanning stale branches on ${remote}...`)
    const stale = await getStaleBranches(remote)

    if (stale.length === 0) {
      scanSpinner.succeed('No stale branches')
      console.log('')
      continue
    }
    scanSpinner.stop()

    console.log(`    ${Y}${stale.length} stale branch${stale.length === 1 ? '' : 'es'} found:${R}`)
    for (const branch of stale) {
      console.log(`      ${RED}✗${R} ${GR}${branch}${R}`)
    }
    console.log('')

    const ok = confirm(
      `Remove ${stale.length} stale branch${stale.length === 1 ? '' : 'es'} from ${remote}?`,
      true
    )
    if (!ok) {
      log.warn(`Skipped pruning ${remote}.`)
      console.log('')
      continue
    }

    try {
      console.log('')
      const spinner = log.spinner()
      spinner.start(`Pruning ${remote}...`)
      await execAsync(`git remote prune ${remote}`, true)
      spinner.succeed(
        `Pruned ${stale.length} branch${stale.length === 1 ? '' : 'es'} from ${remote}`
      )
      totalPruned += stale.length
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      log.error(`Failed to prune ${remote}: ${msg}`)
    }
    console.log('')
  }

  // Also offer to fetch with prune
  if (totalPruned > 0) {
    console.log(`  ${GR}Total pruned: ${G}${totalPruned}${R}`)
  } else {
    log.success('All remotes are clean. No stale branches found.')
  }
  console.log('')
}
