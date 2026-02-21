/**
 * Menu option builders for consistent UI
 */

/** Build standard menu with cancel option */
export function withCancel<T extends string>(
  options: Array<{ label: string; value: T }>
): Array<{ label: string; value: T | 'cancel' }> {
  return [...options, { label: 'Cancel', value: 'cancel' as const }]
}

/** Build standard menu with back option */
export function withBack<T extends string>(
  options: Array<{ label: string; value: T }>,
  backLabel = 'Back'
): Array<{ label: string; value: T | 'back' }> {
  return [...options, { label: backLabel, value: 'back' as const }]
}

/** Build AI provider menu */
export function buildAIProviderMenu() {
  return [
    { label: 'Gemini', value: 'gemini' as const },
    { label: 'GitHub (Recommended)', value: 'copilot' as const },
    { label: 'OpenRouter', value: 'openrouter' as const },
  ]
}

/** Build yes/no menu */
export function buildYesNoMenu() {
  return [
    { label: 'Yes', value: 'yes' as const },
    { label: 'No', value: 'no' as const },
  ]
}

/** Build retry/cancel menu */
export function buildRetryCancelMenu() {
  return [
    { label: 'Retry', value: 'retry' as const },
    { label: 'Cancel', value: 'cancel' as const },
  ]
}
