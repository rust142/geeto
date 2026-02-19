/**
 * Interactive cherry-pick workflow
 * Select commits from another branch and cherry-pick them
 */

import { confirm } from '../cli/input.js'
import { multiSelect, select } from '../cli/menu.js'
import { colors } from '../utils/colors.js'
import { exec, execSilent } from '../utils/exec.js'
import { getCurrentBranch } from '../utils/git.js'
import { log } from '../utils/logging.js'

/**
 * Get all branch names (local + remote) excluding current
 */
const getAllBranches = (): Array<{ name: string; isLocal: boolean; ref: string }> => {
  const current = getCurrentBranch()
  const branchMap = new Map<string, { name: string; isLocal: boolean; ref: string }>()

  try {
    const local = execSilent(
      'git for-each-ref --sort=-committerdate --format="%(refname:short)" refs/heads/'
    )
    for (const name of local.split('\n').filter(Boolean)) {
      if (name !== current) {
        branchMap.set(name, { name, isLocal: true, ref: name })
      }
    }
  } catch {
    // Ignore
  }

  try {
    const remote = execSilent(
      'git for-each-ref --sort=-committerdate --format="%(refname:short)" refs/remotes/origin/'
    )
    for (const line of remote.split('\n').filter(Boolean)) {
      if (line.includes('HEAD')) continue
      const name = line.replace('origin/', '')
      if (!name || name === 'origin' || name === current) continue
      if (!branchMap.has(name)) {
        branchMap.set(name, { name, isLocal: false, ref: `origin/${name}` })
      }
    }
  } catch {
    // Ignore
  }

  return [...branchMap.values()]
}

/**
 * Get commits on source branch that are NOT on current branch
 */
const getUniqueCommits = (
  sourceRef: string,
  limit = 50
): Array<{ hash: string; shortHash: string; subject: string; date: string; author: string }> => {
  try {
    const current = getCurrentBranch()
    const output = execSilent(
      `git log --no-merges --format="%H|%h|%s|%cr|%an" ${current}..${sourceRef} -${limit}`
    ).trim()
    if (!output) return []

    return output
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, shortHash, subject, date, author] = line.split('|')
        return {
          hash: hash ?? '',
          shortHash: shortHash ?? '',
          subject: subject ?? '',
          date: date ?? '',
          author: author ?? '',
        }
      })
      .filter((c) => c.hash !== '')
  } catch {
    return []
  }
}

/**
 * Check if there's a cherry-pick in progress
 */
const isCherryPickInProgress = (): boolean => {
  try {
    execSilent('git rev-parse --verify CHERRY_PICK_HEAD 2>/dev/null')
    return true
  } catch {
    return false
  }
}

/**
 * Interactive cherry-pick workflow
 */
