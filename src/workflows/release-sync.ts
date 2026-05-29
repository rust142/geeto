/**
 * Release sync workflows — sync GitHub/GitLab Releases for existing tags, delete releases
 */

import { writeFileSync } from 'node:fs'
import type { CopilotModel } from '../api/copilot.js'
import type { GeminiModel } from '../api/gemini.js'
import type { OpenRouterModel } from '../api/openrouter.js'

import { generateReleaseMd, normalizeReleaseMarkdown } from './release-notes.js'
import { getCommitsSinceTag, getExistingTags } from './release-utils.js'
import { confirm } from '../cli/input.js'
import { select } from '../cli/menu.js'
import { getConfiguredAIProvider } from '../utils/ai-workflow.js'
import { colors } from '../utils/colors.js'
import { BOX_W } from '../utils/display.js'
import { execAsync, execSilent } from '../utils/exec.js'
import {
  chooseModelForProvider,
  generateReleaseNotesWithProvider,
  getAIProviderShortName,
  getModelValue,
} from '../utils/git-ai.js'
import { detectPlatformFromRemote, getPlatformCLI } from '../utils/github-helpers.js'
import { log } from '../utils/logging.js'
import { ScrambleProgress } from '../utils/scramble.js'
import { loadState } from '../utils/state.js'

// ─── Release helpers ───

export const getExistingGithubReleases = async (cli = 'gh'): Promise<string[]> => {
  try {
    const result = await execAsync(
      `${cli} release list --limit 100 --json tagName --jq ".[].tagName"`,
      true
    )
    const output = result.stdout.trim()
    const tags = output ? output.split('\n').filter(Boolean) : []
    // eslint-disable-next-line unicorn/no-array-sort -- toSorted needs ES2023
    return [...tags].sort((a, b) => {
      const pa = a.replace(/^v/, '').split(/[-.]/)
      const pb = b.replace(/^v/, '').split(/[-.]/)
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const na = Number(pa[i]) || 0
        const nb = Number(pb[i]) || 0
        if (na !== nb) return nb - na
        if (pa[i] !== pb[i]) return (pb[i] ?? '').localeCompare(pa[i] ?? '')
      }
      return 0
    })
  } catch {
    return []
  }
}

// ─── Sync Releases for existing tags ───

