import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentFile = fileURLToPath(import.meta.url)
const currentDir = path.dirname(currentFile)

// From src/utils/ or lib/utils/, go up 2 levels to project root
const PROMPTS_DIR = path.join(currentDir, '..', '..', 'prompts')

// In-memory cache to avoid repeated filesystem reads
const cache = new Map<string, string>()

/** Load a prompt file from the prompts/ directory. Results are cached. */
export const loadPrompt = (filename: string): string => {
  const cached = cache.get(filename)
  if (cached) return cached

  const filepath = path.join(PROMPTS_DIR, filename)
  const content = readFileSync(filepath, 'utf8').trim()
  cache.set(filename, content)
  return content
}

/** Load a prompt and replace `{{key}}` placeholders with provided values. */
export const loadPromptWithVars = (filename: string, vars: Record<string, string>): string => {
  let content = loadPrompt(filename)

  for (const [key, value] of Object.entries(vars)) {
    content = content.replaceAll(`{{${key}}}`, value)
  }

  return content
}
