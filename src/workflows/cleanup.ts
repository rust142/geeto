/**
 * Interactive branch cleanup workflow
 * Allows users to select and delete local and remote branches
 */

import { askQuestion, confirm } from '../cli/input.js'
import { colors } from '../utils/colors.js'
import { exec, execSilent } from '../utils/exec.js'
import { getCurrentBranch } from '../utils/git.js'
import { log } from '../utils/logging.js'

interface BranchInfo {
  name: string
  hasLocal: boolean
  hasRemote: boolean
  label: string
}

/**
 * Get unified list of branches with location info
 */
const getUnifiedBranchList = (): BranchInfo[] => {
  const current = getCurrentBranch()
  const protectedBranches = new Set(['main', 'master', 'development', 'develop', 'dev', current])

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

  for (const name of allBranchNames) {
    const hasLocal = localBranches.has(name)
    const hasRemote = remoteBranches.has(name)

    let label = ''
    if (hasLocal && hasRemote) {
      label = '' // Both - no label needed
    } else if (hasLocal) {
      label = `${colors.yellow}(local only)${colors.reset}`
    } else if (hasRemote) {
      label = `${colors.cyan}(remote only)${colors.reset}`
    }

    branchList.push({
      name,
      hasLocal,
      hasRemote,
      label,
    })
  }

  // Sort by location: remote-only first, then both, then local-only; within each group sort alphabetically
  const rank = (br: BranchInfo) =>
    br.hasRemote && !br.hasLocal ? 0 : br.hasRemote && br.hasLocal ? 1 : 2
  branchList.sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    if (ra !== rb) return ra - rb
    return a.name.localeCompare(b.name)
  })

  return branchList
}

/**
 * Interactive branch cleanup
 * Allows users to select and delete local and remote branches
 */
export const handleInteractiveCleanup = (): void => {
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

  // Show branches with numbering
  console.log(`${colors.cyan}Select branches to delete:${colors.reset}`)
  for (const [i, branch] of branches.entries()) {
    const num = `${i + 1}`
    const label = branch.label ? ` ${branch.label}` : ''
    console.log(`  ${colors.gray}[${num}]${colors.reset} ${branch.name}${label}`)
  }
  console.log('')

  // Get user selection
  console.log(`${colors.yellow}Instructions:${colors.reset}`)
  console.log('  • Type "all" to delete all branches')
  console.log('  • Type "none" or "cancel" to cancel')
  console.log('  • Type numbers separated by space (e.g., "1 3 5 7")')
  console.log('  • Type ranges with dash (e.g., "1-5 8 10-12")')
  console.log('')

  const input = askQuestion('Select branches: ').trim().toLowerCase()

  if (!input || input === 'none' || input === 'cancel') {
    log.info('Cleanup cancelled.')
    return
  }

  let selectedIndices: number[] = []

  if (input === 'all') {
    selectedIndices = branches.map((_, i) => i)
  } else {
    // Parse input
    const parts = input.split(/\s+/)
    for (const part of parts) {
      if (part.includes('-')) {
        // Range like "1-5"
        const rangeParts = part.split('-').map((s) => Number.parseInt(s.trim(), 10))
        const start = rangeParts[0]
        const end = rangeParts[1]
        if (
          start !== undefined &&
          end !== undefined &&
          !Number.isNaN(start) &&
          !Number.isNaN(end) &&
          start > 0 &&
          end <= branches.length
        ) {
          for (let i = start - 1; i < end; i++) {
            if (!selectedIndices.includes(i)) {
              selectedIndices.push(i)
            }
          }
        }
      } else {
        // Single number
        const num = Number.parseInt(part, 10)
        if (!Number.isNaN(num) && num > 0 && num <= branches.length) {
          const idx = num - 1
          if (!selectedIndices.includes(idx)) {
            selectedIndices.push(idx)
          }
        }
      }
    }
  }

  if (selectedIndices.length === 0) {
    log.warn('No valid branches selected.')
    return
  }

  // Sort indices for ordered display
  selectedIndices.sort((a, b) => a - b)

  const selectedBranches = selectedIndices
    .map((i) => branches[i])
    .filter((b): b is BranchInfo => b !== undefined)

  // Show summary
  console.log(`\n${colors.yellow}Selected ${selectedBranches.length} branches:${colors.reset}`)
  for (const branch of selectedBranches) {
    const locations = []
    if (branch.hasLocal) locations.push('local')
    if (branch.hasRemote) locations.push('remote')
    console.log(
      `  • ${branch.name} ${colors.gray}(will delete: ${locations.join(' & ')})${colors.reset}`
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
          // Stop spinner before interactive prompt
          spinner.stop()
          const forceDelete = confirm(
            `Branch '${branch.name}' is not fully merged. Force delete local? (Y/n):`
          )
          if (forceDelete) {
            const spinner2 = log.spinner()
            spinner2.start(`Force deleting local: ${branch.name}`)
            exec(`git branch -D "${branch.name}"`, true)
            spinner2.succeed(`Force deleted local: ${branch.name}`)
            localSuccessCount++
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
          exec(`git push origin --delete "${branch.name}"`, true)
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
  console.log('')

  log.success('Cleanup complete!')
}
