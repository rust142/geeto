/**
 * Reword workflow — edit past commit messages without changing position.
 *
 * Uses git rebase -i with GIT_SEQUENCE_EDITOR / GIT_EDITOR overrides
 * so the user can edit commit title + body via nano/notepad and all
 * selected commits are reworded in a single rebase operation.
 */

import { execSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { CopilotModel } from '../api/copilot.js'
import type { GeminiModel } from '../api/gemini.js'
import type { OpenRouterModel } from '../api/openrouter.js'

import { askQuestion, confirm, editInline } from '../cli/input.js'
import { multiSelect, select } from '../cli/menu.js'
import { colors } from '../utils/colors.js'
import {
  extractCommitBody,
  extractCommitTitle,
  formatCommitBody,
  normalizeAIOutput,
} from '../utils/commit-helpers.js'
import { DEFAULT_GEMINI_MODEL } from '../utils/config.js'
import { isDryRun, logDryRun } from '../utils/dry-run.js'
import { execSilent } from '../utils/exec.js'
import {
  chooseModelForProvider,
  getAIProviderShortName,
  getModelValue,
  interactiveAIFallback,
  isContextLimitFailure,
  isTransientAIFailure,
} from '../utils/git-ai.js'
import { getCurrentBranch } from '../utils/git.js'
import { log } from '../utils/logging.js'
import { loadState, saveState } from '../utils/state.js'

// ── Types ──────────────────────────────────────────────────────────

interface CommitInfo {
  hash: string
  shortHash: string
  subject: string
  body: string
  author: string
  relativeDate: string
  refs: string
}

// ── Helpers ────────────────────────────────────────────────────────

const SEP = '<<GTO>>'
const REC = '<<END>>'

const getRecentCommits = (limit: number): CommitInfo[] => {
  try {
    const format = ['%H', '%h', '%s', '%b', '%an', '%cr', '%D'].join(SEP)
    const raw = execSilent(`git log --format="${format}${REC}" -${limit}`).trim()
    if (!raw) return []

    return raw
      .split(REC)
      .map((r) => r.trim())
      .filter(Boolean)
      .map((r) => {
        const p = r.split(SEP)
        return {
          hash: p[0] ?? '',
          shortHash: p[1] ?? '',
          subject: p[2] ?? '',
          body: (p[3] ?? '').trim(),
          author: p[4] ?? '',
          relativeDate: p[5] ?? '',
          refs: p[6] ?? '',
        }
      })
      .filter((c) => c.hash !== '')
  } catch {
    return []
  }
}

/** Get the diff (patch) for a specific commit. */
const getCommitDiff = (hash: string): string => {
  try {
    return execSilent(`git show --format= --patch ${hash}`).trim()
  } catch {
    return ''
  }
}

/** Get full commit message (title + body). */
const getCommitMessage = (hash: string): string => {
  try {
    return execSilent(`git log -1 --format=%B ${hash}`).trim()
  } catch {
    return ''
  }
}

/** Check if the working tree is clean (no uncommitted changes). */
const isWorkingTreeClean = (): boolean => {
  try {
    execSync('git diff --quiet && git diff --cached --quiet', {
      stdio: 'pipe',
    })
    return true
  } catch {
    return false
  }
}

/** Format ref tags (HEAD, branches, etc.) */
const formatRefs = (refs: string): string => {
  if (!refs.trim()) return ''
  const parts = refs.split(',').map((r) => r.trim())
  const formatted = parts.map((ref) => {
    if (ref.startsWith('HEAD')) return `${colors.red}${colors.bright}HEAD${colors.reset}`
    if (ref.startsWith('tag:')) {
      return `${colors.yellow}${ref.replace('tag: ', '')}${colors.reset}`
    }
    if (ref.includes('origin/')) return `${colors.cyan}${ref}${colors.reset}`
    return `${colors.green}${ref}${colors.reset}`
  })
  return ` (${formatted.join(', ')})`
}

// ── Rebase helper scripts ──────────────────────────────────────────

/**
 * Create a Node.js script (GIT_SEQUENCE_EDITOR) that replaces
 * `pick <hash>` with `reword <hash>` for the selected commits.
 */
const writeSequenceEditor = (dir: string, hashes: string[]): string => {
  const scriptPath = path.join(dir, 'sequence-editor.js')

  // Build sed-like replacement logic in JS
  const hashSet = JSON.stringify(hashes)
  const script = String.raw`#!/usr/bin/env node
const fs = require('fs');
const file = process.argv[2];
const hashes = new Set(${hashSet});
let content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n').map(line => {
  const m = line.match(/^pick\s+(\w+)/);
  if (m) {
    const short = m[1];
    for (const h of hashes) {
      if (h.startsWith(short) || short.startsWith(h.slice(0, short.length))) {
        return line.replace(/^pick/, 'reword');
      }
    }
  }
  return line;
});
fs.writeFileSync(file, lines.join('\n'), 'utf8');
`
  fs.writeFileSync(scriptPath, script, { mode: 0o755 })
  return scriptPath
}

/**
 * Create a Node.js script (GIT_EDITOR) that injects the new commit
 * message by looking up the current HEAD hash in our temp directory.
 */
const writeMessageEditor = (dir: string): string => {
  const scriptPath = path.join(dir, 'message-editor.js')
  const messagesDir = path.join(dir, 'messages')

  const script = String.raw`#!/usr/bin/env node
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const file = process.argv[2];
const messagesDir = ${JSON.stringify(messagesDir)};

// Get current HEAD hash (during rebase, HEAD = commit being reworded)
let hash;
try {
  hash = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
} catch { process.exit(0); }

// Find matching message file
const files = fs.readdirSync(messagesDir);
let msgFile = null;
for (const f of files) {
  if (hash.startsWith(f) || f.startsWith(hash.slice(0, f.length))) {
    msgFile = path.join(messagesDir, f);
    break;
  }
}
if (!msgFile) process.exit(0);

// Read new message and comment lines from original
const original = fs.readFileSync(file, 'utf8');
const comments = original.split('\n').filter(l => l.startsWith('#')).join('\n');
const newMsg = fs.readFileSync(msgFile, 'utf8').trim();

fs.writeFileSync(file, newMsg + '\n\n' + comments + '\n', 'utf8');
`
  fs.writeFileSync(scriptPath, script, { mode: 0o755 })
  return scriptPath
}

// ── Main handler ───────────────────────────────────────────────────

export const handleReword = async (): Promise<void> => {
  log.banner()
  log.step(`${colors.cyan}Edit Commit Messages${colors.reset}\n`)

  const branch = getCurrentBranch()
  console.log(`  ${colors.gray}Branch: ${branch}${colors.reset}`)

  // Check working tree
  if (!isWorkingTreeClean()) {
    log.error('Working tree has uncommitted changes.')
    log.info('Please commit or stash changes before rewording.')
    return
  }

  // Load commits
  const commits = getRecentCommits(30)
  if (commits.length === 0) {
    log.warn('No commits found.')
    return
  }

  // Compute column widths
  const maxHash = Math.max(...commits.map((c) => c.shortHash.length))
  const maxDate = Math.max(...commits.map((c) => c.relativeDate.length))

  // Build multi-select options
  const options = commits.map((c) => {
    const hashCol = c.shortHash.padEnd(maxHash)
    const dateCol = c.relativeDate.padEnd(maxDate)
    const refs = formatRefs(c.refs)
    const subj = c.subject.length > 60 ? c.subject.slice(0, 57) + '...' : c.subject
    const label =
      `${colors.yellow}${hashCol}${colors.reset}` +
      `  ${colors.gray}${dateCol}${colors.reset}` +
      `${refs}  ${colors.bright}${subj}${colors.reset}`
    return { label, value: c.hash }
  })

  console.log('')
  const selected = await multiSelect('Select commits to edit:', options)

  if (selected.length === 0) {
    log.info('No commits selected.')
    return
  }

  // Sort selected: oldest first (for rebase ordering)
  const filtered = commits.filter((c) => selected.includes(c.hash))
  const selectedCommits: CommitInfo[] = []
  for (let i = filtered.length - 1; i >= 0; i--) {
    const item = filtered[i]
    if (item) selectedCommits.push(item)
  }

  // Collect new messages for each commit
  console.log('')
  log.info(`Editing ${selectedCommits.length} commit message(s)...`)
  console.log('')

  const newMessages = new Map<string, string>()

  // Load provider/model state for AI generation
  const state = loadState() ?? {
    step: 0,
    workingBranch: '',
    targetBranch: '',
    currentBranch: branch,
    timestamp: new Date().toISOString(),
  }

  for (const commit of selectedCommits) {
    const currentMsg = getCommitMessage(commit.hash)
    console.log(
      `  ${colors.yellow}${commit.shortHash}${colors.reset}` +
        `  ${colors.gray}${commit.relativeDate}${colors.reset}` +
        `  ${colors.bright}${commit.subject}${colors.reset}`
    )

    // Per-commit method menu
    const method = await select('How to edit this commit message?', [
      { label: 'Generate from AI', value: 'ai' },
      { label: 'Edit manually', value: 'manual' },
      { label: 'Skip this commit', value: 'skip' },
    ])

    if (method === 'skip') {
      log.info(`Skipped ${commit.shortHash}`)
      console.log('')
      continue
    }

    if (method === 'manual') {
      const edited = await editInline(currentMsg, `Edit: ${commit.shortHash} ${commit.subject}`)

      if (edited === null) {
        log.info(`Skipped ${commit.shortHash}`)
      } else if (edited.trim() === currentMsg.trim()) {
        log.info(`No changes for ${commit.shortHash}`)
      } else {
        newMessages.set(commit.hash, edited.trim())
      }
      console.log('')
      continue
    }

    // ── AI generation flow ───────────────────────────────────

    const diff = getCommitDiff(commit.hash)
    if (!diff) {
      log.warn(`No diff found for ${commit.shortHash}, falling back to manual edit`)
      const edited = await editInline(currentMsg, `Edit: ${commit.shortHash} ${commit.subject}`)
      if (edited && edited.trim() !== currentMsg.trim()) {
        newMessages.set(commit.hash, edited.trim())
      }
      console.log('')
      continue
    }

    // Determine current provider/model
    let currentProvider: 'gemini' | 'copilot' | 'openrouter' =
      (state.aiProvider === 'manual' ? undefined : state.aiProvider) ?? 'gemini'
    let currentModel: string | undefined
    if (currentProvider === 'copilot') {
      currentModel = state.copilotModel as unknown as string
    } else if (currentProvider === 'openrouter') {
      currentModel = state.openrouterModel as unknown as string
    } else {
      currentModel = (state.geminiModel as unknown as string) ?? DEFAULT_GEMINI_MODEL
    }

    // Initial AI generation
    let correction = ''
    let initialAiResult: string | null = null

    const spinner = log.spinner()
    try {
      spinner.start(
        `Generating commit message with ${getAIProviderShortName(currentProvider)}` +
          `${currentModel ? ` (${currentModel})` : ''}...`
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
      spinner.stop()
    } catch {
      spinner.stop()
      log.warn('AI generation failed, falling back to manual edit')
      const edited = await editInline(currentMsg, `Edit: ${commit.shortHash} ${commit.subject}`)
      if (edited && edited.trim() !== currentMsg.trim()) {
        newMessages.set(commit.hash, edited.trim())
      }
      console.log('')
      continue
    }

    // AI accept loop (mirrors commit.ts pattern)
    let firstAttempt = true
    let forceDirect = false
    let skipRegenerate = false
    let previousAiResult: string | null = initialAiResult

    let commitDone = false

    while (!commitDone) {
      let aiResult: string | null = null

      if (skipRegenerate) {
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
        let directAttempt = 0
        const maxDirectAttempts = 2
        while (directAttempt < maxDirectAttempts && !aiResult) {
          let directModelName = ''
          if (state.aiProvider === 'copilot' && state.copilotModel) {
            directModelName = state.copilotModel as string
          } else if (state.aiProvider === 'openrouter' && state.openrouterModel) {
            directModelName = state.openrouterModel as string
          } else if (state.aiProvider === 'gemini') {
            directModelName = (state.geminiModel as string) ?? DEFAULT_GEMINI_MODEL
          }

          if (correction) console.log('')
          const sp = log.spinner()
          sp.start(
            `Regenerating with ${getAIProviderShortName(
              state.aiProvider ?? 'gemini'
            )}${directModelName ? ` (${directModelName})` : ''}...`
          )

          try {
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
            sp.stop()
          } catch {
            sp.stop()
            aiResult = null
          }

          directAttempt += 1
          if (!aiResult && directAttempt < maxDirectAttempts) {
            log.ai('Regenerate returned no suggestion; retrying...')
          }
        }
      } else {
        const provForFallback = (state.aiProvider ?? 'gemini') as
          | 'gemini'
          | 'copilot'
          | 'openrouter'
        let modelChoice: CopilotModel | OpenRouterModel | GeminiModel | string
        if (provForFallback === 'copilot') {
          modelChoice = state.copilotModel as CopilotModel
        } else if (provForFallback === 'openrouter') {
          modelChoice = state.openrouterModel as OpenRouterModel
        } else {
          modelChoice = (state.geminiModel as GeminiModel) ?? DEFAULT_GEMINI_MODEL
        }

        aiResult = await interactiveAIFallback(
          firstAttempt ? initialAiResult : null,
          provForFallback,
          modelChoice,
          diff,
          correction,
          branch,
          (provider: 'gemini' | 'copilot' | 'openrouter', model?: string) => {
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

      previousAiResult = aiResult
      firstAttempt = false
      forceDirect = false

      const commitMessage = aiResult ?? ''
      if (!commitMessage) {
        log.warn('Could not generate message; falling back to manual edit')
        const edited = await editInline(currentMsg, `Edit: ${commit.shortHash} ${commit.subject}`)
        if (edited && edited.trim() !== currentMsg.trim()) {
          newMessages.set(commit.hash, edited.trim())
        }
        break
      }

      const contextLimitDetected = isContextLimitFailure(commitMessage)

      // Display AI suggestion
      const lines = commitMessage.split('\n')
      const subject = lines.find((l) => l.trim()) ?? commitMessage
      const body = lines
        .slice(lines.indexOf(subject) + 1)
        .join('\n')
        .trim()
      log.ai(`Suggested Message:\n\n${colors.cyan}${colors.bright}${subject}`)
      if (body) {
        console.log('\n' + body + `${colors.reset}\n`)
      }

      // Accept menu
      let acceptChoice: string
      if (contextLimitDetected && !subject.trim()) {
        acceptChoice = await select('Token/context limits. Choose:', [
          {
            label: `Try again with ${getAIProviderShortName(
              currentProvider
            )}${getModelValue(currentModel) ? ` (${getModelValue(currentModel)})` : ''}`,
            value: 'try-same',
          },
          { label: 'Change model', value: 'change-model' },
          { label: 'Change AI provider', value: 'change-provider' },
          { label: 'Edit manually', value: 'edit' },
        ])
      } else {
        acceptChoice = await select('Accept this commit message?', [
          { label: 'Yes, use it', value: 'accept' },
          { label: 'Regenerate', value: 'regenerate' },
          { label: 'Edit inline', value: 'edit' },
          { label: 'Correct AI (give feedback)', value: 'correct' },
          { label: 'Change model', value: 'change-model' },
          { label: 'Change AI provider', value: 'change-provider' },
        ])
      }

      switch (acceptChoice) {
        case 'accept': {
          const normalized = normalizeAIOutput(commitMessage)
          const extracted = extractCommitTitle(normalized)

          let title: string
          let bodyText: string | null = null

          if (extracted) {
            title = extracted
            bodyText = extractCommitBody(normalized, title)
            if (bodyText) bodyText = formatCommitBody(bodyText)
          } else {
            const first = normalized.split('\n').find((l) => l.trim())
            title = first?.trim() ?? normalized
          }

          const finalMsg = bodyText ? `${title}\n\n${bodyText}` : title
          newMessages.set(commit.hash, finalMsg.trim())
          log.success(`Message set for ${commit.shortHash}`)
          commitDone = true
          break
        }
        case 'regenerate': {
          correction = ''
          forceDirect = true
          continue
        }
        case 'try-same': {
          forceDirect = true
          continue
        }
        case 'change-provider': {
          const prov = await select('Choose AI provider:', [
            { label: 'Gemini', value: 'gemini' },
            {
              label: 'GitHub Copilot (Recommended)',
              value: 'copilot',
            },
            { label: 'OpenRouter', value: 'openrouter' },
            { label: 'Back', value: 'back' },
          ])

          if (prov === 'back') {
            skipRegenerate = true
            continue
          }

          const chosenModel = await chooseModelForProvider(
            prov as 'gemini' | 'copilot' | 'openrouter',
            'Choose model:',
            'Back'
          )

          if (!chosenModel || chosenModel === 'back') {
            skipRegenerate = true
            continue
          }

          state.aiProvider = prov as 'gemini' | 'copilot' | 'openrouter'
          currentProvider = prov as 'gemini' | 'copilot' | 'openrouter'
          switch (prov) {
            case 'copilot': {
              state.copilotModel = chosenModel as unknown as CopilotModel
              state.openrouterModel = undefined
              state.geminiModel = undefined
              currentModel = chosenModel
              break
            }
            case 'openrouter': {
              state.openrouterModel = chosenModel as unknown as OpenRouterModel
              state.copilotModel = undefined
              state.geminiModel = undefined
              currentModel = chosenModel
              break
            }
            default: {
              state.geminiModel = chosenModel as unknown as GeminiModel
              state.copilotModel = undefined
              state.openrouterModel = undefined
              currentModel = chosenModel
              break
            }
          }

          saveState(state)
          forceDirect = true
          correction = ''
          continue
        }
        case 'change-model': {
          const provKey = (
            currentProvider === 'gemini' ||
            currentProvider === 'copilot' ||
            currentProvider === 'openrouter'
              ? currentProvider
              : 'gemini'
          ) as 'gemini' | 'copilot' | 'openrouter'

          const chosen = await chooseModelForProvider(provKey, 'Choose model:', 'Back')

          if (!chosen || chosen === 'back') {
            skipRegenerate = true
            continue
          }

          switch (provKey) {
            case 'copilot': {
              state.copilotModel = chosen as unknown as CopilotModel
              currentModel = chosen
              break
            }
            case 'openrouter': {
              state.openrouterModel = chosen as unknown as OpenRouterModel
              currentModel = chosen
              break
            }
            default: {
              state.geminiModel = chosen as unknown as GeminiModel
              state.copilotModel = undefined
              state.openrouterModel = undefined
              currentModel = chosen
              break
            }
          }

          saveState(state)
          forceDirect = true
          correction = ''
          continue
        }
        case 'correct': {
          correction = askQuestion('Provide corrections for the AI: ')
          forceDirect = true
          continue
        }
        case 'edit': {
          const edited = await editInline(commitMessage, `Edit: ${commit.shortHash}`)
          if (edited?.trim()) {
            const editedNorm = normalizeAIOutput(edited.trim())
            const editedTitle = extractCommitTitle(editedNorm)

            let title: string
            let bodyText: string | null = null

            if (editedTitle) {
              title = editedTitle
              bodyText = extractCommitBody(editedNorm, title)
              if (bodyText) bodyText = formatCommitBody(bodyText)
            } else {
              const first = editedNorm.split('\n').find((l) => l.trim())
              title = first?.trim() ?? editedNorm
            }

            const finalMsg = bodyText ? `${title}\n\n${bodyText}` : title
            newMessages.set(commit.hash, finalMsg.trim())
            log.success(`Message set for ${commit.shortHash}`)
            commitDone = true
          }
          break
        }
        default: {
          break
        }
      }
    }

    console.log('')
  }

  if (newMessages.size === 0) {
    log.info('No messages changed.')
    return
  }

  // Preview changes
  console.log('')
  console.log(`  ${colors.bright}Changes to apply:${colors.reset}`)
  for (const [hash, msg] of newMessages) {
    const commit = commits.find((c) => c.hash === hash)
    const short = commit?.shortHash ?? hash.slice(0, 7)
    const oldSubj = commit?.subject ?? ''
    const newSubj = msg.split('\n')[0] ?? msg
    console.log(
      `  ${colors.yellow}${short}${colors.reset}` +
        `  ${colors.red}${oldSubj}${colors.reset}` +
        `  →  ${colors.green}${newSubj}${colors.reset}`
    )
  }
  console.log('')

  if (isDryRun()) {
    logDryRun(`git rebase -i (reword ${newMessages.size} commits)`)
    return
  }

  const proceed = confirm(`Reword ${newMessages.size} commit(s)?`)
  if (!proceed) {
    log.info('Cancelled.')
    return
  }

  // Prepare temp directory with scripts and messages
  const tmpDir = path.join(os.tmpdir(), `geeto-reword-${Date.now()}`)
  const messagesDir = path.join(tmpDir, 'messages')
  fs.mkdirSync(messagesDir, { recursive: true })

  // Write message files (keyed by full hash)
  for (const [hash, msg] of newMessages) {
    fs.writeFileSync(path.join(messagesDir, hash), msg, 'utf8')
  }

  // Create editor scripts
  const allHashes = [...newMessages.keys()]
  const seqEditorPath = writeSequenceEditor(tmpDir, allHashes)
  const msgEditorPath = writeMessageEditor(tmpDir)

  // Find the parent of the oldest selected commit
  const oldestHash = selectedCommits.find((c) => newMessages.has(c.hash))?.hash
  if (!oldestHash) {
    log.error('Internal error: could not find oldest commit.')
    return
  }

  let parentRef: string
  try {
    parentRef = execSilent(`git rev-parse ${oldestHash}^`).trim()
  } catch {
    // Oldest commit might be the root commit
    parentRef = '--root'
  }

  // Execute rebase
  console.log('')
  const rebaseTarget = parentRef === '--root' ? '--root' : parentRef
  const env = {
    ...process.env,
    GIT_SEQUENCE_EDITOR: `node ${seqEditorPath}`,
    GIT_EDITOR: `node ${msgEditorPath}`,
  }

  try {
    const result = spawnSync('git', ['rebase', '-i', rebaseTarget], { stdio: 'inherit', env })

    if (result.status === 0) {
      log.success(`Reworded ${newMessages.size} commit(s)!`)
      // Show updated commits
      for (const [hash] of newMessages) {
        const short = hash.slice(0, 7)
        const newMsg = getCommitMessage(hash)?.split('\n')[0]
        if (newMsg) {
          console.log(
            `  ${colors.green}✓${colors.reset} ${colors.yellow}${short}${colors.reset} ${newMsg}`
          )
        }
      }
    } else {
      log.error('Rebase failed. You may need to resolve conflicts.')
      log.info('Run: git rebase --abort  to undo')
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    log.error(`Rebase error: ${msg}`)
    log.info('Run: git rebase --abort  to undo')
  } finally {
    // Cleanup temp files
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  }
}
