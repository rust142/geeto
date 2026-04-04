/**
 * Trello workflow menu and utilities
 */

import fs from 'node:fs'
import path from 'node:path'

import { fetchTrelloCards, fetchTrelloLists } from '../api/trello.js'
import { multiSelect, select } from '../cli/menu.js'
import { colors } from '../utils/colors.js'
import { hasTrelloConfig } from '../utils/config.js'
import { commandExists, exec } from '../utils/exec.js'
import { log } from '../utils/logging.js'

/**
 * Generate individual task files from selected Trello list cards
 * Creates tasks/ directory with README.md (AI instructions) + card-{id}-{slug}.md per card
 */
export const handleGenerateTaskInstructions = async (): Promise<void> => {
  log.step('Generate Task Instructions')

  // Check if Trello is configured
  if (!hasTrelloConfig()) {
    log.error('Trello is not configured!')
    log.info('Please run: geeto --setup-trello')
    return
  }

  // Fetch lists
  console.log('')
  const spinner = log.spinner()
  spinner.start('Fetching Trello lists...')
  const lists = await fetchTrelloLists()

  if (lists.length === 0) {
    spinner.fail('No lists found')
    log.warn('Make sure your Trello credentials are valid and the board exists.')
    return
  }

  spinner.succeed(`Found ${lists.length} lists`)

  // Let user select a list
  const listChoices = lists.map((list) => ({
    label: list.name,
    value: list.id,
  }))
  listChoices.push({ label: 'Cancel', value: 'cancel' })

  const selectedListId = await select('Select a Trello list to generate tasks from:', listChoices)

  if (selectedListId === 'cancel') {
    log.info('Cancelled.')
    return
  }

  const selectedList = lists.find((l) => l.id === selectedListId)
  if (!selectedList) {
    log.error('List not found')
    return
  }

  // Fetch cards from selected list
  console.log('')
  const spinner2 = log.spinner()
  spinner2.start(`Fetching cards from "${selectedList.name}"...`)
  const allCards = await fetchTrelloCards(selectedListId)

  if (allCards.length === 0) {
    spinner2.fail('No cards found in this list')
    log.warn('The selected list is empty or all cards are marked as [DONE]/[ARCHIVED].')
    return
  }

  spinner2.succeed(`Found ${allCards.length} cards`)
  console.log('')

  const toSlug = (name: string): string =>
    name
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/^-|-$/g, '')
      .slice(0, 50)

  const cardChoices = allCards.map((card) => ({
    label: `${card.shortLink}-${toSlug(card.name)}`,
    value: card.id,
  }))

  const selectedCardIds = await multiSelect(
    'Select cards to include in tasks instruction:',
    cardChoices
  )

  if (selectedCardIds.length === 0) {
    log.warn('No cards selected. Cancelled.')
    return
  }

  // Filter only selected cards (preserve original order)
  const cards = allCards.filter((card) => selectedCardIds.includes(card.id))

  log.success(`Selected ${colors.cyan}${cards.length}${colors.reset} of ${allCards.length} cards`)

  // Detect editor from terminal environment to determine output path
  let editorCommand: string | null = null
  let tasksDir: string

  const termProgram = process.env.TERM_PROGRAM
  const vsCodeHandle = process.env.VSCODE_GIT_IPC_HANDLE
  const vsCodeInjection = process.env.VSCODE_INJECTION
  const cursorExecutable = process.env.CURSOR_EXECUTABLE

  if (cursorExecutable || termProgram === 'cursor') {
    // Running in Cursor terminal - save to .cursor/tasks/
    tasksDir = path.join(process.cwd(), '.cursor', 'tasks')
    if (commandExists('cursor')) {
      editorCommand = 'cursor'
    }
  } else if (vsCodeHandle || vsCodeInjection || termProgram === 'vscode') {
    // Running in VSCode terminal - save to .github/instructions/tasks/
    tasksDir = path.join(process.cwd(), '.github', 'instructions', 'tasks')
    if (commandExists('code')) {
      editorCommand = 'code'
    }
  } else if (termProgram?.toLowerCase().includes('jetbrains')) {
    // Running in JetBrains IDE terminal - save to .idea/tasks/
    tasksDir = path.join(process.cwd(), '.idea', 'tasks')
    const jetbrainsCommands = ['webstorm', 'idea', 'pycharm', 'phpstorm', 'rubymine', 'goland']
    for (const cmd of jetbrainsCommands) {
      if (commandExists(cmd)) {
        editorCommand = cmd
        break
      }
    }
  } else {
    // Fallback - save to .github/instructions/tasks/
    tasksDir = path.join(process.cwd(), '.github', 'instructions', 'tasks')
  }

  // Write task files
  try {
    // Create tasks directory if it doesn't exist
    if (!fs.existsSync(tasksDir)) {
      fs.mkdirSync(tasksDir, { recursive: true })
    }

    // Write individual card files in tasks/ folder
    for (const card of cards) {
      const slug = toSlug(card.name)
      const fileName = `card-${card.idShort}-${slug}.md`

      let cardContent = `# Task: ${card.name} (#${card.idShort})

- Trello URL: ${card.url}

## Description

${card.desc?.trim() ? card.desc : 'No description provided.'}

## Checklists

`

      if (card.checklists && card.checklists.length > 0) {
        let hasChecklistItems = false
        for (const checklist of card.checklists) {
          if (checklist.checkItems && checklist.checkItems.length > 0) {
            hasChecklistItems = true
            cardContent += `### ${checklist.name}\n\n`
            for (const item of checklist.checkItems) {
              const checked = item.state === 'complete' ? 'x' : ' '
              cardContent += `- [${checked}] ${item.name}\n`
            }
            cardContent += '\n'
          }
        }
        if (!hasChecklistItems) {
          cardContent += 'No checklists.\n'
        }
      } else {
        cardContent += 'No checklists.\n'
      }

      fs.writeFileSync(path.join(tasksDir, fileName), cardContent, 'utf8')
      log.info(`Written: ${colors.cyan}${fileName}${colors.reset}`)
    }

    console.log('')
    log.success(
      `Generated ${colors.cyan}${cards.length}${colors.reset} task files in ${colors.cyan}${tasksDir}${colors.reset}`
    )

    // Auto-open tasks directory in detected editor
    if (editorCommand) {
      try {
        exec(`${editorCommand} "${tasksDir}"`, true)
        log.info(`Opening tasks directory in ${editorCommand}...`)
      } catch {
        // Ignore open errors (not critical)
      }
    }

    // Add to .gitignore if not already there
    const gitignorePath = path.join(process.cwd(), '.gitignore')
    try {
      let gitignoreContent = ''
      if (fs.existsSync(gitignorePath)) {
        gitignoreContent = fs.readFileSync(gitignorePath, 'utf8')
      }

      // Check if Trello-generated tasks section already exists
      const lines = gitignoreContent.split('\n')
      const hasTrelloSection = lines.some((line) => line.trim() === '# Trello-generated tasks')

      if (!hasTrelloSection) {
        // Add complete Trello-generated tasks section to .gitignore
        const trelloSection = `\n# Trello-generated tasks\n**/tasks/card-*.md\n`
        const newContent = gitignoreContent.endsWith('\n')
          ? `${gitignoreContent}${trelloSection}`
          : `${gitignoreContent}${trelloSection}`
        fs.writeFileSync(gitignorePath, newContent, 'utf8')
        log.success('Added Trello-generated tasks section to .gitignore')
      }
    } catch (gitignoreError) {
      // Ignore gitignore errors (not critical)
      log.warn(
        `Could not update .gitignore: ${gitignoreError instanceof Error ? gitignoreError.message : String(gitignoreError)}`
      )
    }
  } catch (error) {
    log.error(`Failed to write files: ${error instanceof Error ? error.message : String(error)}`)
  }
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
    { label: 'Generate task files from cards', value: 'generate' },
    { label: 'Back to main menu', value: 'back' },
  ])

  switch (choice) {
    case 'generate': {
      await handleGenerateTaskInstructions()
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
