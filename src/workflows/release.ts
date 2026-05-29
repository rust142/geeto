/**
 * Release/Tag Manager workflow
 * Create releases with semver bumping, package.json update,
 * RELEASE.MD (user-friendly) and CHANGELOG.md (developer-facing)
 */

import { readFileSync, writeFileSync } from 'node:fs'
import type { CopilotModel } from '../api/copilot.js'
import type { GeminiModel } from '../api/gemini.js'
import type { OpenRouterModel } from '../api/openrouter.js'

import { handleMergeReleases } from './release-merge.js'
import {
  generateChangelogEntry,
  generateReleaseMd,
  normalizeReleaseMarkdown,
} from './release-notes.js'
import { handleRecoverTags } from './release-recover.js'
import { handleDeleteReleases, handleSyncReleases } from './release-sync.js'
import {
  bumpPrerelease,
  categorizeCommits,
  formatSemver,
  getCommitsSinceTag,
  getCurrentVersion,
  getExistingTags,
  parseSemver,
  promoteToStable,
  updatePackageVersion,
} from './release-utils.js'
import { askQuestion, confirm, editMultiline } from '../cli/input.js'
import { select } from '../cli/menu.js'
import { colors } from '../utils/colors.js'
import { BOX_W } from '../utils/display.js'
import { exec, execAsync, execSilent } from '../utils/exec.js'
import {
  chooseModelForProvider,
  generateReleaseNotesWithProvider,
  getAIProviderShortName,
  getModelValue,
  isContextLimitFailure,
  isTransientAIFailure,
} from '../utils/git-ai.js'
import { detectPlatformFromRemote, getPlatformCLI } from '../utils/github-helpers.js'
import { log } from '../utils/logging.js'
import { ScrambleProgress } from '../utils/scramble.js'
import { loadState } from '../utils/state.js'

// ─── Main handler ───

