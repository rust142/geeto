/**
 * Merge Releases workflow — consolidate multiple GitHub/GitLab releases into one.
 *
 * Flow:
 * 1. Fetch all releases (with body/notes) via platform API
 * 2. User multiSelects which releases to merge
 * 3. Choose merge mode: raw concat or AI rewrite
 * 4. Preview combined release notes
 * 5. Update the newest selected release, delete older ones
 */

import { unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { CopilotModel } from '../api/copilot.js'
import type { GeminiModel } from '../api/gemini.js'
import type { OpenRouterModel } from '../api/openrouter.js'

import { getCurrentVersion, updatePackageVersion } from './release-utils.js'
import { askQuestion, confirm, editInline } from '../cli/input.js'
import { select } from '../cli/menu.js'
import { colors } from '../utils/colors.js'
import { BOX_W } from '../utils/display.js'
import { exec, execAsync } from '../utils/exec.js'
import {
  chooseModelForProvider,
  generateTextWithProvider,
  getAIProviderShortName,
  getModelValue,
} from '../utils/git-ai.js'
import { detectPlatformFromRemote, getPlatformCLI } from '../utils/github-helpers.js'
import { log } from '../utils/logging.js'
import { ScrambleProgress } from '../utils/scramble.js'
import { loadState } from '../utils/state.js'

// ─── Types ───

interface ReleaseInfo {
  tagName: string
  name: string
  body: string
  publishedAt: string
  isPrerelease: boolean
  isDraft: boolean
}

// ─── Helpers ───

/**
 * Fetch all releases with body content from the platform API.
 * Uses `gh api` since `gh release list` doesn't include body field.
 */
const fetchReleasesWithBody = async (cli: string): Promise<ReleaseInfo[]> => {
  try {
    if (cli === 'gh') {
      // GitHub: use REST API which includes body
      const result = await execAsync(
        `gh api repos/{owner}/{repo}/releases --paginate --jq '[.[] | {tagName: .tag_name, name: .name, body: .body, publishedAt: .published_at, isPrerelease: .prerelease, isDraft: .draft}]'`,
        true
      )
      const data = JSON.parse(result.stdout.trim()) as ReleaseInfo[]
      return Array.isArray(data) ? data : []
    }
    // GitLab: glab release list supports body via --json
    const result = await execAsync(
      `${cli} release list --per-page 100 --json tag_name,name,description,released_at`,
      true
    )
    const raw = JSON.parse(result.stdout.trim()) as Array<{
      tag_name: string
      name: string
      description: string
      released_at: string
    }>
    return (raw ?? []).map((r) => ({
      tagName: r.tag_name,
      name: r.name ?? r.tag_name,
      body: r.description ?? '',
      publishedAt: r.released_at ?? '',
      isPrerelease: false,
      isDraft: false,
    }))
  } catch {
    return []
  }
}

/**
 * Parse release notes body into categorized bullet items.
 * Handles standard "### What's New?" / "#### Section" format.
 */
const parseNotesIntoSections = (body: string): Record<string, string[]> => {
  const sections: Record<string, string[]> = {}
  let currentSection = 'Other Improvements'

  for (const line of body.split('\n')) {
    const trimmed = line.trim()
    // Skip top-level "### What's New?" heading
    if (/^###\s+What['']s New/i.test(trimmed)) continue
    // Detect subsection heading (#### Breaking Changes, #### New Features, etc.)
    const sectionMatch = /^####\s+(.+)/.exec(trimmed)
    if (sectionMatch?.[1]) {
      currentSection = sectionMatch[1].trim()
      continue
    }
    // Detect bullet items
    if (/^[-*]\s/.test(trimmed)) {
      const arr = sections[currentSection] ?? []
      sections[currentSection] = arr
      arr.push(trimmed)
    }
  }

  return sections
}

/**
 * Merge multiple release bodies into one unified release note.
 * Combines same-named sections and deduplicates items.
 */
const rawMergeNotes = (releases: ReleaseInfo[]): string => {
  const merged: Record<string, string[]> = {}

  for (const r of releases) {
    const body = r.body?.trim()
    if (!body) continue
    const sections = parseNotesIntoSections(body)
    for (const [section, items] of Object.entries(sections)) {
      merged[section] ??= []
      for (const item of items) {
        // Deduplicate by normalized text
        const norm = item
          .replace(/^[-*]\s+/, '')
          .toLowerCase()
          .trim()
        const exists = merged[section].some(
          (existing) =>
            existing
              .replace(/^[-*]\s+/, '')
              .toLowerCase()
              .trim() === norm
        )
        if (!exists) merged[section].push(item)
      }
    }
  }

  // Build output in standard order
  const sectionOrder = ['Breaking Changes', 'New Features', 'Bug Fixes', 'Other Improvements']
  const lines: string[] = ["### What's New?", '']

  // Known sections first (in order), then any remaining
  const rendered = new Set<string>()
  for (const name of sectionOrder) {
    const items = merged[name]
    if (!items || items.length === 0) continue
    lines.push(`#### ${name}`, '')
    for (const item of items) lines.push(item)
    lines.push('')
    rendered.add(name)
  }

  // Any extra sections not in the standard order
  for (const [name, items] of Object.entries(merged)) {
    if (rendered.has(name) || items.length === 0) continue
    lines.push(`#### ${name}`, '')
    for (const item of items) lines.push(item)
    lines.push('')
  }

  return lines.join('\n').trim()
}

/**
 * Build AI prompt for merging release notes.
 */
const buildMergePrompt = (releases: ReleaseInfo[], language: 'en' | 'id'): string => {
  const langLabel = language === 'id' ? 'Indonesian (Bahasa Indonesia)' : 'English'
  const releaseBlocks = releases
    .map((r) => {
      const body = r.body?.trim() || '(no release notes)'
      return `### ${r.tagName}\n${body}`
    })
    .join('\n\n')

  return `You are a release notes writer. You are given multiple release notes from prerelease/beta/rc versions that need to be merged into a single, clean release note in ${langLabel}.

Rules:
- Combine all changes into one unified release note
- Remove duplicate entries (same change mentioned in multiple releases)
- Group changes into subsections: "#### New Features", "#### Bug Fixes", "#### Other Improvements"
- Only include subsections that have items (skip empty ones)
- Use simple, non-technical language that end users can understand
- Each item should be a bullet point starting with "-"
- Keep it concise but informative
- If there are breaking changes, add a "#### Breaking Changes" subsection at the top
- Start with "### What's New?" as the top-level section
- Do NOT include version numbers, dates, or the original release tags in the output
- Output ONLY the merged release notes content

Here are the release notes to merge:

${releaseBlocks}`
}

/**
 * Preview release notes in a formatted box.
 */
const previewNotes = (notes: string): void => {
  console.log(`${colors.cyan}┌${'─'.repeat(BOX_W)}┐${colors.reset}`)
  console.log(
    `${colors.cyan}│${colors.reset} ${colors.bright}Merged Release Notes Preview${colors.reset}`
  )
  console.log(`${colors.cyan}├${'─'.repeat(BOX_W)}┤${colors.reset}`)
  for (const line of notes.split('\n')) {
    console.log(`${colors.cyan}│${colors.reset} ${line}`)
  }
  console.log(`${colors.cyan}└${'─'.repeat(BOX_W)}┘${colors.reset}`)
}

/**
 * Update a GitHub/GitLab release's body (notes).
 */
const updateReleaseNotes = async (
  cli: string,
  tagName: string,
  notes: string
): Promise<boolean> => {
  const tmpFile = path.join(tmpdir(), `geeto-merge-${Date.now()}.md`)
  try {
    writeFileSync(tmpFile, notes, 'utf8')
    await execAsync(`${cli} release edit ${tagName} --notes-file "${tmpFile}"`, true)
    return true
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim()
    log.error(`Failed to update release ${tagName}`)
    if (stderr) log.error(`  ${stderr.split('\n')[0]}`)
    return false
  } finally {
    try {
      unlinkSync(tmpFile)
    } catch {
      /* ignore */
    }
  }
}

/**
 * Create a new GitHub/GitLab release with notes.
 */
const createRelease = async (cli: string, tagName: string, notes: string): Promise<boolean> => {
  const tmpFile = path.join(tmpdir(), `geeto-merge-${Date.now()}.md`)
  try {
    writeFileSync(tmpFile, notes, 'utf8')
    await execAsync(
      `${cli} release create ${tagName} --title "${tagName}" --notes-file "${tmpFile}"`,
      true
    )
    return true
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim()
    log.error(`Failed to create release ${tagName}`)
    if (stderr) log.error(`  ${stderr.split('\n')[0]}`)
    return false
  } finally {
    try {
      unlinkSync(tmpFile)
    } catch {
      /* ignore */
    }
  }
}

/**
 * Delete a GitHub/GitLab release (keeps the git tag).
 */
const deleteRelease = async (cli: string, tagName: string): Promise<boolean> => {
  try {
    await execAsync(`${cli} release delete ${tagName} --yes`, true)
    return true
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim()
    log.error(`Failed to delete release ${tagName}`)
    if (stderr) log.error(`  ${stderr.split('\n')[0]}`)
    return false
  }
}

// ─── AI rewrite flow ───

const aiRewriteMergedNotes = async (
  releases: ReleaseInfo[],
  language: 'en' | 'id'
): Promise<string | null> => {
  const savedState = loadState()
  let aiProvider: 'gemini' | 'copilot' | 'openrouter' = 'copilot'
  let copilotModel: CopilotModel | undefined
  let openrouterModel: OpenRouterModel | undefined
  let geminiModel: GeminiModel | undefined

  // Use saved provider/model if available
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

      const chosen = await chooseModelForProvider(aiProvider, undefined, 'Back to AI provider menu')
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

  // Generate/review loop
  let correction: string | undefined
  let finalNotes: string | null = null

  while (true) {
    const prompt = buildMergePrompt(releases, language)
    const fullPrompt = correction ? `${prompt}\n\nUser feedback: ${correction}` : prompt

    const spinner = new ScrambleProgress()
    const modelDisplay = getModelValue(copilotModel ?? openrouterModel ?? geminiModel ?? '')
    spinner.start([
      `Merging release notes with ${getAIProviderShortName(aiProvider)}${modelDisplay ? ` (${modelDisplay})` : ''}`,
    ])

    const result = await generateTextWithProvider(
      aiProvider,
      fullPrompt,
      copilotModel,
      openrouterModel,
      geminiModel
    )

    spinner.succeed('Merged release notes generated')
    console.log('')

    if (!result) {
      log.warn('AI returned no result.')
      return null
    }

    finalNotes = result
    previewNotes(finalNotes)
    console.log('')

    const action = await select('Accept these merged release notes?', [
      { label: 'Yes, use it', value: 'accept' },
      { label: 'Regenerate', value: 'regenerate' },
      { label: 'Edit inline', value: 'edit' },
      { label: 'Correct AI (give feedback)', value: 'correct' },
      { label: 'Change model', value: 'change-model' },
      { label: 'Change AI provider', value: 'change-provider' },
      { label: 'Use raw merge instead', value: 'raw' },
    ])

    switch (action) {
      case 'accept': {
        return finalNotes
      }
      case 'regenerate': {
        correction = undefined
        continue
      }
      case 'edit': {
        const edited = await editInline(finalNotes, 'Merged Release Notes', '.md')
        return edited
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
        const provModel = await chooseModelForProvider(aiProvider, undefined, 'Back')
        if (provModel && provModel !== 'back') {
          switch (aiProvider) {
            case 'gemini': {
              geminiModel = provModel as GeminiModel
              break
            }
            case 'copilot': {
              copilotModel = provModel as CopilotModel
              break
            }
            case 'openrouter': {
              openrouterModel = provModel as OpenRouterModel
              break
            }
          }
        }
        correction = undefined
        continue
      }
      case 'raw': {
        return null
      } // caller falls back to raw merge
    }
  }
}

// ─── Prerelease grouping ───

interface PrereleaseGroup {
  baseVersion: string // e.g. "0.7.0"
  releases: ReleaseInfo[] // all prereleases in this group (alpha, beta, rc)
  stableRelease: ReleaseInfo | null // the stable release for this base version, if exists
}

/**
 * Extract base version from a tag (strip prerelease suffix).
 * e.g. "v0.7.0-alpha.3" → "0.7.0", "v1.2.0" → "1.2.0"
 */
const getBaseVersion = (tag: string): string => {
  const cleaned = tag.replace(/^v/, '')
  const dashIdx = cleaned.indexOf('-')
  return dashIdx === -1 ? cleaned : cleaned.slice(0, dashIdx)
}

/**
 * Check if a tag is a prerelease (has alpha, beta, rc, etc.).
 */
const isPrerelease = (tag: string): boolean => {
  return /-(alpha|beta|rc|pre|dev|canary|next)\b/i.test(tag)
}

/**
 * Group releases by base version, separating prereleases from stable.
 */
const groupPrereleases = (releases: ReleaseInfo[]): PrereleaseGroup[] => {
  const groups = new Map<string, PrereleaseGroup>()

  for (const r of releases) {
    const base = getBaseVersion(r.tagName)
    let group = groups.get(base)
    if (!group) {
      group = { baseVersion: base, releases: [], stableRelease: null }
      groups.set(base, group)
    }

    if (isPrerelease(r.tagName)) {
      group.releases.push(r)
    } else {
      group.stableRelease = r
    }
  }

  // Only return groups that have prereleases
  return [...groups.values()].filter((g) => g.releases.length > 0)
}

// ─── Main handler ───

export const handleMergeReleases = async (): Promise<void> => {
  const platform = detectPlatformFromRemote()
  const cli = platform ? getPlatformCLI(platform) : 'gh'
  const platformName = platform === 'gitlab' ? 'GitLab' : 'GitHub'

  // Check CLI availability
  try {
    await execAsync(`${cli} --version`, true)
  } catch {
    log.error(
      `${platformName} CLI (${cli}) is not installed.${cli === 'gh' ? ' Install it: https://cli.github.com' : ' Install it: https://gitlab.com/gitlab-org/cli'}`
    )
    return
  }

  // Fetch releases
  console.log('')
  const spinner = new ScrambleProgress()
  spinner.start([`Fetching ${platformName} releases`])

  const releases = await fetchReleasesWithBody(cli)
  spinner.succeed(`Found ${releases.length} ${platformName} releases`)

  // Group prereleases by base version
  const groups = groupPrereleases(releases)

  if (groups.length === 0) {
    console.log('')
    log.info('No prerelease groups found to merge.')
    return
  }

  // Show prerelease groups for selection
  console.log('')
  const { multiSelect } = await import('../cli/menu.js')
  const groupChoices = groups.map((g) => {
    const tags = g.releases.map((r) => r.tagName.replace(/^v/, '')).join(', ')
    const targetLabel = g.stableRelease
      ? `→ ${g.stableRelease.tagName}`
      : `→ v${g.baseVersion} (newest prerelease)`
    return {
      label: `v${g.baseVersion} — ${g.releases.length} prerelease(s) [${tags}] ${targetLabel}`,
      value: g.baseVersion,
    }
  })

  const selectedGroups = await multiSelect(
    'Select version group(s) to merge prereleases:',
    groupChoices
  )

  if (selectedGroups.length === 0) {
    log.info('No groups selected.')
    return
  }

  // Process each selected group
  for (const baseVer of selectedGroups) {
    const group = groups.find((g) => g.baseVersion === baseVer)
    if (!group) continue

    const stableTag = `v${baseVer}`
    const hasStableRelease = Boolean(group.stableRelease)

    // All prereleases to merge and delete
    const allPrereleases = group.releases
    const allReleases = hasStableRelease
      ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        [group.stableRelease!, ...allPrereleases]
      : allPrereleases

    console.log('')
    if (hasStableRelease) {
      log.step(
        `${colors.bright}v${baseVer}${colors.reset} — merging ${allPrereleases.length} prerelease(s) into ${colors.bright}${stableTag}${colors.reset}`
      )
    } else {
      log.step(
        `${colors.bright}v${baseVer}${colors.reset} — merging ${allPrereleases.length} prerelease(s) → creating ${colors.bright}${stableTag}${colors.reset}`
      )
    }
    for (const r of allPrereleases) {
      log.info(`  ${r.tagName}`)
    }

    // Choose merge mode (once per group)
    console.log('')
    const mergeMode = await select('How to merge the release notes?', [
      { label: 'Raw merge (combine sections, deduplicate)', value: 'raw' },
      { label: 'AI rewrite (unified clean notes)', value: 'ai' },
    ])

    let mergedNotes: string

    if (mergeMode === 'ai') {
      const language = (await select('Release notes language:', [
        { label: 'English', value: 'en' },
        { label: 'Indonesian (Bahasa Indonesia)', value: 'id' },
      ])) as 'en' | 'id'

      const aiResult = await aiRewriteMergedNotes(allReleases, language)
      if (aiResult) {
        mergedNotes = aiResult
      } else {
        log.info('Falling back to raw merge.')
        mergedNotes = rawMergeNotes(allReleases)
      }
    } else {
      mergedNotes = rawMergeNotes(allReleases)
    }

    // Preview
    if (mergeMode !== 'ai') {
      console.log('')
      previewNotes(mergedNotes)
    }

    // Confirm
    console.log('')
    const actionDesc = hasStableRelease
      ? `Update ${stableTag} and delete ${allPrereleases.length} prerelease(s)?`
      : `Create ${stableTag} and delete ${allPrereleases.length} prerelease(s)?`
    const proceed = confirm(actionDesc)
    if (!proceed) {
      log.info('Skipped.')
      continue
    }

    // Execute all operations under a single spinner
    console.log('')
    const mergeSpinner = new ScrambleProgress()
    mergeSpinner.start([`Merging ${allPrereleases.length} prerelease(s) into ${stableTag}`])

    // Step 1: update or create stable release
    let createOk: boolean
    if (hasStableRelease) {
      createOk = await updateReleaseNotes(cli, stableTag, mergedNotes)
    } else {
      createOk = await createRelease(cli, stableTag, mergedNotes)
    }

    if (!createOk) {
      mergeSpinner.fail(`Failed to ${hasStableRelease ? 'update' : 'create'} ${stableTag}`)
      continue
    }

    // Step 2: delete all prereleases
    let deleteCount = 0
    for (const rel of allPrereleases) {
      const deleted = await deleteRelease(cli, rel.tagName)
      if (deleted) deleteCount++
    }

    if (deleteCount === allPrereleases.length) {
      mergeSpinner.succeed(`Merged ${allReleases.length} releases into ${stableTag} ✓`)
    } else {
      mergeSpinner.succeed(
        `Merged into ${stableTag}, but ${allPrereleases.length - deleteCount}/${allPrereleases.length} deletions failed`
      )
    }

    // Step 3: bump package.json to stable version
    const currentVer = getCurrentVersion()
    if (currentVer !== baseVer && isPrerelease(`v${currentVer}`)) {
      console.log('')
      console.log(
        `  ${colors.yellow}package.json${colors.reset} is still at ${colors.bright}v${currentVer}${colors.reset}`
      )
      const doBump = confirm(`Bump package.json to v${baseVer}?`)
      if (doBump) {
        try {
          updatePackageVersion(baseVer)
          log.success(`package.json → v${baseVer}`)

          // Offer to commit the version bump
          const doCommit = confirm('Commit version bump?')
          if (doCommit) {
            exec('git add package.json src/version.ts', true)
            exec(`git commit --no-verify -m "chore(release): bump version to v${baseVer}"`, true)
            log.success('Version bump committed')
          }
        } catch (error) {
          log.error('Failed to update package.json: ' + String(error))
        }
      }
    }
  }
}
