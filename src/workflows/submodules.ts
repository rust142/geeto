/**
 * Interactive git submodule manager
 * Add, list, update, remove, and sync submodules
 */

import { askQuestion, confirm } from '../cli/input.js'
import { multiSelect, select } from '../cli/menu.js'
import { colors } from '../utils/colors.js'
import { exec, execAsync, execSilent } from '../utils/exec.js'
import { log } from '../utils/logging.js'

// ─── Types ──────────────────────────────────────────────────────

interface SubmoduleInfo {
  path: string
  url: string
  branch: string
  sha: string
  status: 'up-to-date' | 'modified' | 'uninitialized' | 'conflict'
  statusIcon: string
}

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Parse `git submodule status` output into structured entries.
 * Status prefixes: ' ' = init, '-' = not init, '+' = changed, 'U' = conflict
 */
const getSubmodules = (): SubmoduleInfo[] => {
  try {
    const statusOut = execSilent('git submodule status --recursive').trim()
    if (!statusOut) return []

    return statusOut
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const prefix = line.charAt(0)
        const rest = line.slice(1).trim()
        const parts = rest.split(/\s+/)
        const sha = parts[0] ?? ''
        const subPath = parts[1] ?? ''

        let url = ''
        let branch = ''
        try {
          url = execSilent(`git config --file .gitmodules --get submodule.${subPath}.url`).trim()
          branch =
            execSilent(`git config --file .gitmodules --get submodule.${subPath}.branch`).trim() ||
            ''
        } catch {
          // .gitmodules may not have branch key
        }

        let status: SubmoduleInfo['status'] = 'up-to-date'
        let statusIcon = `${colors.green}✓${colors.reset}`

        switch (prefix) {
          case '-': {
            status = 'uninitialized'
            statusIcon = `${colors.gray}○${colors.reset}`

            break
          }
          case '+': {
            status = 'modified'
            statusIcon = `${colors.yellow}●${colors.reset}`

            break
          }
          case 'U': {
            status = 'conflict'
            statusIcon = `${colors.red}✗${colors.reset}`

            break
          }
          // No default
        }

        return { path: subPath, url, branch, sha: sha.slice(0, 8), status, statusIcon }
      })
  } catch {
    return []
  }
}

/**
 * Render submodule list with status indicators
 */
const renderSubmodules = (submodules: SubmoduleInfo[]): void => {
  for (const [i, sm] of submodules.entries()) {
    const connector = i === submodules.length - 1 ? '╰' : '├'
    const pipe = i === submodules.length - 1 ? ' ' : '│'

    const pathStr = `${colors.bright}${sm.path}${colors.reset}`
    const shaStr = `${colors.yellow}${sm.sha}${colors.reset}`
    const branchStr = sm.branch
      ? ` ${colors.gray}→${colors.reset} ${colors.green}${sm.branch}${colors.reset}`
      : ''

    console.log(
      `  ${colors.gray}${connector}─${colors.reset} ${sm.statusIcon} ${pathStr} ${shaStr}${branchStr}`
    )
    console.log(`  ${colors.gray}${pipe}${colors.reset}   ${colors.gray}${sm.url}${colors.reset}`)

    if (i < submodules.length - 1) {
      console.log(`  ${colors.gray}│${colors.reset}`)
    }
  }
}

// ─── Actions ────────────────────────────────────────────────────

const handleAdd = async (): Promise<void> => {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false)
  }
  const url = askQuestion('Repository URL: ').trim()
  if (!url) {
    log.warn('No URL provided.')
    return
  }

  const defaultPath =
    url
      .split('/')
      .pop()
      ?.replace(/\.git$/, '') ?? ''
  const subPath = askQuestion(`Path (default: ${defaultPath}): `).trim() || defaultPath

  const branch = askQuestion('Track branch (optional, press Enter to skip): ').trim()

  let cmd = `git submodule add`
  if (branch) cmd += ` -b ${branch}`
  cmd += ` "${url}" "${subPath}"`

  const spinner = log.spinner()
  spinner.start('Adding submodule...')
  try {
    await execAsync(cmd, true)
    spinner.succeed(`Submodule added at ${colors.green}${subPath}${colors.reset}`)
  } catch {
    spinner.fail('Failed to add submodule')
  }
}

