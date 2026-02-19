/**
 * Release/Tag Manager workflow
 * Create releases with semver bumping, package.json update,
 * RELEASE.MD (user-friendly) and CHANGELOG.md (developer-facing)
 */

import { readFileSync, writeFileSync } from 'node:fs'

import { askQuestion, confirm, ProgressBar } from '../cli/input.js'
import { select } from '../cli/menu.js'
import { colors } from '../utils/colors.js'
import { exec, execAsync, execSilent } from '../utils/exec.js'
import { log } from '../utils/logging.js'

// ─── Types ───

interface SemVer {
  major: number
  minor: number
  patch: number
}

interface CommitEntry {
  hash: string
  short: string
  subject: string
  author: string
  date: string
}

interface CategorizedCommits {
  features: CommitEntry[]
  fixes: CommitEntry[]
  breaking: CommitEntry[]
  other: CommitEntry[]
}

// ─── Helpers ───

const parseSemver = (version: string): SemVer | null => {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null
  return {
    major: Number.parseInt(match[1] ?? '0', 10),
    minor: Number.parseInt(match[2] ?? '0', 10),
    patch: Number.parseInt(match[3] ?? '0', 10),
  }
}

const getCurrentVersion = (): string => {
  try {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      version?: string
    }
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

const getExistingTags = (): string[] => {
  try {
    const output = execSilent('git tag --list --sort=-v:refname').trim()
    return output ? output.split('\n').filter(Boolean) : []
  } catch {
    return []
  }
}

const getCommitsSinceTag = (tag?: string): CommitEntry[] => {
  try {
    const sep = '<<GTO>>'
    const range = tag ? `${tag}..HEAD` : 'HEAD'
    const output = execSilent(
      `git log ${range} --format="%H${sep}%h${sep}%s${sep}%an${sep}%ci" --no-merges`
    ).trim()
    if (!output) return []
    return output
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(sep)
        return {
          hash: parts[0] ?? '',
          short: parts[1] ?? '',
          subject: parts[2] ?? '',
          author: parts[3] ?? '',
          date: parts[4] ?? '',
        }
      })
  } catch {
    return []
  }
}

const categorizeCommits = (commits: CommitEntry[]): CategorizedCommits => {
  const result: CategorizedCommits = {
    features: [],
    fixes: [],
    breaking: [],
    other: [],
  }

  for (const c of commits) {
    if (c.subject.includes('BREAKING CHANGE') || c.subject.includes('!:')) {
      result.breaking = [...result.breaking, c]
    } else if (c.subject.startsWith('feat')) {
      result.features = [...result.features, c]
    } else if (c.subject.startsWith('fix')) {
      result.fixes = [...result.fixes, c]
    } else {
      result.other = [...result.other, c]
    }
  }

  return result
}

const getRepoUrl = (): string => {
  try {
    return execSilent('git config --get remote.origin.url')
      .trim()
      .replace(/\.git$/, '')
      .replace(/^git@github\.com:/, 'https://github.com/')
  } catch {
    return ''
  }
}

const updatePackageVersion = (newVersion: string): void => {
  const content = readFileSync('package.json', 'utf8')
  const pkg = JSON.parse(content) as Record<string, unknown>
  pkg.version = newVersion
  writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n', 'utf8')
}

// ─── stripConventional helpers ───

const stripFeatPrefix = (s: string): string => {
  const idx = s.indexOf(': ')
  if (idx !== -1 && s.slice(0, idx).startsWith('feat')) return s.slice(idx + 2)
  return s.replace(/^feat:\s*/, '')
}

const stripFixPrefix = (s: string): string => {
  const idx = s.indexOf(': ')
  if (idx !== -1 && s.slice(0, idx).startsWith('fix')) return s.slice(idx + 2)
  return s.replace(/^fix:\s*/, '')
}

const stripBreakingPrefix = (s: string): string => {
  const idx = s.indexOf('!: ')
  if (idx !== -1) return s.slice(idx + 3)
  return s.replace(/BREAKING CHANGE:\s*/, '')
}

const stripConventionalPrefix = (s: string): string => {
  const idx = s.indexOf(': ')
  if (idx !== -1) return s.slice(idx + 2)
  return s
}

