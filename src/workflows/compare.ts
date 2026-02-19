/**
 * Branch compare workflow
 * Show diff summary between current branch and a target branch
 */

import { select } from '../cli/menu.js'
import { colors } from '../utils/colors.js'
import { execSilent } from '../utils/exec.js'
import { getCurrentBranch } from '../utils/git.js'
import { log } from '../utils/logging.js'

/**
 * Get all branch names (local + remote) excluding current
 */
const getAllBranches = (): Array<{ name: string; isLocal: boolean; isRemote: boolean }> => {
  const current = getCurrentBranch()
  const branchMap = new Map<string, { name: string; isLocal: boolean; isRemote: boolean }>()

  try {
    const local = execSilent('git branch --format="%(refname:short)"')
    for (const name of local.split('\n').filter(Boolean)) {
      if (name !== current) {
        branchMap.set(name, { name, isLocal: true, isRemote: false })
      }
    }
  } catch {
    // Ignore
  }

  try {
    const remote = execSilent('git branch -r --format="%(refname:short)"')
    for (const line of remote.split('\n').filter(Boolean)) {
      if (line.includes('HEAD')) continue
      const name = line.replace('origin/', '')
      if (!name || name === 'origin' || name === current) continue
      const existing = branchMap.get(name)
      if (existing) {
        existing.isRemote = true
      } else {
        branchMap.set(name, { name, isLocal: false, isRemote: true })
      }
    }
  } catch {
    // Ignore
  }

  return [...branchMap.values()]
}

/**
 * Get ahead/behind counts between two branches
 */
const getAheadBehind = (
  base: string,
  compare: string
): { ahead: number; behind: number } | null => {
  try {
    const output = execSilent(`git rev-list --left-right --count ${base}...${compare}`).trim()
    const [ahead, behind] = output.split('\t').map(Number)
    return { ahead: ahead ?? 0, behind: behind ?? 0 }
  } catch {
    return null
  }
}

/**
 * Get file change stats (insertions/deletions per file)
 */
const getFileStats = (
  base: string,
  compare: string
): Array<{ file: string; insertions: number; deletions: number; status: string }> => {
  try {
    const output = execSilent(`git diff --numstat ${base}...${compare}`).trim()
    if (!output) return []

    return output
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const parts = line.split('\t')
        const ins = parts[0] === '-' ? 0 : Number(parts[0])
        const del = parts[1] === '-' ? 0 : Number(parts[1])
        return {
          file: parts[2] ?? 'unknown',
          insertions: ins || 0,
          deletions: del || 0,
          status: ins > 0 && del > 0 ? 'modified' : ins > 0 ? 'added' : 'deleted',
        }
      })
  } catch {
    return []
  }
}

/**
 * Get list of commits between branches
 */
const getCommitsBetween = (
  base: string,
  compare: string,
  limit = 10
): Array<{ hash: string; subject: string; date: string; author: string }> => {
  try {
    const output = execSilent(
      `git log --format="%h|%s|%cr|%an" ${base}..${compare} -${limit}`
    ).trim()
    if (!output) return []

    return output
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, subject, date, author] = line.split('|')
        return {
          hash: hash ?? '',
          subject: subject ?? '',
          date: date ?? '',
          author: author ?? '',
        }
      })
  } catch {
    return []
  }
}

/**
 * Interactive branch compare
 */
