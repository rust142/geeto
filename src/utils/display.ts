/**
 * Display helpers for showing git and provider status
 */

import { colors } from './colors.js'
import { getTrelloConfig } from './config.js'
import { getGitUser, getRemoteUrl, getUpstreamBranch } from './git-commands.js'
import { withSpinnerSync } from './spinner-wrapper.js'

/* ──────────────────────────── box helpers ──────────────────────────── */

const BOX_W = 56

function boxTop(title: string): string {
  const pad = BOX_W - title.length - 3
  return `${colors.cyan}┌─ ${title} ${'─'.repeat(Math.max(0, pad))}┐${colors.reset}`
}

function boxRow(label: string, value: string): string {
  return `${colors.cyan}│${colors.reset}  ${colors.gray}${label}${colors.reset}  ${colors.cyan}${value}${colors.reset}`
}

function boxBottom(): string {
  return `${colors.cyan}└${'─'.repeat(BOX_W + 1)}┘${colors.reset}`
}

/* ────────────────────────── status helpers ─────────────────────────── */

/**
 * Map git porcelain status to a coloured badge.
 * XY format: X = index status, Y = work-tree status.
 */
export function statusBadge(xy: string): string {
  const x = xy[0] ?? ' '
  const y = xy[1] ?? ' '

  if (xy === '??') return `${colors.green}NEW${colors.reset}`
  if (x === 'A') return `${colors.green}ADD${colors.reset}`
  if (x === 'D' || y === 'D') return `${colors.red}DEL${colors.reset}`
  if (x === 'R') return `${colors.yellow}REN${colors.reset}`
  if (x === 'M' || y === 'M') return `${colors.yellow}MOD${colors.reset}`
  if (x === 'C') return `${colors.blue}CPY${colors.reset}`
  return `${colors.gray}${xy.trim() || '?'}${colors.reset}`
}

/* ────────────────────────── public display ─────────────────────────── */

/**
 * Display current git configuration and Trello board info
 */
export function displayCurrentProviderStatus(): void {
  const gitInfo = withSpinnerSync('Loading git information...', () => {
    const gitUser = getGitUser()
    const remoteUrl = getRemoteUrl()
    const upstream = getUpstreamBranch()
    const trelloConfig = getTrelloConfig()

    return { gitUser, remoteUrl, upstream, trelloConfig }
  })

  console.log(boxTop('Git Information'))

  if (gitInfo.gitUser.name) {
    console.log(boxRow('User   ', gitInfo.gitUser.name))
    console.log(boxRow('Email  ', gitInfo.gitUser.email))
  }

  if (gitInfo.remoteUrl) {
    console.log(boxRow('Remote ', gitInfo.remoteUrl))
  }

  if (gitInfo.upstream) {
    console.log(boxRow('Branch ', gitInfo.upstream))
  }

  if (gitInfo.trelloConfig.boardId) {
    console.log(boxRow('Trello ', gitInfo.trelloConfig.boardId))
  }

  console.log(boxBottom())
}

/**
 * Get step name from step number
 */
export function getStepName(step: number): string {
  const STEP = {
    NONE: 0,
    STAGED: 1,
    BRANCH_CREATED: 2,
    COMMITTED: 3,
    PUSHED: 4,
    MERGED: 5,
    CLEANUP: 6,
  }

  switch (step) {
    case STEP.STAGED: {
      return 'Staging completed'
    }
    case STEP.BRANCH_CREATED: {
      return 'Branch created'
    }
    case STEP.COMMITTED: {
      return 'Commit completed'
    }
    case STEP.PUSHED: {
      return 'Push completed'
    }
    case STEP.MERGED: {
      return 'Merge completed'
    }
    case STEP.CLEANUP: {
      return 'Cleanup'
    }
    default: {
      return 'Unknown'
    }
  }
}

/**
 * Generate step progress visualization
 * Format: [1✓ 2✓ 3● 4○ 5○ 6○]
 * ✓ = completed, ● = current, ○ = pending
 */
export function getStepProgress(currentStep: number): string {
  const steps = [1, 2, 3, 4, 5, 6]
  const icons = steps.map((stepNum) => {
    if (stepNum < currentStep) {
      return `${colors.green}${stepNum}✓${colors.reset}`
    }
    if (stepNum === currentStep) {
      return `${colors.cyan}${stepNum}●${colors.reset}`
    }
    return `${colors.gray}${stepNum}○${colors.reset}`
  })
  return `[${icons.join(' ')}]`
}

/**
 * Display changed files with coloured status badges.
 */
export function displayChangedFiles(
  files: { status: string; file: string }[],
  opts?: { maxShow?: number }
): void {
  const max = opts?.maxShow ?? 12
  const shown = files.slice(0, max)

  for (const f of shown) {
    const badge = statusBadge(f.status).padEnd(14) // account for ANSI
    console.log(`  ${badge} ${f.file}`)
  }

  if (files.length > max) {
    console.log(`  ${colors.gray}… and ${files.length - max} more files${colors.reset}`)
  }
}

/**
 * Display staged files list.
 */
export function displayStagedFiles(files: string[], opts?: { maxShow?: number }): void {
  const max = opts?.maxShow ?? 12
  const shown = files.slice(0, max)

  for (const f of shown) {
    console.log(`  ${colors.green}+${colors.reset} ${f}`)
  }

  if (files.length > max) {
    console.log(`  ${colors.gray}… and ${files.length - max} more files${colors.reset}`)
  }
}

/**
 * Display enhanced workflow completion summary
 */
export function displayCompletionSummary(state: {
  stagedFiles: number
  workingBranch: string
  commitMessage?: string
  targetBranch?: string
}): void {
  console.log('')
  console.log(boxTop('Workflow Complete ✓'))

  console.log(boxRow('Files  ', String(state.stagedFiles)))
  console.log(boxRow('Branch ', state.workingBranch))

  if (state.commitMessage) {
    const truncated =
      state.commitMessage.length > 42
        ? state.commitMessage.slice(0, 39) + '...'
        : state.commitMessage
    console.log(boxRow('Commit ', truncated))
  }

  if (state.targetBranch) {
    console.log(boxRow('Merged ', state.targetBranch))
  }

  console.log(boxBottom())

  // Next steps suggestion
  if (state.targetBranch) {
    console.log(
      `\n  ${colors.gray}Next → Continue working on ${colors.cyan}${state.targetBranch}${colors.reset}`
    )
  } else {
    console.log(
      `\n  ${colors.gray}Next → Create a pull request or merge your changes${colors.reset}`
    )
  }
  console.log('')
}