// ─── RELEASE.MD generator (user-facing, simple language) ───

const generateReleaseMd = (
  version: string,
  commits: CommitEntry[],
  prevVersion: string
): string => {
  const now = new Date()
  const date = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const cat = categorizeCommits(commits)

  const header = [
    `# Release v${version}`,
    '',
    `**Release date:** ${date}`,
    `**Previous version:** v${prevVersion}`,
    '',
    "## What's New?",
    '',
  ]

  const featureSection =
    cat.features.length > 0
      ? ['### New Features', '', ...cat.features.map((f) => `- ${stripFeatPrefix(f.subject)}`), '']
      : []

  const fixSection =
    cat.fixes.length > 0
      ? ['### Bug Fixes', '', ...cat.fixes.map((f) => `- ${stripFixPrefix(f.subject)}`), '']
      : []

  const breakingSection =
    cat.breaking.length > 0
      ? [
          '### Important Changes',
          '',
          '> Note: Some changes in this version may require adjustments.',
          '',
          ...cat.breaking.map((b) => `- ${stripBreakingPrefix(b.subject)}`),
          '',
        ]
      : []

  const otherSection =
    cat.other.length > 0
      ? [
          '### Other Improvements',
          '',
          ...cat.other.map((o) => `- ${stripConventionalPrefix(o.subject)}`),
          '',
        ]
      : []

  const empty = commits.length === 0 ? ['No significant changes in this version.', ''] : []

  const footer = [
    '---',
    '',
    '*This document was automatically generated by [Geeto CLI](https://github.com/rust142/geeto)*',
    '',
  ]

  return [
    ...header,
    ...featureSection,
    ...fixSection,
    ...breakingSection,
    ...otherSection,
    ...empty,
    ...footer,
  ].join('\n')
}

// ─── CHANGELOG.md generator (developer-facing, per-commit) ───

const generateChangelogEntry = (
  version: string,
  commits: CommitEntry[],
  prevVersion: string
): string => {
  const repoUrl = getRepoUrl()
  const dateStr = new Date().toISOString().slice(0, 10)
  const cat = categorizeCommits(commits)

  const commitLink = (c: CommitEntry): string =>
    repoUrl ? `[${c.short}](${repoUrl}/commit/${c.short})` : c.short

  const versionLink = repoUrl
    ? `[${version}](${repoUrl}/compare/v${prevVersion}...v${version})`
    : version

  const header = [`## ${versionLink} (${dateStr})`, '']

  const breakingSection =
    cat.breaking.length > 0
      ? [
          '### BREAKING CHANGES',
          '',
          ...cat.breaking.map((c) => `* ${c.subject} (${commitLink(c)})`),
          '',
        ]
      : []

  const featureSection =
    cat.features.length > 0
      ? ['### Features', '', ...cat.features.map((c) => `* ${c.subject} (${commitLink(c)})`), '']
      : []

  const fixSection =
    cat.fixes.length > 0
      ? ['### Bug Fixes', '', ...cat.fixes.map((c) => `* ${c.subject} (${commitLink(c)})`), '']
      : []

  const otherSection =
    cat.other.length > 0
      ? ['### Other Changes', '', ...cat.other.map((c) => `* ${c.subject} (${commitLink(c)})`), '']
      : []

  return [...header, ...breakingSection, ...featureSection, ...fixSection, ...otherSection].join(
    '\n'
  )
}

// ─── Main handler ───

