/**
 * Commit workflow - handles commit-related operations
 */

import type { CopilotModel } from '../api/copilot.js'
import type { GeminiModel } from '../api/gemini.js'
import type { OpenRouterModel } from '../api/openrouter.js'
import type { GeetoState } from '../types/index.js'

import { askQuestion, confirm, editInEditor } from '../cli/input.js'
import { select } from '../cli/menu.js'
import { colors } from '../utils/colors.js'
import { DEFAULT_GEMINI_MODEL } from '../utils/config.js'
import { execGit } from '../utils/exec.js'
import {
  chooseModelForProvider,
  getAIProviderShortName,
  getModelValue,
  interactiveAIFallback,
  isContextLimitFailure,
  isTransientAIFailure,
} from '../utils/git-ai.js'
import { log } from '../utils/logging.js'
import { saveState } from '../utils/state.js'

export const getCommitTypes = () => [
  { label: 'feat     - New feature', value: 'feat' },
  { label: 'fix      - Bug fix', value: 'fix' },
  { label: 'docs     - Documentation', value: 'docs' },
  { label: 'style    - Code style changes', value: 'style' },
  { label: 'refactor - Code refactoring', value: 'refactor' },
  { label: 'test     - Testing', value: 'test' },
  { label: 'chore    - Maintenance', value: 'chore' },
  { label: 'perf     - Performance improvement', value: 'perf' },
  { label: 'ci       - CI/CD changes', value: 'ci' },
  { label: 'build    - Build system changes', value: 'build' },
  { label: 'revert   - Revert changes', value: 'revert' },
  { label: 'cancel', value: 'cancel' },
]

export const getDefaultCommitTool = (
  aiProvider: 'gemini' | 'copilot' | 'openrouter' | 'manual'
): string => {
  switch (aiProvider) {
    case 'gemini': {
      return 'gemini'
    }
    case 'copilot': {
      return 'copilot'
    }
    case 'openrouter': {
      return 'openrouter'
    }
    default: {
      return 'manual'
    }
  }
}

const normalizeAIOutput = (input: string): string => {
  let t = String(input ?? '')

  // Remove fenced code blocks and triple backticks
  t = t.replaceAll(/```[\w-]*\n?/g, '').replaceAll('```', '')
  // Remove inline backticks
  t = t.replaceAll('`', '')
  // Trim surrounding quotes and whitespace
  t = t.replaceAll(/^"+|"+$/g, '').trim()

  // Strip any explanatory preface before the conventional commit line
  const lower = t.toLowerCase()
  const typesList = [
    'feat',
    'fix',
    'docs',
    'style',
    'refactor',
    'test',
    'chore',
    'perf',
    'ci',
    'build',
    'revert',
  ]

  let earliestIndex = -1
  for (const typ of typesList) {
    const pat1 = `${typ}(`
    const pat2 = `${typ}:`
    const i1 = lower.indexOf(pat1)
    const i2 = lower.indexOf(pat2)
    let i = -1
    if (i1 === -1) {
      i = i2
    } else if (i2 === -1) {
      i = i1
    } else {
      i = Math.min(i1, i2)
    }

    if (i !== -1 && (earliestIndex === -1 || i < earliestIndex)) {
      earliestIndex = i
    }
  }

  if (earliestIndex !== -1) {
    return t.slice(earliestIndex).trim()
  }

  return t
}

const extractCommitTitle = (text: string): string | null => {
  // Try line-by-line first
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const typesList = [
    'feat',
    'fix',
    'docs',
    'style',
    'refactor',
    'test',
    'chore',
    'perf',
    'ci',
    'build',
    'revert',
  ]

  for (const line of lines) {
    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) {
      continue
    }

    const left = line.slice(0, colonIndex).trim()
    const type = (left.split('(')[0] ?? '').trim()
    if (typesList.includes(type)) {
      const after = line.slice(colonIndex + 1).trim()
      if (after.length > 0) {
        return line
      }
    }
  }

  // If not found line-by-line, scan the whole text for a conventional commit substring
  const lower = text.toLowerCase()
  let earliestIndex = -1
  let foundType: string | null = null

  for (const t of typesList) {
    // look for 't(' or 't:' patterns
    const pat1 = `${t}(`
    const pat2 = `${t}:`
    const i1 = lower.indexOf(pat1)
    const i2 = lower.indexOf(pat2)
    let i = -1
    if (i1 === -1) {
      i = i2
    } else if (i2 === -1) {
      i = i1
    } else {
      i = Math.min(i1, i2)
    }
    if (i !== -1 && (earliestIndex === -1 || i < earliestIndex)) {
      earliestIndex = i
      foundType = t
    }
  }

  if (earliestIndex !== -1 && foundType) {
    // extract the full line starting at earliestIndex
    const rest = text.slice(earliestIndex)
    const endIdx = rest.indexOf('\n')
    const line = (endIdx === -1 ? rest : rest.slice(0, endIdx)).trim()
    // basic validation
    if (line.includes(':') && line.length > foundType.length + 2) {
      return line
    }
  }

  return null
}

