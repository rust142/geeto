/**
 * Trello workflow menu and utilities
 */

import fs from 'node:fs'
import path from 'node:path'

import {
  addLabelToCard,
  archiveTrelloCard,
  createTrelloCard,
  createTrelloLabel,
  deleteTrelloCard,
  deleteTrelloLabel,
  fetchTrelloCards,
  fetchTrelloLabels,
  fetchTrelloLists,
  moveTrelloCard,
  removeLabelFromCard,
  TRELLO_LABEL_COLORS,
  updateTrelloCard,
  updateTrelloLabel,
} from '../api/trello.js'
import { askQuestion, editMultiline } from '../cli/input.js'
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
// ── helpers ────────────────────────────────────────────────────────────────

const pickList = async (): Promise<string | null> => {
  const spinner = log.spinner()
  spinner.start('Fetching lists...')
  const lists = await fetchTrelloLists()
  spinner.stop()
  if (lists.length === 0) {
    log.warn('No lists found.')
    return null
  }
  const choice = await select('Select list:', [
    ...lists.map((l) => ({ label: l.name, value: l.id })),
    { label: 'Cancel', value: 'cancel' },
  ])
  return choice === 'cancel' ? null : choice
}

const pickCard = async (
  listId?: string
): Promise<import('../types/index.js').TrelloCard | null> => {
  const spinner = log.spinner()
  spinner.start('Fetching cards...')
  const cards = await fetchTrelloCards(listId)
  spinner.stop()
  if (cards.length === 0) {
    log.warn('No cards found.')
    return null
  }
  const toSlug = (n: string) =>
    n
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/^-|-$/g, '')
      .slice(0, 40)
  const choice = await select('Select card:', [
    ...cards.map((c) => ({ label: `#${c.idShort} ${c.name.slice(0, 50)}`, value: c.id })),
    { label: 'Cancel', value: 'cancel' },
  ])
  if (choice === 'cancel') return null
  return cards.find((c) => c.id === choice) ?? null
  void toSlug
}

const pickLabel = async (
  fromCard?: import('../types/index.js').TrelloCard
): Promise<string | null> => {
  const spinner = log.spinner()
  spinner.start('Fetching labels...')
  const labels = fromCard?.labels ?? (await fetchTrelloLabels())
  spinner.stop()
  if (!Array.isArray(labels) || labels.length === 0) {
    log.warn('No labels found.')
    return null
  }
  const choice = await select('Select label:', [
    ...(labels as import('../types/index.js').TrelloLabel[]).map((l) => ({
      label: `${l.color ?? 'no color'}  ${l.name || '(unnamed)'}`,
      value: l.id,
    })),
    { label: 'Cancel', value: 'cancel' },
  ])
  return choice === 'cancel' ? null : choice
}

// ── card actions (after card selected) ────────────────────────────────────

