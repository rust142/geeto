#!/usr/bin/env node
/**
 * Geeto - Git flow automation CLI tool with AI-powered branch naming
 * Main entry point - delegates to modular workflows via command registry
 */
import { VERSION } from './version.js'

// ─── Command Registry ────────────────────────────────────────────────

interface CommandEntry {
  /** Primary flag (e.g., '--cleanup') */
  flag: string
  /** Short alias (e.g., '-cl') */
  alias?: string
  /** Module path to dynamic-import */
  module: string
  /** Exported function name to call */
  handler: string
  /** Label shown in error messages */
  errorLabel: string
}

/**
 * Registry of all standalone commands.
 * Order determines priority when multiple flags are passed.
 */
const COMMAND_REGISTRY: CommandEntry[] = [
  // Git tools
  {
    flag: '--abort',
    alias: undefined,
    module: './workflows/abort.js',
    handler: 'handleAbort',
    errorLabel: 'Abort',
  },
  {
    flag: '--pull',
    alias: '-pl',
    module: './workflows/pull.js',
    handler: 'handlePull',
    errorLabel: 'Pull',
  },
  {
    flag: '--prune',
    alias: undefined,
    module: './workflows/prune.js',
    handler: 'handlePrune',
    errorLabel: 'Prune',
  },
  {
    flag: '--fetch',
    alias: '-ft',
    module: './workflows/fetch.js',
    handler: 'handleFetch',
    errorLabel: 'Fetch',
  },
  {
    flag: '--status',
    alias: '-st',
    module: './workflows/status.js',
    handler: 'handleStatus',
    errorLabel: 'Status',
  },
  {
    flag: '--revert',
    alias: '-rv',
    module: './workflows/revert.js',
    handler: 'handleRevert',
    errorLabel: 'Revert',
  },
  {
    flag: '--alias',
    alias: '-al',
    module: './workflows/alias.js',
    handler: 'handleAlias',
    errorLabel: 'Alias',
  },
  {
    flag: '--reword',
    alias: '-rw',
    module: './workflows/reword.js',
    handler: 'handleReword',
    errorLabel: 'Reword',
  },
  {
    flag: '--cleanup',
    alias: '-cl',
    module: './workflows/cleanup.js',
    handler: 'handleInteractiveCleanup',
    errorLabel: 'Cleanup',
  },
  {
    flag: '--switch',
    alias: '-sw',
    module: './workflows/switch.js',
    handler: 'handleBranchSwitch',
    errorLabel: 'Switch',
  },
  {
    flag: '--compare',
    alias: '-cmp',
    module: './workflows/compare.js',
    handler: 'handleBranchCompare',
    errorLabel: 'Compare',
  },
  {
    flag: '--cherry-pick',
    alias: '-cp',
    module: './workflows/cherry-pick.js',
    handler: 'handleCherryPick',
    errorLabel: 'Cherry-pick',
  },
  {
    flag: '--pr',
    alias: '-pr',
    module: './workflows/pr.js',
    handler: 'handleCreatePR',
    errorLabel: 'PR',
  },
  {
    flag: '--issue',
    alias: '-i',
    module: './workflows/issue.js',
    handler: 'handleCreateIssue',
    errorLabel: 'Issue',
  },
  {
    flag: '--log',
    alias: '-lg',
    module: './workflows/history.js',
    handler: 'handleHistory',
    errorLabel: 'History',
  },
  {
    flag: '--stash',
    alias: '-sh',
    module: './workflows/stash.js',
    handler: 'handleStash',
    errorLabel: 'Stash',
  },
  {
    flag: '--amend',
    alias: '-am',
    module: './workflows/amend.js',
    handler: 'handleAmend',
    errorLabel: 'Amend',
  },
  {
    flag: '--stats',
    alias: '-sts',
    module: './workflows/stats.js',
    handler: 'handleStats',
    errorLabel: 'Stats',
  },
  {
    flag: '--undo',
    alias: '-u',
    module: './workflows/undo.js',
    handler: 'handleUndo',
    errorLabel: 'Undo',
  },
  {
    flag: '--tag',
    alias: '-t',
    module: './workflows/release.js',
    handler: 'handleRelease',
    errorLabel: 'Release',
  },
  {
    flag: '--repo',
    alias: '-rp',
    module: './workflows/repo-settings.js',
    handler: 'handleRepoSettings',
    errorLabel: 'Repo settings',
  },
  // Trello
  {
    flag: '--trello',
    alias: '-tr',
    module: './workflows/trello-menu.js',
    handler: 'showTrelloMenu',
    errorLabel: 'Trello menu',
  },
  {
    flag: '--trello-list',
    alias: '-tl',
    module: './workflows/trello-menu.js',
    handler: 'handleGetTrelloLists',
    errorLabel: 'Trello list',
  },
  {
    flag: '--trello-generate',
    alias: '-tg',
    module: './workflows/trello-menu.js',
    handler: 'handleGenerateTaskInstructions',
    errorLabel: 'Trello generate',
  },
  // Settings
  {
    flag: '--separator',
    alias: undefined,
    module: './workflows/settings.js',
    handler: 'handleSeparatorSetting',
    errorLabel: 'Settings',
  },
  {
    flag: '--sync-models',
    alias: undefined,
    module: './workflows/settings.js',
    handler: 'handleModelResetSetting',
    errorLabel: 'Settings',
  },
  {
    flag: '--change-model',
    alias: undefined,
    module: './workflows/settings.js',
    handler: 'handleChangeModelSetting',
    errorLabel: 'Settings',
  },
  {
    flag: '--setup-gemini',
    alias: undefined,
    module: './workflows/settings.js',
    handler: 'handleGeminiSetting',
    errorLabel: 'Settings',
  },
  {
    flag: '--setup-openrouter',
    alias: undefined,
    module: './workflows/settings.js',
    handler: 'handleOpenRouterSetting',
    errorLabel: 'Settings',
  },
  {
    flag: '--setup-trello',
    alias: undefined,
    module: './workflows/settings.js',
    handler: 'handleTrelloSetting',
    errorLabel: 'Settings',
  },
  {
    flag: '--setup-github',
    alias: undefined,
    module: './core/github-setup.js',
    handler: 'setupGithubConfigInteractive',
    errorLabel: 'Settings',
  },
  {
    flag: '--setup-gitlab',
    alias: undefined,
    module: './core/gitlab-setup.js',
    handler: 'setupGitlabConfigInteractive',
    errorLabel: 'Settings',
  },
]