export const handleRelease = async (): Promise<void> => {
  log.banner()
  log.step(`${colors.cyan}Release / Tag Manager${colors.reset}\n`)

  const currentVersion = getCurrentVersion()
  const semver = parseSemver(currentVersion)

  if (!semver) {
    log.error(`Invalid version in package.json: ${currentVersion}`)
    return
  }

  const tags = getExistingTags()
  const lastTag = tags[0] ?? ''

  // Show current state
  const line = '─'.repeat(56)
  console.log(`${colors.cyan}┌${line}┐${colors.reset}`)
  console.log(
    `${colors.cyan}│${colors.reset} ${colors.bright}Current version: ${colors.yellow}v${currentVersion}${colors.reset}`
  )
  if (lastTag) {
    console.log(`${colors.cyan}│${colors.reset} ${colors.gray}Last tag: ${lastTag}${colors.reset}`)
  }
  console.log(
    `${colors.cyan}│${colors.reset} ${colors.gray}Total tags: ${tags.length}${colors.reset}`
  )
  console.log(`${colors.cyan}└${line}┘${colors.reset}`)

  // Get commits since last tag
  const commits = getCommitsSinceTag(lastTag || undefined)
  if (commits.length === 0) {
    console.log('')
    log.warn('No new commits since last tag.')
    const force = confirm('Create a release anyway?')
    if (!force) return
  } else {
    console.log('')
    log.info(`${colors.bright}${commits.length}${colors.reset} commits since last tag`)
  }

  // Version bump selection
  console.log('')
  const { major, minor, patch } = semver
  const bumpType = await select('Version bump:', [
    {
      label: `Patch  ${colors.gray}${major}.${minor}.${patch + 1}${colors.reset} — bug fixes`,
      value: 'patch',
    },
    {
      label: `Minor  ${colors.gray}${major}.${minor + 1}.0${colors.reset} — new features`,
      value: 'minor',
    },
    {
      label: `Major  ${colors.gray}${major + 1}.0.0${colors.reset} — breaking changes`,
      value: 'major',
    },
    { label: 'Custom — enter version manually', value: 'custom' },
    { label: 'Cancel', value: 'cancel' },
  ])

  if (bumpType === 'cancel') return

  let newVersion: string
  switch (bumpType) {
    case 'custom': {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false)
      }
      const input = askQuestion('Enter version (e.g. 1.2.3): ').trim()
      if (!parseSemver(input)) {
        log.error('Invalid semver format.')
        return
      }
      newVersion = input

      break
    }
    case 'major': {
      newVersion = `${major + 1}.0.0`

      break
    }
    case 'minor': {
      newVersion = `${major}.${minor + 1}.0`

      break
    }
    default: {
      newVersion = `${major}.${minor}.${patch + 1}`
    }
  }

  // Show plan
  console.log('')
  console.log(`${colors.cyan}┌${line}┐${colors.reset}`)
  console.log(`${colors.cyan}│${colors.reset} ${colors.bright}Release Plan${colors.reset}`)
  console.log(`${colors.cyan}├${line}┤${colors.reset}`)
  console.log(
    `${colors.cyan}│${colors.reset}  Version    ${colors.yellow}v${currentVersion}${colors.reset} → ${colors.green}v${newVersion}${colors.reset}`
  )
  console.log(
    `${colors.cyan}│${colors.reset}  Tag        ${colors.bright}v${newVersion}${colors.reset}`
  )
  console.log(
    `${colors.cyan}│${colors.reset}  Files      ${colors.gray}package.json, RELEASE.MD, CHANGELOG.md${colors.reset}`
  )
  console.log(
    `${colors.cyan}│${colors.reset}  Commits    ${colors.bright}${commits.length}${colors.reset} changes included`
  )
  console.log(`${colors.cyan}└${line}┘${colors.reset}`)

  // Preview commit categories
  if (commits.length > 0) {
    const cat = categorizeCommits(commits)
    console.log('')
    if (cat.features.length > 0) {
      log.info(`  ${colors.green}+${cat.features.length}${colors.reset} features`)
    }
    if (cat.fixes.length > 0) {
      log.info(`  ${colors.yellow}~${cat.fixes.length}${colors.reset} fixes`)
    }
    if (cat.breaking.length > 0) {
      log.info(`  ${colors.red}!${cat.breaking.length}${colors.reset} breaking`)
    }
    if (cat.other.length > 0) {
      log.info(`  ${colors.gray}○${cat.other.length}${colors.reset} other`)
    }
  }

  console.log('')
  const proceed = confirm('Create this release?')
  if (!proceed) {
    log.info('Cancelled.')
    return
  }

  // Execute release steps
  const spinner = log.spinner()

  // 1. Update package.json
  spinner.start('Updating package.json...')
  try {
    updatePackageVersion(newVersion)
    spinner.succeed(`package.json → v${newVersion}`)
  } catch {
    spinner.fail('Failed to update package.json')
    return
  }

  // 2. Generate RELEASE.MD
  spinner.start('Generating RELEASE.MD...')
  try {
    writeFileSync('RELEASE.MD', generateReleaseMd(newVersion, commits, currentVersion), 'utf8')
    spinner.succeed('RELEASE.MD generated')
  } catch {
    spinner.fail('Failed to generate RELEASE.MD')
  }

  // 3. Update CHANGELOG.md
  spinner.start('Updating CHANGELOG.md...')
  try {
    const newEntry = generateChangelogEntry(newVersion, commits, currentVersion)
    let existing = ''
    try {
      existing = readFileSync('CHANGELOG.md', 'utf8')
    } catch {
      // File doesn't exist yet
    }

    let changelog: string
    if (existing.startsWith('# Changelog')) {
      const headerEnd = existing.indexOf('\n') + 1
      changelog = existing.slice(0, headerEnd) + '\n' + newEntry + existing.slice(headerEnd)
    } else if (existing) {
      changelog = '# Changelog\n\n' + newEntry + existing
    } else {
      changelog = '# Changelog\n\n' + newEntry
    }

    writeFileSync('CHANGELOG.md', changelog, 'utf8')
    spinner.succeed('CHANGELOG.md updated')
  } catch {
    spinner.fail('Failed to update CHANGELOG.md')
  }

  // 4. Stage, commit, tag
  spinner.start('Creating release commit...')
  try {
    exec('git add package.json RELEASE.MD CHANGELOG.md', true)
    exec(`git commit --no-verify -m "chore(release): v${newVersion}"`, true)
    spinner.succeed('Release commit created')
  } catch {
    spinner.fail('Failed to create release commit')
    return
  }

  spinner.start(`Creating tag v${newVersion}...`)
  try {
    exec(`git tag -a v${newVersion} -m "Release v${newVersion}"`, true)
    spinner.succeed(`Tag v${newVersion} created`)
  } catch {
    spinner.fail('Failed to create tag')
    return
  }

  // 5. Push
  console.log('')
  const pushChoice = await select('Push to remote?', [
    { label: 'Push commit + tag', value: 'both' },
    { label: 'Push commit only', value: 'commit' },
    { label: 'Skip pushing', value: 'skip' },
  ])

  if (pushChoice === 'both' || pushChoice === 'commit') {
    const progressBar = new ProgressBar(100, 'Pushing to remote')
    let progress = 0
    const interval = setInterval(() => {
      progress = Math.min(95, progress + Math.max(1, Math.floor(Math.random() * 6)))
      progressBar.update(progress)
    }, 250)

    try {
      await execAsync(`git push`, true)
      if (pushChoice === 'both') {
        await execAsync(`git push origin v${newVersion}`, true)
      }
      clearInterval(interval)
      progressBar.update(100)
      progressBar.complete()
      console.log('')
      log.success(pushChoice === 'both' ? 'Pushed commit + tag' : 'Pushed commit')
    } catch {
      clearInterval(interval)
      progressBar.complete()
      console.log('')
      log.error('Failed to push')
    }
  }

  // Summary
  console.log('')
  console.log(`${colors.cyan}┌${line}┐${colors.reset}`)
  console.log(
    `${colors.cyan}│${colors.reset} ${colors.green}✓${colors.reset} ${colors.bright}Release v${newVersion} created!${colors.reset}`
  )
  console.log(`${colors.cyan}├${line}┤${colors.reset}`)
  console.log(
    `${colors.cyan}│${colors.reset}  ${colors.green}✓${colors.reset} package.json updated`
  )
  console.log(
    `${colors.cyan}│${colors.reset}  ${colors.green}✓${colors.reset} RELEASE.MD generated ${colors.gray}(user-facing)${colors.reset}`
  )
  console.log(
    `${colors.cyan}│${colors.reset}  ${colors.green}✓${colors.reset} CHANGELOG.md updated ${colors.gray}(developer-facing)${colors.reset}`
  )
  console.log(
    `${colors.cyan}│${colors.reset}  ${colors.green}✓${colors.reset} Tag v${newVersion} created`
  )
  console.log(`${colors.cyan}└${line}┘${colors.reset}`)
}
