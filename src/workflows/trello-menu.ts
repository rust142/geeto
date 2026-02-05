/**
 * Trello workflow menu and utilities
 */

import { fetchTrelloLists } from '../api/trello.js'
import { select } from '../cli/menu.js'
import { colors } from '../utils/colors.js'
import { getTrelloConfig, hasTrelloConfig } from '../utils/config.js'
import { log } from '../utils/logging.js'

/**
 * Display Trello lists with formatted output
 */
export const handleGetTrelloLists = async (): Promise<void> => {
  log.step('Fetching Trello Lists')

  // Check if Trello is configured
  if (!hasTrelloConfig()) {
    log.error('Trello is not configured!')
    log.info('Please run: geeto --setup-trello')
    return
  }

  const config = getTrelloConfig()
  log.info(`Board ID: ${colors.cyan}${config.boardId}${colors.reset}`)

  console.log('')
  const spinner = log.spinner()
  spinner.start('Fetching lists from Trello...')

  const lists = await fetchTrelloLists()

  if (lists.length === 0) {
    spinner.fail('No lists found or failed to fetch')
    log.warn('Make sure your Trello credentials are valid and the board exists.')
    return
  }

  spinner.succeed(`Found ${lists.length} lists`)

  log.step(`${colors.cyan}Trello Lists${colors.reset}\n`)

  for (const [index, list] of lists.entries()) {
    const num = `${index + 1}`.padStart(2, ' ')
    console.log(`  ${colors.gray}[${num}]${colors.reset} ${colors.cyan}${list.name}${colors.reset}`)
    console.log(`       ${colors.gray}ID: ${list.id}${colors.reset}`)
  }

  console.log('')
  log.success('Lists fetched successfully!')
}

/**
 * Show Trello menu
 */
export const showTrelloMenu = async (): Promise<void> => {
  log.banner()
  log.step(`${colors.cyan}Trello Tasks${colors.reset}\n`)

  // Check if Trello is configured
  if (!hasTrelloConfig()) {
    log.warn('Trello is not configured!')
    const shouldSetup = await select('Would you like to set it up now?', [
      { label: 'Yes, setup Trello', value: 'setup' },
      { label: 'No, go back', value: 'back' },
    ])

    if (shouldSetup === 'setup') {
      const { handleTrelloSetting } = await import('./settings.js')
      await handleTrelloSetting()
      // After setup, show menu again
      await showTrelloMenu()
      return
    }
    return
  }

  const choice = await select('What would you like to do?', [
    { label: 'Get Trello lists', value: 'lists' },
    { label: 'Back to main menu', value: 'back' },
  ])

  switch (choice) {
    case 'lists': {
      await handleGetTrelloLists()
      // Show menu again after action
      console.log('')
      await showTrelloMenu()
      break
    }
    case 'back': {
      // Return to main menu
      const { main } = await import('./main.js')
      await main()
      break
    }
  }
}