/** Flags that set the `startAt` step for the main workflow */
const START_AT_FLAGS: {
  flag: string
  alias: string
  startAt: 'commit' | 'merge' | 'branch' | 'stage' | 'push'
}[] = [
  { flag: '--commit', alias: '-c', startAt: 'commit' },
  { flag: '--merge', alias: '-m', startAt: 'merge' },
  { flag: '--branch', alias: '-b', startAt: 'branch' },
  { flag: '--stage', alias: '-s', startAt: 'stage' },
  { flag: '--push', alias: '-p', startAt: 'push' },
]

/** Modifier flags that don't trigger a command on their own */
const MODIFIER_FLAGS: { flag: string; alias: string }[] = [
  { flag: '--fresh', alias: '-f' },
  { flag: '--resume', alias: '-r' },
  { flag: '--version', alias: '-v' },
  { flag: '--help', alias: '-h' },
  { flag: '--dry-run', alias: '-dr' },
]

// ─── Valid Flags (auto-generated from registries) ────────────────────

function buildValidFlags(): Set<string> {
  const flags = new Set<string>()

  for (const cmd of COMMAND_REGISTRY) {
    flags.add(cmd.flag)
    if (cmd.alias) flags.add(cmd.alias)
  }

  for (const sf of START_AT_FLAGS) {
    flags.add(sf.flag)
    flags.add(sf.alias)
  }

  // Special compound aliases
  flags.add('-sa')
  flags.add('-as')

  for (const mf of MODIFIER_FLAGS) {
    flags.add(mf.flag)
    flags.add(mf.alias)
  }

  return flags
}

const validFlags = buildValidFlags()

// ─── Argument Parsing ────────────────────────────────────────────────

interface ParsedArgs {
  startAt?: 'commit' | 'merge' | 'branch' | 'stage' | 'push'
  fresh: boolean
  resume: boolean
  stageAll: boolean
  dryRunMode: boolean
  showVersion: boolean
  showHelp: boolean
  /** Set of matched command flags (by primary flag name) */
  activeFlags: Set<string>
}

function parseArgs(argv: string[]): ParsedArgs {
  let startAt: ParsedArgs['startAt']
  let fresh = false
  let resume = false
  let stageAll = false
  let dryRunMode = false
  let showVersion = false
  let showHelp = false
  const activeFlags = new Set<string>()

  for (const arg of argv) {
    // Start-at flags (workflow step shortcuts)
    for (const sf of START_AT_FLAGS) {
      if (arg === sf.flag || arg === sf.alias) {
        startAt = sf.startAt
      }
    }

    // Special compound: -sa / -as → stage + stageAll
    if (arg === '-sa' || arg === '-as') {
      startAt = 'stage'
      stageAll = true
    }

    // Modifier flags
    if (arg === '-f' || arg === '--fresh') fresh = true
    if (arg === '-r' || arg === '--resume') resume = true
    if (arg === '-v' || arg === '--version') showVersion = true
    if (arg === '-h' || arg === '--help') showHelp = true
    if (arg === '--dry-run' || arg === '-dr') dryRunMode = true

    // Command registry lookup
    for (const cmd of COMMAND_REGISTRY) {
      if (arg === cmd.flag || arg === cmd.alias) {
        activeFlags.add(cmd.flag)
      }
    }

    // Non-flag argument → ignored
  }

  return {
    startAt,
    fresh,
    resume,
    stageAll,
    dryRunMode,
    showVersion,
    showHelp,
    activeFlags,
  }
}

// ─── Help Display ────────────────────────────────────────────────────

