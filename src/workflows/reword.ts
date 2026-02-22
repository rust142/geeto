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
import { execAsync, execSilent } from '../utils/exec.js'
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
import { ScrambleProgress } from '../utils/scramble.js'
import { loadState, saveState } from '../utils/state.js'

// ── Types ──────────────────────────────────────────────────────────

interface CommitInfo {
  hash: string
  shortHash: string
  subject: string
  body: string
  author: string
  committer: string
  authorDate: string
  committerDate: string
  relativeDate: string
  refs: string
  /** true when authorDate ≠ committerDate (rebased / amended) */
  isModified: boolean
  /** true when author ≠ committer (cherry-picked / applied by someone else) */
  isReauthored: boolean
}

// ── Helpers ────────────────────────────────────────────────────────

const SEP = '<<GTO>>'
const REC = '<<END>>'

const getRecentCommits = (limit: number): CommitInfo[] => {
  try {
    const format = ['%H', '%h', '%s', '%b', '%an', '%cn', '%ai', '%ci', '%cr', '%D'].join(SEP)
    const raw = execSilent(`git log --format="${format}${REC}" -${limit}`).trim()
    if (!raw) return []

    return raw
      .split(REC)
      .map((r) => r.trim())
      .filter(Boolean)
      .map((r) => {
        const p = r.split(SEP)
        const authorName = p[4] ?? ''
        const committerName = p[5] ?? ''
        const authorDate = (p[6] ?? '').trim()
        const committerDate = (p[7] ?? '').trim()
        // Compare only date portion (first 19 chars: YYYY-MM-DD HH:MM:SS)
        const isModified = authorDate.slice(0, 19) !== committerDate.slice(0, 19)
        const isReauthored = authorName !== committerName
        return {
          hash: p[0] ?? '',
          shortHash: p[1] ?? '',
          subject: p[2] ?? '',
          body: (p[3] ?? '').trim(),
          author: authorName,
          committer: committerName,
          authorDate,
          committerDate,
          relativeDate: p[8] ?? '',
          refs: p[9] ?? '',
          isModified,
          isReauthored,
        }
      })
      .filter((c) => c.hash !== '')
  } catch {
    return []
  }
}

