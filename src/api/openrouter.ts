/**
 * OpenRouter AI integration for credit-based models
 * Provides access to multiple AI models through OpenRouter API (cheapest options selected)
 */

import type { FreeModel } from '../types'

import { log } from '../utils/logging.js'

// OpenRouter API response interface
interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

// Supported models on OpenRouter (cheapest options)

/**
 * Call free AI model API via OpenRouter
 */
const callFreeModelAPI = async (prompt: string, model: FreeModel): Promise<string | null> => {
  const { getOpenRouterConfig } = await import('../utils/config.js')
  const config = getOpenRouterConfig()
  const apiKey = config.apiKey

  if (!apiKey) {
    log.warn('OpenRouter API key not found in openrouter.toml')
    return null
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://geeto-cli.com',
        'X-Title': 'Geeto CLI',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150,
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      let errorMessage = `OpenRouter API error: ${response.status}`

      switch (response.status) {
        case 401: {
          errorMessage =
            'OpenRouter API error: Invalid API key. Please check your OpenRouter configuration.'
          break
        }
        case 402: {
          errorMessage =
            'OpenRouter API error: Insufficient credits or payment required. Please check your OpenRouter account balance at https://openrouter.ai/ or add credits to continue using AI models.'
          break
        }
        case 429: {
          errorMessage =
            'OpenRouter API error: Rate limit exceeded. Please wait a moment before trying again.'
          break
        }
        case 400: {
          errorMessage = 'OpenRouter API error: Bad request. Please check your request parameters.'
          break
        }
        case 403: {
          errorMessage =
            'OpenRouter API error: Access forbidden. Please check your OpenRouter account permissions.'
          break
        }
        case 404: {
          errorMessage =
            'OpenRouter API error: Model not found. The selected model may not be available.'
          break
        }
        case 500:
        case 502:
        case 503:
        case 504: {
          errorMessage = `OpenRouter API error: Server error (${response.status}). Please try again later.`
          break
        }
        default: {
          errorMessage = `OpenRouter API error: ${response.status} - ${response.statusText || 'Unknown error'}`
        }
      }

      throw new Error(errorMessage)
    }

    const data = (await response.json()) as OpenRouterResponse
    return data.choices?.[0]?.message?.content ?? null
  } catch (error) {
    let errorMessage = 'OpenRouter API call failed'

    if (error instanceof Error) {
      errorMessage = error.message
    } else if (typeof error === 'string') {
      errorMessage = error
    } else {
      errorMessage = `Unknown error: ${String(error)}`
    }

    log.warn(`OpenRouter API call failed: ${errorMessage}`)
    return null
  }
}

/**
 * Generate branch name from Trello card title using free AI models
 */
export const generateBranchNameFromTitle = async (
  trelloTitle: string,
  correction?: string,
  model: FreeModel = 'allenai/olmo-3.1-32b-instruct'
): Promise<string | null> => {
  try {
    const prompt = `Generate a short git branch name suffix from this Trello card title:

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

    const fullPrompt = correction
      ? `${prompt}\n\nUser wants this adjustment: "${correction}"\nGenerate a new branch name based on this feedback.`
      : prompt

    const response = await callFreeModelAPI(fullPrompt, model)
    if (response) {
      // Clean up the result
      const branchName = response
        .trim()
        .replaceAll(/[^\da-z-]/g, '') // Remove special chars except hyphens
        .replaceAll(/-+/g, '-') // Replace multiple hyphens
        .replaceAll(/^-|-$/g, '') // Remove leading/trailing hyphens

      return branchName && branchName.length >= 3 ? branchName : null
    } else {
      return null
    }
  } catch (error) {
    log.warn(
      `OpenRouter (${model}) failed: ${error instanceof Error ? error.message : String(error)}`
    )
    return null
  }
}

/**
 * Generate commit message from git diff using free AI models
 */
export const generateCommitMessage = async (
  diff: string,
  correction?: string,
  model: FreeModel = 'allenai/olmo-3.1-32b-instruct'
): Promise<string | null> => {
  try {
    const prompt = `Generate a conventional commit message from this git diff:

Git diff summary:
${diff}

Requirements:
- Use conventional commit format: type(scope): description
- Types: feat, fix, docs, style, refactor, test, chore, perf, ci, build, revert
- Scope: optional, use component/module name if clear from diff
- Description: imperative mood, start with lowercase, max 72 chars
- If multiple changes, focus on the main change
- Be specific but concise

Examples:
"feat(auth): add user login functionality"
"fix(api): resolve null pointer in user validation"
"refactor(db): optimize query performance"

Output ONLY the commit message, nothing else.`

    const fullPrompt = correction
      ? `${prompt}\n\nUser wants this adjustment: "${correction}"\nGenerate a new commit message based on this feedback.`
      : prompt

    const response = await callFreeModelAPI(fullPrompt, model)
    if (response) {
      // Clean up the result
      const commitMessage = response.trim()
      return commitMessage && commitMessage.length > 10 ? commitMessage : null
    } else {
      return null
    }
  } catch (error) {
    log.warn(
      `OpenRouter (${model}) failed: ${error instanceof Error ? error.message : String(error)}`
    )
    return null
  }
}

/**
 * Generate commit message from git diff using free AI models
 */
