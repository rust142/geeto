/**
 * Dry-run interactive menu — pick a command to simulate.
 */

import { select } from '../cli/menu.js'
import { printDryRunBanner, printDryRunSummary, setDryRun } from '../utils/dry-run.js'
import { log } from '../utils/logging.js'

const DRY_RUN_COMMANDS = [
  { label: 'Cleanup branches', value: 'cleanup' },
  { label: 'Commit with AI message', value: 'commit' },
  { label: 'Push to remote', value: 'push' },
  { label: 'Amend last commit', value: 'amend' },
  { label: 'Undo last action', value: 'undo' },
  { label: 'Cherry-pick commits', value: 'cherry-pick' },
  { label: 'Stash management', value: 'stash' },
  { label: 'Pull from remote', value: 'pull' },
  { label: 'Create branch with AI', value: 'branch' },
  { label: 'Merge branches', value: 'merge' },
  { label: 'Release & tag', value: 'release' },
  { label: 'Create Pull Request', value: 'pr' },
  { label: 'Create Issue', value: 'issue' },
  { label: 'Repo settings', value: 'repo' },
  { label: 'Prune stale branches', value: 'prune' },
]

export const handleDryRunMenu = async (): Promise<void> => {
  log.banner()
  log.step('Dry-Run Mode')
  log.info('Pick a command to simulate — no changes will be made.\n')

  const choice = await select('Which command to dry-run?', DRY_RUN_COMMANDS)

  setDryRun(true)
  printDryRunBanner()

  try {
    switch (choice) {
      case 'cleanup': {
        const m = await import('./cleanup.js')
        await m.handleInteractiveCleanup()
        break
      }
      case 'commit': {
        const m = await import('./main.js')
        await m.main({ startAt: 'commit' })
        break
      }
      case 'push': {
        const m = await import('./main.js')
        await m.main({ startAt: 'push' })
        break
      }
      case 'amend': {
        const m = await import('./amend.js')
        await m.handleAmend()
        break
      }
      case 'undo': {
        const m = await import('./undo.js')
        await m.handleUndo()
        break
      }
      case 'cherry-pick': {
        const m = await import('./cherry-pick.js')
        await m.handleCherryPick()
        break
      }
      case 'stash': {
        const m = await import('./stash.js')
        await m.handleStash()
        break
      }
      case 'pull': {
        const m = await import('./pull.js')
        await m.handlePull()
        break
      }
      case 'branch': {
        const m = await import('./main.js')
        await m.main({ startAt: 'branch' })
        break
      }
      case 'merge': {
        const m = await import('./main.js')
        await m.main({ startAt: 'merge' })
        break
      }
      case 'release': {
        const m = await import('./release.js')
        await m.handleRelease()
        break
      }
      case 'pr': {
        const m = await import('./pr.js')
        await m.handleCreatePR()
        break
      }
      case 'issue': {
        const m = await import('./issue.js')
        await m.handleCreateIssue()
        break
      }
      case 'repo': {
        const m = await import('./repo-settings.js')
        await m.handleRepoSettings()
        break
      }
      case 'prune': {
        const m = await import('./prune.js')
        await m.handlePrune()
        break
      }
    }
  } catch (error) {
    log.error(`Dry-run workflow failed: ${error}`)
  }

  printDryRunSummary()
}
