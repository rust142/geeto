/**
 * Gemini API integration for AI-powered branch naming
 */

import type { GeminiResponse } from '../types/index.js'

import { getGeminiConfig } from '../utils/config.js'
import { log } from '../utils/logging.js'

/**
 * Call Gemini API with retry logic
 */
export const callGeminiAPI = async (prompt: string, retries = 3): Promise<string | null> => {
  const config = getGeminiConfig()
  if (!config.apiKey) {
    log.warn('Gemini API key not found')
    return null
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.8,
              maxOutputTokens: 256,
            },
          }),
        }
      )

      if (response.status === 429) {
        const waitTime = attempt * 5
        log.warn(`Rate limited. Waiting ${waitTime}s... (attempt ${attempt}/${retries})`)
        await new Promise((resolve) => setTimeout(resolve, waitTime * 1000))
        continue
      }

      if (!response.ok) {
        log.warn(`Gemini API HTTP error: ${response.status} ${response.statusText}`)
        return null
      }

      const data = (await response.json()) as GeminiResponse

      if (data.error) {
        log.error(`Gemini API error: ${data.error.message}`)
        return null
      }

      return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null
    } catch (error) {
      const errorMessage = (error as Error).message
      if (attempt === retries) {
        log.error(`Gemini API failed: ${(error as Error).message}`)
        return null
      }
      log.warn(`Gemini API attempt ${attempt} failed: ${errorMessage}, retrying...`)
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }
  return null
}

/**
 * Generate branch name from staged files and diff
 */
export const generateBranchName = async (
  prefix: string,
  stagedFiles: string[],
  diff: string,
  correction?: string
): Promise<string | null> => {
  let prompt = `Generate a descriptive git branch name suffix based on the code changes.

Branch prefix that will be used: ${prefix}#
Changed files: ${stagedFiles.slice(0, 15).join(', ')}

Code diff (partial):
${diff.slice(0, 2000)}

Requirements:
- Output ONLY the suffix part (without the "${prefix}#" prefix)
- Use kebab-case format (lowercase-with-hyphens)
- Length: 10-40 characters (not too short, not too long)
- Be specific and descriptive about what the changes do
- Include the main feature/fix/component being changed

Good examples:
- "add-user-authentication-flow"
- "fix-booking-api-validation"
- "update-navbar-responsive-design"
- "refactor-git-flow-script"
- "implement-gemini-ai-integration"

Bad examples (too vague):
- "add" (too short)
- "fix" (too short)
- "update" (too short)
- "changes" (not descriptive)

Output ONLY the branch suffix, nothing else. No quotes, no explanation.`

  if (correction) {
    prompt += `\n\nUser wants this adjustment: "${correction}"\nGenerate a new branch name based on this feedback.`
  }

  return callGeminiAPI(prompt)
}

/**
 * Generate branch name from Trello card title
 */
export const generateBranchNameFromTitle = async (
  trelloTitle: string,
  correction?: string
): Promise<string | null> => {
  let prompt = `Generate a short git branch name suffix from this Trello card title:

Trello title: "${trelloTitle}"

Requirements:
- Output ONLY the branch suffix (no prefix like "dev#" or "#123-")
- Use kebab-case format (lowercase-with-hyphens)
- Length: 15-40 characters (be descriptive, don't truncate important info)
- Keep important context like version numbers, years, or key details
- Focus on the main action and what's being changed
- NEVER truncate in the middle of a word or number

Good examples from titles:
"Add user authentication flow" → "add-user-authentication"
"Fix booking API validation" → "fix-booking-validation"
"Update navbar responsive design" → "update-navbar-responsive"
"Refactor git flow script" → "refactor-git-flow"
"Create shopping cart feature" → "create-shopping-cart"
"Fix payment processing bug" → "fix-payment-processing"
"Update database schema migration" → "update-database-schema"
"Implement email notifications" → "implement-email-notifications"
"Add admin dashboard" → "add-admin-dashboard"
"Optimize image upload service" → "optimize-image-upload"

Bad examples (avoid):
- "create-shopping-cart-feat" (truncated, missing context)
- "update-datab" (incomplete word)
- "fix-bug" (too short)

Output ONLY the branch suffix, nothing else. No quotes, no explanation.`

  if (correction) {
    prompt += `\n\nUser wants this adjustment: "${correction}"\nGenerate a new branch name based on this feedback.`
  }

  return callGeminiAPI(prompt)
}
