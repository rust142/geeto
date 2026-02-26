/**
 * Elegant commit history viewer
 * Display commit log with a beautiful timeline UI
 */

import { createHash } from 'node:crypto'

import { select } from '../cli/menu.js'
import { buildProjectLink, extractCardIdFromBranch } from '../utils/branch-naming.js'
import { colors } from '../utils/colors.js'
import { getBranchStrategyConfig } from '../utils/config.js'
import { BOX_W } from '../utils/display.js'
import { execSilent } from '../utils/exec.js'
import { getRemoteUrl } from '../utils/git-commands.js'
import { getCurrentBranch } from '../utils/git.js'
import { log } from '../utils/logging.js'

interface CommitEntry {
  hash: string
  shortHash: string
  subject: string
  body: string
  author: string
  authorEmail: string
  committer: string
  authorDate: string
  date: string
  relativeDate: string
  refs: string
  isMerge: boolean
  /** Parent commit hashes (2+ for merge commits) */
  parents: string[]
  /** true when authorDate ≠ committerDate (rebased / amended) */
  isModified: boolean
  /** true when author ≠ committer (cherry-picked / applied by someone else) */
  isReauthored: boolean
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
      '%ae', // author email
      '%cn', // committer name
      '%ai', // author date ISO
      '%ci', // committer date ISO
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
        const authorName = parts[4] ?? ''
        const authorEmail = (parts[5] ?? '').trim()
        const committerName = parts[6] ?? ''
        const authorDateStr = (parts[7] ?? '').trim()
        const committerDateStr = (parts[8] ?? '').trim()
        const parents = (parts[11] ?? '').trim().split(' ').filter(Boolean)
        // Compare only date portion (first 19 chars: YYYY-MM-DD HH:MM:SS)
        const isModified = authorDateStr.slice(0, 19) !== committerDateStr.slice(0, 19)
        const isReauthored = authorName !== committerName
        return {
          hash: parts[0] ?? '',
          shortHash: parts[1] ?? '',
          subject: parts[2] ?? '',
          body: (parts[3] ?? '').trim(),
          author: authorName,
          authorEmail,
          committer: committerName,
          authorDate: authorDateStr,
          date: committerDateStr,
          relativeDate: parts[9] ?? '',
          refs: parts[10] ?? '',
          isMerge: parents.length > 1,
          parents,
          isModified,
          isReauthored,
        }
      })
      .filter((c) => c.hash !== '')
  } catch {
    return []
  }
}

/**
 * Fetch commits with extra git log args (e.g. --author filter)
 */
