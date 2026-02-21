/**
 * GitHub Repository Settings workflow
 * Update repo description, topics, homepage — AI-powered from README
 */

import { readFileSync } from 'node:fs'
import type { CopilotModel } from '../api/copilot.js'
import type { GeminiModel } from '../api/gemini.js'
import type { OpenRouterModel } from '../api/openrouter.js'

import { askQuestion, confirm } from '../cli/input.js'
import { select } from '../cli/menu.js'
import { colors } from '../utils/colors.js'
import { execAsync, execSilent } from '../utils/exec.js'
import {
  chooseModelForProvider,
  generateTextWithProvider,
  getAIProviderShortName,
  getModelValue,
} from '../utils/git-ai.js'
import { log } from '../utils/logging.js'
import { loadState } from '../utils/state.js'

/** Read README.md content. */
const readReadme = (): string | null => {
  try {
    return readFileSync('README.md', 'utf8')
  } catch {
    return null
  }
}

/** Extract topics from README features and package.json keywords. */
const extractTopicsFromReadme = (): string[] => {
  const readme = readReadme()
  if (!readme) return []

  const topics: Set<string> = new Set()
  const keywords = [
    'git',
    'cli',
    'ai',
    'typescript',
    'workflow',
    'automation',
    'developer-tools',
    'command-line',
  ]

  const lowerReadme = readme.toLowerCase()
  for (const kw of keywords) {
    if (lowerReadme.includes(kw)) topics.add(kw)
  }

  try {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { keywords?: string[] }
    if (pkg.keywords) {
      for (const kw of pkg.keywords) {
        topics.add(kw.toLowerCase().replaceAll(/\s+/g, '-'))
      }
    }
  } catch {
    /* ignore */
  }

  return [...topics]
}

/** Get current repo info from gh CLI. */
const getCurrentRepoInfo = (): {
  description: string
  homepage: string
  topics: string[]
} | null => {
  try {
    const raw = execSilent('gh repo view --json description,homepageUrl,repositoryTopics')
    const data = JSON.parse(raw) as {
      description: string
      homepageUrl: string
      repositoryTopics: { name: string }[]
    }
    return {
      description: data.description || '',
      homepage: data.homepageUrl || '',
      topics: data.repositoryTopics.map((t) => t.name),
    }
  } catch {
    return null
  }
}

/**
 * Interactive GitHub repo settings workflow
 */