const showCardActions = async (card: import('../types/index.js').TrelloCard): Promise<void> => {
  let current = card
  while (true) {
    const labelCount = (current.labels ?? []).length
    const action = await select(`#${current.idShort} ${current.name.slice(0, 50)}:`, [
      { label: 'Edit name', value: 'edit-name' },
      { label: 'Edit description', value: 'edit-desc' },
      { label: 'Move to list', value: 'move' },
      { label: `Labels (${labelCount} attached)`, value: 'labels' },
      { label: 'Archive', value: 'archive' },
      { label: 'Delete', value: 'delete' },
      { label: 'Back', value: 'back' },
    ])

    if (action === 'back') return

    if (action === 'edit-name') {
      log.info(`Current name: ${current.name}`)
      const value = askQuestion('New name: ').trim()
      if (!value) {
        log.warn('No input.')
        continue
      }
      const spinner = log.spinner()
      spinner.start('Updating...')
      const ok = await updateTrelloCard(current.id, { name: value })
      spinner.stop()
      if (ok) {
        current = { ...current, name: value }
        log.success('Name updated.')
      } else log.error('Failed.')
      continue
    }

    if (action === 'edit-desc') {
      const value = await editMultiline('Edit Description', current.desc ?? '')
      if (value === null) {
        log.info('Cancelled.')
        continue
      }
      const spinner = log.spinner()
      spinner.start('Updating...')
      const ok = await updateTrelloCard(current.id, { desc: value })
      spinner.stop()
      if (ok) {
        current = { ...current, desc: value }
        log.success('Description updated.')
      } else log.error('Failed.')
      continue
    }

    if (action === 'move') {
      const destListId = await pickList()
      if (!destListId) continue
      const spinner = log.spinner()
      spinner.start('Moving...')
      const ok = await moveTrelloCard(current.id, destListId)
      spinner.stop()
      if (ok) {
        current = { ...current, idList: destListId }
        log.success('Card moved.')
      } else log.error('Failed.')
      continue
    }

    if (action === 'labels') {
      const labelAction = await select(`Labels (${labelCount} attached):`, [
        { label: 'Add label', value: 'add' },
        { label: 'Remove label', value: 'remove' },
        { label: 'Back', value: 'back' },
      ])
      if (labelAction === 'back') continue

      if (labelAction === 'add') {
        const spinnerL = log.spinner()
        spinnerL.start('Fetching board labels...')
        const boardLabels = await fetchTrelloLabels()
        spinnerL.stop()
        if (boardLabels.length === 0) {
          log.warn('No labels on board.')
          continue
        }
        const labelId = await pickLabel({ ...current, labels: boardLabels })
        if (!labelId) continue
        const spinner = log.spinner()
        spinner.start('Adding label...')
        const ok = await addLabelToCard(current.id, labelId)
        spinner.stop()
        if (ok) {
          const added = boardLabels.find((l) => l.id === labelId)
          if (added) current = { ...current, labels: [...(current.labels ?? []), added] }
          log.success('Label added.')
        } else log.error('Failed.')
      } else {
        if (!current.labels || current.labels.length === 0) {
          log.warn('No labels on this card.')
          continue
        }
        const labelId = await pickLabel(current)
        if (!labelId) continue
        const spinner = log.spinner()
        spinner.start('Removing label...')
        const ok = await removeLabelFromCard(current.id, labelId)
        spinner.stop()
        if (ok) {
          current = { ...current, labels: current.labels.filter((l) => l.id !== labelId) }
          log.success('Label removed.')
        } else log.error('Failed.')
      }
      continue
    }

    if (action === 'archive') {
      const spinner = log.spinner()
      spinner.start('Archiving...')
      const ok = await archiveTrelloCard(current.id)
      spinner.stop()
      log.success(ok ? 'Card archived.' : 'Failed.')
      return
    }

    if (action === 'delete') {
      const confirmInput = askQuestion('Type YES to confirm delete: ').trim()
      if (confirmInput !== 'YES') {
        log.info('Cancelled.')
        continue
      }
      const spinner = log.spinner()
      spinner.start('Deleting...')
      const ok = await deleteTrelloCard(current.id)
      spinner.stop()
      log.success(ok ? 'Card deleted.' : 'Failed.')
      return
    }
  }
}

// ── cards menu ─────────────────────────────────────────────────────────────

const showCardsMenu = async (): Promise<void> => {
  while (true) {
    const choice = await select('Cards:', [
      { label: 'Select card to manage', value: 'manage' },
      { label: 'Create card', value: 'create' },
      { label: 'Back', value: 'back' },
    ])

    if (choice === 'back') return

    if (choice === 'create') {
      const listId = await pickList()
      if (!listId) continue
      const name = askQuestion('Card name: ').trim()
      if (!name) {
        log.warn('Name required.')
        continue
      }
      const desc = askQuestion('Description (optional, Enter to skip): ').trim()
      const spinner = log.spinner()
      spinner.start('Creating card...')
      const card = await createTrelloCard(listId, name, desc || undefined)
      spinner.stop()
      if (card) log.success(`Card created: #${card.idShort} ${card.name}`)
      else log.error('Failed to create card.')
      continue
    }

    if (choice === 'manage') {
      const listId = await pickList()
      if (!listId) continue
      const card = await pickCard(listId)
      if (!card) continue
      await showCardActions(card)
      continue
    }
  }
}

