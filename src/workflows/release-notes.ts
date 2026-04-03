/**
 * Release notes generation — markdown formatting, RELEASE.MD and CHANGELOG.md generators
 */

import type { CommitEntry } from './release-utils.js'

import { categorizeCommits, getRepoUrl } from './release-utils.js'

// ─── Markdown helpers ───

/**
 * Normalize markdown spacing for consistent markdownlint-friendly output.
 * Ensures: one blank line after ### and #### headings, one blank line between sections,
 * no double blank lines, trailing newline.
 */
export const normalizeReleaseMarkdown = (md: string): string => {
  const lines = md.split('\n')
  const result: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const nextLine = lines[i + 1] ?? ''

    result.push(line)

    // After a heading (### or ####), ensure exactly one blank line before content
    if ((line.startsWith('###') || line.startsWith('####')) && nextLine.trim() !== '') {
      result.push('')
    }

    // After a bullet line, if next line is a heading, ensure blank line
    if (line.startsWith('-') && (nextLine.startsWith('###') || nextLine.startsWith('####'))) {
      result.push('')
    }
  }

  // Collapse multiple blank lines into one
  return result
    .join('\n')
    .replaceAll(/\n{3,}/g, '\n\n')
    .trim()
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

export const generateReleaseMd = (
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

  // Each version is a ## section so multiple versions stack in a single file
  const header = [
    `## v${version} — ${date}`,
    '',
    `> Previous version: v${prevVersion}`,
    '',
    "### What's New?",
    '',
  ]

  const featureSection =
    cat.features.length > 0
      ? ['#### New Features', '', ...cat.features.map((f) => `- ${stripFeatPrefix(f.subject)}`), '']
      : []

  const fixSection =
    cat.fixes.length > 0
      ? ['#### Bug Fixes', '', ...cat.fixes.map((f) => `- ${stripFixPrefix(f.subject)}`), '']
      : []

  const breakingSection =
    cat.breaking.length > 0
      ? [
          '#### Important Changes',
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
          '#### Other Improvements',
          '',
          ...cat.other.map((o) => `- ${stripConventionalPrefix(o.subject)}`),
          '',
        ]
      : []

  const empty = commits.length === 0 ? ['No significant changes in this version.', ''] : []

  return [
    ...header,
    ...featureSection,
    ...fixSection,
    ...breakingSection,
    ...otherSection,
    ...empty,
    '---',
    '',
  ].join('\n')
}

// ─── CHANGELOG.md generator (developer-facing, per-commit) ───

export const generateChangelogEntry = (
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
