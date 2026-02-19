#!/usr/bin/env node
/**
 * Geeto - Git flow automation CLI tool with AI-powered branch naming
 * Main entry point - delegates to modular workflows
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const filename = fileURLToPath(import.meta.url)
const dir = path.dirname(filename)

const packageJson = JSON.parse(readFileSync(path.join(dir, '../package.json'), 'utf8')) as {
  version: string
}
const version = packageJson.version

const { main } = await import('./workflows/main.js')

// Parse simple CLI flags for quick step shortcuts
const argv = process.argv.slice(2)
let startAt: 'commit' | 'merge' | 'branch' | 'stage' | 'push' | undefined
let fresh = false
let resume = false
let stageAll = false
let showVersion = false
let showHelp = false
let showCleanup = false
let showSwitch = false
let showCompare = false
let showCherryPick = false
let showPR = false
let showIssue = false
let showHistory = false
let showStash = false
let showAmend = false
let showTrello = false
let showTrelloLists = false
let showTrelloGenerate = false
let settingsAction:
  | 'separator'
  | 'models'
  | 'change-model'
  | 'gemini'
  | 'openrouter'
  | 'trello'
  | 'github'
  | undefined
for (const arg of argv) {
  if (arg === '-c' || arg === '--commit') {
    startAt = 'commit'
  }
  if (arg === '-m' || arg === '--merge') {
    startAt = 'merge'
  }
  if (arg === '-b' || arg === '--branch') {
    startAt = 'branch'
  }
  if (arg === '-s' || arg === '--stage') {
    startAt = 'stage'
  }
  if (arg === '-sa' || arg === '-as') {
    startAt = 'stage'
    stageAll = true
  }
  if (arg === '-p' || arg === '--push') {
    startAt = 'push'
  }
  if (arg === '-f' || arg === '--fresh') {
    fresh = true
  }
  if (arg === '-r' || arg === '--resume') {
    resume = true
  }
  if (arg === '-v' || arg === '--version') {
    showVersion = true
  }
  if (arg === '-h' || arg === '--help') {
    showHelp = true
  }
  if (arg === '--separator') {
    settingsAction = 'separator'
  }
  if (arg === '--sync-models') {
    settingsAction = 'models'
  }
  if (arg === '--change-model') {
    settingsAction = 'change-model'
  }
  if (arg === '--setup-gemini') {
    settingsAction = 'gemini'
  }
  if (arg === '--setup-openrouter') {
    settingsAction = 'openrouter'
  }
  if (arg === '--setup-trello') {
    settingsAction = 'trello'
  }
  if (arg === '--setup-github') {
    settingsAction = 'github'
  }
  if (arg === '--cleanup' || arg === '-cl') {
    showCleanup = true
  }
  if (arg === '--switch' || arg === '-sw') {
    showSwitch = true
  }
  if (arg === '--compare' || arg === '-cmp') {
    showCompare = true
  }
  if (arg === '--cherry-pick' || arg === '-cp') {
    showCherryPick = true
  }
  if (arg === '--pr') {
    showPR = true
  }
  if (arg === '--issue') {
    showIssue = true
  }
  if (arg === '--log' || arg === '-lg') {
    showHistory = true
  }
  if (arg === '--stash') {
    showStash = true
  }
  if (arg === '--amend') {
    showAmend = true
  }
  if (arg === '--trello') {
    showTrello = true
  }
  if (arg === '--trello-list') {
    showTrelloLists = true
  }
  if (arg === '--trello-generate') {
    showTrelloGenerate = true
  }
}

// Validate unknown flags
const validFlags = new Set([
  '-c',
  '--commit',
  '-m',
  '--merge',
  '-b',
  '--branch',
  '-s',
  '--stage',
  '-sa',
  '-as',
  '-p',
  '--push',
  '--cleanup',
  '-cl',
  '--switch',
  '-sw',
  '--compare',
  '-cmp',
  '--cherry-pick',
  '-cp',
  '--pr',
  '--issue',
  '--log',
  '-lg',
  '--stash',
  '--amend',
  '-f',
  '--fresh',
  '-r',
  '--resume',
  '-v',
  '--version',
  '-h',
  '--help',
  '--separator',
  '--sync-models',
  '--change-model',
  '--setup-gemini',
  '--setup-openrouter',
  '--setup-trello',
  '--setup-github',
  '--trello',
  '--trello-list',
  '--trello-generate',
])

for (const arg of argv) {
  if (arg.startsWith('-') && !validFlags.has(arg)) {
    console.error(`Unknown flag: ${arg}`)
    console.error('Use --help to see available options')
    process.exit(1)
  }
}

;(async () => {
  if (showVersion) {
    console.log(`Geeto v${version}`)
    process.exit(0)
  }

  if (showHelp) {
    console.log('Geeto CLI — Git flow automation')
    console.log('')
    console.log('Usage: geeto [options]')
    console.log('')
    console.log('Options:')
    console.log('  -c, --commit         Start at commit step')
    console.log('  -m, --merge          Start at merge step')
    console.log('  -b, --branch         Start at branch step')
    console.log('  -s, --stage          Start at stage step')
    console.log('  -sa, -as             Start at stage step and automatically stage all changes')
    console.log('  -p, --push           Start at push step')
    console.log(
      '  -cl, --cleanup       Interactive branch cleanup (delete local & remote branches)'
    )
    console.log('  -sw, --switch        Interactive branch switcher with fuzzy search')
    console.log('  -cmp, --compare      Compare current branch with another branch')
    console.log('  -cp, --cherry-pick   Interactive cherry-pick commits from another branch')
    console.log('  --pr                 Create a GitHub Pull Request')
    console.log('  --issue              Create a GitHub Issue')
    console.log('  -lg, --log           View commit history with elegant timeline')
    console.log('  --stash              Interactive stash manager')
    console.log('  --amend              Amend the last commit (message, files, or both)')
    console.log('  -f, --fresh          Start fresh workflow (ignore checkpoint)')
    console.log('  -r, --resume         Resume from checkpoint (default if exists)')
    console.log('  -v, --version        Show version')
    console.log('  -h, --help           Show this help message')
    console.log('')
    console.log('Settings:')
    console.log('  --separator          Configure branch separator (hyphen/underscore)')
    console.log('  --sync-models        Sync model configurations (fetch live models)')
    console.log('  --change-model       Change AI provider / model')
    console.log('  --setup-gemini       Setup Gemini AI integration')
    console.log('  --setup-openrouter   Setup OpenRouter AI integration')
    console.log('  --setup-trello       Setup Trello integration')
    console.log('  --setup-github       Setup GitHub integration (token for PR/issues)')
    console.log('')
    console.log('Trello:')
    console.log('  --trello             Open Trello menu')
    console.log('  --trello-list        Get Trello lists from board')
    console.log('  --trello-generate    Generate tasks.instructions.md from Trello list')
    process.exit(0)
  }

  if (showCleanup) {
    try {
      const { handleInteractiveCleanup } = await import('./workflows/cleanup.js')
      await handleInteractiveCleanup()
      process.exit(0)
    } catch (error) {
      console.error('Cleanup error:', error)
      process.exit(1)
    }
  }

  if (showSwitch) {
    try {
      const { handleBranchSwitch } = await import('./workflows/switch.js')
      await handleBranchSwitch()
      process.exit(0)
    } catch (error) {
      console.error('Switch error:', error)
      process.exit(1)
    }
  }

  if (showCompare) {
    try {
      const { handleBranchCompare } = await import('./workflows/compare.js')
      await handleBranchCompare()
      process.exit(0)
    } catch (error) {
      console.error('Compare error:', error)
      process.exit(1)
    }
  }

  if (showCherryPick) {
    try {
      const { handleCherryPick } = await import('./workflows/cherry-pick.js')
      await handleCherryPick()
      process.exit(0)
    } catch (error) {
      console.error('Cherry-pick error:', error)
      process.exit(1)
    }
  }

  if (showPR) {
    try {
      const { handleCreatePR } = await import('./workflows/pr.js')
      await handleCreatePR()
      process.exit(0)
    } catch (error) {
      console.error('PR error:', error)
      process.exit(1)
    }
  }

  if (showIssue) {
    try {
      const { handleCreateIssue } = await import('./workflows/issue.js')
      await handleCreateIssue()
      process.exit(0)
    } catch (error) {
      console.error('Issue error:', error)
      process.exit(1)
    }
  }

  if (showHistory) {
    try {
      const { handleHistory } = await import('./workflows/history.js')
      await handleHistory()
      process.exit(0)
    } catch (error) {
      console.error('History error:', error)
      process.exit(1)
    }
  }

  if (showStash) {
    try {
      const { handleStash } = await import('./workflows/stash.js')
      await handleStash()
      process.exit(0)
    } catch (error) {
      console.error('Stash error:', error)
      process.exit(1)
    }
  }

  if (showAmend) {
    try {
      const { handleAmend } = await import('./workflows/amend.js')
      await handleAmend()
      process.exit(0)
    } catch (error) {
      console.error('Amend error:', error)
      process.exit(1)
    }
  }

  if (showTrello) {
    try {
      const { showTrelloMenu } = await import('./workflows/trello-menu.js')
      await showTrelloMenu()
      process.exit(0)
    } catch (error) {
      console.error('Trello menu error:', error)
      process.exit(1)
    }
  }

  if (showTrelloLists) {
    try {
      const { handleGetTrelloLists } = await import('./workflows/trello-menu.js')
      await handleGetTrelloLists()
      process.exit(0)
    } catch (error) {
      console.error('Trello list error:', error)
      process.exit(1)
    }
  }

  if (showTrelloGenerate) {
    try {
      const { handleGenerateTaskInstructions } = await import('./workflows/trello-menu.js')
      await handleGenerateTaskInstructions()
      process.exit(0)
    } catch (error) {
      console.error('Trello generate error:', error)
      process.exit(1)
    }
  }

  if (settingsAction) {
    try {
      const {
        handleSeparatorSetting,
        handleModelResetSetting,
        handleChangeModelSetting,
        handleGeminiSetting,
        handleOpenRouterSetting,
        handleTrelloSetting,
      } = await import('./workflows/settings.js')
      switch (settingsAction) {
        case 'separator': {
          await handleSeparatorSetting()
          break
        }
        case 'models': {
          await handleModelResetSetting()
          break
        }
        case 'change-model': {
          await handleChangeModelSetting()
          break
        }
        case 'gemini': {
          await handleGeminiSetting()
          break
        }
        case 'openrouter': {
          await handleOpenRouterSetting()
          break
        }
        case 'trello': {
          await handleTrelloSetting()
          break
        }
        case 'github': {
          const { setupGithubConfigInteractive } = await import('./core/github-setup.js')
          setupGithubConfigInteractive()
          break
        }
      }
      process.exit(0)
    } catch (error) {
      console.error('Settings error:', error)
      process.exit(1)
    }
  }

  // Pass stageAll flag into main so workflows can auto-stage all changes

  // Start the application with optional start step
  main({ startAt, fresh, resume, stageAll }).catch((error: unknown) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
})()