const extractCommitBody = (text: string, title: string): string | null => {
  const lines = text.split('\n').map((l) => l.trim())
  const titleIndex = lines.indexOf(title)

  if (titleIndex === -1) {
    return null
  }

  // Get lines after the title
  const bodyLines = lines.slice(titleIndex + 1).filter(Boolean)

  if (bodyLines.length === 0) {
    return null
  }

  return bodyLines.join('\n')
}

const isConventionalLine = (line: string): boolean => {
  const types = new Set([
    'feat',
    'fix',
    'docs',
    'style',
    'refactor',
    'test',
    'chore',
    'perf',
    'ci',
    'build',
    'revert',
  ])

  const trimmed = line.trim()
  if (!trimmed) {
    return false
  }

  const colonIndex = trimmed.indexOf(':')
  if (colonIndex === -1) {
    return false
  }

  const left = trimmed.slice(0, colonIndex).trim()
  const type = (left.split('(')[0] ?? '').trim()
  return types.has(type)
}

const formatCommitBody = (rawBody: string): string => {
  if (!rawBody) {
    return ''
  }

  const lines = rawBody
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const conv: string[] = []
  const others: string[] = []

  for (const l of lines) {
    if (isConventionalLine(l)) {
      conv.push(l)
    } else {
      others.push(l)
    }
  }

  // If conventional lines exist, list them under "Other suggested commits"; otherwise join others.
  if (conv.length > 0 && others.length > 0) {
    return `${others.join('\n')}

Other suggested commits:\n- ${conv.join('\n- ')}`
  }

  if (conv.length > 0) {
    return conv.join('\n')
  }

  return others.join('\n')
}