/** Badge for modified/reauthored commits */
const modBadge = (c: CommitInfo): string => {
  if (c.isReauthored) return ` ${colors.magenta}🍒${colors.reset}`
  if (c.isModified) return ` ${colors.blue}🔄${colors.reset}`
  return ''
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

// ── Commit format detection ────────────────────────────────────────

type CommitFormat = 'conventional' | 'bracket-tag' | 'no-prefix' | 'other'

const CONVENTIONAL_TYPES = new Set([
  'feat',
  'fix',
  'chore',
  'docs',
  'style',
  'refactor',
  'test',
  'ci',
  'perf',
  'build',
  'revert',
])

const detectCommitFormat = (subject: string): CommitFormat => {
  const colonIdx = subject.indexOf(':')
  if (colonIdx > 0) {
    let typeStr = subject.slice(0, colonIdx).trim()
    // Remove scope: feat(auth) → feat
    const parenIdx = typeStr.indexOf('(')
    if (parenIdx > 0) typeStr = typeStr.slice(0, parenIdx)
    // Remove breaking change marker: feat! → feat
    typeStr = typeStr.replace(/!$/, '')
    if (CONVENTIONAL_TYPES.has(typeStr.toLowerCase())) return 'conventional'
    // Other prefix like "Update:" or "ADD:"
    if (/^[A-Z]/.test(typeStr)) return 'other'
  }
  if (/^\[.+\]\s/.test(subject)) return 'bracket-tag'
  return 'no-prefix'
}

const formatLabel = (format: CommitFormat): string => {
  switch (format) {
    case 'conventional': {
      return 'conventional commits'
    }
    case 'bracket-tag': {
      return '[TAG] style'
    }
    case 'no-prefix': {
      return 'no prefix'
    }
    case 'other': {
      return 'non-standard prefix'
    }
  }
}

/** Get GitHub repo URL from remote origin (for clickable links). */
const getRepoUrl = (): string => {
  try {
    return execSilent('git config --get remote.origin.url')
      .trim()
      .replace(/\.git$/, '')
      .replace(/^git@github\.com:/, 'https://github.com/')
  } catch {
    return ''
  }
}

/** Wrap text in OSC 8 hyperlink (clickable in supported terminals). */
const hyperlink = (url: string, text: string): string =>
  `\u001B]8;;${url}\u0007${text}\u001B]8;;\u0007`

// ── Main handler ───────────────────────────────────────────────────

export const handleReword = async (): Promise<void> => {
  log.banner()
  log.step(`${colors.cyan}Edit Commit Messages${colors.reset}\n`)

  const branch = getCurrentBranch()
  const isProtected = ['main', 'master', 'develop', 'production', 'staging'].includes(branch)
  console.log(`  ${colors.gray}Branch: ${branch}${colors.reset}`)

  if (isProtected) {
    console.log(
      `  ${colors.red}⚠${colors.reset} ${colors.bright}Protected branch${colors.reset} — rewriting history here affects all collaborators.`
    )
  }

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

  // Detect commit format consistency (skip merge commits)
  const isMerge = (subject: string): boolean => /^Merge\s/.test(subject)
  const formats = commits.map((c) => (isMerge(c.subject) ? null : detectCommitFormat(c.subject)))

  // Count non-merge formats
  const formatCounts = new Map<CommitFormat, number>()
  for (const f of formats) {
    if (f !== null) formatCounts.set(f, (formatCounts.get(f) ?? 0) + 1)
  }
  const totalNonMerge = [...formatCounts.values()].reduce((a, b) => a + b, 0)

  // Find majority format among non-merge commits
  let majorityFormat: CommitFormat = 'conventional'
  let majorityCount = 0
  for (const [fmt, count] of formatCounts) {
    if (count > majorityCount) {
      majorityFormat = fmt
      majorityCount = count
    }
  }

  // Priority-based inconsistency detection:
  // conventional (1st) > bracket-tag (2nd) > no-prefix / other (3rd)
  // - conventional: NEVER gets ⚠ (gold standard)
  // - bracket-tag: ⚠ only when conventional is the majority
  // - no-prefix/other: ⚠ when ANY conventional or bracket-tag exists
  const hasConventional = (formatCounts.get('conventional') ?? 0) > 0
  const hasBracketTag = (formatCounts.get('bracket-tag') ?? 0) > 0
  const hasStructured = hasConventional || hasBracketTag

  const isInconsistent = (fmt: CommitFormat | null): boolean => {
    if (fmt === null) return false // merge commits — always skip
    if (fmt === 'conventional') return false // gold standard — never flag
    if (fmt === 'bracket-tag') return majorityFormat === 'conventional' // only flag if conventional is majority
    // no-prefix / other: flag if any structured format exists
    return hasStructured
  }

  const inconsistentCount = formats.filter((f) => isInconsistent(f)).length

  // Show consistency summary if issues found
  if (inconsistentCount > 0) {
    console.log(
      `  ${colors.yellow}⚠${colors.reset} ${inconsistentCount} inconsistent commit(s) detected`
    )
    console.log(
      `  ${colors.gray}Team pattern: ${formatLabel(majorityFormat)} (${majorityCount}/${totalNonMerge})${colors.reset}`
    )
    // If bracket-tag is majority, gently suggest conventional commits
    if (majorityFormat === 'bracket-tag' && !hasConventional) {
      console.log(
        `  ${colors.gray}💡 Tip: conventional commits is the recommended project standard${colors.reset}`
      )
    }
    console.log('')
  } else if (majorityFormat !== 'conventional' && totalNonMerge > 0) {
    // No inconsistencies but not using conventional — soft tip
    console.log(
      `  ${colors.gray}💡 Tip: conventional commits is the recommended project standard${colors.reset}`
    )
    console.log('')
  }

  // Compute column widths
  const maxHash = Math.max(...commits.map((c) => c.shortHash.length))
  const repoUrl = getRepoUrl()

  // Build multi-select options
  const options = commits.map((c, i) => {
    const hashCol = c.shortHash.padEnd(maxHash)
    const refs = formatRefs(c.refs)
    const subj = c.subject.length > 60 ? c.subject.slice(0, 57) + '...' : c.subject

    // Show indicator only when inconsistencies exist
    const fmt = formats[i] ?? null
    const indicator =
      inconsistentCount > 0
        ? isInconsistent(fmt)
          ? `${colors.red}⚠${colors.reset} `
          : fmt === null
            ? '  ' // merge commit — no indicator
            : `${colors.green}✓${colors.reset} `
        : ''

    // Wrap hash in OSC 8 hyperlink when repo URL is available
    const hashDisplay = repoUrl
      ? hyperlink(`${repoUrl}/commit/${c.hash}`, `${colors.yellow}${hashCol}${colors.reset}`)
      : `${colors.yellow}${hashCol}${colors.reset}`

    const badge = modBadge(c)

    const label =
      `${indicator}${hashDisplay}${badge}` +
      `  ${colors.gray}${c.relativeDate}${colors.reset}` +
      `${refs}  ${colors.bright}${subj}${colors.reset}`
    return { label, value: c.hash }
  })

  // Show modification legend if any modified/reauthored commits exist
  const modCount = commits.filter((c) => c.isModified && !c.isReauthored).length
  const reauthorCount = commits.filter((c) => c.isReauthored).length
  if (modCount > 0 || reauthorCount > 0) {
    const parts: string[] = []
    if (modCount > 0) {
      parts.push(`${colors.blue}🔄${colors.reset} rebased/amended (${modCount})`)
    }
    if (reauthorCount > 0) {
      parts.push(`${colors.magenta}🍒${colors.reset} cherry-picked (${reauthorCount})`)
    }
    console.log(`\n  ${colors.gray}Legend: ${parts.join('  ')}${colors.reset}`)
  }

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
    const hashDisp = repoUrl
      ? hyperlink(
          `${repoUrl}/commit/${commit.hash}`,
          `${colors.yellow}${commit.shortHash}${colors.reset}`
        )
      : `${colors.yellow}${commit.shortHash}${colors.reset}`
    console.log(
      `  ${hashDisp}${modBadge(commit)}` +
        `  ${colors.gray}${commit.relativeDate}${colors.reset}` +
        `  ${colors.bright}${commit.subject}${colors.reset}`
    )

    console.log('')

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

    // Show full current commit message before AI generation
    console.log(`  ${colors.bright}Current message:${colors.reset}`)
    for (const line of currentMsg.split('\n')) {
      console.log(`  ${colors.gray}${line}${colors.reset}`)
    }
    console.log('')

    // Ask what user wants to change before generating
    const editGuidance = askQuestion('What would you like to change? (empty = auto-generate): ')

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
    let correction = editGuidance.trim()
    let initialAiResult: string | null = null

    const spinner = new ScrambleProgress()
    try {
      spinner.start([
        'analyzing commit diff...',
        `generating commit message with ${getAIProviderShortName(currentProvider)}${currentModel ? ` (${currentModel})` : ''}...`,
        'formatting conventional commit...',
      ])

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
          const sp = new ScrambleProgress()
          sp.start([
            'reviewing feedback...',
            `regenerating with ${getAIProviderShortName(state.aiProvider ?? 'gemini')}${directModelName ? ` (${directModelName})` : ''}...`,
            'formatting conventional commit...',
          ])

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
              label: 'GitHub (Recommended)',
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

  // Preview changes — complete before/after summary
  const line = '─'.repeat(56)
  console.log('')
  console.log(`  ${colors.cyan}┌${line}┐${colors.reset}`)
  console.log(
    `  ${colors.cyan}│${colors.reset} ${colors.bright}Changes to apply (${newMessages.size} commit${newMessages.size > 1 ? 's' : ''})${colors.reset}`
  )
  console.log(`  ${colors.cyan}├${line}┤${colors.reset}`)

  let isFirst = true
  for (const [hash, msg] of newMessages) {
    const commit = commits.find((c) => c.hash === hash)
    const short = commit?.shortHash ?? hash.slice(0, 7)
    const oldMsg = commit ? getCommitMessage(commit.hash) : ''
    const oldTitle = oldMsg.split('\n')[0] ?? ''
    const oldBody = oldMsg.split('\n').slice(1).join('\n').trim()
    const newTitle = msg.split('\n')[0] ?? msg
    const newBody = msg.split('\n').slice(1).join('\n').trim()

    if (!isFirst) {
      console.log(`  ${colors.cyan}│${colors.reset}`)
    }
    const badge = commit ? modBadge(commit) : ''
    const summaryHash =
      repoUrl && commit
        ? hyperlink(`${repoUrl}/commit/${commit.hash}`, `${colors.yellow}${short}${colors.reset}`)
        : `${colors.yellow}${short}${colors.reset}`
    console.log(
      `  ${colors.cyan}│${colors.reset}  ${summaryHash}${badge}  ${colors.gray}${commit?.relativeDate ?? ''}${colors.reset}`
    )
    console.log(`  ${colors.cyan}│${colors.reset}  ${colors.red}− ${oldTitle}${colors.reset}`)
    console.log(`  ${colors.cyan}│${colors.reset}  ${colors.green}+ ${newTitle}${colors.reset}`)

    // Show body diff if changed
    if (oldBody !== newBody) {
      if (oldBody) {
        for (const bodyLine of oldBody.split('\n').slice(0, 3)) {
          console.log(
            `  ${colors.cyan}│${colors.reset}    ${colors.red}− ${bodyLine}${colors.reset}`
          )
        }
        if (oldBody.split('\n').length > 3) {
          console.log(
            `  ${colors.cyan}│${colors.reset}    ${colors.gray}  ... (${oldBody.split('\n').length - 3} more lines)${colors.reset}`
          )
        }
      }
      if (newBody) {
        for (const bodyLine of newBody.split('\n').slice(0, 3)) {
          console.log(
            `  ${colors.cyan}│${colors.reset}    ${colors.green}+ ${bodyLine}${colors.reset}`
          )
        }
        if (newBody.split('\n').length > 3) {
          console.log(
            `  ${colors.cyan}│${colors.reset}    ${colors.gray}  ... (${newBody.split('\n').length - 3} more lines)${colors.reset}`
          )
        }
      }
    }
    isFirst = false
  }

  console.log(`  ${colors.cyan}└${line}┘${colors.reset}`)
  console.log('')

  if (isDryRun()) {
    logDryRun(`git rebase -i (reword ${newMessages.size} commits)`)
    return
  }

  // Pre-rebase warnings
  if (isProtected) {
    console.log(
      `  ${colors.red}⚠ WARNING:${colors.reset} You are about to rewrite history on ${colors.cyan}${branch}${colors.reset} — a shared/protected branch.`
    )
    console.log(
      `  ${colors.gray}Rewriting ${branch} can break other team members' local repos.${colors.reset}`
    )
    console.log(`  ${colors.gray}Consider rewording on a feature branch instead.${colors.reset}`)
    console.log('')
  }

  console.log(`  ${colors.gray}Before proceeding, make sure:${colors.reset}`)
  console.log(
    `    ${colors.gray}1. Create a backup branch:${colors.reset} ${colors.cyan}git branch backup/${branch}${colors.reset}`
  )
  console.log(
    `    ${colors.gray}2. No uncommitted changes:${colors.reset} ${colors.cyan}git stash${colors.reset} ${colors.gray}(if needed)${colors.reset}`
  )
  console.log(
    `    ${colors.gray}3. Inform your team before rewriting shared branches${colors.reset}`
  )
  console.log('')

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

      // Offer force push (reword requires force push to update remote)
      console.log('')
      const shouldPush = confirm('Force push to update remote? (recommended)')
      if (shouldPush) {
        if (isDryRun()) {
          logDryRun(`git push --force-with-lease origin ${branch}`)
        } else {
          console.log('')
          const pushProgress = new ScrambleProgress()
          pushProgress.start([
            'preparing force push...',
            'pushing to remote...',
            'confirming remote state...',
          ])
          try {
            await execAsync(`git push --force-with-lease origin "${branch}"`, true)
            pushProgress.succeed(`Force pushed ${branch} to remote`)
          } catch (pushError) {
            pushProgress.fail('Force push failed')
            const stderr = (pushError as { stderr?: string }).stderr?.trim()
            if (stderr) log.error(`  ${stderr.split('\n')[0]}`)
          }
        }
      }

      // Team warning — history has been rewritten
      console.log('')
      console.log(
        `  ${colors.yellow}⚠${colors.reset} ${colors.bright}History rewritten!${colors.reset} All commit hashes on ${colors.cyan}${branch}${colors.reset} have changed.`
      )
      console.log(
        `  ${colors.gray}If this branch is shared, inform your team to run:${colors.reset}`
      )
      console.log('')
      console.log(`    ${colors.cyan}git fetch origin${colors.reset}`)
      console.log(`    ${colors.cyan}git reset --hard origin/${branch}${colors.reset}`)
      console.log('')
      console.log(`  ${colors.gray}Or if they have local changes:${colors.reset}`)
      console.log('')
      console.log(`    ${colors.cyan}git fetch origin${colors.reset}`)
      console.log(`    ${colors.cyan}git rebase origin/${branch}${colors.reset}`)
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