const handleInit = async (submodules: SubmoduleInfo[]): Promise<void> => {
  const uninit = submodules.filter((sm) => sm.status === 'uninitialized')
  if (uninit.length === 0) {
    log.info('All submodules are already initialized.')
    return
  }

  const selected = await multiSelect(
    `Select submodules to initialize (${uninit.length} uninitialized):`,
    uninit.map((sm) => ({
      label: `${colors.gray}○${colors.reset} ${sm.path} ${colors.gray}${sm.url}${colors.reset}`,
      value: sm.path,
    })),
    uninit.map((sm) => sm.path)
  )

  if (selected.length === 0) return

  const spinner = log.spinner()
  spinner.start('Initializing submodules...')
  try {
    for (const p of selected) {
      exec(`git submodule init "${p}"`, true)
    }
    await execAsync(`git submodule update ${selected.map((p) => `"${p}"`).join(' ')}`, true)
    spinner.succeed(`${selected.length} submodule(s) initialized`)
  } catch {
    spinner.fail('Failed to initialize submodules')
  }
}

const handleUpdate = async (submodules: SubmoduleInfo[]): Promise<void> => {
  const initialized = submodules.filter((sm) => sm.status !== 'uninitialized')
  if (initialized.length === 0) {
    log.warn('No initialized submodules to update.')
    return
  }

  const mode = await select('Update mode:', [
    { label: 'Update to recorded commit (safe)', value: 'checkout' },
    { label: 'Update to latest remote (--remote)', value: 'remote' },
    { label: 'Cancel', value: 'cancel' },
  ])

  if (mode === 'cancel') return

  const scope = await select('Scope:', [
    { label: `All submodules (${initialized.length})`, value: 'all' },
    { label: 'Select specific submodules', value: 'pick' },
    { label: 'Cancel', value: 'cancel' },
  ])

  if (scope === 'cancel') return

  let targets: string[] = []

  if (scope === 'pick') {
    targets = await multiSelect(
      'Select submodules to update:',
      initialized.map((sm) => ({
        label: `${sm.statusIcon} ${sm.path} ${colors.gray}${sm.sha}${colors.reset}`,
        value: sm.path,
      }))
    )
    if (targets.length === 0) return
  }

  let cmd = 'git submodule update --recursive'
  if (mode === 'remote') cmd += ' --remote'
  if (targets.length > 0) {
    cmd += ' ' + targets.map((p) => `"${p}"`).join(' ')
  }

  const spinner = log.spinner()
  spinner.start('Updating submodules...')
  try {
    await execAsync(cmd, true)
    spinner.succeed('Submodules updated!')
  } catch {
    spinner.fail('Failed to update submodules')
  }
}

const handleRemove = async (submodules: SubmoduleInfo[]): Promise<void> => {
  if (submodules.length === 0) {
    log.warn('No submodules to remove.')
    return
  }

  const selected = await multiSelect(
    'Select submodules to remove:',
    submodules.map((sm) => ({
      label: `${sm.statusIcon} ${sm.path} ${colors.gray}${sm.url}${colors.reset}`,
      value: sm.path,
    }))
  )

  if (selected.length === 0) return

  const sure = confirm(
    `Remove ${selected.length} submodule(s)? This will deinit and delete the directories.`
  )
  if (!sure) return

  const spinner = log.spinner()
  spinner.start('Removing submodules...')
  try {
    for (const p of selected) {
      exec(`git submodule deinit -f "${p}"`, true)
      exec(`git rm -f "${p}"`, true)
      // Clean .git/modules cache
      try {
        exec(`rm -rf ".git/modules/${p}"`, true)
      } catch {
        // May not exist, ignore
      }
    }
    spinner.succeed(`${selected.length} submodule(s) removed`)
    log.info('Run `git commit` to finalize the removal.')
  } catch {
    spinner.fail('Failed to remove submodules')
  }
}

