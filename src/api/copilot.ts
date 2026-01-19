/**
 * GitHub Copilot integration for AI-powered branch naming and commit messages
 */

import { spawn } from 'node:child_process'

import { log } from '../utils/logging.js'

/**
 * Generate branch name from Trello card title using GitHub Copilot CLI
 */
export const generateBranchNameFromTitle = async (
  trelloTitle: string,
  correction?: string,
  model: 'claude-haiku-4.5' | 'gpt-5' = 'claude-haiku-4.5'
): Promise<string | null> => {
  return new Promise((resolve) => {
    // Use GitHub Copilot CLI to generate branch name
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
    const command = 'copilot'
    const args = ['-p', prompt, '--allow-all-tools', '--model', model]

    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' }, // Disable colors
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    child.on('close', (code: number) => {
      if (code === 0 && stdout.trim()) {
        // Clean up the result - remove any extra text, keep only the branch name
        const branchName =
          stdout
            .trim()
            .split('\n')
            .filter(
              (line) =>
                line.trim() &&
                !line.includes('Total usage') &&
                !line.includes('Total duration') &&
                !line.includes('Usage by model') &&
                !line.includes('Premium request')
            )
            .pop() // Get last meaningful line
            ?.replace(/[^\da-z-]/g, '') // Remove special chars except hyphens
            ?.replace(/-+/g, '-') // Replace multiple hyphens
            ?.replace(/^-|-$/g, '') ?? null // Remove leading/trailing hyphens

        resolve(branchName && branchName.length >= 3 ? branchName : null)
      } else {
        log.warn(`GitHub Copilot (${model}) failed with exit code ${code}`)
        if (stderr.trim()) {
          log.warn(`Copilot stderr: ${stderr.trim()}`)
        }
        if (stdout.trim()) {
          log.info(`Copilot stdout: ${stdout.trim()}`)
        }
        resolve(null)
      }
    })

    child.on('error', () => {
      log.warn(`GitHub Copilot (${model}) process error`)
      resolve(null)
    })

    // Timeout after 30 seconds
    setTimeout(() => {
      child.kill()
      log.warn(`GitHub Copilot (${model}) timed out after 30 seconds`)
      resolve(null)
    }, 30000)
  })
}

/**
 * Generate commit message from git diff using GitHub Copilot CLI
 */
export const generateCommitMessage = async (
  diff: string,
  correction?: string,
  model: 'claude-haiku-4.5' | 'gpt-5' = 'claude-haiku-4.5'
): Promise<string | null> => {
  return new Promise((resolve) => {
    let prompt = `Generate a conventional commit message from this git diff:

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
feat(auth): add user login validation
fix(api): resolve null pointer in user service
docs(readme): update installation instructions
refactor(utils): simplify date formatting logic
test(auth): add unit tests for password validation
chore(deps): update lodash to version 4.17.21

Output ONLY the commit message, nothing else. No quotes, no explanation.`

    if (correction) {
      prompt += `\n\nUser wants this adjustment: "${correction}"\nGenerate a new commit message based on this feedback.`
    }

    const command = 'copilot'
    const args = ['-p', prompt, '--allow-all-tools', '--model', model]

    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' }, // Disable colors
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    child.on('close', (code: number) => {
      if (code === 0 && stdout.trim()) {
        // Clean up the result - remove any extra text, keep only the commit message
        const commitMessage =
          stdout
            .trim()
            .split('\n')
            .filter(
              (line) =>
                line.trim() &&
                !line.includes('Total usage') &&
                !line.includes('Total duration') &&
                !line.includes('Usage by model') &&
                !line.includes('Premium request')
            )
            .pop() // Get last meaningful line
            ?.trim() ?? null
        resolve(commitMessage && commitMessage.length >= 10 ? commitMessage : null)
      } else {
        log.warn(`GitHub Copilot (${model}) failed with exit code ${code}`)
        if (stderr.trim()) {
          log.warn(`Copilot stderr: ${stderr.trim()}`)
        }
        if (stdout.trim()) {
          log.info(`Copilot stdout: ${stdout.trim()}`)
        }
        resolve(null)
      }
    })

    child.on('error', (error: Error) => {
      log.warn(`GitHub Copilot (${model}) process error: ${error.message}`)
      resolve(null)
    })

    // Timeout after 30 seconds
    setTimeout(() => {
      child.kill()
      log.warn(`GitHub Copilot (${model}) timed out after 30 seconds`)
      resolve(null)
    }, 30000)
  })
}
