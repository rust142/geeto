/**
 * Display helpers for showing git and provider status
 */

import { colors } from './colors.js'
import { getTrelloConfig } from './config.js'
import { getGitUser, getRemoteUrl, getUpstreamBranch } from './git-commands.js'
import { withSpinnerSync } from './spinner-wrapper.js'

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

  console.log(
    `${colors.cyan}┌─ Git Information ───────────────────────────────────────┐${colors.reset}`
  )

  if (gitInfo.gitUser.name) {
    console.log(
      `${colors.cyan}│${colors.reset} Username: ${colors.cyan}${gitInfo.gitUser.name}${colors.reset}`
    )
    console.log(
      `${colors.cyan}│${colors.reset} Email: ${colors.cyan}${gitInfo.gitUser.email}${colors.reset}`
    )
  }

  if (gitInfo.remoteUrl) {
    console.log(
      `${colors.cyan}│${colors.reset} Remote: ${colors.cyan}${gitInfo.remoteUrl}${colors.reset}`
    )
  }

  if (gitInfo.upstream) {
    console.log(
      `${colors.cyan}│${colors.reset} Remote branch: ${colors.cyan}${gitInfo.upstream}${colors.reset}`
    )
  }

  if (gitInfo.trelloConfig.boardId) {
    console.log(
      `${colors.cyan}│${colors.reset} Trello board: ${colors.cyan}${gitInfo.trelloConfig.boardId}${colors.reset}`
    )
  }

  console.log(
    `${colors.cyan}└─────────────────────────────────────────────────────────┘${colors.reset}`
  )
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
      return `${stepNum}✓`
    }
    if (stepNum === currentStep) {
      return `${stepNum}●`
    }
    return `${stepNum}○`
  })
  return `[${icons.join(' ')}]`
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
  console.log(`\n${colors.green}✓ Workflow Complete!${colors.reset}\n`)
  console.log(
    `${colors.cyan}┌─ Summary ───────────────────────────────────────────────┐${colors.reset}`
  )
  console.log(
    `${colors.cyan}│${colors.reset} Files staged: ${colors.bright}${state.stagedFiles}${colors.reset}`
  )
  console.log(
    `${colors.cyan}│${colors.reset} Branch: ${colors.cyan}${state.workingBranch}${colors.reset}`
  )

  if (state.commitMessage) {
    const truncated =
      state.commitMessage.length > 50
        ? state.commitMessage.slice(0, 47) + '...'
        : state.commitMessage
    console.log(`${colors.cyan}│${colors.reset} Commit: ${colors.gray}${truncated}${colors.reset}`)
  }

  if (state.targetBranch) {
    console.log(
      `${colors.cyan}│${colors.reset} Merged to: ${colors.cyan}${state.targetBranch}${colors.reset}`
    )
  }

  console.log(
    `${colors.cyan}└─────────────────────────────────────────────────────────┘${colors.reset}`
  )

  // Next steps suggestion
  if (state.targetBranch) {
    console.log(`\n${colors.gray}Next: Continue working on ${state.targetBranch}${colors.reset}\n`)
  } else {
    console.log(
      `\n${colors.gray}Next: Create a pull request or merge your changes${colors.reset}\n`
    )
  }
}