const handleSync = async (submodules: SubmoduleInfo[]): Promise<void> => {
  if (submodules.length === 0) {
    log.warn('No submodules to sync.')
    return
  }

  const scope = await select('Sync scope:', [
    { label: `All submodules (${submodules.length})`, value: 'all' },
    { label: 'Select specific submodules', value: 'pick' },
    { label: 'Cancel', value: 'cancel' },
  ])

  if (scope === 'cancel') return

  let targets: string[] = []

  if (scope === 'pick') {
    targets = await multiSelect(
      'Select submodules to sync:',
      submodules.map((sm) => ({
        label: `${sm.statusIcon} ${sm.path} ${colors.gray}${sm.url}${colors.reset}`,
        value: sm.path,
      }))
    )
    if (targets.length === 0) return
  }

  let cmd = 'git submodule sync --recursive'
  if (targets.length > 0) {
    cmd += ' ' + targets.map((p) => `"${p}"`).join(' ')
  }

  const spinner = log.spinner()
  spinner.start('Syncing submodule URLs...')
  try {
    await execAsync(cmd, true)
    spinner.succeed('Submodule URLs synced!')
    log.info('Remote URLs updated from .gitmodules to .git/config')
  } catch {
    spinner.fail('Failed to sync submodules')
  }
}

// ─── Main Handler ───────────────────────────────────────────────

export const handleSubmodules = async (): Promise<void> => {
  log.banner()
  log.step(`${colors.cyan}Submodule Manager${colors.reset}\n`)

  let keepGoing = true

  while (keepGoing) {
    const submodules = getSubmodules()
    const hasSubmodules = submodules.length > 0

    if (hasSubmodules) {
      const uninit = submodules.filter((sm) => sm.status === 'uninitialized').length
      const modified = submodules.filter((sm) => sm.status === 'modified').length

      console.log(`  ${colors.gray}╭── Submodules (${submodules.length}) ──${colors.reset}`)
      console.log(`  ${colors.gray}│${colors.reset}`)
      renderSubmodules(submodules)
      console.log('')

      if (uninit > 0 || modified > 0) {
        const parts: string[] = []
        if (uninit > 0) parts.push(`${colors.gray}${uninit} uninitialized${colors.reset}`)
        if (modified > 0) parts.push(`${colors.yellow}${modified} modified${colors.reset}`)
        log.info(parts.join('  '))
        console.log('')
      }
    } else {
      log.info('No submodules found in this repository.')
      console.log('')
    }

    const menuOptions = [
      { label: `${colors.green}+ Add${colors.reset} — add new submodule`, value: 'add' },
    ]

    if (hasSubmodules) {
      const uninit = submodules.filter((sm) => sm.status === 'uninitialized')
      if (uninit.length > 0) {
        menuOptions.push({
          label: `${colors.cyan}⚙ Init${colors.reset} — initialize submodules (${uninit.length} pending)`,
          value: 'init',
        })
      }

      menuOptions.push(
        {
          label: `${colors.yellow}⚡ Update${colors.reset} — fetch latest changes`,
          value: 'update',
        },
        {
          label: `${colors.blue}🔄 Sync${colors.reset} — sync remote URLs from .gitmodules`,
          value: 'sync',
        },
        {
          label: `${colors.red}✗ Remove${colors.reset} — deinit and delete submodules`,
          value: 'remove',
        }
      )
    }

    menuOptions.push({ label: 'Exit', value: 'exit' })

    const choice = await select('Action:', menuOptions)

    switch (choice) {
      case 'add': {
        await handleAdd()
        console.log('')
        break
      }
      case 'init': {
        await handleInit(submodules)
        console.log('')
        break
      }
      case 'update': {
        await handleUpdate(submodules)
        console.log('')
        break
      }
      case 'sync': {
        await handleSync(submodules)
        console.log('')
        break
      }
      case 'remove': {
        await handleRemove(submodules)
        console.log('')
        break
      }
      default: {
        keepGoing = false
        break
      }
    }
  }

  console.log('')
}