export const handleSyncReleases = async (): Promise<void> => {
  const line = '─'.repeat(BOX_W)

  // Detect platform (GitHub or GitLab)
  const platform = detectPlatformFromRemote()
  const cli = platform ? getPlatformCLI(platform) : 'gh'
  const platformName = platform === 'gitlab' ? 'GitLab' : 'GitHub'

  // Check if platform CLI is available
  try {
    execSilent(`${cli} --version`)
  } catch {
    log.error(
      `${platformName} CLI (${cli}) is not installed.${cli === 'gh' ? ' Install it: https://cli.github.com' : ' Install it: https://gitlab.com/gitlab-org/cli'}`
    )
    return
  }

  console.log('')
  const spinner = new ScrambleProgress()
  spinner.start([`Fetching tags and ${platformName} releases`])

  const localTags = getExistingTags()
  const ghReleases = await getExistingGithubReleases(cli)
  const missingTags = localTags.filter((t) => !ghReleases.includes(t))

  spinner.succeed(`Found ${localTags.length} tags, ${ghReleases.length} ${platformName} releases`)

  if (missingTags.length === 0) {
    console.log('')
    log.success(`All tags have ${platformName} Releases! Nothing to sync.`)
    return
  }

  console.log('')
  log.info(
    `${colors.bright}${missingTags.length}${colors.reset} tags missing ${platformName} Releases:`
  )
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
  let aiProvider: 'gemini' | 'copilot' | 'openrouter' | 'groq' = 'copilot'
  let copilotModel: CopilotModel | undefined
  let openrouterModel: OpenRouterModel | undefined
  let geminiModel: GeminiModel | undefined
  let groqModel: string | undefined

  if (useAI) {
    language = (await select('Release notes language:', [
      { label: 'English', value: 'en' },
      { label: 'Indonesian (Bahasa Indonesia)', value: 'id' },
    ])) as 'en' | 'id'

    // Check saved config
    const savedState = loadState()
    const configuredProvider = getConfiguredAIProvider(savedState)
    if (
      configuredProvider &&
      (savedState?.copilotModel ||
        savedState?.openrouterModel ||
        savedState?.geminiModel ||
        savedState?.groqModel)
    ) {
      aiProvider = configuredProvider
      copilotModel = savedState.copilotModel
      openrouterModel = savedState.openrouterModel
      geminiModel = savedState.geminiModel
      groqModel = savedState.groqModel
    } else {
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
          case 'groq': {
            groqModel = chosen
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
  const proceed = confirm(`Create ${tagsToRelease.length} ${platformName} Releases?`)
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
      const currentModel =
        aiProvider === 'copilot'
          ? copilotModel
          : aiProvider === 'openrouter'
            ? openrouterModel
            : aiProvider === 'groq'
              ? groqModel
              : geminiModel
      const modelDisplay = getModelValue(currentModel)
      aiSpinner.start([
        `Generating release notes with ${getAIProviderShortName(aiProvider)}${modelDisplay ? ` (${modelDisplay})` : ''}`,
      ])

      const aiResult = await generateReleaseNotesWithProvider(
        aiProvider,
        commitList,
        language,
        undefined,
        copilotModel,
        openrouterModel,
        geminiModel,
        groqModel
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
    releaseSpinner.start([`Pushing tag ${tag} to remote`])
    try {
      await execAsync(`git push origin ${tag} --no-verify`, true)
      releaseSpinner.succeed(`Tag ${tag} pushed to remote`)
    } catch {
      // Tag might already exist on remote — that's fine, continue
    }

    console.log('')
    const createSpinner = new ScrambleProgress()
    createSpinner.start([`Creating ${platformName} release`])

    const os = await import('node:os')
    const tempFile = `${os.tmpdir()}/geeto-sync-${Date.now()}.md`
    writeFileSync(tempFile, releaseBody, 'utf8')

    try {
      await execAsync(
        `${cli} release create ${tag} --title "${tag}" --notes-file "${tempFile}"`,
        true
      )
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
    log.success(`All ${successCount} ${platformName} Releases created!`)
  } else {
    log.warn(`${successCount}/${tagsToRelease.length} releases created`)
  }
}

// ─── Delete Releases ───

export const handleDeleteReleases = async (): Promise<void> => {
  // Detect platform (GitHub or GitLab)
  const platform = detectPlatformFromRemote()
  const cli = platform ? getPlatformCLI(platform) : 'gh'
  const platformName = platform === 'gitlab' ? 'GitLab' : 'GitHub'

  // Check if platform CLI is available
  try {
    execSilent(`${cli} --version`)
  } catch {
    log.error(
      `${platformName} CLI (${cli}) is not installed.${cli === 'gh' ? ' Install it: https://cli.github.com' : ' Install it: https://gitlab.com/gitlab-org/cli'}`
    )
    return
  }

  console.log('')
  const spinner = new ScrambleProgress()
  spinner.start([`Fetching ${platformName} releases`, 'Fetching local tags'])

  const ghReleases = await getExistingGithubReleases(cli)
  const localTags = getExistingTags()
  const ghSet = new Set(ghReleases)
  const localOnlyTags = localTags.filter((t) => !ghSet.has(t))

  const allTags = [...ghReleases, ...localOnlyTags]
  // eslint-disable-next-line unicorn/no-array-sort -- toSorted needs ES2023
  const sorted = [...allTags].sort((a, b) => {
    const pa = a.replace(/^v/, '').split(/[-.]/)
    const pb = b.replace(/^v/, '').split(/[-.]/)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = Number(pa[i]) || 0
      const nb = Number(pb[i]) || 0
      if (na !== nb) return nb - na
      if (pa[i] !== pb[i]) return (pb[i] ?? '').localeCompare(pa[i] ?? '')
    }
    return 0
  })

  const total = sorted.length
  const localCount = localOnlyTags.length
  spinner.succeed(`Found ${total} releases${localCount > 0 ? ` (${localCount} local only)` : ''}`)

  if (total === 0) {
    console.log('')
    log.info(`No ${platformName} Releases to delete.`)
    return
  }

  console.log('')
  const { multiSelect } = await import('../cli/menu.js')
  const choices = sorted.map((t) => {
    const isLocal = !ghSet.has(t)
    const label = isLocal ? `${t} ${colors.yellow}(local)${colors.reset}` : t
    return { label, value: t }
  })
  const selected = await multiSelect('Select releases to delete:', choices)

  if (selected.length === 0) {
    log.info('No releases selected.')
    return
  }

  console.log('')
  const alsoDeleteTag = confirm('Also delete the associated git tags?')

  console.log('')
  const proceed = confirm(
    `Delete ${selected.length} ${platformName} Release(s)${alsoDeleteTag ? ' + tags' : ''}?`
  )
  if (!proceed) return

  let successCount = 0

  for (const release of selected) {
    console.log('')
    const releaseSpinner = new ScrambleProgress()
    const isLocalOnly = !ghSet.has(release)

    if (isLocalOnly) {
      releaseSpinner.start([`Deleting local tag ${release}`])
      try {
        await execAsync(`git tag -d ${release}`, true)
        try {
          await execAsync(`git push origin --delete ${release} --no-verify`, true)
        } catch {
          /* Remote tag may not exist */
        }
        releaseSpinner.succeed(`Local tag ${release} deleted`)
        successCount++
      } catch {
        releaseSpinner.fail(`Failed to delete tag ${release}`)
      }
      continue
    }

    releaseSpinner.start([`Deleting release ${release}`])
    try {
      await execAsync(`${cli} release delete ${release} --yes`, true)
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
