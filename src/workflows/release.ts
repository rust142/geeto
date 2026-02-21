/**
 * Release/Tag Manager workflow
 * Create releases with semver bumping, package.json update,
 * RELEASE.MD (user-friendly) and CHANGELOG.md (developer-facing)
 */

import { readFileSync, writeFileSync } from 'node:fs'
import type { CopilotModel } from '../api/copilot.js'
import type { GeminiModel } from '../api/gemini.js'
import type { OpenRouterModel } from '../api/openrouter.js'

import { askQuestion, confirm, editInline, ProgressBar } from '../cli/input.js'
import { select } from '../cli/menu.js'
import { colors } from '../utils/colors.js'
import { exec, execAsync, execSilent } from '../utils/exec.js'
import {
  chooseModelForProvider,
  generateReleaseNotesWithProvider,
  getAIProviderShortName,
  getModelValue,
} from '../utils/git-ai.js'
import { log } from '../utils/logging.js'
import { loadState } from '../utils/state.js'

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

/**
 * Normalize markdown spacing for consistent markdownlint-friendly output.
 * Ensures: one blank line after ### and #### headings, one blank line between sections,
 * no double blank lines, trailing newline.
 */
const normalizeReleaseMarkdown = (md: string): string => {
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
    // Sort by creation date (newest first), NOT version number.
    // Version sort breaks when older dummy/test tags have higher semver (e.g. v2.0.0 before v0.3.x).
    const output = execSilent('git tag --list --sort=-creatordate').trim()
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

  // Also update the compiled-binary-safe version constant
  try {
    const versionTs = readFileSync('src/version.ts', 'utf8')
    writeFileSync(
      'src/version.ts',
      versionTs.replace(/VERSION = '[^']*'/, `VERSION = '${newVersion}'`),
      'utf8'
    )
  } catch {
    /* version.ts update is best-effort */
  }
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

// ─── Sync GitHub Releases for existing tags ───

const getExistingGithubReleases = (): string[] => {
  try {
    const output = execSilent(
      'gh release list --limit 100 --json tagName --jq ".[].tagName"'
    ).trim()
    return output ? output.split('\n').filter(Boolean) : []
  } catch {
    return []
  }
}

const handleSyncReleases = async (): Promise<void> => {
  const line = '─'.repeat(56)

  // Check if gh CLI is available
  try {
    execSilent('gh --version')
  } catch {
    log.error('GitHub CLI (gh) is not installed. Install it: https://cli.github.com')
    return
  }

  console.log('')
  const spinner = log.spinner()
  spinner.start('Checking GitHub releases...')

  const localTags = getExistingTags()
  const ghReleases = getExistingGithubReleases()
  const missingTags = localTags.filter((t) => !ghReleases.includes(t))

  spinner.succeed(`Found ${localTags.length} tags, ${ghReleases.length} GitHub releases`)

  if (missingTags.length === 0) {
    console.log('')
    log.success('All tags have GitHub Releases! Nothing to sync.')
    return
  }

  console.log('')
  log.info(`${colors.bright}${missingTags.length}${colors.reset} tags missing GitHub Releases:`)
  for (const tag of missingTags) {
    console.log(`  ${colors.yellow}${tag}${colors.reset}`)
  }

  console.log('')
  const action = await select('What do you want to do?', [
    { label: 'Create releases for all missing tags', value: 'all' },
    { label: 'Select which tags to release', value: 'select' },
    { label: 'Cancel', value: 'cancel' },
  ])

  if (action === 'cancel') return

  let tagsToRelease = missingTags

  if (action === 'select') {
    const { multiSelect } = await import('../cli/menu.js')
    const choices = missingTags.map((t) => ({ label: t, value: t }))
    const selected = await multiSelect('Select tags to create releases for:', choices)
    if (selected.length === 0) {
      log.info('No tags selected.')
      return
    }
    tagsToRelease = selected
  }

  // Choose release notes mode: AI or template
  console.log('')
  const notesMode = await select('How should release notes be generated?', [
    { label: 'AI-generated (recommended)', value: 'ai' },
    { label: 'Auto-generate (template-based)', value: 'auto' },
  ])

  // AI setup if needed
  let useAI = notesMode === 'ai'
  let language: 'en' | 'id' = 'en'
  let aiProvider: 'gemini' | 'copilot' | 'openrouter' = 'copilot'
  let copilotModel: CopilotModel | undefined
  let openrouterModel: OpenRouterModel | undefined
  let geminiModel: GeminiModel | undefined

  if (useAI) {
    language = (await select('Release notes language:', [
      { label: 'English', value: 'en' },
      { label: 'Indonesian (Bahasa Indonesia)', value: 'id' },
    ])) as 'en' | 'id'

    // Check saved config
    const savedState = loadState()
    if (
      savedState?.aiProvider &&
      savedState.aiProvider !== 'manual' &&
      (savedState.copilotModel || savedState.openrouterModel || savedState.geminiModel)
    ) {
      aiProvider = savedState.aiProvider as 'gemini' | 'copilot' | 'openrouter'
      copilotModel = savedState.copilotModel
      openrouterModel = savedState.openrouterModel
      geminiModel = savedState.geminiModel
    } else {
      let providerChosen = false
      while (!providerChosen) {
        aiProvider = (await select('Choose AI Provider:', [
          { label: 'GitHub (Recommended)', value: 'copilot' },
          { label: 'Gemini', value: 'gemini' },
          { label: 'OpenRouter', value: 'openrouter' },
        ])) as 'gemini' | 'copilot' | 'openrouter'

        const chosen = await chooseModelForProvider(
          aiProvider,
          undefined,
          'Back to AI provider menu'
        )
        if (!chosen || chosen === 'back') continue

        switch (aiProvider) {
          case 'gemini': {
            geminiModel = chosen as GeminiModel
            break
          }
          case 'copilot': {
            copilotModel = chosen as CopilotModel
            break
          }
          case 'openrouter': {
            openrouterModel = chosen as OpenRouterModel
            break
          }
        }
        providerChosen = true
      }
    }
  }

  // Preview and confirm
  console.log('')
  console.log(`${colors.cyan}┌${line}┐${colors.reset}`)
  console.log(`${colors.cyan}│${colors.reset} ${colors.bright}Sync Plan${colors.reset}`)
  console.log(`${colors.cyan}├${line}┤${colors.reset}`)
  for (const tag of tagsToRelease) {
    const ver = tag.replace(/^v/, '')
    console.log(
      `${colors.cyan}│${colors.reset}  ${colors.green}+${colors.reset} Create release for ${colors.yellow}${ver}${colors.reset}`
    )
  }
  console.log(
    `${colors.cyan}│${colors.reset}  ${colors.gray}Mode: ${useAI ? 'AI-generated' : 'Template-based'}${colors.reset}`
  )
  console.log(`${colors.cyan}└${line}┘${colors.reset}`)

  console.log('')
  const proceed = confirm(`Create ${tagsToRelease.length} GitHub Releases?`)
  if (!proceed) return

  // Create releases one by one
  const allTags = getExistingTags()
  let successCount = 0

  for (const tag of tagsToRelease) {
    const ver = tag.replace(/^v/, '')
    const tagIdx = allTags.indexOf(tag)
    const prevTag = allTags[tagIdx + 1]
    const commits = getCommitsSinceTag(prevTag)
    const commitList = commits.map((c) => c.subject).join('\n')

    let releaseBody: string

    if (useAI && commits.length > 0) {
      console.log('')
      const aiSpinner = log.spinner()
      const modelDisplay = getModelValue(copilotModel ?? openrouterModel ?? geminiModel ?? '')
      aiSpinner.start(
        `Generating notes for ${tag} with ${getAIProviderShortName(aiProvider)}` +
          (modelDisplay ? ` (${modelDisplay})` : '') +
          '...'
      )

      const aiResult = await generateReleaseNotesWithProvider(
        aiProvider,
        commitList,
        language,
        undefined,
        copilotModel,
        openrouterModel,
        geminiModel
      )

      if (aiResult) {
        aiSpinner.succeed(`Notes generated for ${tag}`)
        releaseBody = normalizeReleaseMarkdown(aiResult)

        // Preview notes for user review
        console.log('')
        console.log(`${colors.cyan}┌${'─'.repeat(56)}┐${colors.reset}`)
        console.log(
          `${colors.cyan}│${colors.reset} ${colors.bright}Release Notes — ${tag}${colors.reset}`
        )
        console.log(`${colors.cyan}├${'─'.repeat(56)}┤${colors.reset}`)
        for (const noteLine of releaseBody.split('\n')) {
          console.log(`${colors.cyan}│${colors.reset} ${noteLine}`)
        }
        console.log(`${colors.cyan}└${'─'.repeat(56)}┘${colors.reset}`)

        console.log('')
        const reviewAction = await select(`Publish release for ${tag}?`, [
          { label: 'Yes, publish', value: 'accept' },
          { label: 'Skip this tag', value: 'skip' },
        ])

        if (reviewAction === 'skip') continue
      } else {
        aiSpinner.fail(`AI failed for ${tag}, using template`)
        useAI = false
        releaseBody = generateReleaseMd(ver, commits, prevTag?.replace(/^v/, '') ?? '0.0.0')
          .replace(/^## .*\n+/, '')
          .replace(/\n---\n*$/, '')
          .trim()
      }
    } else {
      releaseBody = generateReleaseMd(ver, commits, prevTag?.replace(/^v/, '') ?? '0.0.0')
        .replace(/^## .*\n+/, '')
        .replace(/\n---\n*$/, '')
        .trim()
    }

    console.log('')
    const releaseSpinner = log.spinner()

    // Ensure tag exists on remote before creating GitHub Release
    releaseSpinner.start(`Pushing tag ${colors.yellow}${tag}${colors.reset} to remote...`)
    try {
      await execAsync(`git push origin ${tag} --no-verify`, true)
      releaseSpinner.succeed(`Tag ${tag} pushed to remote`)
    } catch {
      // Tag might already exist on remote — that's fine, continue
    }

    console.log('')
    const createSpinner = log.spinner()
    createSpinner.start(`Creating release ${colors.yellow}${tag}${colors.reset}...`)

    const os = await import('node:os')
    const tempFile = `${os.tmpdir()}/geeto-sync-${Date.now()}.md`
    writeFileSync(tempFile, releaseBody, 'utf8')

    try {
      await execAsync(`gh release create ${tag} --title "${tag}" --notes-file "${tempFile}"`, true)
      createSpinner.succeed(`Release ${tag} created`)
      successCount++
    } catch (error) {
      const stderr = (error as { stderr?: string }).stderr?.trim()
      createSpinner.fail(`Failed to create release for ${tag}`)
      if (stderr) log.error(`  ${stderr.split('\n')[0]}`)
    }

    // Cleanup temp file
    try {
      const { unlinkSync } = await import('node:fs')
      unlinkSync(tempFile)
    } catch {
      /* ignore */
    }
  }

  console.log('')
  if (successCount === tagsToRelease.length) {
    log.success(`All ${successCount} GitHub Releases created!`)
  } else {
    log.warn(`${successCount}/${tagsToRelease.length} releases created`)
  }
}

// ─── Delete GitHub Releases ───

const handleDeleteReleases = async (): Promise<void> => {
  // Check if gh CLI is available
  try {
    execSilent('gh --version')
  } catch {
    log.error('GitHub CLI (gh) is not installed. Install it: https://cli.github.com')
    return
  }

  console.log('')
  const spinner = log.spinner()
  spinner.start('Fetching GitHub releases...')

  const ghReleases = getExistingGithubReleases()

  spinner.succeed(`Found ${ghReleases.length} GitHub releases`)

  if (ghReleases.length === 0) {
    console.log('')
    log.info('No GitHub Releases to delete.')
    return
  }

  console.log('')
  const { multiSelect } = await import('../cli/menu.js')
  const choices = ghReleases.map((t) => ({ label: t, value: t }))
  const selected = await multiSelect('Select releases to delete:', choices)

  if (selected.length === 0) {
    log.info('No releases selected.')
    return
  }

  console.log('')
  const alsoDeleteTag = confirm('Also delete the associated git tags?')

  console.log('')
  const proceed = confirm(
    `Delete ${selected.length} GitHub Release(s)${alsoDeleteTag ? ' + tags' : ''}?`
  )
  if (!proceed) return

  let successCount = 0

  for (const release of selected) {
    console.log('')
    const releaseSpinner = log.spinner()
    releaseSpinner.start(`Deleting release ${colors.yellow}${release}${colors.reset}...`)

    try {
      await execAsync(`gh release delete ${release} --yes`, true)
      if (alsoDeleteTag) {
        try {
          await execAsync(`git tag -d ${release}`, true)
          await execAsync(`git push origin --delete ${release} --no-verify`, true)
        } catch {
          /* Tag deletion is best-effort */
        }
      }
      releaseSpinner.succeed(`Release ${release} deleted${alsoDeleteTag ? ' + tag' : ''}`)
      successCount++
    } catch (error) {
      const stderr = (error as { stderr?: string }).stderr?.trim()
      releaseSpinner.fail(`Failed to delete ${release}`)
      if (stderr) log.error(`  ${stderr.split('\n')[0]}`)
    }
  }

  console.log('')
  if (successCount === selected.length) {
    log.success(`All ${successCount} releases deleted!`)
  } else {
    log.warn(`${successCount}/${selected.length} releases deleted`)
  }
}

// ─── Recover missing tags ───

const handleRecoverTags = async (): Promise<void> => {
  const line = '─'.repeat(56)

  console.log('')
  const spinner = log.spinner()
  spinner.start('Scanning release commits...')

  // Find all release commits: "chore(release): vX.Y.Z"
  let gitLog: string
  try {
    gitLog = exec('git log --all --oneline --grep="^chore(release): v" --format="%H %s"', true)
  } catch {
    spinner.fail('Failed to scan git log')
    return
  }

  const releasePattern = /^([a-f0-9]+) chore\(release\): v(.+)$/
  const releaseCommits: { hash: string; version: string; tag: string }[] = []

  for (const logLine of gitLog.split('\n').filter(Boolean)) {
    const match = logLine.match(releasePattern)
    if (match?.[1] && match[2]) {
      releaseCommits.push({
        hash: match[1],
        version: match[2],
        tag: `v${match[2]}`,
      })
    }
  }

  if (releaseCommits.length === 0) {
    spinner.fail('No release commits found')
    return
  }

  // Compare with existing tags
  const existingTags = new Set(getExistingTags())
  const missingTags = releaseCommits.filter((rc) => !existingTags.has(rc.tag))

  spinner.succeed(`Found ${releaseCommits.length} release commits, ${existingTags.size} tags`)

  if (missingTags.length === 0) {
    console.log('')
    log.success('All release commits have matching tags! Nothing to recover.')
    return
  }

  // Show missing tags
  console.log('')
  log.info(
    `${colors.bright}${missingTags.length}${colors.reset} tags missing (release commit exists but no tag):`
  )
  for (const mt of missingTags) {
    console.log(
      `  ${colors.yellow}${mt.tag}${colors.reset} ${colors.gray}← ${mt.hash.slice(0, 7)}${colors.reset}`
    )
  }

  console.log('')
  const action = await select('What do you want to do?', [
    { label: 'Recover all missing tags', value: 'all' },
    { label: 'Select which tags to recover', value: 'select' },
    { label: 'Cancel', value: 'cancel' },
  ])

  if (action === 'cancel') return

  let tagsToRecover = missingTags

  if (action === 'select') {
    const { multiSelect } = await import('../cli/menu.js')
    const choices = missingTags.map((mt) => ({
      label: `${mt.tag} (${mt.hash.slice(0, 7)})`,
      value: mt.tag,
    }))
    const selected = await multiSelect('Select tags to recover:', choices)
    if (selected.length === 0) {
      log.info('No tags selected.')
      return
    }
    tagsToRecover = missingTags.filter((mt) => selected.includes(mt.tag))
  }

  // Preview
  console.log('')
  console.log(`${colors.cyan}┌${line}┐${colors.reset}`)
  console.log(`${colors.cyan}│${colors.reset} ${colors.bright}Recovery Plan${colors.reset}`)
  console.log(`${colors.cyan}├${line}┤${colors.reset}`)
  for (const mt of tagsToRecover) {
    console.log(
      `${colors.cyan}│${colors.reset}  ${colors.green}+${colors.reset} ${colors.yellow}${mt.tag}${colors.reset} → commit ${colors.gray}${mt.hash.slice(0, 7)}${colors.reset}`
    )
  }
  console.log(`${colors.cyan}└${line}┘${colors.reset}`)

  console.log('')
  const proceed = confirm(`Create ${tagsToRecover.length} tags?`)
  if (!proceed) return

  let successCount = 0

  for (const mt of tagsToRecover) {
    console.log('')
    const tagSpinner = log.spinner()
    tagSpinner.start(`Creating tag ${colors.yellow}${mt.tag}${colors.reset}...`)

    try {
      exec(`git tag -a ${mt.tag} ${mt.hash} -m "Release ${mt.tag}"`, true)
      tagSpinner.succeed(`Tag ${mt.tag} created`)
      successCount++
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      tagSpinner.fail(`Failed to create ${mt.tag}`)
      log.error(`  ${errMsg.split('\n')[0]}`)
    }
  }

  console.log('')
  if (successCount === tagsToRecover.length) {
    log.success(`All ${successCount} tags recovered!`)
  } else {
    log.warn(`${successCount}/${tagsToRecover.length} tags recovered`)
  }

  // Offer to push tags to remote
  if (successCount > 0) {
    console.log('')
    const pushTags = confirm('Push recovered tags to remote?')
    if (pushTags) {
      console.log('')
      const pushSpinner = log.spinner()
      pushSpinner.start('Pushing tags to remote...')
      try {
        await execAsync('git push --tags --no-verify', true)
        pushSpinner.succeed('Tags pushed to remote')
      } catch (error) {
        const stderr = (error as { stderr?: string }).stderr?.trim()
        pushSpinner.fail('Failed to push tags')
        if (stderr) log.error(`  ${stderr.split('\n')[0]}`)
      }
    }
  }
}

// ─── Main handler ───

export const handleRelease = async (): Promise<void> => {
  log.banner()
  log.step(`${colors.cyan}Release / Tag Manager${colors.reset}\n`)

  // Main menu: create new release, sync, or manage releases
  const mode = await select('What do you want to do?', [
    { label: 'Create a new release', value: 'create' },
    { label: 'Sync GitHub Releases for existing tags', value: 'sync' },
    { label: 'Recover missing tags from release commits', value: 'recover' },
    { label: 'Delete GitHub Releases', value: 'delete' },
  ])

  if (mode === 'sync') {
    await handleSyncReleases()
    return
  }

  if (mode === 'recover') {
    await handleRecoverTags()
    return
  }

  if (mode === 'delete') {
    await handleDeleteReleases()
    return
  }

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

  // ─── AI Release Notes Generation ───
  // Ask how to generate release notes for RELEASE.MD
  const commitList = commits.map((c) => c.subject).join('\n')

  console.log('')
  const releaseNotesMode = await select('How do you want to generate RELEASE.MD?', [
    { label: 'AI-generated (recommended)', value: 'ai' },
    { label: 'Auto-generate (template-based)', value: 'auto' },
  ])

  let aiReleaseNotes: string | null = null

  if (releaseNotesMode === 'ai' && commits.length > 0) {
    // Choose language
    const language = (await select('Release notes language:', [
      { label: 'English', value: 'en' },
      { label: 'Indonesian (Bahasa Indonesia)', value: 'id' },
    ])) as 'en' | 'id'

    // Read saved AI config from state
    const savedState = loadState()
    let aiProvider: 'gemini' | 'copilot' | 'openrouter' = 'copilot'
    let copilotModel: CopilotModel | undefined
    let openrouterModel: OpenRouterModel | undefined
    let geminiModel: GeminiModel | undefined

    // Use saved provider/model if available, otherwise ask user
    if (
      savedState?.aiProvider &&
      savedState.aiProvider !== 'manual' &&
      (savedState.copilotModel || savedState.openrouterModel || savedState.geminiModel)
    ) {
      aiProvider = savedState.aiProvider as 'gemini' | 'copilot' | 'openrouter'
      copilotModel = savedState.copilotModel
      openrouterModel = savedState.openrouterModel
      geminiModel = savedState.geminiModel
    } else {
      // No saved config — ask user to pick provider + model
      let providerChosen = false
      while (!providerChosen) {
        aiProvider = (await select('Choose AI Provider:', [
          { label: 'GitHub (Recommended)', value: 'copilot' },
          { label: 'Gemini', value: 'gemini' },
          { label: 'OpenRouter', value: 'openrouter' },
        ])) as 'gemini' | 'copilot' | 'openrouter'

        const chosen = await chooseModelForProvider(
          aiProvider,
          undefined,
          'Back to AI provider menu'
        )
        if (!chosen || chosen === 'back') continue

        switch (aiProvider) {
          case 'gemini': {
            geminiModel = chosen as GeminiModel
            break
          }
          case 'copilot': {
            copilotModel = chosen as CopilotModel
            break
          }
          case 'openrouter': {
            openrouterModel = chosen as OpenRouterModel
            break
          }
        }
        providerChosen = true
      }
    }

    // Generate/regenerate loop (similar to commit flow)
    let correction: string | undefined
    let accepted = false

    while (!accepted) {
      const spinner = log.spinner()
      const modelDisplay = getModelValue(copilotModel ?? openrouterModel ?? geminiModel ?? '')
      spinner.start(
        `Generating release notes with ${getAIProviderShortName(aiProvider)}` +
          (modelDisplay ? ` (${modelDisplay})` : '') +
          '...'
      )

      const result = await generateReleaseNotesWithProvider(
        aiProvider,
        commitList,
        language,
        correction,
        copilotModel,
        openrouterModel,
        geminiModel
      )

      spinner.succeed('Release notes generated')
      console.log('')

      if (!result) {
        log.warn('AI returned no result. Falling back to template-based generation.')
        break
      }

      aiReleaseNotes = result

      // Preview
      console.log(`${colors.cyan}┌${'─'.repeat(56)}┐${colors.reset}`)
      console.log(
        `${colors.cyan}│${colors.reset} ${colors.bright}Release Notes Preview${colors.reset}`
      )
      console.log(`${colors.cyan}├${'─'.repeat(56)}┤${colors.reset}`)
      for (const line of aiReleaseNotes.split('\n')) {
        console.log(`${colors.cyan}│${colors.reset} ${line}`)
      }
      console.log(`${colors.cyan}└${'─'.repeat(56)}┘${colors.reset}`)
      console.log('')

      const action = await select('Accept these release notes?', [
        { label: 'Yes, use it', value: 'accept' },
        { label: 'Regenerate', value: 'regenerate' },
        { label: 'Edit inline', value: 'edit' },
        { label: 'Correct AI (give feedback)', value: 'correct' },
        { label: 'Change model', value: 'change-model' },
        { label: 'Change AI provider', value: 'change-provider' },
        { label: 'Use template instead', value: 'template' },
      ])

      switch (action) {
        case 'accept': {
          accepted = true
          break
        }
        case 'regenerate': {
          correction = undefined
          continue
        }
        case 'edit': {
          const edited = await editInline(aiReleaseNotes, 'Release Notes', '.md')
          aiReleaseNotes = edited
          accepted = true
          break
        }
        case 'correct': {
          if (process.stdin.isTTY) process.stdin.setRawMode(false)
          const feedback = askQuestion('Feedback for AI: ').trim()
          if (feedback) correction = feedback
          continue
        }
        case 'change-model': {
          const newModel = await chooseModelForProvider(aiProvider, undefined, 'Back')
          if (newModel && newModel !== 'back') {
            switch (aiProvider) {
              case 'gemini': {
                geminiModel = newModel as GeminiModel
                break
              }
              case 'copilot': {
                copilotModel = newModel as CopilotModel
                break
              }
              case 'openrouter': {
                openrouterModel = newModel as OpenRouterModel
                break
              }
            }
          }
          correction = undefined
          continue
        }
        case 'change-provider': {
          const prov = (await select('Choose AI provider:', [
            { label: 'Copilot', value: 'copilot' },
            { label: 'Gemini', value: 'gemini' },
            { label: 'OpenRouter', value: 'openrouter' },
          ])) as 'gemini' | 'copilot' | 'openrouter'
          aiProvider = prov
          copilotModel = undefined
          openrouterModel = undefined
          geminiModel = undefined
          const newModel = await chooseModelForProvider(aiProvider, undefined, 'Back')
          if (newModel && newModel !== 'back') {
            switch (aiProvider) {
              case 'gemini': {
                geminiModel = newModel as GeminiModel
                break
              }
              case 'copilot': {
                copilotModel = newModel as CopilotModel
                break
              }
              case 'openrouter': {
                openrouterModel = newModel as OpenRouterModel
                break
              }
            }
          }
          correction = undefined
          continue
        }
        case 'template': {
          aiReleaseNotes = null
          accepted = true
          break
        }
      }
    }
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

  // 2. Update RELEASE.MD (prepend new version, keep old ones)
  spinner.start('Updating RELEASE.MD...')
  try {
    // Use AI-generated notes if available, otherwise fallback to template
    let newEntry: string
    if (aiReleaseNotes) {
      const now = new Date()
      const date = now.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
      const normalizedNotes = normalizeReleaseMarkdown(aiReleaseNotes)
      newEntry =
        [`## v${newVersion} — ${date}`, '', normalizedNotes, '', '---', ''].join('\n') + '\n'
    } else {
      newEntry = generateReleaseMd(newVersion, commits, currentVersion)
    }
    let existing = ''
    try {
      existing = readFileSync('RELEASE.MD', 'utf8')
    } catch {
      // File doesn't exist yet
    }

    const header = '# Releases\n\n'
    const footer =
      '\n*This document was automatically generated by [Geeto CLI](https://github.com/rust142/geeto)*\n'

    let releaseMd: string
    if (existing.startsWith('# Releases')) {
      // Strip old header and footer, prepend new entry after header
      const headerEnd = existing.indexOf('\n\n') + 2
      let body = existing.slice(headerEnd)
      // Remove trailing auto-generated footer if present
      const footerIdx = body.lastIndexOf(
        '*This document was automatically generated by [Geeto CLI]'
      )
      if (footerIdx !== -1) {
        body = body.slice(0, footerIdx).trimEnd() + '\n\n'
      }
      releaseMd = header + newEntry + body + footer
    } else if (existing) {
      // Old format without "# Releases" header — keep existing below new entry
      releaseMd = header + newEntry + existing + '\n' + footer
    } else {
      releaseMd = header + newEntry + footer
    }

    writeFileSync('RELEASE.MD', releaseMd, 'utf8')
    spinner.succeed('RELEASE.MD updated')
  } catch {
    spinner.fail('Failed to update RELEASE.MD')
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
    exec('git add package.json src/version.ts RELEASE.MD CHANGELOG.md', true)
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
    { label: 'Push release + tag', value: 'both' },
    { label: 'Push release only', value: 'commit' },
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
        await execAsync(`git push origin v${newVersion} --no-verify`, true)
      }
      clearInterval(interval)
      progressBar.update(100)
      progressBar.complete()
      console.log('')
      log.success(pushChoice === 'both' ? 'Pushed release + tag' : 'Pushed release')
    } catch {
      clearInterval(interval)
      progressBar.complete()
      console.log('')
      log.error('Failed to push')
    }
  }

  // 6. Create GitHub Release (if tag was pushed and gh CLI is available)
  let ghReleaseCreated = false
  if (pushChoice === 'both') {
    try {
      execSilent('gh --version')
      // gh CLI is available — create a GitHub Release

      // Build release body from AI notes or template
      const releaseBody = aiReleaseNotes
        ? normalizeReleaseMarkdown(aiReleaseNotes)
        : generateReleaseMd(newVersion, commits, currentVersion)
            .replace(/^## .*\n+/, '')
            .replace(/\n---\n*$/, '')
            .trim()

      // Write to temp file to avoid shell quoting issues
      const os = await import('node:os')
      const tempFile = `${os.tmpdir()}/geeto-release-${Date.now()}.md`
      writeFileSync(tempFile, releaseBody, 'utf8')

      const releaseSpinner = log.spinner()
      releaseSpinner.start('Creating GitHub Release...')

      try {
        await execAsync(
          `gh release create v${newVersion} --title "v${newVersion}" --notes-file "${tempFile}"`,
          true
        )
        releaseSpinner.succeed('GitHub Release created')
        ghReleaseCreated = true
      } catch (error) {
        const stderr = (error as { stderr?: string }).stderr?.trim()
        releaseSpinner.fail('Failed to create GitHub Release')
        if (stderr) log.error(`  ${stderr.split('\n')[0]}`)
      }

      // Cleanup temp file
      try {
        const { unlinkSync } = await import('node:fs')
        unlinkSync(tempFile)
      } catch {
        /* ignore cleanup errors */
      }
    } catch {
      // gh CLI not available — skip silently
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
  if (ghReleaseCreated) {
    console.log(
      `${colors.cyan}│${colors.reset}  ${colors.green}✓${colors.reset} GitHub Release published`
    )
  }
  console.log(`${colors.cyan}└${line}┘${colors.reset}`)
}
