/**
 * Revert workflow
 * Quick revert of the last commit using soft reset (changes stay staged)
 */

import { confirm } from '../cli/input.js'
import { select } from '../cli/menu.js'
import { colors } from '../utils/colors.js'
import { isDryRun, logDryRun } from '../utils/dry-run.js'
import { execSilent } from '../utils/exec.js'
import { log } from '../utils/logging.js'

/**
 * Get info about the last commit
 */
const getLastCommit = (): { hash: string; message: string } | null => {
  try {
    const raw = execSilent('git log -1 --format=%H%n%s').trim()
    const [hash, ...rest] = raw.split('\n')
    if (!hash) return null
    return { hash, message: rest.join('\n') }
  } catch {
    return null
  }
}

/**
 * Interactive revert of the last commit
 */
export const handleRevert = async (): Promise<void> => {
  log.banner()
  log.step(`${colors.cyan}Revert Last Commit${colors.reset}\n`)

  const last = getLastCommit()
  if (!last) {
    log.error('No commits found to revert.')
    return
  }

  const shortHash = last.hash.slice(0, 7)

  console.log(
    `  ${colors.yellow}${shortHash}${colors.reset} ${colors.bright}${last.message}${colors.reset}`
  )
  console.log('')

  const mode = await select('Choose reset mode:', [
    { label: 'Soft — keep changes staged', value: 'soft' },
    { label: 'Mixed — keep changes unstaged', value: 'mixed' },
    { label: 'Hard — discard all changes', value: 'hard' },
    { label: 'Cancel', value: 'cancel' },
  ])

  if (mode === 'cancel') {
    log.info('Cancelled.')
    return
  }

  if (mode === 'hard') {
    const sure = confirm('This will DISCARD all changes. Are you sure?', false)
    if (!sure) {
      log.info('Cancelled.')
      return
    }
  }

  const cmd = `git reset --${mode} HEAD~1`

  if (isDryRun()) {
    logDryRun(cmd)
    log.success('Commit would be reverted (dry-run)')
    return
  }

  try {
    execSilent(cmd)
    const modeLabel =
      mode === 'soft'
        ? 'changes still staged'
        : mode === 'mixed'
          ? 'changes unstaged'
          : 'changes discarded'
    log.success(`Commit reverted (${modeLabel})`)
    console.log(`  ${colors.gray}Reverted: ${shortHash} ${last.message}${colors.reset}`)
  } catch {
    log.error('Failed to revert commit.')
  }
}
