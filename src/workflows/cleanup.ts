/**
 * Interactive branch cleanup workflow
 * Allows users to select and delete local and remote branches
 */

import { confirm } from '../cli/input.js'
import { multiSelect } from '../cli/menu.js'
import { colors } from '../utils/colors.js'
import { getProtectedBranches } from '../utils/config.js'
import { exec, execAsync, execSilent } from '../utils/exec.js'
import { getCurrentBranch } from '../utils/git.js'
import { log } from '../utils/logging.js'

interface BranchInfo {
  name: string
  hasLocal: boolean
  hasRemote: boolean
  label: string
  /** Relative age string e.g. "3 months ago" */
  age: string
  /** Timestamp for sorting (epoch seconds, 0 if unknown) */
  ageTimestamp: number
}

/**
 * Get unified list of branches with location info
 */
const getUnifiedBranchList = (): BranchInfo[] => {
  const current = getCurrentBranch()
  const configProtected = getProtectedBranches()
  const protectedBranches = new Set([...configProtected.map((b) => b.toLowerCase()), current])

  // Get local branches
  const localBranches = new Set<string>()
  try {
    const branches = execSilent('git branch --format="%(refname:short)"')
      .split('\n')
      .filter(Boolean)
    for (const branch of branches) {
      if (!protectedBranches.has(branch.toLowerCase())) {
        localBranches.add(branch)
      }
    }
  } catch {
    // Ignore error
  }

  // Get remote branches
  const remoteBranches = new Set<string>()
  try {
    const branches = execSilent('git branch -r --format="%(refname:short)"')
      .split('\n')
      .filter(Boolean)
      .filter((branch) => !branch.includes('HEAD')) // Exclude HEAD pointer
      .filter((branch) => branch.startsWith('origin/')) // Must have origin/ prefix

    for (const branch of branches) {
      const branchName = branch.replace('origin/', '')
      // Skip if empty or just "origin" or protected
      if (
        branchName &&
        branchName !== 'origin' &&
        !protectedBranches.has(branchName.toLowerCase())
      ) {
        remoteBranches.add(branchName)
      }
    }
  } catch {
    // Ignore error
  }

  // Merge and create unified list
  const allBranchNames = new Set([...localBranches, ...remoteBranches])
  const branchList: BranchInfo[] = []

  // Fetch commit dates in bulk for efficiency
  const branchDates = new Map<string, { age: string; timestamp: number }>()
  try {
    // Local branch dates
    const localDates = execSilent(
      'git for-each-ref --format="%(refname:short)|%(committerdate:relative)|%(committerdate:unix)" refs/heads/'
    )
    for (const line of localDates.split('\n').filter(Boolean)) {
      const [name, age, ts] = line.split('|')
      if (name && age) {
        branchDates.set(name, { age, timestamp: Number(ts) || 0 })
      }
    }
    // Remote branch dates (for remote-only branches)
    const remoteDates = execSilent(
      'git for-each-ref --format="%(refname:short)|%(committerdate:relative)|%(committerdate:unix)" refs/remotes/origin/'
    )
    for (const line of remoteDates.split('\n').filter(Boolean)) {
      const [fullName, age, ts] = line.split('|')
      const name = fullName?.replace('origin/', '')
      if (name && age && !branchDates.has(name)) {
        branchDates.set(name, { age, timestamp: Number(ts) || 0 })
      }
    }
  } catch {
    // Continue without dates
  }

  for (const name of allBranchNames) {
    const hasLocal = localBranches.has(name)
    const hasRemote = remoteBranches.has(name)
    const dateInfo = branchDates.get(name)

    let label = ''
    if (hasLocal && hasRemote) {
      label = '' // Both - no label needed
    } else if (hasLocal) {
      label = `${colors.yellow}(local only)${colors.reset}`
    } else if (hasRemote) {
      label = `${colors.cyan}(remote only)${colors.reset}`
    }

    // Append age to label
    if (dateInfo?.age) {
      const agePart = `${colors.gray}${dateInfo.age}${colors.reset}`
      label = label ? `${label} ${agePart}` : agePart
    }

    branchList.push({
      name,
      hasLocal,
      hasRemote,
      label,
      age: dateInfo?.age ?? '',
      ageTimestamp: dateInfo?.timestamp ?? 0,
    })
  }

  // Sort by location group, then by staleness (oldest first)
  const rank = (br: BranchInfo) =>
    br.hasRemote && !br.hasLocal ? 0 : br.hasRemote && br.hasLocal ? 1 : 2
  branchList.sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    if (ra !== rb) return ra - rb
    // Within same group, oldest first (lowest timestamp = oldest)
    if (a.ageTimestamp !== b.ageTimestamp) return a.ageTimestamp - b.ageTimestamp
    return a.name.localeCompare(b.name)
  })

  return branchList
}

