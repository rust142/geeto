/**
 * Create GitHub Issue workflow
 * Interactive issue creation from CLI
 */

import { createIssue, listLabels, parseRepoFromUrl } from '../api/github.js'
import { askQuestion, confirm } from '../cli/input.js'
import { multiSelect, select } from '../cli/menu.js'
import { setupGithubConfigInteractive } from '../core/github-setup.js'
import { colors } from '../utils/colors.js'
import { hasGithubConfig } from '../utils/config.js'
import { execSilent } from '../utils/exec.js'
import { log } from '../utils/logging.js'

/**
 * Interactive Create Issue workflow
 */
export const handleCreateIssue = async (): Promise<void> => {
  log.banner()
  log.step(`${colors.cyan}Create GitHub Issue${colors.reset}\n`)

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

  log.info(`Repo: ${colors.cyan}${repoInfo.owner}/${repoInfo.repo}${colors.reset}\n`)

  // Issue Title
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false)
  }

  const title = askQuestion('Issue title: ').trim()
  if (!title) {
    log.error('Title is required.')
    return
  }

  // Issue Body
  console.log('')
  const bodyChoice = await select('Issue description:', [
    { label: 'Write description', value: 'write' },
    { label: 'Use template (Bug Report)', value: 'bug' },
    { label: 'Use template (Feature Request)', value: 'feature' },
    { label: 'Empty (no description)', value: 'empty' },
  ])

  let body = ''

  switch (bodyChoice) {
    case 'write': {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false)
      }
      body = askQuestion('Description: ').trim()
      break
    }
    case 'bug': {
      body = [
        '## Bug Report',
        '',
        '### Description',
        'A clear description of what the bug is.',
        '',
        '### Steps to Reproduce',
        '1. ',
        '2. ',
        '3. ',
        '',
        '### Expected Behavior',
        '',
        '',
        '### Actual Behavior',
        '',
        '',
        '### Environment',
        `- OS: ${process.platform}`,
        `- Node: ${process.version}`,
      ].join('\n')
      log.info('Bug report template applied. Edit in GitHub after creation.')
      break
    }
    case 'feature': {
      body = [
        '## Feature Request',
        '',
        '### Description',
        'A clear description of the feature you want.',
        '',
        '### Motivation',
        'Why is this feature needed?',
        '',
        '### Proposed Solution',
        '',
        '',
        '### Alternatives Considered',
        '',
      ].join('\n')
      log.info('Feature request template applied. Edit in GitHub after creation.')
      break
    }
    default: {
      body = ''
      break
    }
  }

  // Labels
  console.log('')
  const spinner = log.spinner()
  spinner.start('Fetching labels...')
  const labels = await listLabels(repoInfo.owner, repoInfo.repo)
  spinner.stop()

  let selectedLabels: string[] = []

  if (labels.length > 0) {
    const labelOptions = labels.map((l) => ({
      label: `${l.name}${l.description ? ` ${colors.gray}— ${l.description}${colors.reset}` : ''}`,
      value: l.name,
    }))

    selectedLabels = await multiSelect('Add labels (optional):', labelOptions)
  }

  // Assignees
  console.log('')
  const assignChoice = await select('Assign to:', [
    { label: 'No one', value: 'none' },
    { label: 'Me (repo owner)', value: 'me' },
    { label: 'Custom username', value: 'custom' },
  ])

  let assignees: string[] = []
  switch (assignChoice) {
    case 'me': {
      assignees = [repoInfo.owner]
      break
    }
    case 'custom': {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false)
      }
      const username = askQuestion('GitHub username: ').trim()
      if (username) assignees = [username]
      break
    }
    default: {
      break
    }
  }

  // Summary
  console.log('')
  console.log(`${colors.cyan}┌──────────────────────────────────────────────┐${colors.reset}`)
  console.log(`${colors.cyan}│${colors.reset} ${colors.bright}Issue Summary${colors.reset}`)
  console.log(`${colors.cyan}├──────────────────────────────────────────────┤${colors.reset}`)
  console.log(`${colors.cyan}│${colors.reset} Title: ${colors.bright}${title}${colors.reset}`)
  if (body) {
    const bodyPreview = body.length > 50 ? body.slice(0, 50) + '...' : body
    const cleanPreview = bodyPreview.replaceAll('\n', ' ')
    console.log(`${colors.cyan}│${colors.reset} Body: ${colors.gray}${cleanPreview}${colors.reset}`)
  }
  if (selectedLabels.length > 0) {
    console.log(
      `${colors.cyan}│${colors.reset} Labels: ${colors.yellow}${selectedLabels.join(', ')}${colors.reset}`
    )
  }
  if (assignees.length > 0) {
    console.log(
      `${colors.cyan}│${colors.reset} Assignee: ${colors.green}${assignees.join(', ')}${colors.reset}`
    )
  }
  console.log(`${colors.cyan}└──────────────────────────────────────────────┘${colors.reset}`)

  console.log('')
  const proceed = confirm('Create this issue?')
  if (!proceed) {
    log.info('Cancelled.')
    return
  }
  console.log('')

  // Create Issue
  const issueSpinner = log.spinner()
  issueSpinner.start('Creating issue...')

  const issue = await createIssue({
    owner: repoInfo.owner,
    repo: repoInfo.repo,
    title,
    body,
    labels: selectedLabels,
    assignees,
  })

  if (issue) {
    issueSpinner.succeed('Issue created!')
    console.log('')
    console.log(`  ${colors.green}#${issue.number}${colors.reset} ${issue.title}`)
    console.log(`  ${colors.cyan}${issue.html_url}${colors.reset}`)

    // OSC 8 clickable link
    console.log('')
    console.log(
      `  \u001B]8;;${issue.html_url}\u0007` +
        `${colors.cyan}Open in browser →${colors.reset}` +
        `\u001B]8;;\u0007`
    )
  } else {
    issueSpinner.fail('Failed to create issue')
  }
}