export const handleBranchCompare = async (): Promise<void> => {
  log.banner()
  log.step(`${colors.cyan}Branch Compare${colors.reset}\n`)

  const current = getCurrentBranch()
  log.info(`Current: ${colors.green}${current}${colors.reset}\n`)

  const branches = getAllBranches()

  if (branches.length === 0) {
    log.warn('No other branches found to compare.')
    return
  }

  // Put common base branches first
  const commonBases = new Set(['main', 'master', 'development', 'develop', 'dev'])
  const sorted = [...branches]
  sorted.sort((a, b) => {
    const aBase = commonBases.has(a.name) ? 0 : 1
    const bBase = commonBases.has(b.name) ? 0 : 1
    if (aBase !== bBase) return aBase - bBase
    return a.name.localeCompare(b.name)
  })

  const options = sorted.map((b) => {
    const location =
      b.isLocal && b.isRemote
        ? ''
        : b.isLocal
          ? ` ${colors.yellow}(local)${colors.reset}`
          : ` ${colors.cyan}(remote)${colors.reset}`
    return {
      label: `${b.name}${location}`,
      value: b.name,
    }
  })

  const target = await select('Compare current branch with:', options)

  if (!target) return

  // Resolve the ref (use origin/ for remote-only)
  const branch = branches.find((b) => b.name === target)
  const targetRef = branch?.isLocal ? target : `origin/${target}`

  const spinner = log.spinner()
  spinner.start('Analyzing differences...')

  const aheadBehind = getAheadBehind(targetRef, current)
  const fileStats = getFileStats(targetRef, current)
  const commits = getCommitsBetween(targetRef, current)
  const reverseCommits = getCommitsBetween(current, targetRef)

  spinner.stop()

  // Display comparison box
  console.log('')
  const boxWidth = 60
  const line = '─'.repeat(boxWidth - 2)
  console.log(`${colors.cyan}┌${line}┐${colors.reset}`)
  console.log(
    `${colors.cyan}│${colors.reset} ${colors.bright}${current}${colors.reset} vs ${colors.bright}${target}${colors.reset}`
  )
  console.log(`${colors.cyan}├${line}┤${colors.reset}`)

  if (aheadBehind) {
    const aheadText =
      aheadBehind.ahead > 0
        ? `${colors.green}${aheadBehind.ahead} ahead${colors.reset}`
        : `${colors.gray}0 ahead${colors.reset}`
    const behindText =
      aheadBehind.behind > 0
        ? `${colors.red}${aheadBehind.behind} behind${colors.reset}`
        : `${colors.gray}0 behind${colors.reset}`
    console.log(`${colors.cyan}│${colors.reset} ${aheadText}, ${behindText}`)
  } else {
    console.log(
      `${colors.cyan}│${colors.reset} ${colors.gray}Could not determine ahead/behind${colors.reset}`
    )
  }

  // File change summary
  const totalIns = fileStats.reduce((sum, f) => sum + f.insertions, 0)
  const totalDel = fileStats.reduce((sum, f) => sum + f.deletions, 0)
  console.log(
    `${colors.cyan}│${colors.reset} Files changed: ${colors.yellow}${fileStats.length}${colors.reset}  (+${colors.green}${totalIns}${colors.reset} -${colors.red}${totalDel}${colors.reset})`
  )

  console.log(`${colors.cyan}└${line}┘${colors.reset}`)

  // Show files with most changes
  if (fileStats.length > 0) {
    console.log('')
    console.log(`${colors.bright}📁 Changed files:${colors.reset}`)
    const withTotals = fileStats.map((f) => ({ ...f, total: f.insertions + f.deletions }))
    withTotals.sort((a, b) => b.total - a.total)
    const topFiles = withTotals.slice(0, 15)

    for (const f of topFiles) {
      const ins = f.insertions > 0 ? `${colors.green}+${f.insertions}${colors.reset}` : ''
      const del = f.deletions > 0 ? `${colors.red}-${f.deletions}${colors.reset}` : ''
      const stats = [ins, del].filter(Boolean).join(' ')
      console.log(`  ${colors.gray}${f.file}${colors.reset} ${stats}`)
    }

    if (fileStats.length > 15) {
      const remaining = fileStats.length - 15
      console.log(`  ${colors.gray}... and ${remaining} more files${colors.reset}`)
    }
  }

  // Show commits on current branch not in target
  if (commits.length > 0) {
    console.log('')
    console.log(
      `${colors.bright}📝 Commits on ${colors.green}${current}${colors.reset}${colors.bright} not in ${colors.cyan}${target}${colors.reset}${colors.bright}:${colors.reset}`
    )
    for (const c of commits) {
      console.log(
        `  ${colors.yellow}${c.hash}${colors.reset} ${c.subject} ${colors.gray}(${c.date})${colors.reset}`
      )
    }
    if (aheadBehind && aheadBehind.ahead > commits.length) {
      console.log(
        `  ${colors.gray}... and ${aheadBehind.ahead - commits.length} more commits${colors.reset}`
      )
    }
  }

  // Show commits on target not in current
  if (reverseCommits.length > 0) {
    console.log('')
    console.log(
      `${colors.bright}📝 Commits on ${colors.cyan}${target}${colors.reset}${colors.bright} not in ${colors.green}${current}${colors.reset}${colors.bright}:${colors.reset}`
    )
    for (const c of reverseCommits) {
      console.log(
        `  ${colors.yellow}${c.hash}${colors.reset} ${c.subject} ${colors.gray}(${c.date})${colors.reset}`
      )
    }
    if (aheadBehind && aheadBehind.behind > reverseCommits.length) {
      console.log(
        `  ${colors.gray}... and ${aheadBehind.behind - reverseCommits.length} more commits${colors.reset}`
      )
    }
  }

  if (commits.length === 0 && reverseCommits.length === 0) {
    console.log('')
    log.success('Both branches are identical!')
  }

  console.log('')
}
