/**
 * Commit message formatting and validation helpers
 */

const COMMIT_TYPES = [
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
] as const

export type CommitType = (typeof COMMIT_TYPES)[number]

export const getCommitTypes = () => [
  { label: 'feat     - New feature', value: 'feat' as const },
  { label: 'fix      - Bug fix', value: 'fix' as const },
  { label: 'docs     - Documentation', value: 'docs' as const },
  { label: 'style    - Code style changes', value: 'style' as const },
  { label: 'refactor - Code refactoring', value: 'refactor' as const },
  { label: 'test     - Testing', value: 'test' as const },
  { label: 'chore    - Maintenance', value: 'chore' as const },
  { label: 'perf     - Performance improvement', value: 'perf' as const },
  { label: 'ci       - CI/CD changes', value: 'ci' as const },
  { label: 'build    - Build system changes', value: 'build' as const },
  { label: 'revert   - Revert changes', value: 'revert' as const },
  { label: 'cancel', value: 'cancel' as const },
]

export function normalizeAIOutput(input: string): string {
  let t = String(input ?? '')

  // Remove fenced code blocks and triple backticks
  t = t.replaceAll(/```[\w-]*\n?/g, '').replaceAll('```', '')
  // Remove inline backticks
  t = t.replaceAll('`', '')
  // Trim surrounding quotes and whitespace
  t = t.replaceAll(/^"+|"+$/g, '').trim()

  // Strip any explanatory preface before the conventional commit line
  const lower = t.toLowerCase()

  let earliestIndex = -1
  for (const typ of COMMIT_TYPES) {
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

export function extractCommitTitle(text: string): string | null {
  // Try line-by-line first
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  for (const line of lines) {
    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) {
      continue
    }

    const left = line.slice(0, colonIndex).trim()
    const type = (left.split('(')[0] ?? '').trim()
    if (COMMIT_TYPES.includes(type as CommitType)) {
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

  for (const t of COMMIT_TYPES) {
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
    const rest = text.slice(earliestIndex)
    const endIdx = rest.indexOf('\n')
    const line = (endIdx === -1 ? rest : rest.slice(0, endIdx)).trim()
    if (line.includes(':') && line.length > foundType.length + 2) {
      return line
    }
  }

  return null
}

export function extractCommitBody(text: string, title: string): string | null {
  const lines = text.split('\n').map((l) => l.trim())
  const titleIndex = lines.indexOf(title)

  if (titleIndex === -1) {
    return null
  }

  const bodyLines = lines.slice(titleIndex + 1).filter(Boolean)
  return bodyLines.length > 0 ? bodyLines.join('\n') : null
}

export function formatCommitBody(body: string): string {
  const lines = body.split('\n')
  const wrapped: string[] = []

  for (const line of lines) {
    if (line.length <= 72) {
      wrapped.push(line)
    } else {
      const words = line.split(' ')
      let currentLine = ''
      for (const word of words) {
        if ((currentLine + ' ' + word).length <= 72) {
          currentLine += (currentLine ? ' ' : '') + word
        } else {
          if (currentLine) wrapped.push(currentLine)
          currentLine = word
        }
      }
      if (currentLine) wrapped.push(currentLine)
    }
  }

  return wrapped.join('\n')
}

export function isConventionalLine(line: string): boolean {
  const colonIndex = line.indexOf(':')
  if (colonIndex === -1) return false

  const left = line.slice(0, colonIndex).trim()
  const type = (left.split('(')[0] ?? '').trim()
  return COMMIT_TYPES.includes(type as CommitType)
}

export function validateCommitMessage(message: string): { valid: boolean; error?: string } {
  const lines = message.split('\n').map((l) => l.trim())
  const title = lines[0]

  if (!title) {
    return { valid: false, error: 'Commit message cannot be empty' }
  }

  if (!isConventionalLine(title)) {
    return { valid: false, error: 'Title must follow conventional commit format' }
  }

  if (title.length > 100) {
    return { valid: false, error: 'Title must be 100 characters or less' }
  }

  return { valid: true }
}
