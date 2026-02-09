/**
 * Trello workflow menu and utilities
 */

import fs from 'node:fs'
import path from 'node:path'

import { fetchTrelloCards, fetchTrelloLists } from '../api/trello.js'
import { select } from '../cli/menu.js'
import { colors } from '../utils/colors.js'
import { getTrelloConfig, hasTrelloConfig } from '../utils/config.js'
import { commandExists, exec } from '../utils/exec.js'
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
 * Generate tasks.instructions.md from selected Trello list
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

  // Show tip about creating dedicated agent list
  console.log('')
  log.info(
    `${colors.cyan}💡 Tip:${colors.reset} For best results with AI agents, create a dedicated Trello list called:`
  )
  log.info(`   ${colors.green}"TODO FOR AGENT"${colors.reset}`)
  log.info('   This helps organize tasks specifically meant for automated execution.')
  console.log('')

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
  const cards = await fetchTrelloCards(selectedListId)

  if (cards.length === 0) {
    spinner2.fail('No cards found in this list')
    log.warn('The selected list is empty or all cards are marked as [DONE]/[ARCHIVED].')
    return
  }

  spinner2.succeed(`Found ${cards.length} cards`)

  // Generate markdown content
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  let markdown = `# Tasks from "${selectedList.name}"

Generated from Trello board on ${dateStr}

---

## ⚠️ IMPORTANT INSTRUCTIONS FOR AI AGENTS ⚠️

**CRITICAL: You MUST follow these rules strictly:**

1. **EXECUTE ONLY ONE TASK AT A TIME** - Never work on multiple tasks simultaneously
2. **STOP after completing each task** - Do NOT automatically proceed to the next task
3. **Wait for explicit user confirmation** before moving to the next task
4. **Delete the completed task** from this file after finishing it
5. **Ask the user** "Task completed. Should I proceed to the next task?" before continuing

**WORKFLOW:**
\`\`\`
Step 1: Read only the FIRST uncompleted task (with - [ ])
Step 2: Execute ONLY that one task
Step 3: Mark it done by changing - [ ] to - [x]
Step 4: STOP and ask user for confirmation
Step 5: Wait for user response before proceeding
Step 6: If confirmed, delete the completed task and go to Step 1
\`\`\`

**❌ DO NOT:**
- Execute multiple tasks in one go
- Continue to next task without confirmation
- Assume you should complete everything at once
- Make assumptions about database schema, models, or queries without checking

**✅ DO:**
- Work on exactly one task
- Stop and wait after each task
- Ask for permission to continue

**📋 FOR FULLSTACK/BACKEND PROJECTS:**

Before implementing any task involving database, API, or data logic:

1. **Check migrations** - Look at recent migration files to understand schema changes
2. **Review models** - Examine model definitions and relationships
3. **Read existing queries** - Check similar queries or repository patterns in the codebase
4. **Understand the data flow** - Trace how data moves through the application

**When creating NEW ENDPOINTS/CONTROLLERS/SERVICES:**
1. **Find the most similar existing endpoint** - Look for endpoints with similar functionality
2. **Copy the exact structure** - Use the same file organization, naming, and patterns
3. **Match the code patterns exactly** - Request validation, error handling, response format
4. **Keep consistency** - Controller methods, service layer, repository patterns should be identical
5. **Reuse existing utilities** - Auth middleware, validators, error handlers, etc

Example: If creating a "Create User" endpoint, find "Create Product" or similar and replicate its exact structure.

**Never assume:**
- Table structures or column names
- Model relationships or foreign keys
- Query patterns or ORM usage
- API endpoint structures
- Request/response formats
- Validation rules

**Always verify** by reading the actual code first, then implement based on what exists **exactly**.

**📋 FOR FRONTEND PROJECTS:**

Before implementing any UI/frontend task:

1. **Review existing components** - Check similar components for patterns and conventions
2. **Check styling approach** - Identify CSS framework (Tailwind, CSS Modules, styled-components, etc)
3. **Understand state management** - See how state is managed (Redux, Zustand, Context, props)
4. **Review API integration** - Look at how data fetching and error handling is done
5. **Check type definitions** - Read existing interfaces/types for props and data structures
6. **Follow naming conventions** - Match existing component and file naming patterns

**When creating NEW PAGES/ROUTES:**
1. **Find the most similar existing page** - Look for pages with similar functionality
2. **Copy the exact structure** - Use the same file organization, imports, and layout
3. **Match the code patterns exactly** - Don't deviate from the established patterns
4. **Keep consistency** - Naming, export style, component composition should be identical
5. **Reuse existing components** - Don't create new ones if similar components exist

Example: If creating a "User Settings" page, find "Account Settings" or similar page and replicate its structure exactly.

**Never assume:**
- Component structure or prop patterns
- CSS class naming or styling approach
- State management implementation
- API client or fetch patterns
- File/folder naming conventions
- Page/route structure

**Always match** the existing codebase style and patterns **exactly**.

---

## Tasks

**Total: ${cards.length} tasks**

`

  for (const [index, card] of cards.entries()) {
    markdown += `### Task ${index + 1} of ${cards.length}\n\n`
    markdown += `- [ ] **${card.name}** (#${card.idShort})\n`
    markdown += `  - Trello URL: ${card.url}\n`
    if (card.desc?.trim()) {
      markdown += `\n**Description:**\n${card.desc}\n`
    }
    markdown += `\n---\n\n`
  }

  markdown += `
## Instructions for Human Users

This file contains tasks from your Trello board. To work through these:

1. **Execute each task one by one** from top to bottom (or let your AI agent do it)
2. **When a task is completed**, mark it done or delete it from this file
3. **If using an AI agent**, confirm after each task before proceeding
4. **Keep this file updated** as you progress

---

*Generated by Geeto CLI - Trello Integration*
`

  // Detect editor from terminal environment to determine output path
  let editorCommand: string | null = null
  let outputPath: string

  const termProgram = process.env.TERM_PROGRAM
  const vsCodeHandle = process.env.VSCODE_GIT_IPC_HANDLE
  const vsCodeInjection = process.env.VSCODE_INJECTION
  const cursorExecutable = process.env.CURSOR_EXECUTABLE

  if (cursorExecutable || termProgram === 'cursor') {
    // Running in Cursor terminal - save to .cursor/
    outputPath = path.join(process.cwd(), '.cursor', 'tasks.instructions.md')
    if (commandExists('cursor')) {
      editorCommand = 'cursor'
    }
  } else if (vsCodeHandle || vsCodeInjection || termProgram === 'vscode') {
    // Running in VSCode terminal - save to .github/instructions/
    outputPath = path.join(process.cwd(), '.github', 'instructions', 'tasks.instructions.md')
    if (commandExists('code')) {
      editorCommand = 'code'
    }
  } else if (termProgram?.toLowerCase().includes('jetbrains')) {
    // Running in JetBrains IDE terminal - save to .idea/
    outputPath = path.join(process.cwd(), '.idea', 'tasks.instructions.md')
    const jetbrainsCommands = ['webstorm', 'idea', 'pycharm', 'phpstorm', 'rubymine', 'goland']
    for (const cmd of jetbrainsCommands) {
      if (commandExists(cmd)) {
        editorCommand = cmd
        break
      }
    }
  } else {
    // Fallback - save to root
    outputPath = path.join(process.cwd(), 'tasks.instructions.md')
  }

  // Write to file
  try {
    // Create directory if it doesn't exist
    const outputDir = path.dirname(outputPath)
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    fs.writeFileSync(outputPath, markdown, 'utf8')
    console.log('')
    log.success(`Task instructions generated: ${colors.cyan}${outputPath}${colors.reset}`)
    log.info(`Total tasks: ${colors.cyan}${cards.length}${colors.reset}`)

    // Auto-open file in detected editor
    if (editorCommand) {
      try {
        exec(`${editorCommand} "${outputPath}"`, true)
        log.info(`Opening file in ${editorCommand}...`)
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
        const trelloSection = `\n# Trello-generated tasks\n.github/instructions/tasks.instructions.md\n.cursor/tasks.instructions.md\n.idea/tasks.instructions.md\n`
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
    log.error(`Failed to write file: ${error instanceof Error ? error.message : String(error)}`)
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
    { label: 'Get Trello lists', value: 'lists' },
    { label: 'Generate tasks.instructions.md', value: 'generate' },
    { label: 'Back to main menu', value: 'back' },
  ])

  switch (choice) {
    case 'lists': {
      await handleGetTrelloLists()
      break
    }
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