// ── labels menu ────────────────────────────────────────────────────────────

const showLabelsMenu = async (): Promise<void> => {
  while (true) {
    const choice = await select('Labels:', [
      { label: 'View all labels', value: 'view' },
      { label: 'Create label', value: 'create' },
      { label: 'Edit label', value: 'edit' },
      { label: 'Delete label', value: 'delete' },
      { label: 'Back', value: 'back' },
    ])

    if (choice === 'back') return

    if (choice === 'view') {
      const spinner = log.spinner()
      spinner.start('Fetching labels...')
      const labels = await fetchTrelloLabels()
      spinner.stop()
      if (labels.length === 0) {
        log.info('No labels on this board.')
        continue
      }
      log.info(`Board labels (${labels.length}):`)
      for (const l of labels) {
        log.info(`  ${(l.color ?? 'no color').padEnd(10)} ${l.name || '(unnamed)'}`)
      }
      continue
    }

    if (choice === 'create') {
      const name = askQuestion('Label name: ').trim()
      const colorChoice = await select('Color:', [
        ...TRELLO_LABEL_COLORS.map((c) => ({ label: c, value: c })),
        { label: 'No color', value: '' },
      ])
      const spinner = log.spinner()
      spinner.start('Creating label...')
      const label = await createTrelloLabel(name, colorChoice || null)
      spinner.stop()
      log.success(label ? `Label created: ${label.name}` : 'Failed to create label.')
      continue
    }

    if (choice === 'edit') {
      const labelId = await pickLabel()
      if (!labelId) continue
      const name = askQuestion('New name (Enter to keep current): ').trim()
      const colorChoice = await select('New color:', [
        ...TRELLO_LABEL_COLORS.map((c) => ({ label: c, value: c })),
        { label: 'No color', value: '' },
        { label: 'Keep current', value: 'keep' },
      ])
      const spinner = log.spinner()
      spinner.start('Updating label...')
      const ok = await updateTrelloLabel(
        labelId,
        name,
        colorChoice === 'keep' ? null : colorChoice || null
      )
      spinner.stop()
      log.success(ok ? 'Label updated.' : 'Failed to update label.')
      continue
    }

    if (choice === 'delete') {
      const labelId = await pickLabel()
      if (!labelId) continue
      const confirm = askQuestion('Delete this label? Type YES to confirm: ').trim()
      if (confirm !== 'YES') {
        log.info('Cancelled.')
        continue
      }
      const spinner = log.spinner()
      spinner.start('Deleting label...')
      const ok = await deleteTrelloLabel(labelId)
      spinner.stop()
      log.success(ok ? 'Label deleted.' : 'Failed to delete label.')
      continue
    }
  }
}

// ── main menu ──────────────────────────────────────────────────────────────

export const showTrelloMenu = async (): Promise<void> => {
  log.banner()
  log.step(`${colors.cyan}Trello Management${colors.reset}\n`)

  if (!hasTrelloConfig()) {
    log.warn('Trello is not configured!')
    const shouldSetup = await select('Would you like to set it up now?', [
      { label: 'Yes, setup Trello', value: 'setup' },
      { label: 'No, go back', value: 'back' },
    ])
    if (shouldSetup === 'setup') {
      const { handleTrelloSetting } = await import('./settings.js')
      await handleTrelloSetting()
      await showTrelloMenu()
    }
    return
  }

  while (true) {
    const choice = await select('Trello management:', [
      { label: 'Cards', value: 'cards' },
      { label: 'Labels', value: 'labels' },
      { label: 'Generate task files from cards', value: 'generate' },
      { label: 'Back to main menu', value: 'back' },
    ])

    switch (choice) {
      case 'cards': {
        await showCardsMenu()
        break
      }
      case 'labels': {
        await showLabelsMenu()
        break
      }
      case 'generate': {
        await handleGenerateTaskInstructions()
        break
      }
      case 'back': {
        const { main } = await import('./main.js')
        await main()
        return
      }
    }
  }
}