/**
 * Get remote repo base URL for branch links
 * Converts git remote URL to HTTPS browser URL
 */
const getRemoteBranchBaseUrl = (): string | null => {
  try {
    const remoteUrl = execSilent('git remote get-url origin').trim()
    if (!remoteUrl) return null

    // Convert SSH to HTTPS: git@github.com:user/repo.git → https://github.com/user/repo
    // Also handle: https://github.com/user/repo.git
    let url = remoteUrl
      .replace(/\.git$/, '')
      .replace(/^git@([^:]+):/, 'https://$1/')
      .replace(/^ssh:\/\/git@([^/]+)\//, 'https://$1/')

    // Ensure it starts with https://
    if (!url.startsWith('https://')) {
      url = `https://${url}`
    }

    return url
  } catch {
    return null
  }
}

/**
 * Create a clickable terminal hyperlink using OSC 8
 */
const terminalLink = (text: string, url: string): string => {
  return `\u001B]8;;${url}\u0007${text}\u001B]8;;\u0007`
}

/**
 * Interactive branch cleanup
 * Allows users to select and delete local and remote branches
 */
export const handleInteractiveCleanup = async (): Promise<void> => {
  log.banner()
  log.step(`${colors.cyan}Branch Cleanup${colors.reset}\n`)

  // Check if in git repo
  try {
    exec('git rev-parse --is-inside-work-tree', true)
  } catch {
    log.error('Not a git repository!')
    process.exit(1)
  }

  const current = getCurrentBranch()
  log.info(`Current branch: ${colors.cyan}${current}${colors.reset}\n`)

  // Get unified branch list
  const branches = getUnifiedBranchList()

  if (branches.length === 0) {
    log.info('No branches available for cleanup.')
    log.info('All branches are either protected or currently checked out.')
    return
  }

  // Show summary
  const localCount = branches.filter((b) => b.hasLocal).length
  const remoteCount = branches.filter((b) => b.hasRemote).length
  const bothCount = branches.filter((b) => b.hasLocal && b.hasRemote).length

  console.log(`${colors.cyan}Available branches for cleanup:${colors.reset}`)
  console.log(
    `  Total: ${colors.yellow}${branches.length}${colors.reset} unique branches (${bothCount} in both locations)`
  )
  console.log(`  Local: ${colors.yellow}${localCount}${colors.reset} branches`)
  console.log(`  Remote: ${colors.yellow}${remoteCount}${colors.reset} branches`)
  console.log('')

  // Let user select branches with multi-select
  const repoBaseUrl = getRemoteBranchBaseUrl()

  const branchChoices = branches.map((branch) => {
    const label = branch.label ? ` ${branch.label}` : ''
    // Make branch name a clickable link to remote repo
    const branchDisplay = repoBaseUrl
      ? terminalLink(branch.name, `${repoBaseUrl}/tree/${branch.name}`)
      : branch.name
    return {
      label: `${branchDisplay}${label}`,
      value: branch.name,
    }
  })

  const selectedNames = await multiSelect('Select branches to delete:', branchChoices)

  if (selectedNames.length === 0) {
    log.info('No branches selected. Cleanup cancelled.')
    return
  }

  const selectedBranches = branches.filter((b) => selectedNames.includes(b.name))

  // Show summary
  console.log(`\n${colors.yellow}Selected ${selectedBranches.length} branches:${colors.reset}`)
  for (const branch of selectedBranches) {
    const locations = []
    if (branch.hasLocal) locations.push('local')
    if (branch.hasRemote) locations.push('remote')
    const branchDisplay = repoBaseUrl
      ? terminalLink(branch.name, `${repoBaseUrl}/tree/${branch.name}`)
      : branch.name
    console.log(
      `  • ${branchDisplay} ${colors.gray}(will delete: ${locations.join(' & ')})${colors.reset}`
    )
  }
  console.log('')

  const finalConfirm = confirm(
    `${colors.red}Delete ${selectedBranches.length} branches? This cannot be undone.${colors.reset}`
  )
  console.log('')

  if (!finalConfirm) {
    log.warn('Cleanup cancelled.')
    return
  }

  // Delete branches
  let localSuccessCount = 0
  let localFailCount = 0
  let remoteSuccessCount = 0
  let remoteFailCount = 0

  for (const branch of selectedBranches) {
    // Delete local if exists
    if (branch.hasLocal) {
      try {
        // Try normal delete first with spinner
        const spinner = log.spinner()
        spinner.start(`Deleting local: ${branch.name}`)
        try {
          exec(`git branch -d "${branch.name}"`, true)
          spinner.succeed(`Deleted local: ${branch.name}`)
          localSuccessCount++
        } catch {
          // Stop spinner and clear line before interactive prompt
          spinner.fail(`Branch '${branch.name}' is not fully merged`)
          console.log('')
          const forceDelete = confirm(`Force delete local?`)
          console.log('')
          if (forceDelete) {
            const spinner2 = log.spinner()
            spinner2.start(`Force deleting local: ${branch.name}`)
            try {
              exec(`git branch -D "${branch.name}"`, true)
              spinner2.succeed(`Force deleted local: ${branch.name}`)
              localSuccessCount++
            } catch {
              spinner2.fail(`Failed to force delete local: ${branch.name}`)
              localFailCount++
            }
          } else {
            localFailCount++
            log.warn(`Skipped local: ${branch.name}`)
          }
        }
      } catch {
        localFailCount++
        log.error(`Failed to delete local: ${branch.name}`)
      }
    }

    // Delete remote if exists
    if (branch.hasRemote) {
      try {
        const spinner = log.spinner()
        spinner.start(`Deleting remote: ${branch.name}`)
        try {
          await execAsync(`git push origin --delete "${branch.name}"`, true)
          spinner.succeed(`Deleted remote: ${branch.name}`)
          remoteSuccessCount++
        } catch {
          spinner.fail(`Failed to delete remote: ${branch.name}`)
          remoteFailCount++
        }
      } catch {
        remoteFailCount++
        log.error(`Failed to delete remote: ${branch.name}`)
      }
    }
  }

  // Final summary
  console.log(`\n${colors.cyan}═══ Cleanup Summary ═══${colors.reset}`)
  const localTotal = selectedBranches.filter((b) => b.hasLocal).length
  const remoteTotal = selectedBranches.filter((b) => b.hasRemote).length

  if (localTotal > 0) {
    console.log(
      `  Local: ${colors.green}${localSuccessCount}/${localTotal}${colors.reset}${localFailCount > 0 ? ` (${colors.red}${localFailCount} failed${colors.reset})` : ''}`
    )
  }
  if (remoteTotal > 0) {
    console.log(
      `  Remote: ${colors.green}${remoteSuccessCount}/${remoteTotal} deleted${colors.reset}${remoteFailCount > 0 ? `, ${colors.red}${remoteFailCount} failed${colors.reset}` : ''}`
    )
  }
  if (remoteFailCount > 0) {
    log.info('  Try prune with: gt --prune')
  }
  console.log('')

  log.success('Cleanup complete!')
}
