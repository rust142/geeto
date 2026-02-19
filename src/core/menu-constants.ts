/**
 * Menu constants to avoid magic strings
 */

export const MENU_VALUES = {
  BACK: 'back',
  CANCEL: 'cancel',
  RETRY: 'retry',
  MANUAL: 'manual',
  EDIT: 'edit',
  ACCEPT: 'accept',
  REGENERATE: 'regenerate',
  SKIP: 'skip',
  YES: 'yes',
  NO: 'no',
} as const

export const AI_PROVIDERS = {
  GEMINI: 'gemini',
  COPILOT: 'copilot',
  OPENROUTER: 'openrouter',
  MANUAL: 'manual',
} as const

export type AIProvider = (typeof AI_PROVIDERS)[keyof typeof AI_PROVIDERS]
export type MenuValue = (typeof MENU_VALUES)[keyof typeof MENU_VALUES]