export const handleCherryPick = async (): Promise<void> => {
  log.banner()
  log.step(`${colors.cyan}Cherry Pick${colors.reset}\n`)

  const current = getCurrentBranch()
  log.info(`Current: ${colors.green}${current}${colors.reset}\n`)

  // Check for in-progress cherry-pick
  if (isCherryPickInProgress()) {
    log.warn('A cherry-pick is already in progress!')
    console.log('')

    const action = await select('What would you like to do?', [
      { label: 'Continue cherry-pick (after resolving conflicts)', value: 'continue' },
      { label: 'Abort cherry-pick', value: 'abort' },
      { label: 'Skip current commit', value: 'skip' },
      { label: 'Cancel', value: 'cancel' },
    ])

    switch (action) {
      case 'continue': {
        try {
          exec('git cherry-pick --continue', true)
          log.success('Cherry-pick continued successfully!')
        } catch (error) {
          log.error(`Failed to continue: ${error}`)
          log.info('Resolve conflicts and try again.')
        }
        break
      }
      case 'abort': {
        exec('git cherry-pick --abort', true)
        log.success('Cherry-pick aborted.')
        break
      }
      case 'skip': {
        exec('git cherry-pick --skip', true)
        log.success('Skipped current commit.')
        break
      }
    }
    return
  }

  // Check for clean working tree
  try {
    const status = execSilent('git status --porcelain').trim()
    if (status) {
      log.warn('Working tree is not clean. Please commit or stash your changes first.')
      console.log(`${colors.gray}${status}${colors.reset}`)
      console.log('')

      const proceed = confirm('Continue anyway? (conflicts may be harder to resolve)')
      if (!proceed) return
      console.log('')
    }
  } catch {
    // Ignore
  }

  // Select source branch
  const branches = getAllBranches()

  if (branches.length === 0) {
    log.warn('No other branches found.')
    return
  }

  const branchOptions = branches.map((b) => {
    const location = b.isLocal ? '' : ` ${colors.cyan}(remote)${colors.reset}`
    return {
      label: `${b.name}${location}`,
      value: b.name,
    }
  })

  const sourceName = await select('Pick commits from which branch?', branchOptions)
  if (!sourceName) return

  const source = branches.find((b) => b.name === sourceName)
  if (!source) return

  // Get unique commits
  const spinner = log.spinner()
  spinner.start(`Fetching commits from ${sourceName}...`)
  const commits = getUniqueCommits(source.ref)
  spinner.stop()

  if (commits.length === 0) {
    log.info(`No new commits found on ${colors.cyan}${sourceName}${colors.reset} to cherry-pick.`)
    log.info('All commits are already present on the current branch.')
    return
  }

  log.info(
    `Found ${colors.cyan}${commits.length}${colors.reset} commits on ${colors.cyan}${sourceName}${colors.reset} not in ${colors.green}${current}${colors.reset}`
  )
  console.log('')

  // Select commits
  const commitOptions = commits.map((c) => ({
    label: `${colors.yellow}${c.shortHash}${colors.reset} ${c.subject} ${colors.gray}(${c.date})${colors.reset}`,
    value: c.hash,
  }))

  const selectedHashes = await multiSelect('Select commits to cherry-pick:', commitOptions)

  if (selectedHashes.length === 0) {
    log.info('No commits selected. Cancelled.')
    return
  }

  // Show summary
  console.log('')
  log.info(`Cherry-picking ${colors.cyan}${selectedHashes.length}${colors.reset} commits:`)
  for (const hash of selectedHashes) {
    const commit = commits.find((c) => c.hash === hash)
    if (commit) {
      console.log(`  ${colors.yellow}${commit.shortHash}${colors.reset} ${commit.subject}`)
    }
  }
  console.log('')

  const doIt = confirm('Proceed with cherry-pick?')
  if (!doIt) {
    log.info('Cancelled.')
    return
  }
  console.log('')

  // Execute cherry-pick one by one for better conflict handling
  let successCount = 0
  let failCount = 0

  for (const hash of selectedHashes) {
    const commit = commits.find((c) => c.hash === hash)
    const label = commit ? `${commit.shortHash} ${commit.subject}` : hash.slice(0, 7)

    const pickSpinner = log.spinner()
    pickSpinner.start(`Cherry-picking: ${label}`)

    try {
      exec(`git cherry-pick "${hash}"`, true)
      pickSpinner.succeed(`Cherry-picked: ${label}`)
      successCount++
    } catch {
      pickSpinner.fail(`Conflict: ${label}`)
      console.log('')
      log.warn('Cherry-pick paused due to conflicts.')
      log.info('Resolve conflicts, then run:')
      console.log(`  ${colors.cyan}geeto --cherry-pick${colors.reset} to continue`)
      console.log(
        `  ${colors.gray}or: git cherry-pick --continue / --abort / --skip${colors.reset}`
      )
      failCount++
      break // Stop on first conflict
    }
  }

  // Summary
  if (failCount === 0) {
    console.log('')
    log.success(
      `All ${colors.cyan}${successCount}${colors.reset} commits cherry-picked successfully! 🍒`
    )
  } else {
    console.log('')
    const applied = successCount > 0 ? `${successCount} applied, ` : ''
    log.warn(`${applied}1 commit has conflicts. Resolve and continue.`)
  }
}