function showHelpMessage(): void {
  const C = '\u001B[36m' // cyan
  const B = '\u001B[1m' // bright/bold
  const G = '\u001B[90m' // gray
  const R = '\u001B[0m' // reset

  console.log('')
  console.log(`  ${B}Geeto CLI${R} ${G}v${VERSION}${R}`)
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
  console.log(`    ${C}-rv, --revert${R}             Revert the last commit (soft reset)`)
  console.log(`    ${C}-al, --alias${R}              Install shell aliases for geeto`)
  console.log(`    ${C}-rw, --reword${R}             Edit past commit messages`)
  console.log(`    ${C}-sts, --stats${R}             Repository statistics dashboard`)
  console.log(`    ${C}     --abort${R}              Abort in-progress operation`)
  console.log(`    ${C}-pl, --pull${R}               Pull from remote interactively`)
  console.log(`    ${C}-ft, --fetch${R}              Fetch latest from remote`)
  console.log(`    ${C}     --prune${R}              Remove stale remote branches`)
  console.log(`    ${C}-st, --status${R}             Pretty git status overview`)
  console.log('')

  console.log(`  ${B}GITHUB / GITLAB${R}`)
  console.log(`    ${C}-pr, --pr${R}                 Create a Pull Request / Merge Request`)
  console.log(`    ${C}-i,  --issue${R}              Create an Issue`)
  console.log(`    ${C}-t,  --tag${R}                Release & tag manager with semver`)
  console.log(`    ${C}-rp, --repo${R}               Update repo settings`)
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
  console.log(`    ${C}     --setup-gitlab${R}       Configure GitLab token`)
  console.log(`    ${C}     --setup-trello${R}       Configure Trello integration`)
  console.log(`    ${C}     --change-model${R}       Switch AI provider / model`)
  console.log(`    ${C}     --sync-models${R}        Fetch latest model list`)
  console.log(`    ${C}     --separator${R}          Set branch name separator`)
  console.log('')

  console.log(`  ${B}OPTIONS${R}`)
  console.log(`    ${C}-f,  --fresh${R}              Start fresh (ignore checkpoint)`)
  console.log(`    ${C}-r,  --resume${R}             Resume from last checkpoint`)
  console.log(`    ${C}-dr, --dry-run${R}            Simulate commands without executing`)
  console.log(`    ${C}-v,  --version${R}            Show version`)
  console.log(`    ${C}-h,  --help${R}               Show this help message`)
  console.log('')
}

// ─── Command Execution ───────────────────────────────────────────────

async function handleDryRunSetup(args: ParsedArgs): Promise<void> {
  const { setDryRun, printDryRunBanner, printDryRunSummary } = await import('./utils/dry-run.js')

  const hasOtherCommand = args.startAt !== undefined || args.activeFlags.size > 0

  if (!hasOtherCommand) {
    // Standalone --dry-run: show interactive menu
    try {
      const { handleDryRunMenu } = await import('./workflows/dry-run.js')
      await handleDryRunMenu()
      process.exit(0)
    } catch (error) {
      console.error('Dry-run error:', error)
      process.exit(1)
    }
  }

  // Combo mode: activate dry-run, let normal routing handle it
  setDryRun(true)
  printDryRunBanner()

  // Wrap process.exit to print summary before exiting
  const originalExit = process.exit
  process.exit = ((code?: number) => {
    printDryRunSummary()
    originalExit(code)
  }) as typeof process.exit
}

async function executeCommand(args: ParsedArgs): Promise<void> {
  // 1. Version (instant, no imports)
  if (args.showVersion) {
    console.log(`Geeto v${VERSION}`)
    process.exit(0)
  }

  // 2. Help (instant, no imports)
  if (args.showHelp) {
    showHelpMessage()
    process.exit(0)
  }

  // 3. Dry-run mode setup (must run before other commands)
  if (args.dryRunMode) {
    await handleDryRunSetup(args)
  }

  // 4. Registry commands — first match wins
  for (const cmd of COMMAND_REGISTRY) {
    if (args.activeFlags.has(cmd.flag)) {
      try {
        const mod = (await import(cmd.module)) as Record<string, (...args: unknown[]) => unknown>
        const handlerFn = mod[cmd.handler]
        if (handlerFn) {
          await handlerFn()
        }
        process.exit(0)
      } catch (error) {
        console.error(`${cmd.errorLabel} error:`, error)
        process.exit(1)
      }
    }
  }

  // 6. Default: run main workflow
  const { main } = await import('./workflows/main.js')
  main({
    startAt: args.startAt,
    fresh: args.fresh,
    resume: args.resume,
    stageAll: args.stageAll,
  }).catch((error: unknown) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}

// ─── Entry Point ─────────────────────────────────────────────────────

const argv = process.argv.slice(2)

// Validate unknown flags
for (const arg of argv) {
  if (arg.startsWith('-') && !validFlags.has(arg)) {
    console.error(`Unknown flag: ${arg}`)
    console.error('Use --help to see available options')
    process.exit(1)
  }
}

const args = parseArgs(argv)
void executeCommand(args)
