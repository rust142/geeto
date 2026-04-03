/**
 * Release recovery — recover missing tags from release commits
 */

import { getExistingTags } from './release-utils.js'
import { confirm } from '../cli/input.js'
import { select } from '../cli/menu.js'
import { colors } from '../utils/colors.js'
import { BOX_W } from '../utils/display.js'
import { exec, execAsync } from '../utils/exec.js'
import { log } from '../utils/logging.js'
import { ScrambleProgress } from '../utils/scramble.js'

// ─── Recover missing tags ───

export const handleRecoverTags = async (): Promise<void> => {
  const line = '─'.repeat(BOX_W)

  console.log('')
  const spinner = log.spinner()
  spinner.start('Scanning release commits...')

  // Find all release commits: "chore(release): vX.Y.Z"
  let gitLog: string
  try {
    gitLog = exec('git log --all --oneline --grep="^chore(release): v" --format="%H %s"', true)
  } catch {
    spinner.fail('Failed to scan git log')
    return
  }

  const releasePattern = /^([a-f0-9]+) chore\(release\): v(.+)$/
  const releaseCommits: { hash: string; version: string; tag: string }[] = []

  for (const logLine of gitLog.split('\n').filter(Boolean)) {
    const match = logLine.match(releasePattern)
    if (match?.[1] && match[2]) {
      releaseCommits.push({
        hash: match[1],
        version: match[2],
        tag: `v${match[2]}`,
      })
    }
  }

  if (releaseCommits.length === 0) {
    spinner.fail('No release commits found')
    return
  }

  // Compare with existing tags
  const existingTags = new Set(getExistingTags())
  const missingTags = releaseCommits.filter((rc) => !existingTags.has(rc.tag))

  spinner.succeed(`Found ${releaseCommits.length} release commits, ${existingTags.size} tags`)

  if (missingTags.length === 0) {
    console.log('')
    log.success('All release commits have matching tags! Nothing to recover.')
    return
  }

  // Show missing tags
  console.log('')
  log.info(
    `${colors.bright}${missingTags.length}${colors.reset} tags missing (release commit exists but no tag):`
  )
  for (const mt of missingTags) {
    console.log(
      `  ${colors.yellow}${mt.tag}${colors.reset} ${colors.gray}← ${mt.hash.slice(0, 7)}${colors.reset}`
    )
  }

  console.log('')
  const action = await select('What do you want to do?', [
    { label: 'Recover all missing tags', value: 'all' },
    { label: 'Select which tags to recover', value: 'select' },
    { label: 'Cancel', value: 'cancel' },
  ])

  if (action === 'cancel') return

  let tagsToRecover = missingTags

  if (action === 'select') {
    const { multiSelect } = await import('../cli/menu.js')
    const choices = missingTags.map((mt) => ({
      label: `${mt.tag} (${mt.hash.slice(0, 7)})`,
      value: mt.tag,
    }))
    const selected = await multiSelect('Select tags to recover:', choices)
    if (selected.length === 0) {
      log.info('No tags selected.')
      return
    }
    tagsToRecover = missingTags.filter((mt) => selected.includes(mt.tag))
  }

  // Preview
  console.log('')
  console.log(`${colors.cyan}┌${line}┐${colors.reset}`)
  console.log(`${colors.cyan}│${colors.reset} ${colors.bright}Recovery Plan${colors.reset}`)
  console.log(`${colors.cyan}├${line}┤${colors.reset}`)
  for (const mt of tagsToRecover) {
    console.log(
      `${colors.cyan}│${colors.reset}  ${colors.green}+${colors.reset} ${colors.yellow}${mt.tag}${colors.reset} → commit ${colors.gray}${mt.hash.slice(0, 7)}${colors.reset}`
    )
  }
  console.log(`${colors.cyan}└${line}┘${colors.reset}`)

  console.log('')
  const proceed = confirm(`Create ${tagsToRecover.length} tags?`)
  if (!proceed) return

  let successCount = 0

  for (const mt of tagsToRecover) {
    console.log('')
    const tagSpinner = log.spinner()
    tagSpinner.start(`Creating tag ${colors.yellow}${mt.tag}${colors.reset}...`)

    try {
      exec(`git tag -a ${mt.tag} ${mt.hash} -m "Release ${mt.tag}"`, true)
      tagSpinner.succeed(`Tag ${mt.tag} created`)
      successCount++
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      tagSpinner.fail(`Failed to create ${mt.tag}`)
      log.error(`  ${errMsg.split('\n')[0]}`)
    }
  }

  console.log('')
  if (successCount === tagsToRecover.length) {
    log.success(`All ${successCount} tags recovered!`)
  } else {
    log.warn(`${successCount}/${tagsToRecover.length} tags recovered`)
  }

  // Offer to push tags to remote
  if (successCount > 0) {
    console.log('')
    const pushTags = confirm('Push recovered tags to remote?')
    if (pushTags) {
      console.log('')
      const pushSpinner = new ScrambleProgress()
      pushSpinner.start(['Pushing tags to remote'])
      try {
        await execAsync('git push --tags --no-verify', true)
        pushSpinner.succeed('Tags pushed to remote')
      } catch (error) {
        const stderr = (error as { stderr?: string }).stderr?.trim()
        pushSpinner.fail('Failed to push tags')
        if (stderr) log.error(`  ${stderr.split('\n')[0]}`)
      }
    }
  }
}
