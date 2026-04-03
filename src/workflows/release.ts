/**
 * Release/Tag Manager workflow
 * Create releases with semver bumping, package.json update,
 * RELEASE.MD (user-friendly) and CHANGELOG.md (developer-facing)
 */

import { readFileSync, writeFileSync } from 'node:fs'
import type { CopilotModel } from '../api/copilot.js'
import type { GeminiModel } from '../api/gemini.js'
import type { OpenRouterModel } from '../api/openrouter.js'

import {
  generateChangelogEntry,
  generateReleaseMd,
  normalizeReleaseMarkdown,
} from './release-notes.js'
import { handleRecoverTags } from './release-recover.js'
import { handleDeleteReleases, handleSyncReleases } from './release-sync.js'
import {
  categorizeCommits,
  getCommitsSinceTag,
  getCurrentVersion,
  getExistingTags,
  parseSemver,
  updatePackageVersion,
} from './release-utils.js'
import { askQuestion, confirm, editInline } from '../cli/input.js'
import { select } from '../cli/menu.js'
import { colors } from '../utils/colors.js'
import { BOX_W } from '../utils/display.js'
import { exec, execAsync, execSilent } from '../utils/exec.js'
import {
  chooseModelForProvider,
  generateReleaseNotesWithProvider,
  getAIProviderShortName,
  getModelValue,
} from '../utils/git-ai.js'
import { log } from '../utils/logging.js'
import { ScrambleProgress } from '../utils/scramble.js'
import { loadState } from '../utils/state.js'

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
  const line = '─'.repeat(BOX_W)
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
      const spinner = new ScrambleProgress()
      const modelDisplay = getModelValue(copilotModel ?? openrouterModel ?? geminiModel ?? '')
      spinner.start([
        `Generating release notes with ${getAIProviderShortName(aiProvider)}${modelDisplay ? ` (${modelDisplay})` : ''}`,
      ])

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
      console.log(`${colors.cyan}┌${'─'.repeat(BOX_W)}┐${colors.reset}`)
      console.log(
        `${colors.cyan}│${colors.reset} ${colors.bright}Release Notes Preview${colors.reset}`
      )
      console.log(`${colors.cyan}├${'─'.repeat(BOX_W)}┤${colors.reset}`)
      for (const line of aiReleaseNotes.split('\n')) {
        console.log(`${colors.cyan}│${colors.reset} ${line}`)
      }
      console.log(`${colors.cyan}└${'─'.repeat(BOX_W)}┘${colors.reset}`)
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
    console.log('')
    const pushProgress = new ScrambleProgress()
    pushProgress.start(['Pushing release to remote'])

    try {
      await execAsync(`git push`, true)
      if (pushChoice === 'both') {
        await execAsync(`git push origin v${newVersion} --no-verify`, true)
      }
      pushProgress.stop()
      console.log('')
      log.success(pushChoice === 'both' ? 'Pushed release + tag' : 'Pushed release')
    } catch {
      pushProgress.fail('Push failed')
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

      const releaseSpinner = new ScrambleProgress()
      releaseSpinner.start(['Creating GitHub release'])

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