export const handleRepoSettings = async (): Promise<void> => {
  log.banner()
  log.step(`${colors.cyan}GitHub Repository Settings${colors.reset}\n`)

  // Check gh CLI
  try {
    execSilent('gh --version')
  } catch {
    log.error('GitHub CLI (gh) is not installed.')
    log.info('Install it: https://cli.github.com')
    return
  }

  // Check auth
  try {
    execSilent('gh auth status')
  } catch {
    log.error('Not authenticated with GitHub CLI.')
    log.info('Run: gh auth login')
    return
  }

  console.log('')
  const spinner = log.spinner()
  spinner.start('Fetching repo info...')

  const repoInfo = getCurrentRepoInfo()
  if (!repoInfo) {
    spinner.fail('Failed to fetch repo info. Are you in a git repo with a GitHub remote?')
    return
  }

  spinner.succeed('Repo info loaded')

  // Show current info
  const line = '─'.repeat(56)
  console.log('')
  console.log(`${colors.cyan}┌${line}┐${colors.reset}`)
  console.log(`${colors.cyan}│${colors.reset} ${colors.bright}Current Settings${colors.reset}`)
  console.log(`${colors.cyan}├${line}┤${colors.reset}`)
  console.log(
    `${colors.cyan}│${colors.reset} ${colors.gray}Description:${colors.reset} ${repoInfo.description || '(empty)'}`
  )
  console.log(
    `${colors.cyan}│${colors.reset} ${colors.gray}Homepage:${colors.reset}    ${repoInfo.homepage || '(empty)'}`
  )
  console.log(
    `${colors.cyan}│${colors.reset} ${colors.gray}Topics:${colors.reset}      ${repoInfo.topics.length > 0 ? repoInfo.topics.join(', ') : '(none)'}`
  )
  console.log(`${colors.cyan}└${line}┘${colors.reset}`)

  // Main menu
  console.log('')
  const action = await select('What do you want to update?', [
    { label: 'Update description (AI from README)', value: 'description' },
    { label: 'Update topics from README + package.json', value: 'topics' },
    { label: 'Update homepage URL', value: 'homepage' },
    { label: 'Update all', value: 'all' },
    { label: 'Cancel', value: 'cancel' },
  ])

  if (action === 'cancel') return

  const changes: { description?: string; homepage?: string; topics?: string[] } = {}

  // ── Description (AI-generated from README) ──
  if (action === 'description' || action === 'all') {
    const readme = readReadme()
    if (readme) {
      // AI provider setup
      let aiProvider: 'gemini' | 'copilot' | 'openrouter' = 'copilot'
      let copilotModel: CopilotModel | undefined
      let openrouterModel: OpenRouterModel | undefined
      let geminiModel: GeminiModel | undefined

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
          console.log('')
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

      let descriptionDone = false
      let correction = ''

      while (!descriptionDone) {
        const basePrompt =
          'Analyze this README and write a short GitHub repo description ' +
          '(max 150 chars). Concise, informative. Output ONLY the text, no quotes.\n\n'
        const prompt = correction
          ? `${basePrompt}User feedback: ${correction}\n\nREADME:\n${readme.slice(0, 3000)}`
          : `${basePrompt}${readme.slice(0, 3000)}`

        console.log('')
        const currentModel = copilotModel ?? openrouterModel ?? geminiModel ?? ''
        const modelDisplay = getModelValue(currentModel)
        const aiSpinner = log.spinner()
        aiSpinner.start(
          `Generating description with ${getAIProviderShortName(aiProvider)}` +
            (modelDisplay ? ` (${modelDisplay})` : '') +
            '...'
        )

        const aiResult = await generateTextWithProvider(
          aiProvider,
          prompt,
          copilotModel,
          openrouterModel,
          geminiModel
        )

        if (!aiResult) {
          aiSpinner.fail('AI generation failed')
          console.log('')
          const custom = askQuestion('Enter description manually:')
          if (custom.trim()) changes.description = custom.trim()
          descriptionDone = true
          continue
        }

        aiSpinner.succeed('Description generated')
        console.log('')
        log.info(`AI suggestion: ${colors.bright}${aiResult}${colors.reset}`)

        console.log('')
        const choice = await select('Accept this description?', [
          { label: 'Yes, use it', value: 'accept' },
          { label: 'Regenerate', value: 'regenerate' },
          { label: 'Correct AI (give feedback)', value: 'correct' },
          { label: 'Edit manually', value: 'edit' },
          { label: 'Change model', value: 'change-model' },
          { label: 'Change AI provider', value: 'change-provider' },
        ])

        switch (choice) {
          case 'accept': {
            changes.description = aiResult
            descriptionDone = true
            break
          }
          case 'regenerate': {
            correction = ''
            break
          }
          case 'correct': {
            console.log('')
            correction = askQuestion('Feedback for AI (e.g., shorter, more technical): ')
            break
          }
          case 'edit': {
            console.log('')
            const custom = askQuestion(`Edit description (current: ${aiResult}):\n> `)
            if (custom.trim()) changes.description = custom.trim()
            descriptionDone = true
            break
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
            correction = ''
            break
          }
          case 'change-provider': {
            console.log('')
            aiProvider = (await select('Choose AI Provider:', [
              { label: 'GitHub (Recommended)', value: 'copilot' },
              { label: 'Gemini', value: 'gemini' },
              { label: 'OpenRouter', value: 'openrouter' },
            ])) as 'gemini' | 'copilot' | 'openrouter'

            const newModel = await chooseModelForProvider(aiProvider, undefined, 'Back')
            if (newModel && newModel !== 'back') {
              // Reset all models, set only the new one
              copilotModel = undefined
              openrouterModel = undefined
              geminiModel = undefined
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
            correction = ''
            break
          }
        }
      }
    } else {
      log.warn('No README.md found in current directory')
      console.log('')
      const custom = askQuestion('Enter description manually: ')
      if (custom.trim()) changes.description = custom.trim()
    }
  }

  // ── Topics ──
  if (action === 'topics' || action === 'all') {
    const extracted = extractTopicsFromReadme()
    if (extracted.length > 0) {
      console.log('')
      log.info(`Detected topics: ${colors.bright}${extracted.join(', ')}${colors.reset}`)
      console.log('')
      const useExtracted = confirm('Use these topics?')

      if (useExtracted) {
        changes.topics = extracted
      } else {
        console.log('')
        const custom = askQuestion('Enter topics (comma-separated): ')
        if (custom.trim()) {
          changes.topics = custom
            .split(',')
            .map((t) => t.trim().toLowerCase().replaceAll(/\s+/g, '-'))
            .filter(Boolean)
        }
      }
    } else {
      console.log('')
      const custom = askQuestion('Enter topics (comma-separated): ')
      if (custom.trim()) {
        changes.topics = custom
          .split(',')
          .map((t) => t.trim().toLowerCase().replaceAll(/\s+/g, '-'))
          .filter(Boolean)
      }
    }
  }

  // ── Homepage ──
  if (action === 'homepage' || action === 'all') {
    console.log('')
    const homepage = askQuestion(
      `Enter homepage URL${repoInfo.homepage ? ` (current: ${repoInfo.homepage})` : ''}: `
    )
    if (homepage.trim()) changes.homepage = homepage.trim()
  }

  // Check if there are any changes
  if (!changes.description && !changes.topics && !changes.homepage) {
    console.log('')
    log.info('No changes to apply.')
    return
  }

  // Preview changes
  console.log('')
  console.log(`${colors.cyan}┌${line}┐${colors.reset}`)
  console.log(`${colors.cyan}│${colors.reset} ${colors.bright}Changes to Apply${colors.reset}`)
  console.log(`${colors.cyan}├${line}┤${colors.reset}`)
  if (changes.description) {
    console.log(
      `${colors.cyan}│${colors.reset}  ${colors.green}✓${colors.reset} Description: ${changes.description}`
    )
  }
  if (changes.topics) {
    console.log(
      `${colors.cyan}│${colors.reset}  ${colors.green}✓${colors.reset} Topics: ${changes.topics.join(', ')}`
    )
  }
  if (changes.homepage) {
    console.log(
      `${colors.cyan}│${colors.reset}  ${colors.green}✓${colors.reset} Homepage: ${changes.homepage}`
    )
  }
  console.log(`${colors.cyan}└${line}┘${colors.reset}`)

  console.log('')
  const proceed = confirm('Apply these changes?')
  if (!proceed) return

  // Apply changes
  console.log('')
  const applySpinner = log.spinner()
  applySpinner.start('Updating GitHub repo settings...')

  try {
    // Apply description + homepage
    if (changes.description || changes.homepage) {
      let cmd = 'gh repo edit'
      if (changes.description) {
        const escaped = changes.description.replaceAll("'", String.raw`'\''`)
        cmd += ` --description '${escaped}'`
      }
      if (changes.homepage) {
        cmd += ` --homepage '${changes.homepage}'`
      }
      await execAsync(cmd, true)
    }

    // Apply topics (add/remove individually)
    if (changes.topics) {
      for (const topic of repoInfo.topics) {
        try {
          await execAsync(`gh repo edit --remove-topic "${topic}"`, true)
        } catch {
          /* ignore */
        }
      }
      for (const topic of changes.topics) {
        try {
          await execAsync(`gh repo edit --add-topic "${topic}"`, true)
        } catch {
          /* ignore */
        }
      }
    }

    applySpinner.succeed('GitHub repo settings updated!')

    // Show final state
    console.log('')
    const verifySpinner = log.spinner()
    verifySpinner.start('Verifying changes...')

    const updated = getCurrentRepoInfo()
    if (updated) {
      verifySpinner.succeed('Verified')
      console.log('')
      console.log(`${colors.cyan}┌${line}┐${colors.reset}`)
      console.log(`${colors.cyan}│${colors.reset} ${colors.bright}Updated Settings${colors.reset}`)
      console.log(`${colors.cyan}├${line}┤${colors.reset}`)
      console.log(
        `${colors.cyan}│${colors.reset} ${colors.gray}Description:${colors.reset} ${updated.description || '(empty)'}`
      )
      console.log(
        `${colors.cyan}│${colors.reset} ${colors.gray}Homepage:${colors.reset}    ${updated.homepage || '(empty)'}`
      )
      console.log(
        `${colors.cyan}│${colors.reset} ${colors.gray}Topics:${colors.reset}      ${updated.topics.length > 0 ? updated.topics.join(', ') : '(none)'}`
      )
      console.log(`${colors.cyan}└${line}┘${colors.reset}`)
    } else {
      verifySpinner.fail('Could not verify — check manually on GitHub')
    }
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim()
    applySpinner.fail('Failed to update repo settings')
    if (stderr) log.error(`  ${stderr.split('\n')[0]}`)
  }
}
