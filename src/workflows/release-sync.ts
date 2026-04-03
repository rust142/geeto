/**
 * Release sync workflows — sync GitHub Releases for existing tags, delete releases
 */

import { writeFileSync } from 'node:fs'
import type { CopilotModel } from '../api/copilot.js'
import type { GeminiModel } from '../api/gemini.js'
import type { OpenRouterModel } from '../api/openrouter.js'

import { generateReleaseMd, normalizeReleaseMarkdown } from './release-notes.js'
import { getCommitsSinceTag, getExistingTags } from './release-utils.js'
import { confirm } from '../cli/input.js'
import { select } from '../cli/menu.js'
import { colors } from '../utils/colors.js'
import { BOX_W } from '../utils/display.js'
import { execAsync, execSilent } from '../utils/exec.js'
import {
  chooseModelForProvider,
  generateReleaseNotesWithProvider,
  getAIProviderShortName,
  getModelValue,
} from '../utils/git-ai.js'
import { log } from '../utils/logging.js'
import { ScrambleProgress } from '../utils/scramble.js'
import { loadState } from '../utils/state.js'

// ─── GitHub Release helpers ───

export const getExistingGithubReleases = (): string[] => {
  try {
    const output = execSilent(
      'gh release list --limit 100 --json tagName --jq ".[].tagName"'
    ).trim()
    return output ? output.split('\n').filter(Boolean) : []
  } catch {
    return []
  }
}

// ─── Sync GitHub Releases for existing tags ───

export const handleSyncReleases = async (): Promise<void> => {
  const line = '─'.repeat(BOX_W)

  // Check if gh CLI is available
  try {
    execSilent('gh --version')
  } catch {
    log.error('GitHub CLI (gh) is not installed. Install it: https://cli.github.com')
    return
  }

  console.log('')
  const spinner = new ScrambleProgress()
  spinner.start(['connecting to github...', 'fetching releases...', 'comparing tags...'])

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
      const aiSpinner = new ScrambleProgress()
      const modelDisplay = getModelValue(copilotModel ?? openrouterModel ?? geminiModel ?? '')
      aiSpinner.start([
        'preparing release context...',
        `generating notes with ${getAIProviderShortName(aiProvider)}${modelDisplay ? ` (${modelDisplay})` : ''}...`,
        'processing results...',
      ])

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
        console.log(`${colors.cyan}┌${'─'.repeat(BOX_W)}┐${colors.reset}`)
        console.log(
          `${colors.cyan}│${colors.reset} ${colors.bright}Release Notes — ${tag}${colors.reset}`
        )
        console.log(`${colors.cyan}├${'─'.repeat(BOX_W)}┤${colors.reset}`)
        for (const noteLine of releaseBody.split('\n')) {
          console.log(`${colors.cyan}│${colors.reset} ${noteLine}`)
        }
        console.log(`${colors.cyan}└${'─'.repeat(BOX_W)}┘${colors.reset}`)

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
    const releaseSpinner = new ScrambleProgress()

    // Ensure tag exists on remote before creating GitHub Release
    releaseSpinner.start(['connecting to remote...', 'pushing tag...', 'verifying remote refs...'])
    try {
      await execAsync(`git push origin ${tag} --no-verify`, true)
      releaseSpinner.succeed(`Tag ${tag} pushed to remote`)
    } catch {
      // Tag might already exist on remote — that's fine, continue
    }

    console.log('')
    const createSpinner = new ScrambleProgress()
    createSpinner.start([
      'preparing release data...',
      'creating github release...',
      'confirming creation...',
    ])

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

export const handleDeleteReleases = async (): Promise<void> => {
  // Check if gh CLI is available
  try {
    execSilent('gh --version')
  } catch {
    log.error('GitHub CLI (gh) is not installed. Install it: https://cli.github.com')
    return
  }

  console.log('')
  const spinner = new ScrambleProgress()
  spinner.start(['connecting to github...', 'fetching releases...', 'processing results...'])

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
    const releaseSpinner = new ScrambleProgress()
    releaseSpinner.start(['connecting to github...', 'deleting release...', 'cleaning up...'])

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
