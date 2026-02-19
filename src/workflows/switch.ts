/**
 * Interactive branch switcher
 * Fuzzy-search enabled branch selection with recent branches first
 */

import { select } from '../cli/menu.js'
import { colors } from '../utils/colors.js'
import { exec, execSilent } from '../utils/exec.js'
import { getCurrentBranch } from '../utils/git.js'
import { log } from '../utils/logging.js'

interface SwitchBranch {
  name: string
  isLocal: boolean
  isRemote: boolean
  /** Relative date of last commit */
  lastActivity: string
  /** Unix timestamp for sorting */
  timestamp: number
}

/**
 * Get all branches with recent activity info, sorted by most recent first
 */
const getBranchesForSwitch = (): SwitchBranch[] => {
  const current = getCurrentBranch()
  const branchMap = new Map<string, SwitchBranch>()

  // Get local branches with dates
  try {
    const output = execSilent(
      'git for-each-ref --sort=-committerdate --format="%(refname:short)|%(committerdate:relative)|%(committerdate:unix)" refs/heads/'
    )
    for (const line of output.split('\n').filter(Boolean)) {
      const [name, lastActivity, ts] = line.split('|')
      if (name && name !== current) {
        branchMap.set(name, {
          name,
          isLocal: true,
          isRemote: false,
          lastActivity: lastActivity ?? '',
          timestamp: Number(ts) || 0,
        })
      }
    }
  } catch {
    // Ignore
  }

  // Get remote branches with dates
  try {
    const output = execSilent(
      'git for-each-ref --sort=-committerdate --format="%(refname:short)|%(committerdate:relative)|%(committerdate:unix)" refs/remotes/origin/'
    )
    for (const line of output.split('\n').filter(Boolean)) {
      const [fullName, lastActivity, ts] = line.split('|')
      if (!fullName || fullName.includes('HEAD')) continue
      const name = fullName.replace('origin/', '')
      if (!name || name === 'origin' || name === current) continue

      const existing = branchMap.get(name)
      if (existing) {
        // Branch exists locally — just mark it also has remote
        existing.isRemote = true
      } else {
        branchMap.set(name, {
          name,
          isLocal: false,
          isRemote: true,
          lastActivity: lastActivity ?? '',
          timestamp: Number(ts) || 0,
        })
      }
    }
  } catch {
    // Ignore
  }

  // Sort by most recent activity first
  const result = [...branchMap.values()]
  result.sort((a, b) => b.timestamp - a.timestamp)
  return result
}

/**
 * Interactive branch switcher with fuzzy search
 */
export const handleBranchSwitch = async (): Promise<void> => {
  log.banner()
  log.step(`${colors.cyan}Branch Switcher${colors.reset}\n`)

  const current = getCurrentBranch()
  log.info(`Current: ${colors.green}${current}${colors.reset}\n`)

  const branches = getBranchesForSwitch()

  if (branches.length === 0) {
    log.warn('No other branches found.')
    return
  }

  const options = branches.map((b) => {
    const location =
      b.isLocal && b.isRemote
        ? ''
        : b.isLocal
          ? ` ${colors.yellow}(local)${colors.reset}`
          : ` ${colors.cyan}(remote)${colors.reset}`
    const age = b.lastActivity ? ` ${colors.gray}${b.lastActivity}${colors.reset}` : ''
    return {
      label: `${b.name}${location}${age}`,
      value: b.name,
    }
  })

  const selected = await select('Switch to branch:', options)

  if (!selected) {
    return
  }

  const branch = branches.find((b) => b.name === selected)
  if (!branch) return

  const spinner = log.spinner()

  try {
    if (branch.isLocal) {
      // Local branch — just switch
      spinner.start(`Switching to ${colors.cyan}${selected}${colors.reset}`)
      exec(`git switch "${selected}"`, true)
      spinner.succeed(`Switched to ${colors.cyan}${selected}${colors.reset}`)
    } else {
      // Remote-only — checkout and track
      spinner.start(`Checking out ${colors.cyan}${selected}${colors.reset} from remote`)
      exec(`git switch -c "${selected}" "origin/${selected}"`, true)
      spinner.succeed(`Checked out ${colors.cyan}${selected}${colors.reset} (tracking remote)`)
    }
  } catch {
    spinner.fail(`Failed to switch to ${selected}`)

    // Try fallback with git checkout
    try {
      spinner.start(`Retrying with git checkout...`)
      exec(`git checkout "${selected}"`, true)
      spinner.succeed(`Switched to ${colors.cyan}${selected}${colors.reset}`)
    } catch (retryError) {
      spinner.fail(`Failed to switch: ${retryError}`)
      log.warn('You may have uncommitted changes. Try stashing first: git stash')
    }
  }

  // Show new branch info
  console.log('')
  try {
    const lastCommit = execSilent('git log -1 --format="%h %s (%cr)"').trim()
    log.info(`Latest commit: ${colors.gray}${lastCommit}${colors.reset}`)
  } catch {
    // Ignore
  }

  try {
    const ahead = execSilent('git rev-list --count @{upstream}..HEAD 2>/dev/null').trim()
    const behind = execSilent('git rev-list --count HEAD..@{upstream} 2>/dev/null').trim()
    if (ahead !== '0' || behind !== '0') {
      const parts = []
      if (ahead !== '0') parts.push(`${colors.green}${ahead} ahead${colors.reset}`)
      if (behind !== '0') parts.push(`${colors.red}${behind} behind${colors.reset}`)
      log.info(`Status: ${parts.join(', ')}`)
    }
  } catch {
    // No upstream tracking
  }
}