const getCommitsFiltered = (limit: number, offset: number, extraArgs: string): CommitEntry[] => {
  try {
    const fieldSep = '<<GTO>>'
    const recordSep = '<<END>>'
    const format = [
      '%H',
      '%h',
      '%s',
      '%b',
      '%an',
      '%ae',
      '%cn',
      '%ai',
      '%ci',
      '%cr',
      '%D',
      '%P',
    ].join(fieldSep)

    const output = execSilent(
      `git log ${extraArgs} --format="${format}${recordSep}" --skip=${offset} -${limit}`
    ).trim()
    if (!output) return []

    return output
      .split(recordSep)
      .map((record) => record.trim())
      .filter(Boolean)
      .map((record) => {
        const parts = record.split(fieldSep)
        const authorName = parts[4] ?? ''
        const authorEmail = (parts[5] ?? '').trim()
        const committerName = parts[6] ?? ''
        const authorDateStr = (parts[7] ?? '').trim()
        const committerDateStr = (parts[8] ?? '').trim()
        const parents = (parts[11] ?? '').trim().split(' ').filter(Boolean)
        const isModified = authorDateStr.slice(0, 19) !== committerDateStr.slice(0, 19)
        const isReauthored = authorName !== committerName
        return {
          hash: parts[0] ?? '',
          shortHash: parts[1] ?? '',
          subject: parts[2] ?? '',
          body: (parts[3] ?? '').trim(),
          author: authorName,
          authorEmail,
          committer: committerName,
          authorDate: authorDateStr,
          date: committerDateStr,
          relativeDate: parts[9] ?? '',
          refs: parts[10] ?? '',
          isMerge: parents.length > 1,
          parents,
          isModified,
          isReauthored,
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
      return `${colors.red}${colors.bright}🔥 HEAD${colors.reset}`
    }
    if (ref.startsWith('tag:')) {
      return `${colors.yellow}🏷  ${ref.replace('tag: ', '')}${colors.reset}`
    }
    if (ref.includes('origin/')) {
      return `${colors.cyan}${ref}${colors.reset}`
    }
    return `${colors.green}${ref}${colors.reset}`
  })

  return ` (${formatted.join(', ')})`
}

/**
 * Badge for modified/reauthored commits
 */
const modBadge = (c: CommitEntry): string => {
  if (c.isReauthored) return ` ${colors.magenta}🍒${colors.reset}`
  if (c.isModified) return ` ${colors.blue}🔄${colors.reset}`
  return ''
}

/**
 * Check if terminal supports OSC 8 hyperlinks.
 * Most modern terminals do EXCEPT Warp (as of 2025).
 */
const supportsHyperlinks = (): boolean => {
  const term = process.env.TERM_PROGRAM?.toLowerCase() ?? ''
  // Warp does NOT support OSC 8 hyperlinks
  if (term.includes('warp')) return false
  // Known good: iTerm2, Kitty, WezTerm, macOS Terminal, GNOME Terminal, Konsole
  return true
}

const HYPERLINKS_SUPPORTED = supportsHyperlinks()

/**
 * Wrap text in OSC 8 hyperlink (clickable in supported terminals).
 * Falls back to plain text in unsupported terminals (e.g. Warp).
 */
let linkCounter = 0
const hyperlink = (url: string, text: string): string => {
  if (!HYPERLINKS_SUPPORTED) return text
  linkCounter += 1
  return `\u001B]8;id=geeto-${linkCounter};${url}\u0007${text}\u001B]8;;\u0007`
}

/**
 * Convert git remote URL to GitHub web base URL.
 * Supports SSH (git@github.com:owner/repo.git) and HTTPS.
 * Returns empty string if not a GitHub remote.
 */
const getGitHubBaseUrl = (): string => {
  try {
    const raw = getRemoteUrl()
    if (!raw) return ''
    // SSH format: git@github.com:owner/repo.git
    const sshMatch = /git@github\.com:(.+?)(?:\.git)?$/.exec(raw)
    if (sshMatch) return `https://github.com/${sshMatch[1]}`
    // HTTPS format: https://github.com/owner/repo.git
    const httpsMatch = /https?:\/\/github\.com\/(.+?)(?:\.git)?$/.exec(raw)
    if (httpsMatch) return `https://github.com/${httpsMatch[1]}`
    return ''
  } catch {
    return ''
  }
}

// ── Avatar helpers ─────────────────────────────────────────────────

/** Check if terminal supports inline images (iTerm2, Kitty, WezTerm, etc.) */
const supportsInlineImages = (): boolean => {
  const term = process.env.TERM_PROGRAM?.toLowerCase() ?? ''
  return term.includes('iterm') || term.includes('wezterm')
}

/** Get Gravatar URL for email. */
const getGravatarUrl = (email: string, size = 16): string => {
  const hash = createHash('md5').update(email.toLowerCase().trim()).digest('hex')
  return `https://gravatar.com/avatar/${hash}?s=${size}&d=identicon`
}

/** In-memory avatar image cache (email → base64) */
const avatarCache = new Map<string, string | null>()

/** Fetch avatar as base64 (returns null on failure, caches result) */
const fetchAvatarBase64 = async (email: string): Promise<string | null> => {
  if (avatarCache.has(email)) return avatarCache.get(email) ?? null
  try {
    const url = getGravatarUrl(email)
    const resp = await fetch(url)
    if (!resp.ok) {
      avatarCache.set(email, null)
      return null
    }
    const buf = Buffer.from(await resp.arrayBuffer())
    const b64 = buf.toString('base64')
    avatarCache.set(email, b64)
    return b64
  } catch {
    avatarCache.set(email, null)
    return null
  }
}

/** Render inline image using iTerm2 protocol */
const iterm2InlineImage = (base64: string, width = 2): string =>
  `\u001B]1337;File=inline=1;width=${width};height=1;preserveAspectRatio=1:${base64}\u0007`

/**
 * Render a single commit in timeline style
 */
const renderCommit = async (
  commit: CommitEntry,
  isLast: boolean,
  projectTool: 'trello' | 'none',
  separator: '-' | '_',
  showAvatar: boolean,
  githubBase: string,
  compact: boolean
): Promise<void> => {
  const connector = isLast ? '╰' : '├'
  const pipe = isLast ? ' ' : '│'

  // Merge indicator
  const mergeIcon = commit.isMerge ? `${colors.cyan}⤵${colors.reset} ` : ''

  // Hash — clickable to GitHub if available (underlined to show it's a link)
  const underOn = '\u001B[4m'
  const underOff = '\u001B[24m'
  let hashStr = `${colors.yellow}${commit.shortHash}${colors.reset}`
  let commitUrl = ''
  if (githubBase) {
    commitUrl = `${githubBase}/commit/${commit.hash}`
    hashStr = hyperlink(
      commitUrl,
      `${underOn}${colors.yellow}${commit.shortHash}${underOff}${colors.reset}`
    )
  }
  const refStr = formatRefs(commit.refs)
  const badge = modBadge(commit)

  // Subject line
  console.log(
    `  ${colors.gray}${connector}─${colors.reset} ${mergeIcon}${hashStr}${badge}${refStr} ${colors.bright}${commit.subject}${colors.reset}`
  )

  // Compact mode: only subject line + spacer
  if (compact) {
    if (!isLast) console.log(`  ${colors.gray}│${colors.reset}`)
    return
  }

  // Show explicit GitHub link for terminals without hyperlink support (e.g. Warp)
  if (commitUrl && !HYPERLINKS_SUPPORTED) {
    console.log(
      `  ${colors.gray}${pipe}${colors.reset}   🔗 ${colors.blue}${commitUrl}${colors.reset}`
    )
  }

  // If merge commit + project tool configured, show linked card
  if (commit.isMerge && projectTool !== 'none') {
    const cardId = extractCardIdFromBranch(commit.subject, separator)
    if (cardId) {
      const link = buildProjectLink(cardId, projectTool)
      if (link) {
        const toolName = projectTool.charAt(0).toUpperCase() + projectTool.slice(1)
        const clickable = hyperlink(link, `${colors.cyan}${toolName}: ${cardId}${colors.reset}`)
        console.log(`  ${colors.gray}${pipe}${colors.reset}   🔗 ${clickable}`)
      }
    }
  }

  // Author + email + date (with avatar if supported) — shown BEFORE merged commits
  let avatarStr = ''
  let authorDisplay = `${colors.blue}${commit.author}${colors.reset}`
  if (showAvatar && commit.authorEmail) {
    const b64 = await fetchAvatarBase64(commit.authorEmail)
    if (b64) {
      avatarStr = `${iterm2InlineImage(b64)} `
    }
  } else if (commit.authorEmail) {
    // Fallback for Warp / terminals without inline image: clickable author → Gravatar
    const gravatarUrl = getGravatarUrl(commit.authorEmail, 256)
    authorDisplay = hyperlink(gravatarUrl, `${colors.blue}${commit.author}${colors.reset}`)
  }
  const emailDisplay = commit.authorEmail
    ? ` ${colors.gray}<${commit.authorEmail}>${colors.reset}`
    : ''
  console.log(
    `  ${colors.gray}${pipe}${colors.reset}   ${avatarStr}${authorDisplay}${emailDisplay} ${colors.gray}· ${commit.relativeDate}${colors.reset}`
  )

  // For merge commits: list the commits that were merged (hash + subject only)
  if (commit.isMerge && commit.parents.length >= 2) {
    try {
      const mergedLog = execSilent(
        `git log --oneline ${commit.parents[0]}..${commit.parents[1]} --format="%h %s" -10`
      ).trim()
      if (mergedLog) {
        const mergedLines = mergedLog.split('\n').filter(Boolean)
        console.log(
          `  ${colors.gray}${pipe}${colors.reset}   ${colors.gray}merged ${mergedLines.length} commit(s):${colors.reset}`
        )
        for (const ml of mergedLines) {
          const spIdx = ml.indexOf(' ')
          const mHash = spIdx > 0 ? ml.slice(0, spIdx) : ml
          const mSubject = spIdx > 0 ? ml.slice(spIdx + 1) : ''
          console.log(
            `  ${colors.gray}${pipe}${colors.reset}     ${colors.yellow}${mHash}${colors.reset} ${colors.gray}${mSubject}${colors.reset}`
          )
        }
      }
    } catch {
      // Silently ignore if git log fails
    }
  }

  // Body (show full description with proper wrapping)
  if (commit.body) {
    const bodyLines = commit.body.split('\n').filter(Boolean)
    for (const bodyLine of bodyLines) {
      // Wrap long lines at 76 chars (terminal-friendly)
      if (bodyLine.length <= 76) {
        console.log(
          `  ${colors.gray}${pipe}${colors.reset}   ${colors.gray}${bodyLine}${colors.reset}`
        )
      } else {
        // Word-wrap at 76 chars
        let remaining = bodyLine
        while (remaining.length > 0) {
          if (remaining.length <= 76) {
            console.log(
              `  ${colors.gray}${pipe}${colors.reset}   ${colors.gray}${remaining}${colors.reset}`
            )
            break
          }
          const breakAt = remaining.lastIndexOf(' ', 76)
          const splitPos = breakAt > 20 ? breakAt : 76
          console.log(
            `  ${colors.gray}${pipe}${colors.reset}   ${colors.gray}${remaining.slice(0, splitPos)}${colors.reset}`
          )
          remaining = remaining.slice(splitPos).trimStart()
        }
      }
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
  const line = '─'.repeat(BOX_W)
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

  // Load project tool config for issue ID linking
  const branchConfig = getBranchStrategyConfig()
  const projectTool = branchConfig?.projectTool ?? 'none'
  const separator = branchConfig?.separator ?? '-'

  // Detect if terminal supports inline avatar images
  const showAvatar = supportsInlineImages()

  // Resolve GitHub base URL for commit links
  const githubBase = getGitHubBaseUrl()

  // Collect unique authors for filter menu
  const getUniqueAuthors = (): string[] => {
    try {
      const all = execSilent('git log --format="%an" HEAD').trim().split('\n').filter(Boolean)
      const unique = [...new Set(all)]
      unique.sort((a, b) => a.localeCompare(b))
      return unique
    } catch {
      return []
    }
  }

  const PAGE_SIZE = 15
  let offset = 0
  let keepGoing = true
  let authorFilter: string | null = null
  let compact = false

  while (keepGoing) {
    // Build git log args
    const authorArg = authorFilter ? `--author="${authorFilter}"` : ''
    const commits = authorFilter
      ? getCommitsFiltered(PAGE_SIZE, offset, authorArg)
      : getCommits(PAGE_SIZE, offset)

    if (commits.length === 0 && offset === 0) {
      console.log('')
      if (authorFilter) {
        log.warn(`No commits found by "${authorFilter}".`)
      } else {
        log.warn('No commits found.')
      }
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
      // Show modification legend if any modified/reauthored commits exist
      const modCount = commits.filter((c) => c.isModified && !c.isReauthored).length
      const reauthorCount = commits.filter((c) => c.isReauthored).length
      const legendParts: string[] = []
      if (modCount > 0) {
        legendParts.push(`${colors.blue}🔄${colors.reset} rebased/amended`)
      }
      if (reauthorCount > 0) {
        legendParts.push(`${colors.magenta}🍒${colors.reset} cherry-picked`)
      }
      const mode = compact ? `${colors.gray}(compact)${colors.reset}` : ''
      const filter = authorFilter
        ? `${colors.gray}by ${colors.blue}${authorFilter}${colors.reset}`
        : ''
      console.log(`  ${colors.gray}╭── Timeline ──${colors.reset} ${mode}${filter}`)
      if (legendParts.length > 0) {
        console.log(
          `  ${colors.gray}│${colors.reset}  ${colors.gray}${legendParts.join('  ')}${colors.reset}`
        )
      }
    } else {
      console.log(`  ${colors.gray}│   ... continued${colors.reset}`)
    }
    console.log(`  ${colors.gray}│${colors.reset}`)

    // Render each commit
    const isLastPage = commits.length < PAGE_SIZE
    for (const [i, commit] of commits.entries()) {
      const isLast = isLastPage && i === commits.length - 1
      await renderCommit(commit, isLast, projectTool, separator, showAvatar, githubBase, compact)
    }

    if (isLastPage) {
      console.log(`  ${colors.gray}  (end of history)${colors.reset}`)
      console.log('')
      return
    }

    // Pagination + filter menu
    console.log('')
    const compactLabel = compact ? 'Detailed view' : 'Compact view'
    const filterLabel = authorFilter ? `Clear filter (${authorFilter})` : 'Filter by author'

    const action = await select('', [
      {
        label: `Load more (${offset + PAGE_SIZE + 1}-${offset + PAGE_SIZE * 2})`,
        value: 'more',
      },
      { label: compactLabel, value: 'compact' },
      { label: filterLabel, value: 'filter' },
      { label: 'Done', value: 'done' },
    ])

    switch (action) {
      case 'more': {
        offset += PAGE_SIZE
        break
      }
      case 'compact': {
        compact = !compact
        offset = 0
        break
      }
      case 'filter': {
        if (authorFilter) {
          // Clear filter
          authorFilter = null
          offset = 0
        } else {
          // Show author picker
          const authors = getUniqueAuthors()
          if (authors.length === 0) {
            log.warn('No authors found.')
            break
          }
          const picked = await select('Filter by author:', [
            ...authors.map((a) => ({ label: a, value: a })),
            { label: 'Cancel', value: '__cancel__' },
          ])
          if (picked !== '__cancel__') {
            authorFilter = picked
            offset = 0
          }
        }
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