export const handleCommitWorkflow = async (
  state: GeetoState,
  opts?: { suppressStep?: boolean; suppressConfirm?: boolean }
): Promise<boolean> => {
  if (!opts?.suppressStep) {
    log.step('Step 3: Commit')
  }

  const aiProvider = (state.aiProvider ?? 'gemini') as
    | 'gemini'
    | 'copilot'
    | 'openrouter'
    | 'manual'
  let selectedTool = getDefaultCommitTool(aiProvider)

  // Helper: attempt to run git commit using a temporary file to avoid shell quoting issues
  const attemptCommit = async (titleStr: string, bodyStr?: string | null): Promise<boolean> => {
    // Compose full commit message
    const msg = bodyStr ? `${titleStr}\n\n${bodyStr}\n` : `${titleStr}\n`

    // Use spawnSync to avoid shell quoting pitfalls
    const tempDir = await import('node:os')
    const pathMod = await import('node:path')
    const fs = await import('node:fs')
    const { spawnSync } = await import('node:child_process')

    const tmpFile = pathMod.join(tempDir.tmpdir(), `geeto-commit-${Date.now()}.txt`)

    try {
      fs.writeFileSync(tmpFile, msg, 'utf8')
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error)
      log.error(`Failed to write temporary commit message: ${errMsg}`)
      return false
    }

    try {
      const res = spawnSync('git', ['commit', '-F', tmpFile], { stdio: 'inherit' })
      // cleanup
      try {
        fs.unlinkSync(tmpFile)
      } catch {
        /* ignore cleanup errors */
      }

      if (res.status === 0) {
        return true
      }

      log.error('Commit failed due to commit hook or invalid message.')

      const action = await select('Commit failed. Choose an action:', [
        { label: 'Edit commit message and retry', value: 'edit' },
        { label: 'Abort', value: 'abort' },
      ])

      if (action === 'edit') {
        const edited = editInEditor(`${titleStr}\n\n${bodyStr ?? ''}`, 'geeto-commit.txt')
        if (!edited?.trim()) {
          return false
        }

        const normalized = normalizeAIOutput(edited.trim())
        const newTitle =
          extractCommitTitle(normalized) ?? edited.split('\n').find((l) => l.trim()) ?? ''
        const newBody = newTitle ? extractCommitBody(normalized, newTitle) : null
        return attemptCommit(newTitle as string, newBody)
      }

      return false
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error)
      log.error(`Failed to run git commit: ${errMsg}`)
      return false
    }
  }

  const aiTools = [
    { label: 'Gemini', value: 'gemini' },
    { label: 'GitHub Copilot (Recommended)', value: 'copilot' },
    { label: 'OpenRouter', value: 'openrouter' },
    { label: 'Manual commit', value: 'manual' },
  ]

  // Log provider detected; if manual, skip AI prompts and go straight to conventional commit flow
  if (aiProvider === 'manual') {
    selectedTool = 'manual'
  } else {
    log.info(`AI provider detected: ${aiProvider}`)
  }

  let modelName = ''
  if (aiProvider === 'copilot' && state.copilotModel) {
    modelName = state.copilotModel
  } else if (aiProvider === 'openrouter' && state.openrouterModel) {
    modelName = state.openrouterModel
  } else if (aiProvider === 'gemini') {
    // prefer persisted state selection, otherwise fall back to default
    modelName = state.geminiModel ?? DEFAULT_GEMINI_MODEL
  }

  if (modelName) {
    log.info(`Using model: ${modelName}`)
  }

  // If not manual, ask whether to use AI provider for commit; otherwise skip to manual flow
  let useAutoTool = false
  if (aiProvider !== 'manual') {
    if (opts?.suppressConfirm) {
      useAutoTool = true
    } else {
      useAutoTool = confirm(
        `\nUse ${getAIProviderShortName(aiProvider)}${modelName ? ` (${modelName})` : ''} for commit? (recommended)`
      )
    }

    if (!useAutoTool) {
      selectedTool = await select('Choose commit method:', aiTools)
    }
  }

  const commitSuccess = false

  const diff = execGit('git diff --cached', true)
  if (!diff?.trim()) {
    log.warn('No staged changes found. Cannot generate a commit message from empty diff. Aborting.')
    return false
  }
  log.info(`Git diff size: ${diff.length} chars`)
  console.log('')

  // Use chosen provider; prompt model and allow going back to provider selection.
  let effectiveProvider: 'gemini' | 'copilot' | 'openrouter' =
    aiProvider === 'manual' ? 'gemini' : (aiProvider as 'gemini' | 'copilot' | 'openrouter')
  if (selectedTool !== 'manual') {
    // Determine if model prompt is needed (skip if default & persisted)
    const defaultTool = getDefaultCommitTool(aiProvider)
    const choseAutoDefault = useAutoTool && selectedTool === defaultTool

    const hasPersistedModel = (tool: string) => {
      switch (tool) {
        case 'copilot': {
          return !!state.copilotModel
        }
        case 'openrouter': {
          return !!state.openrouterModel
        }
        case 'gemini': {
          return !!state.geminiModel
        }
        default: {
          return false
        }
      }
    }

    const needModelPrompt = !choseAutoDefault || !hasPersistedModel(selectedTool)

    if (needModelPrompt) {
      // loop until a model is chosen or user returns to manual
      let providerPick: string = selectedTool
      // eslint-disable-next-line no-constant-condition
      while (true) {
        effectiveProvider = providerPick as 'gemini' | 'copilot' | 'openrouter'
        state.aiProvider = effectiveProvider
        saveState(state)

        // Prompt model for chosen provider (centralized helper)
        log.info(`Selected AI Provider: ${getAIProviderShortName(effectiveProvider)}`)
        const chosenModel = await chooseModelForProvider(
          effectiveProvider,
          'Choose model:',
          'Back to suggested commit selection'
        )
        if (!chosenModel) {
          // setup failed; allow user to reselect provider
          continue
        }
        if (chosenModel === 'back') {
          providerPick = (await select('Choose commit method:', aiTools)) as string
          if (providerPick === 'manual') {
            selectedTool = 'manual'
            break
          }
          continue
        }

        // Persist chosen model
        switch (effectiveProvider) {
          case 'copilot': {
            state.copilotModel = chosenModel as unknown as CopilotModel
            break
          }
          case 'openrouter': {
            state.openrouterModel = chosenModel as unknown as OpenRouterModel
            break
          }
          case 'gemini': {
            state.geminiModel = chosenModel as unknown as GeminiModel
            break
          }
          default: {
            break
          }
        }
        saveState(state)
        break
      }
      // end while
    } else {
      // no interactive model prompt required — persist chosen provider and continue
      state.aiProvider = selectedTool as 'gemini' | 'copilot' | 'openrouter'
      saveState(state)
    }
  }

  if (selectedTool !== 'manual') {
    let correction = ''

    // Try generating commit message via AI
    let initialAiResult: string | null = null
    let currentModel: string | undefined
    try {
      let currentProvider: 'gemini' | 'copilot' | 'openrouter' | undefined
      if (state.aiProvider && state.aiProvider !== 'manual') {
        currentProvider = state.aiProvider
      } else {
        currentProvider = aiProvider as 'gemini' | 'copilot' | 'openrouter'
      }

      if (currentProvider === 'copilot') {
        currentModel = state.copilotModel
      } else if (currentProvider === 'openrouter') {
        currentModel = state.openrouterModel
      } else {
        currentModel = state.geminiModel ?? DEFAULT_GEMINI_MODEL
      }

      log.ai(
        `Generating commit message with ${getAIProviderShortName(currentProvider)}${currentModel ? ` (${currentModel})` : ''}...`
      )

      if (currentProvider === 'copilot') {
        const { generateCommitMessage } = await import('../api/copilot.js')
        initialAiResult = await generateCommitMessage(
          diff,
          correction,
          state.copilotModel as CopilotModel
        )
      } else if (currentProvider === 'openrouter') {
        const { generateCommitMessage } = await import('../api/openrouter.js')
        initialAiResult = await generateCommitMessage(
          diff,
          correction,
          state.openrouterModel as OpenRouterModel
        )
      } else {
        const { generateCommitMessage } = await import('../api/gemini.js')
        initialAiResult = await generateCommitMessage(
          diff,
          correction,
          state.geminiModel as GeminiModel
        )
      }
    } catch {
      log.warn('Initial AI generation attempt failed, will enter interactive fallback')
      initialAiResult = null
    }

    // Loop AI generation/user choices — pass initial result only on first iteration
    let firstAttempt = true

    // eslint-disable-next-line no-constant-condition
    let forceDirect = false
    // allow returning from model/provider menus to the suggested-commit prompt
    let skipRegenerate = false
    let previousAiResult: string | null = initialAiResult
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Obtain AI result: initial -> direct regenerate -> interactive fallback
      let aiResult: string | null = null

      if (skipRegenerate) {
        // reuse the previous AI result and show the accept menu again
        aiResult = previousAiResult
        skipRegenerate = false
      } else if (
        firstAttempt &&
        initialAiResult &&
        !isTransientAIFailure(initialAiResult) &&
        !isContextLimitFailure(initialAiResult)
      ) {
        aiResult = initialAiResult
      } else if (forceDirect) {
        // Try direct generation with the currently selected provider/model
        // Retry once automatically if the provider returns no suggestion to reduce
        // the chance of immediately falling back to the interactive menu after
        // the user provided a correction.
        let directAttempt = 0
        const maxDirectAttempts = 2
        while (directAttempt < maxDirectAttempts && !aiResult) {
          try {
            // Log which provider/model we're attempting for regenerate
            let directModelName = ''
            if (state.aiProvider === 'copilot' && state.copilotModel) {
              directModelName = state.copilotModel as string
            } else if (state.aiProvider === 'openrouter' && state.openrouterModel) {
              directModelName = state.openrouterModel as string
            } else if (state.aiProvider === 'gemini') {
              directModelName = (state.geminiModel as string) ?? DEFAULT_GEMINI_MODEL
            }

            if (correction) {
              console.log('')
            }
            log.ai(
              `Regenerating commit message with ${getAIProviderShortName(
                state.aiProvider ?? 'gemini'
              )}${directModelName ? ` (${directModelName})` : ''}...`
            )

            switch (state.aiProvider) {
              case 'copilot': {
                const { generateCommitMessage } = await import('../api/copilot.js')
                aiResult = await generateCommitMessage(
                  diff,
                  correction,
                  state.copilotModel as CopilotModel
                )
                break
              }
              case 'openrouter': {
                const { generateCommitMessage } = await import('../api/openrouter.js')
                aiResult = await generateCommitMessage(
                  diff,
                  correction,
                  state.openrouterModel as OpenRouterModel
                )
                break
              }
              case 'gemini': {
                const { generateCommitMessage } = await import('../api/gemini.js')
                aiResult = await generateCommitMessage(
                  diff,
                  correction,
                  state.geminiModel as GeminiModel
                )
                break
              }
              default: {
                aiResult = null
                break
              }
            }
          } catch {
            aiResult = null
          }

          directAttempt += 1

          if (!aiResult && directAttempt < maxDirectAttempts) {
            log.ai('Regenerate returned no suggestion; retrying once...')
          }
        }
      } else {
        const currentProv = (state.aiProvider ?? 'gemini') as 'gemini' | 'copilot' | 'openrouter'
        let modelChoice: CopilotModel | OpenRouterModel | GeminiModel | string
        if (currentProv === 'copilot') {
          modelChoice = state.copilotModel as CopilotModel
        } else if (currentProv === 'openrouter') {
          modelChoice = state.openrouterModel as OpenRouterModel
        } else {
          modelChoice = (state.geminiModel as GeminiModel) ?? DEFAULT_GEMINI_MODEL
        }

        aiResult = await interactiveAIFallback(
          firstAttempt ? initialAiResult : null,
          currentProv,
          modelChoice,
          diff,
          correction,
          state.currentBranch,
          (provider: 'gemini' | 'copilot' | 'openrouter', model?: string) => {
            log.info(`AI provider switched to: ${getAIProviderShortName(provider)}`)
            state.aiProvider = provider

            switch (provider) {
              case 'copilot': {
                state.copilotModel = model as CopilotModel
                break
              }
              case 'openrouter': {
                state.openrouterModel = model as OpenRouterModel
                break
              }
              case 'gemini': {
                // persist gemini model selection if provided
                if (model && typeof model === 'string') {
                  state.geminiModel = model as GeminiModel
                }
                break
              }
              default: {
                break
              }
            }

            saveState(state)
          },
          true
        )
      }

      // Remember last AI result before any user-driven continues/regenerates
      previousAiResult = aiResult

      // After first interactive attempt, clear seed to force fresh suggestions
      firstAttempt = false
      // reset forceDirect unless explicitly set again by 'regenerate'
      forceDirect = false

      const commitMessage = aiResult ?? ''

      if (!commitMessage) {
        log.warn('Could not generate commit message from AI provider')
        break
      }

      const contextLimitDetected = isContextLimitFailure(commitMessage)

      // Persist AI suggestion for commit so user can inspect/raw and we can show a short suggested line
      try {
        const fs = await import('node:fs/promises')
        const pathMod = await import('node:path')
        const path = pathMod.default || pathMod
        const outDir = path.join(process.cwd(), '.geeto')
        await fs.mkdir(outDir, { recursive: true })

        let modelParam: string | undefined
        if (state.aiProvider === 'copilot') {
          modelParam = state.copilotModel as unknown as string
        } else if (state.aiProvider === 'openrouter') {
          modelParam = state.openrouterModel as unknown as string
        } else {
          modelParam = (state.geminiModel as unknown as string) ?? DEFAULT_GEMINI_MODEL
        }

        const payload: Record<string, unknown> = {
          provider: state.aiProvider ?? aiProvider,
          model: modelParam,
          raw: commitMessage,
          timestamp: new Date().toISOString(),
        }

        try {
          const existing = await fs.readFile(path.join(outDir, 'last-ai-suggestion.json'), 'utf8')
          const parsed: unknown = JSON.parse(existing || '{}')
          if (parsed && typeof parsed === 'object' && 'content' in parsed) {
            payload.content = (parsed as Record<string, unknown>).content
          }
        } catch {
          /* ignore read errors */
        }

        await fs.writeFile(
          path.join(outDir, 'last-ai-suggestion.json'),
          JSON.stringify(payload, null, 2)
        )

        // Show the suggested commit: subject and full body if present
        const lines = commitMessage.split('\n')
        const subject = lines.find((l) => l.trim()) ?? commitMessage
        const body = lines
          .slice(lines.indexOf(subject) + 1)
          .join('\n')
          .trim()
        log.ai(`Suggested Commit:\n\n${colors.cyan}${colors.bright}${subject}`)
        if (body) {
          console.log('\n' + body + `${colors.reset}\n`)
        }
        log.info(
          'Incorrect Suggestion? check .geeto/last-ai-suggestion.json (possible AI/context limit).'
        )
      } catch {
        /* ignore file write failures */
      }

      // If we have a short subject line in the suggestion, allow accepting
      // the suggested commit message even when a context limit was detected.
      const subjectLine = commitMessage.split('\n').find((l) => l.trim()) ?? ''

      let acceptAi: string
      if (contextLimitDetected && !subjectLine) {
        // No usable suggestion present: force the user to change model/provider or edit
        const editorName = process.env.EDITOR ?? (process.platform === 'win32' ? 'notepad' : 'vi')
        acceptAi = await select(
          'This model cannot process the input due to token/context limits. Please choose a different model or provider:',
          [
            {
              label: `Try again with ${getAIProviderShortName(aiProvider)}${getModelValue(currentModel) ? ` (${getModelValue(currentModel)})` : ''} model`,
              value: 'try-same',
            },
            { label: 'Change model', value: 'change-model' },
            { label: 'Change AI provider', value: 'change-provider' },
            { label: `Edit in editor (${editorName})`, value: 'edit' },
          ]
        )
      } else {
        // Either no context limits, or we have a usable suggestion (allow accepting)
        const editorName = process.env.EDITOR ?? (process.platform === 'win32' ? 'notepad' : 'vi')
        acceptAi = await select('Accept this commit message?', [
          { label: 'Yes, use it', value: 'accept' },
          { label: 'Regenerate', value: 'regenerate' },
          { label: `Edit in editor (${editorName})`, value: 'edit' },
          { label: 'Correct AI (give feedback)', value: 'correct' },
          { label: 'Change model', value: 'change-model' },
          { label: 'Change AI provider', value: 'change-provider' },
        ])
      }
      switch (acceptAi) {
        case 'accept': {
          log.info('User accepted AI suggestion')

          // Extract and clean commit message using helpers
          const normalizedOutput = normalizeAIOutput(commitMessage)
          const extractedTitle = extractCommitTitle(normalizedOutput)

          let title: string
          let body: string | null = null

          if (extractedTitle) {
            title = extractedTitle
            body = extractCommitBody(normalizedOutput, title)
            if (body) {
              body = formatCommitBody(body)
            }
          } else {
            // Fallback: use first non-empty line
            const firstLine = normalizedOutput.split('\n').find((line) => line.trim())
            title = firstLine?.trim() ?? normalizedOutput
          }

          const committed = await attemptCommit(title, body)
          if (committed) {
            return true
          }
          // If commit did not complete (user aborted or editing cancelled), continue loop
          continue
        }
        case 'regenerate': {
          correction = ''
          // next loop should try direct generation with the currently selected model
          forceDirect = true
          continue
        }
        case 'try-same': {
          // User chose to attempt the same model again — try a direct regenerate
          forceDirect = true
          continue
        }
        case 'change-provider': {
          const prov = await select('Choose AI provider:', [
            { label: 'Gemini', value: 'gemini' },
            { label: 'GitHub Copilot (Recommended)', value: 'copilot' },
            { label: 'OpenRouter', value: 'openrouter' },
            { label: 'Back to suggested commit selection', value: 'back' },
          ])

          if (prov === 'back') {
            // return to the accept-suggestion prompt reusing previous AI result
            skipRegenerate = true
            continue
          }

          // Use centralized helper to choose model for the provider
          const chosenModel = await chooseModelForProvider(
            prov as 'gemini' | 'copilot' | 'openrouter',
            'Choose model:',
            'Back to suggested commit selection'
          )

          if (!chosenModel) {
            // setup failed; re-prompt later
            continue
          }

          if (chosenModel === 'back') {
            // user chose to go back to selection
            skipRegenerate = true
            continue
          }

          state.aiProvider = prov as 'gemini' | 'copilot' | 'openrouter'
          switch (prov) {
            case 'copilot': {
              state.copilotModel = chosenModel as unknown as CopilotModel
              state.openrouterModel = undefined
              state.geminiModel = undefined
              break
            }
            case 'openrouter': {
              state.openrouterModel = chosenModel as unknown as OpenRouterModel
              state.copilotModel = undefined
              state.geminiModel = undefined
              break
            }
            case 'gemini': {
              state.geminiModel = chosenModel as unknown as GeminiModel
              state.copilotModel = undefined
              state.openrouterModel = undefined
              break
            }
            default: {
              state.geminiModel = chosenModel as unknown as GeminiModel
              state.copilotModel = undefined
              state.openrouterModel = undefined
              break
            }
          }

          saveState(state)
          // force direct regenerate with new model
          forceDirect = true
          correction = ''
          continue
        }
        case 'change-model': {
          const currentProv = (state.aiProvider ?? 'gemini') as
            | 'gemini'
            | 'copilot'
            | 'openrouter'
            | 'manual'
          const providerKey = (currentProv === 'manual' ? 'gemini' : currentProv) as
            | 'gemini'
            | 'copilot'
            | 'openrouter'
          const chosen = await chooseModelForProvider(
            providerKey,
            'Choose model:',
            'Back to suggested commit selection'
          )
          if (!chosen) {
            skipRegenerate = true
            continue
          }
          if (chosen === 'back') {
            skipRegenerate = true
            continue
          }

          switch (currentProv) {
            case 'copilot': {
              state.copilotModel = chosen as unknown as CopilotModel
              break
            }
            case 'openrouter': {
              state.openrouterModel = chosen as unknown as OpenRouterModel
              break
            }
            case 'gemini': {
              state.geminiModel = chosen as unknown as GeminiModel
              state.copilotModel = undefined
              state.openrouterModel = undefined
              break
            }
            default: {
              state.geminiModel = chosen as unknown as GeminiModel
              break
            }
          }

          saveState(state)
          forceDirect = true
          correction = ''
          continue
        }
        case 'correct': {
          correction = askQuestion(
            'Provide corrections for the AI (e.g., shorten header, clarify scope): ',
            undefined,
            true
          )
          // Immediately force a regenerate using the provided correction
          forceDirect = true
          continue
        }
        case 'edit': {
          // Open user's editor for multi-line editing
          const initial = commitMessage
          const edited = editInEditor(initial, 'geeto-commit.txt')
          if (edited?.trim()) {
            const editedMessage = edited.trim()

            // Process the edited message
            const normalizedOutput = normalizeAIOutput(editedMessage)
            const extractedTitle = extractCommitTitle(normalizedOutput)

            let title: string
            let body: string | null = null

            if (extractedTitle) {
              title = extractedTitle
              body = extractCommitBody(normalizedOutput, title)
              if (body) {
                body = formatCommitBody(body)
              }
            } else {
              // Fallback: use first non-empty line
              const firstLine = normalizedOutput.split('\n').find((line) => line.trim())
              title = firstLine?.trim() ?? normalizedOutput
            }

            const committed = await attemptCommit(title, body)
            if (committed) {
              return true
            }
            // If commit didn't happen, continue the loop to allow later actions
            continue
          }
          // If no edit provided, continue the loop
          continue
        }
      }

      break
    }
  }

  if (!commitSuccess || selectedTool === 'manual') {
    log.info('Falling back to manual commit flow')

    const mode = await select('Choose commit mode:', [
      { label: 'Conventional commit (structured)', value: 'conventional' },
      { label: 'Manual commit (freeform)', value: 'manual' },
      { label: 'Cancel', value: 'cancel' },
    ])

    if (mode === 'cancel') {
      log.warn('Commit cancelled.')
      process.exit(0)
    }

    if (mode === 'manual') {
      // Freeform manual commit: prompt for a non-empty commit message
      let message = ''
      while (!message) {
        message = askQuestion('Commit message: ').trim()
        if (!message) {
          log.error('Commit message cannot be empty!')
        }
      }

      const committed = await attemptCommit(message)
      if (committed) {
        log.success(`Committed: ${colors.cyan}${message}${colors.reset}`)
        return true
      }

      log.error('Commit failed or aborted.')
      process.exit(1)
    }

    const commitType = await select('Select commit type:', getCommitTypes())

    if (commitType === 'cancel') {
      log.warn('Commit cancelled.')
      process.exit(0)
    }

    const scope = askQuestion('Scope (optional, press Enter to skip): ').trim()
    let description = ''

    let suggestedDescription = state.workingBranch
    const slashIndex = state.workingBranch.indexOf('/')
    const hashIndex = state.workingBranch.indexOf('#')

    if (slashIndex > 0) {
      suggestedDescription = state.workingBranch.slice(slashIndex + 1)
    } else if (hashIndex > 0) {
      suggestedDescription = state.workingBranch.slice(hashIndex + 1)
    }

    suggestedDescription = suggestedDescription.replaceAll('-', ' ').replaceAll('_', ' ').trim()

    const useSuggested = confirm(`Use suggested description: "${suggestedDescription}"?`)
    if (useSuggested) {
      description = suggestedDescription
    } else {
      while (!description) {
        description = askQuestion('Commit message: ').trim()
        if (!description) {
          log.error('Commit message cannot be empty!')
        }
      }
    }

    // No prefix selection — keep description as entered

    const commitMsg = scope
      ? `${commitType}(${scope}): ${description}`
      : `${commitType}: ${description}`

    const committed = await attemptCommit(commitMsg)
    if (committed) {
      log.success(`Committed: ${colors.cyan}${commitMsg}${colors.reset}`)
    } else {
      log.error('Commit failed or aborted.')
      process.exit(1)
    }
  }

  return true
}
