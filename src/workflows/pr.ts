/**
 * Create Pull Request workflow
 * Push current branch & create a PR on GitHub
 */

import {
  createPullRequest,
  getDefaultBranch,
  listPullRequests,
  parseRepoFromUrl,
} from '../api/github.js'
import { askQuestion, confirm } from '../cli/input.js'
import { select } from '../cli/menu.js'
import { setupGithubConfigInteractive } from '../core/github-setup.js'
import { colors } from '../utils/colors.js'
import { hasGithubConfig } from '../utils/config.js'
import { exec, execSilent } from '../utils/exec.js'
import { getCurrentBranch } from '../utils/git.js'
import { log } from '../utils/logging.js'

/**
 * Get recent commit messages on current branch (for PR body)
 */
const getRecentCommits = (base: string, limit = 20): string[] => {
  try {
    const output = execSilent(`git log --no-merges --format="- %s" ${base}..HEAD -${limit}`).trim()
    if (!output) return []
    return output.split('\n').filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Get all branch names for base branch selection
 */
const getBaseBranches = (): string[] => {
  const branches: string[] = []

  try {
    const local = execSilent('git branch --format="%(refname:short)"')
    for (const name of local.split('\n').filter(Boolean)) {
      branches.push(name)
    }
  } catch {
    // Ignore
  }

  return branches
}

/**
 * Check if current branch is pushed to remote
 */
const isBranchPushed = (branch: string): boolean => {
  try {
    execSilent(`git rev-parse --verify origin/${branch}`)
    return true
  } catch {
    return false
  }
}

/**
 * Check if there are unpushed commits
 */
const hasUnpushedCommits = (branch: string): boolean => {
  try {
    const count = execSilent(`git rev-list origin/${branch}..HEAD --count`).trim()
    return Number.parseInt(count, 10) > 0
  } catch {
    return true // If remote doesn't exist, we definitely have unpushed
  }
}

/**
 * Get the first commit subject on this branch (for default title)
 */
const getFirstCommitSubject = (base: string): string => {
  try {
    return execSilent(`git log --format="%s" ${base}..HEAD --reverse -1`).trim()
  } catch {
    return ''
  }
}

/**
 * Interactive Create PR workflow
 */
export const handleCreatePR = async (): Promise<void> => {
  log.banner()
  log.step(`${colors.cyan}Create Pull Request${colors.reset}\n`)

  // Check GitHub config
  if (!hasGithubConfig()) {
    const ok = setupGithubConfigInteractive()
    if (!ok) {
      log.info('Setup cancelled. Run --setup-github later.')
      return
    }
    console.log('')
  }

  // Resolve repo info from remote
  let remoteUrl = ''
  try {
    remoteUrl = execSilent('git remote get-url origin').trim()
  } catch {
    log.error('No git remote "origin" found.')
    log.info('Add a remote: git remote add origin <url>')
    return
  }

  const repoInfo = parseRepoFromUrl(remoteUrl)
  if (!repoInfo) {
    log.error('Could not parse GitHub owner/repo from remote URL.')
    log.info(`Remote: ${remoteUrl}`)
    return
  }

  const current = getCurrentBranch()
  log.info(`Repo: ${colors.cyan}${repoInfo.owner}/${repoInfo.repo}${colors.reset}`)
  log.info(`Branch: ${colors.green}${current}${colors.reset}\n`)

  // Check for existing PR
  const spinner = log.spinner()
  spinner.start('Checking for existing PRs...')
  const existingPRs = await listPullRequests(repoInfo.owner, repoInfo.repo, current)
  spinner.stop()

  if (existingPRs.length > 0) {
    const pr = existingPRs[0]
    if (pr) {
      log.warn('An open PR already exists for this branch:')
      console.log(`  ${colors.cyan}#${pr.number}${colors.reset} ${pr.title}`)
      console.log(`  ${colors.gray}${pr.html_url}${colors.reset}\n`)

      const cont = confirm('Create another PR anyway?')
      if (!cont) return
      console.log('')
    }
  }

  // Get default branch for base
  spinner.start('Fetching repo info...')
  const defaultBranch = await getDefaultBranch(repoInfo.owner, repoInfo.repo)
  spinner.stop()

  // Select base branch
  const localBranches = getBaseBranches().filter((b) => b !== current)
  const commonBases = ['main', 'master', 'development', 'develop']

  // Sort: default branch first, then common bases, then alphabetical
  localBranches.sort((a, b) => {
    if (a === defaultBranch) return -1
    if (b === defaultBranch) return 1
    const aCommon = commonBases.indexOf(a)
    const bCommon = commonBases.indexOf(b)
    if (aCommon !== -1 && bCommon === -1) return -1
    if (bCommon !== -1 && aCommon === -1) return 1
    if (aCommon !== -1 && bCommon !== -1) return aCommon - bCommon
    return a.localeCompare(b)
  })

  const baseOptions = localBranches.map((b) => {
    const isDefault = b === defaultBranch ? ` ${colors.green}(default)${colors.reset}` : ''
    return { label: `${b}${isDefault}`, value: b }
  })

  if (baseOptions.length === 0) {
    log.error('No other branches found for base.')
    return
  }

  const baseBranch = await select('Base branch (merge into):', baseOptions)
  if (!baseBranch) return
  console.log('')

  // PR Title
  const firstCommit = getFirstCommitSubject(baseBranch)
  const defaultTitle = firstCommit || current

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false)
  }

  log.info(`Suggested title: ${colors.cyan}${defaultTitle}${colors.reset}`)
  const customTitle = askQuestion('PR title (Enter to use suggested): ').trim()
  const prTitle = customTitle || defaultTitle

  // PR Body
  console.log('')
  const commits = getRecentCommits(baseBranch)
  let prBody = ''

  if (commits.length > 0) {
    const bodyChoice = await select('PR description:', [
      { label: 'Auto-generate from commits', value: 'commits' },
      { label: 'Write custom description', value: 'custom' },
      { label: 'Empty (no description)', value: 'empty' },
    ])

    switch (bodyChoice) {
      case 'commits': {
        prBody = `## Changes\n\n${commits.join('\n')}`
        break
      }
      case 'custom': {
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false)
        }
        prBody = askQuestion('Description: ').trim()
        break
      }
      default: {
        prBody = ''
        break
      }
    }
  } else {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false)
    }
    prBody = askQuestion('Description (optional): ').trim()
  }

  // Draft?
  console.log('')
  const isDraft = await select('PR type:', [
    { label: 'Ready for review', value: 'ready' },
    { label: 'Draft', value: 'draft' },
  ])

  // Summary
  console.log('')
  console.log(`${colors.cyan}┌──────────────────────────────────────────────┐${colors.reset}`)
  console.log(`${colors.cyan}│${colors.reset} ` + `${colors.bright}PR Summary${colors.reset}`)
  console.log(`${colors.cyan}├──────────────────────────────────────────────┤${colors.reset}`)
  console.log(`${colors.cyan}│${colors.reset} Title: ${colors.bright}${prTitle}${colors.reset}`)
  console.log(
    `${colors.cyan}│${colors.reset} ` +
      `${colors.green}${current}${colors.reset} → ` +
      `${colors.cyan}${baseBranch}${colors.reset}`
  )
  console.log(
    `${colors.cyan}│${colors.reset} Type: ` +
      `${isDraft === 'draft' ? `${colors.yellow}Draft${colors.reset}` : `${colors.green}Ready${colors.reset}`}`
  )
  if (prBody) {
    const bodyPreview = prBody.length > 60 ? prBody.slice(0, 60) + '...' : prBody
    console.log(`${colors.cyan}│${colors.reset} Body: ${colors.gray}${bodyPreview}${colors.reset}`)
  }
  console.log(`${colors.cyan}└──────────────────────────────────────────────┘${colors.reset}`)

  console.log('')
  const proceed = confirm('Create this PR?')
  if (!proceed) {
    log.info('Cancelled.')
    return
  }
  console.log('')

  // Push if needed
  const pushed = isBranchPushed(current)
  if (!pushed || hasUnpushedCommits(current)) {
    const pushSpinner = log.spinner()
    pushSpinner.start(`Pushing ${current} to origin...`)
    try {
      exec(`git push -u origin ${current}`, true)
      pushSpinner.succeed(`Pushed ${current} to origin`)
    } catch {
      pushSpinner.fail('Failed to push')
      log.error('Could not push branch to remote.')
      log.info('Push manually and try again.')
      return
    }
  }

  // Create PR
  const prSpinner = log.spinner()
  prSpinner.start('Creating pull request...')

  const pr = await createPullRequest({
    owner: repoInfo.owner,
    repo: repoInfo.repo,
    title: prTitle,
    body: prBody,
    head: current,
    base: baseBranch,
    draft: isDraft === 'draft',
  })

  if (pr) {
    prSpinner.succeed('Pull request created!')
    console.log('')
    console.log(`  ${colors.green}#${pr.number}${colors.reset} ${pr.title}`)
    console.log(`  ${colors.cyan}${pr.html_url}${colors.reset}`)

    // Show clickable link
    console.log('')
    console.log(
      `  \u001B]8;;${pr.html_url}\u0007` +
        `${colors.cyan}Open in browser →${colors.reset}` +
        `\u001B]8;;\u0007`
    )
  } else {
    prSpinner.fail('Failed to create pull request')
  }
}
