/**
 * Commit amend workflow
 * Quick amend last commit message or contents
 */

import { askQuestion, confirm } from '../cli/input.js'
import { multiSelect, select } from '../cli/menu.js'
import { colors } from '../utils/colors.js'
import { exec, execSilent } from '../utils/exec.js'
import { getCurrentBranch } from '../utils/git.js'
import { log } from '../utils/logging.js'

/**
 * Get last commit info
 */
const getLastCommit = (): {
  hash: string
  shortHash: string
  subject: string
  body: string
  author: string
  date: string
} | null => {
  try {
    const sep = '<<GTO>>'
    const output = execSilent(
      `git log -1 --format="%H${sep}%h${sep}%s${sep}%b${sep}%an${sep}%cr"`
    ).trim()
    if (!output) return null

    const parts = output.split(sep)
    return {
      hash: parts[0] ?? '',
      shortHash: parts[1] ?? '',
      subject: parts[2] ?? '',
      body: (parts[3] ?? '').trim(),
      author: parts[4] ?? '',
      date: parts[5] ?? '',
    }
  } catch {
    return null
  }
}

/**
 * Get files changed in the last commit
 */
const getLastCommitFiles = (): string[] => {
  try {
    return execSilent('git diff-tree --no-commit-id --name-only -r HEAD')
      .trim()
      .split('\n')
      .filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Get current working tree changes
 */
const getWorkingChanges = (): Array<{ status: string; file: string }> => {
  try {
    const output = execSilent('git status --porcelain').trim()
    if (!output) return []
    return output
      .split('\n')
      .filter(Boolean)
      .map((line) => ({
        status: line.slice(0, 2).trim(),
        file: line.slice(3),
      }))
  } catch {
    return []
  }
}

/**
 * Interactive commit amend
 */
export const handleAmend = async (): Promise<void> => {
  log.banner()
  log.step(`${colors.cyan}Commit Amend${colors.reset}\n`)

  const current = getCurrentBranch()
  const lastCommit = getLastCommit()

  if (!lastCommit) {
    log.warn('No commits found on this branch.')
    return
  }

  // Show last commit info
  const line = '─'.repeat(56)
  console.log(`${colors.cyan}┌${line}┐${colors.reset}`)
  console.log(
    `${colors.cyan}│${colors.reset} ${colors.bright}Last commit on ${colors.green}${current}${colors.reset}`
  )
  console.log(`${colors.cyan}├${line}┤${colors.reset}`)
  console.log(
    `${colors.cyan}│${colors.reset} ${colors.yellow}${lastCommit.shortHash}${colors.reset} ${colors.bright}${lastCommit.subject}${colors.reset}`
  )
  if (lastCommit.body) {
    const bodyLines = lastCommit.body.split('\n').slice(0, 3)
    for (const bodyLine of bodyLines) {
      console.log(`${colors.cyan}│${colors.reset}   ${colors.gray}${bodyLine}${colors.reset}`)
    }
  }
  console.log(
    `${colors.cyan}│${colors.reset} ${colors.blue}${lastCommit.author}${colors.reset} ${colors.gray}· ${lastCommit.date}${colors.reset}`
  )

  // Show files in last commit
  const commitFiles = getLastCommitFiles()
  if (commitFiles.length > 0) {
    console.log(`${colors.cyan}│${colors.reset}`)
    console.log(`${colors.cyan}│${colors.reset} ${colors.gray}Files:${colors.reset}`)
    const shown = commitFiles.slice(0, 8)
    for (const f of shown) {
      console.log(`${colors.cyan}│${colors.reset}   ${colors.gray}${f}${colors.reset}`)
    }
    if (commitFiles.length > 8) {
      console.log(
        `${colors.cyan}│${colors.reset}   ${colors.gray}... and ${commitFiles.length - 8} more${colors.reset}`
      )
    }
  }
  console.log(`${colors.cyan}└${line}┘${colors.reset}`)

  // Check for pushed commits warning
  try {
    const pushed = execSilent(`git rev-list origin/${current}..HEAD --count`).trim()
    if (pushed === '0') {
      console.log('')
      log.warn('This commit has already been pushed to remote!')
      log.warn('Amending will require a force push.')
      const cont = confirm('Continue anyway?')
      if (!cont) return
    }
  } catch {
    // No remote tracking, safe to amend
  }

  // Amend options
  console.log('')
  const action = await select('What to amend?', [
    { label: 'Reword — change commit message only', value: 'reword' },
    { label: 'Add files — stage more files into the commit', value: 'add-files' },
    { label: 'Both — change message and add files', value: 'both' },
    { label: 'Cancel', value: 'cancel' },
  ])

  if (action === 'cancel') return

  // Handle adding files
  if (action === 'add-files' || action === 'both') {
    const changes = getWorkingChanges()
    if (changes.length === 0) {
      log.info('No pending changes to add.')
      if (action === 'add-files') return
    } else {
      console.log('')
      const fileOptions = changes.map((c) => {
        let statusIcon: string = colors.gray
        if (c.status.includes('M')) statusIcon = colors.yellow
        if (c.status.includes('A') || c.status.includes('?')) statusIcon = colors.green
        if (c.status.includes('D')) statusIcon = colors.red
        return {
          label: `${statusIcon}${c.status}${colors.reset} ${c.file}`,
          value: c.file,
        }
      })

      const selectedFiles = await multiSelect('Add files to commit:', fileOptions)

      if (selectedFiles.length > 0) {
        const spinner = log.spinner()
        spinner.start('Staging files...')
        for (const file of selectedFiles) {
          exec(`git add "${file}"`, true)
        }
        spinner.succeed(`Staged ${selectedFiles.length} files`)
      } else if (action === 'add-files') {
        log.info('No files selected.')
        return
      }
    }
  }

  // Handle reword
  let newMessage = ''
  if (action === 'reword' || action === 'both') {
    console.log('')
    log.info(`Current message: ${colors.bright}${lastCommit.subject}${colors.reset}`)
    if (lastCommit.body) {
      log.info(`Body: ${colors.gray}${lastCommit.body.split('\n')[0]}${colors.reset}`)
    }
    console.log('')

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false)
    }

    newMessage = askQuestion('New commit message (Enter to keep current): ').trim()
  }

  // Confirm
  console.log('')
  const amendDesc = []
  if (newMessage) amendDesc.push(`message → "${newMessage}"`)
  if (action === 'add-files' || action === 'both') amendDesc.push('add staged files')
  if (amendDesc.length === 0 && !newMessage)
    amendDesc.push('keep current message, add staged files')

  log.info(`Amending: ${colors.cyan}${amendDesc.join(' + ')}${colors.reset}`)
  const doIt = confirm('Proceed?')
  if (!doIt) {
    log.info('Cancelled.')
    return
  }

  // Execute amend
  const spinner = log.spinner()
  spinner.start('Amending commit...')

  try {
    if (newMessage) {
      exec(`git commit --amend -m "${newMessage}"`, true)
    } else {
      exec('git commit --amend --no-edit', true)
    }
    spinner.succeed('Commit amended!')

    // Show updated commit
    const updated = getLastCommit()
    if (updated) {
      console.log('')
      console.log(
        `  ${colors.yellow}${updated.shortHash}${colors.reset} ${colors.bright}${updated.subject}${colors.reset}`
      )
    }

    // Offer force push if remote exists
    try {
      execSilent(`git rev-parse --verify origin/${current}`)
      console.log('')
      const forcePush = confirm('Force push to update remote?')
      if (forcePush) {
        const pushSpinner = log.spinner()
        pushSpinner.start('Force pushing...')
        try {
          exec(`git push --force-with-lease origin ${current}`, true)
          pushSpinner.succeed('Force pushed!')
        } catch {
          pushSpinner.fail('Failed to force push')
        }
      }
    } catch {
      // No remote, skip
    }
  } catch {
    spinner.fail('Failed to amend commit')
  }
}
