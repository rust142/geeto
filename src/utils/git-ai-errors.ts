/**
 * AI error detection utilities
 */

/**
 * Heuristics to detect transient AI errors (rate limits, quota, billing).
 */
export function isTransientAIFailure(s: string | null | undefined): boolean {
  // Empty/null isn't considered transient; callers decide whether to fallback
  if (!s) {
    return false
  }

  const low = String(s).toLowerCase()

  // If the assistant returns something that looks like a model name, it's probably not
  if (low.includes('-') || low.includes('_')) {
    const allowed = /^[\d_a-z-]+$/.test(low)
    const hasToken = low.split(/[_-]/).every((t) => t.length > 0)
    if (allowed && hasToken) {
      return false
    }
  }

  if (/rate[\s_-]?limit(ed)?/.test(low)) {
    return true
  }

  if (/quota/.test(low)) {
    return true
  }

  if (/insufficient\s+credit|insufficient\s+credits|out\s+of\s+credits|out_of_credits/.test(low)) {
    return true
  }

  if (/payment\s+required|payment\s+failed|billing/.test(low)) {
    return true
  }

  const subscriptionPattern =
    /subscription\s+required|requires\s+subscription|must\s+upgrade|upgrade\s+required/
  if (subscriptionPattern.test(low)) {
    return true
  }

  if (/not a valid model|model not found|invalid model id|model.*not found/.test(low)) {
    return true
  }

  return false
}

/** Detect errors caused by model/context token length limits. */
export function isContextLimitFailure(s: string | null | undefined): boolean {
  if (!s) {
    return false
  }

  const low = String(s).toLowerCase()

  // Common phrases from OpenRouter/Gemini/OpenAI about context length / token limits
  if (low.includes('maximum context length') || low.includes('context length is')) {
    return true
  }

  if (low.includes('requested about') && low.includes('tokens')) {
    return true
  }

  if (low.includes('middle-out')) {
    return true
  }

  if (low.includes('context window') || low.includes('token limit')) {
    return true
  }

  if (low.includes('large') || low.includes('many files')) {
    return true
  }

  // fallback: mention of tokens + too many/too long
  if (
    low.includes('tokens') &&
    (low.includes('too') || low.includes('exceed') || low.includes('exceeded'))
  ) {
    return true
  }

  return false
}
