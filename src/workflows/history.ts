/**
 * Elegant commit history viewer
 * Display commit log with a beautiful timeline UI
 */

import { select } from '../cli/menu.js'
import { colors } from '../utils/colors.js'
import { execSilent } from '../utils/exec.js'
import { getCurrentBranch } from '../utils/git.js'
import { log } from '../utils/logging.js'

interface CommitEntry {
  hash: string
  shortHash: string
  subject: string
  body: string
  author: string
  date: string
  relativeDate: string
  refs: string
  isMerge: boolean
}

/**
 * Fetch commits with full details
 */
const getCommits = (limit: number, offset = 0): CommitEntry[] => {
  try {
    const fieldSep = '<<GTO>>'
    const recordSep = '<<END>>'
    const format = [
      '%H', // full hash
      '%h', // short hash
      '%s', // subject
      '%b', // body (may contain newlines)
      '%an', // author name
      '%ci', // date ISO
      '%cr', // relative date
      '%D', // ref names
      '%P', // parent hashes (multiple = merge)
    ].join(fieldSep)

    const output = execSilent(
      `git log --format="${format}${recordSep}" --skip=${offset} -${limit}`
    ).trim()
    if (!output) return []

    // Split on record separator first (handles multi-line body)
    return output
      .split(recordSep)
      .map((record) => record.trim())
      .filter(Boolean)
      .map((record) => {
        const parts = record.split(fieldSep)
        const parents = (parts[8] ?? '').trim().split(' ').filter(Boolean)
        return {
          hash: parts[0] ?? '',
          shortHash: parts[1] ?? '',
          subject: parts[2] ?? '',
          body: (parts[3] ?? '').trim(),
          author: parts[4] ?? '',
          date: parts[5] ?? '',
          relativeDate: parts[6] ?? '',
          refs: parts[7] ?? '',
          isMerge: parents.length > 1,
        }
      })
      .filter((c) => c.hash !== '')
  } catch {
    return []
  }
}

/**
 * Format ref tags (HEAD, branches, tags)
 */
const formatRefs = (refs: string): string => {
  if (!refs.trim()) return ''

  const parts = refs.split(',').map((r) => r.trim())
  const formatted = parts.map((ref) => {
    if (ref.startsWith('HEAD')) {
      return `${colors.red}${colors.bright}HEAD${colors.reset}`
    }
    if (ref.startsWith('tag:')) {
      return `${colors.yellow}🏷 ${ref.replace('tag: ', '')}${colors.reset}`
    }
    if (ref.includes('origin/')) {
      return `${colors.cyan}${ref}${colors.reset}`
    }
    return `${colors.green}${ref}${colors.reset}`
  })

  return ` (${formatted.join(', ')})`
}

/**
 * Render a single commit in timeline style
 */
const renderCommit = (commit: CommitEntry, isLast: boolean): void => {
  const connector = isLast ? '╰' : '├'
  const pipe = isLast ? ' ' : '│'

  // Merge indicator
  const mergeIcon = commit.isMerge ? `${colors.cyan}⤵${colors.reset} ` : ''

  // Hash + refs
  const hashStr = `${colors.yellow}${commit.shortHash}${colors.reset}`
  const refStr = formatRefs(commit.refs)

  // Subject line
  console.log(
    `  ${colors.gray}${connector}─${colors.reset} ${mergeIcon}${hashStr}${refStr} ${colors.bright}${commit.subject}${colors.reset}`
  )

  // Author + date
  console.log(
    `  ${colors.gray}${pipe}${colors.reset}   ${colors.blue}${commit.author}${colors.reset} ${colors.gray}· ${commit.relativeDate}${colors.reset}`
  )

  // Body (if present, show first 2 lines)
  if (commit.body) {
    const bodyLines = commit.body.split('\n').filter(Boolean).slice(0, 2)
    for (const bodyLine of bodyLines) {
      const trimmed = bodyLine.length > 80 ? bodyLine.slice(0, 77) + '...' : bodyLine
      console.log(
        `  ${colors.gray}${pipe}${colors.reset}   ${colors.gray}${trimmed}${colors.reset}`
      )
    }
  }

  // Spacer between commits
  if (!isLast) {
    console.log(`  ${colors.gray}│${colors.reset}`)
  }
}

/**
 * Get summary statistics
 */
const getStats = (): { totalCommits: number; authors: number; firstDate: string } => {
  try {
    const total = Number.parseInt(execSilent('git rev-list --count HEAD').trim(), 10)
    const authorsOutput = execSilent('git shortlog -sn HEAD | wc -l').trim()
    const authors = Number.parseInt(authorsOutput, 10)
    const firstDate = execSilent('git log --reverse --format="%cr" -1').trim()
    return { totalCommits: total, authors, firstDate }
  } catch {
    return { totalCommits: 0, authors: 0, firstDate: '' }
  }
}

/**
 * Interactive commit history viewer
 */
export const handleHistory = async (): Promise<void> => {
  log.banner()
  log.step(`${colors.cyan}Commit History${colors.reset}\n`)

  const current = getCurrentBranch()
  const stats = getStats()

  // Header info box
  const line = '─'.repeat(56)
  console.log(`${colors.cyan}┌${line}┐${colors.reset}`)
  console.log(
    `${colors.cyan}│${colors.reset} Branch: ${colors.green}${colors.bright}${current}${colors.reset}`
  )
  console.log(
    `${colors.cyan}│${colors.reset} Commits: ${colors.yellow}${stats.totalCommits}${colors.reset}` +
      `  Authors: ${colors.blue}${stats.authors}${colors.reset}` +
      (stats.firstDate ? `  Since: ${colors.gray}${stats.firstDate}${colors.reset}` : '')
  )
  console.log(`${colors.cyan}└${line}┘${colors.reset}`)

  const PAGE_SIZE = 15
  let offset = 0
  let keepGoing = true

  while (keepGoing) {
    const commits = getCommits(PAGE_SIZE, offset)

    if (commits.length === 0 && offset === 0) {
      console.log('')
      log.warn('No commits found.')
      return
    }

    if (commits.length === 0) {
      console.log('')
      log.info('No more commits.')
      return
    }

    // Timeline header
    console.log('')
    if (offset === 0) {
      console.log(`  ${colors.gray}╭── Timeline ──${colors.reset}`)
    } else {
      console.log(`  ${colors.gray}│   ... continued${colors.reset}`)
    }
    console.log(`  ${colors.gray}│${colors.reset}`)

    // Render each commit
    const isLastPage = commits.length < PAGE_SIZE
    for (const [i, commit] of commits.entries()) {
      const isLast = isLastPage && i === commits.length - 1
      renderCommit(commit, isLast)
    }

    if (isLastPage) {
      console.log(`  ${colors.gray}  (end of history)${colors.reset}`)
      console.log('')
      return
    }

    // Pagination menu
    console.log('')
    const action = await select('', [
      {
        label: `Load more (${offset + PAGE_SIZE + 1}-${offset + PAGE_SIZE * 2})`,
        value: 'more',
      },
      { label: 'Done', value: 'done' },
    ])

    switch (action) {
      case 'more': {
        offset += PAGE_SIZE
        break
      }
      default: {
        keepGoing = false
        break
      }
    }
  }

  console.log('')
}
