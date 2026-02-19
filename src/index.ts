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
let showStats = false
let showUndo = false
let showRelease = false
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
  if (arg === '--pr' || arg === '-pr') {
    showPR = true
  }
  if (arg === '--issue' || arg === '-i') {
    showIssue = true
  }
  if (arg === '--log' || arg === '-lg') {
    showHistory = true
  }
  if (arg === '--stash' || arg === '-sh') {
    showStash = true
  }
  if (arg === '--amend' || arg === '-am') {
    showAmend = true
  }
  if (arg === '--stats' || arg === '-st') {
    showStats = true
  }
  if (arg === '--undo' || arg === '-u') {
    showUndo = true
  }
  if (arg === '--tag' || arg === '-t') {
    showRelease = true
  }
  if (arg === '--trello' || arg === '-tr') {
    showTrello = true
  }
  if (arg === '--trello-list' || arg === '-tl') {
    showTrelloLists = true
  }
  if (arg === '--trello-generate' || arg === '-tg') {
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
  '-pr',
  '--issue',
  '-i',
  '--log',
  '-lg',
  '--stash',
  '-sh',
  '--amend',
  '-am',
  '--stats',
  '-st',
  '--undo',
  '-u',
  '--tag',
  '-t',
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
  '-tr',
  '--trello-list',
  '-tl',
  '--trello-generate',
  '-tg',
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
    const C = '\u001B[36m' // cyan
    const B = '\u001B[1m' // bright/bold
    const G = '\u001B[90m' // gray
    const R = '\u001B[0m' // reset

    console.log('')
    console.log(`  ${B}Geeto CLI${R} ${G}v${version}${R}`)
    console.log(`  ${G}Git flow automation with AI-powered workflows${R}`)
    console.log('')
    console.log(`  ${B}USAGE${R}`)
    console.log(`    ${C}geeto${R} ${G}[command] [options]${R}`)
    console.log('')

    console.log(`  ${B}WORKFLOW${R}`)
    console.log(`    ${C}-s,  --stage${R}              Stage files interactively`)
    console.log(`    ${C}-sa, -as${R}                  Stage all changes automatically`)
    console.log(`    ${C}-c,  --commit${R}             Create a commit with AI message`)
    console.log(`    ${C}-b,  --branch${R}             Create a branch with AI name`)
    console.log(`    ${C}-p,  --push${R}               Push current branch to remote`)
    console.log(`    ${C}-m,  --merge${R}              Merge branches interactively`)
    console.log('')

    console.log(`  ${B}GIT TOOLS${R}`)
    console.log(`    ${C}-cl, --cleanup${R}            Clean up local & remote branches`)
    console.log(`    ${C}-sw, --switch${R}             Switch branches with fuzzy search`)
    console.log(`    ${C}-cmp, --compare${R}           Compare current branch with another`)
    console.log(`    ${C}-cp, --cherry-pick${R}        Cherry-pick from another branch`)
    console.log(`    ${C}-lg, --log${R}                View commit history with timeline`)
    console.log(`    ${C}-sh, --stash${R}              Manage stashes interactively`)
    console.log(`    ${C}-am, --amend${R}              Amend the last commit`)
    console.log(`    ${C}-u,  --undo${R}               Undo the last git action safely`)
    console.log(`    ${C}-st, --stats${R}              Repository statistics dashboard`)
    console.log('')

    console.log(`  ${B}GITHUB${R}`)
    console.log(`    ${C}-pr, --pr${R}                 Create a Pull Request`)
    console.log(`    ${C}-i,  --issue${R}              Create an Issue`)
    console.log(`    ${C}-t,  --tag${R}                Release & tag manager with semver`)
    console.log('')

    console.log(`  ${B}TRELLO${R}`)
    console.log(`    ${C}-tr, --trello${R}             Open Trello menu`)
    console.log(`    ${C}-tl, --trello-list${R}        List boards and lists`)
    console.log(`    ${C}-tg, --trello-generate${R}    Generate tasks from Trello`)
    console.log('')

    console.log(`  ${B}SETTINGS${R}`)
    console.log(`    ${C}     --setup-gemini${R}       Configure Gemini AI`)
    console.log(`    ${C}     --setup-openrouter${R}   Configure OpenRouter AI`)
    console.log(`    ${C}     --setup-github${R}       Configure GitHub token`)
    console.log(`    ${C}     --setup-trello${R}       Configure Trello integration`)
    console.log(`    ${C}     --change-model${R}       Switch AI provider / model`)
    console.log(`    ${C}     --sync-models${R}        Fetch latest model list`)
    console.log(`    ${C}     --separator${R}          Set branch name separator`)
    console.log('')

    console.log(`  ${B}OPTIONS${R}`)
    console.log(`    ${C}-f,  --fresh${R}              Start fresh (ignore checkpoint)`)
    console.log(`    ${C}-r,  --resume${R}             Resume from last checkpoint`)
    console.log(`    ${C}-v,  --version${R}            Show version`)
    console.log(`    ${C}-h,  --help${R}               Show this help message`)
    console.log('')
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

  if (showStats) {
    try {
      const { handleStats } = await import('./workflows/stats.js')
      handleStats()
      process.exit(0)
    } catch (error) {
      console.error('Stats error:', error)
      process.exit(1)
    }
  }

  if (showUndo) {
    try {
      const { handleUndo } = await import('./workflows/undo.js')
      await handleUndo()
      process.exit(0)
    } catch (error) {
      console.error('Undo error:', error)
      process.exit(1)
    }
  }

  if (showRelease) {
    try {
      const { handleRelease } = await import('./workflows/release.js')
      await handleRelease()
      process.exit(0)
    } catch (error) {
      console.error('Release error:', error)
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