export const handleRelease = async (): Promise<void> => {
  log.banner()
  log.step(`${colors.cyan}Release / Tag Manager${colors.reset}\n`)

  // Main menu: create new release, sync, or manage releases
  // Detect platform for CLI commands
  const platform = detectPlatformFromRemote()
  const cli = platform ? getPlatformCLI(platform) : 'gh'
  const platformName = platform === 'gitlab' ? 'GitLab' : 'GitHub'

  const mode = await select('What do you want to do?', [
    { label: 'Create a new release', value: 'create' },
    { label: `Sync ${platformName} Releases for existing tags`, value: 'sync' },
    { label: 'Merge Releases (consolidate release notes)', value: 'merge' },
    { label: 'Recover missing tags from release commits', value: 'recover' },
    { label: `Delete ${platformName} Releases`, value: 'delete' },
  ])

  if (mode === 'sync') {
    await handleSyncReleases()
    return
  }

  if (mode === 'merge') {
    await handleMergeReleases()
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
  const { major, minor, patch, prerelease } = semver
  const nextPatch = `${major}.${minor}.${patch + 1}`

  // Padded label builder for aligned columns
  const vpad = (name: string, ver: string, desc: string) =>
    `${name.padEnd(12)}${colors.gray}${ver.padEnd(20)}${colors.reset}${desc}`

  // Build dynamic menu based on whether current version is a prerelease
  const bumpOptions = []

  if (prerelease) {
    const [preLabel] = prerelease.split('.')
    const bumped = bumpPrerelease(semver)
    const stable = promoteToStable(semver)
    bumpOptions.push(
      {
        label: vpad(`Next ${preLabel}`, formatSemver(bumped), 'bump prerelease'),
        value: 'pre-bump',
      },
      {
        label: vpad('Stable', formatSemver(stable), 'promote to stable'),
        value: 'promote',
      }
    )
  }

  bumpOptions.push(
    {
      label: vpad('Patch', nextPatch, 'bug fixes'),
      value: 'patch',
    },
    {
      label: vpad('Minor', `${major}.${minor + 1}.0`, 'new features'),
      value: 'minor',
    },
    {
      label: vpad('Major', `${major + 1}.0.0`, 'breaking changes'),
      value: 'major',
    }
  )

  if (!prerelease) {
    const nextMinor = `${major}.${minor + 1}.0`
    bumpOptions.push(
      {
        label: vpad('Alpha', `${nextMinor}-alpha.1`, 'early development'),
        value: 'alpha',
      },
      {
        label: vpad('Beta', `${nextMinor}-beta.1`, 'feature testing'),
        value: 'beta',
      },
      {
        label: vpad('RC', `${nextMinor}-rc.1`, 'release candidate'),
        value: 'rc',
      }
    )
  }

  bumpOptions.push({ label: 'Cancel', value: 'cancel' })

  const bumpType = await select('Version bump:', bumpOptions)

  if (bumpType === 'cancel') return

  let newVersion: string
  let isPreVersion = false

  switch (bumpType) {
    case 'pre-bump': {
      const bumped = bumpPrerelease(semver)
      newVersion = formatSemver(bumped)
      isPreVersion = true
      break
    }
    case 'promote': {
      const stable = promoteToStable(semver)
      newVersion = formatSemver(stable)
      break
    }
    case 'alpha':
    case 'beta':
    case 'rc': {
      newVersion = `${major}.${minor + 1}.0-${bumpType}.1`
      isPreVersion = true
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
    let aiProvider: 'gemini' | 'copilot' | 'openrouter' | 'groq' = 'copilot'
    let copilotModel: CopilotModel | undefined
    let openrouterModel: OpenRouterModel | undefined
    let geminiModel: GeminiModel | undefined
    let groqModel: string | undefined

    // Use saved provider/model if available, otherwise ask user
    if (
      savedState?.aiProvider &&
      savedState.aiProvider !== 'manual' &&
      (savedState.copilotModel ||
        savedState.openrouterModel ||
        savedState.geminiModel ||
        savedState.groqModel)
    ) {
      aiProvider = savedState.aiProvider as 'gemini' | 'copilot' | 'openrouter' | 'groq'
      copilotModel = savedState.copilotModel
      openrouterModel = savedState.openrouterModel
      geminiModel = savedState.geminiModel
      groqModel = savedState.groqModel
    } else {
      // No saved config — ask user to pick provider + model
      let providerChosen = false
      while (!providerChosen) {
        aiProvider = (await select('Choose AI Provider:', [
          { label: 'GitHub Copilot', value: 'copilot' },
          { label: 'Gemini', value: 'gemini' },
          { label: 'OpenRouter', value: 'openrouter' },
          { label: 'Groq', value: 'groq' },
        ])) as 'gemini' | 'copilot' | 'openrouter' | 'groq'

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
      const modelDisplay = getModelValue(
        copilotModel ?? openrouterModel ?? groqModel ?? geminiModel ?? ''
      )
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

      const failed = !result || isContextLimitFailure(result) || isTransientAIFailure(result)
      if (failed) {
        spinner.fail('AI could not generate release notes')
        if (result) {
          log.warn(result)
        }

        const failureAction = await select('How would you like to continue?', [
          { label: 'Change model and retry', value: 'change-model' },
          { label: 'Change AI provider and retry', value: 'change-provider' },
          { label: 'Edit release notes manually', value: 'edit' },
          { label: 'Use template instead', value: 'template' },
        ])

        if (failureAction === 'change-model') {
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
              case 'groq': {
                groqModel = newModel
                break
              }
            }
          }
          correction = undefined
          continue
        }

        if (failureAction === 'change-provider') {
          const prov = (await select('Choose AI provider:', [
            { label: 'GitHub Copilot', value: 'copilot' },
            { label: 'Gemini', value: 'gemini' },
            { label: 'OpenRouter', value: 'openrouter' },
            { label: 'Groq', value: 'groq' },
          ])) as 'gemini' | 'copilot' | 'openrouter' | 'groq'
          aiProvider = prov
          copilotModel = undefined
          openrouterModel = undefined
          geminiModel = undefined
          groqModel = undefined
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
              case 'groq': {
                groqModel = newModel
                break
              }
            }
          }
          correction = undefined
          continue
        }

        if (failureAction === 'edit') {
          const edited = await editMultiline('Release Notes', '')
          if (edited === null) {
            log.info('Release cancelled.')
            return
          }
          aiReleaseNotes = edited
          accepted = true
          continue
        }

        aiReleaseNotes = null
        accepted = true
        break
      }

      spinner.succeed('Release notes generated')
      console.log('')

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
          const edited = await editMultiline('Release Notes', aiReleaseNotes)
          if (edited === null) {
            log.info('Release cancelled.')
            return
          }
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
              case 'groq': {
                groqModel = newModel
                break
              }
            }
          }
          correction = undefined
          continue
        }
        case 'change-provider': {
          const prov = (await select('Choose AI provider:', [
            { label: 'GitHub Copilot', value: 'copilot' },
            { label: 'Gemini', value: 'gemini' },
            { label: 'OpenRouter', value: 'openrouter' },
            { label: 'Groq', value: 'groq' },
          ])) as 'gemini' | 'copilot' | 'openrouter' | 'groq'
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
              case 'groq': {
                groqModel = newModel
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

  console.log('')
  const confirmFinalRelease = confirm('Proceed with release now?')
  if (!confirmFinalRelease) {
    log.info('Release cancelled. No files, tags, or versions were changed.')
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

  // 6. Create Release (if tag was pushed and platform CLI is available)
  let releaseCreated = false
  if (pushChoice === 'both') {
    try {
      execSilent(`${cli} --version`)
      // Platform CLI is available — create a Release

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
      releaseSpinner.start([`Creating ${platformName} release`])

      try {
        const preFlag = isPreVersion ? ' --prerelease' : ''
        await execAsync(
          `${cli} release create v${newVersion} --title "v${newVersion}" --notes-file "${tempFile}"${preFlag}`,
          true
        )
        releaseSpinner.succeed(`${platformName} Release created`)
        releaseCreated = true
      } catch (error) {
        const stderr = (error as { stderr?: string }).stderr?.trim()
        releaseSpinner.fail(`Failed to create ${platformName} Release`)
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
      // Platform CLI not available — skip silently
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
  if (releaseCreated) {
    console.log(
      `${colors.cyan}│${colors.reset}  ${colors.green}✓${colors.reset} ${platformName} Release published`
    )
  }
  console.log(`${colors.cyan}└${line}┘${colors.reset}`)
}
