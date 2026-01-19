export interface SelectOption {
  label: string
  value: string
}

// Models available on OpenRouter (cheapest options)
export type FreeModel =
  | 'allenai/olmo-3.1-32b-instruct'
  | 'minimax/minimax-m2.1'
  | 'meta-llama/llama-3.2-3b-instruct:free'
  | 'meta-llama/llama-3.1-8b-instruct:free'
  | 'meta-llama/llama-3.1-70b-instruct:free'

export interface GeetoState {
  step: number
  workingBranch: string
  targetBranch: string
  currentBranch: string
  stagedFiles: string[]
  timestamp: string
  aiProvider?: 'gemini' | 'copilot' | 'openrouter'
  copilotModel?: 'claude-haiku-4.5' | 'gpt-5'
  openrouterModel?: FreeModel
}

export interface BranchNamingResult {
  workingBranch: string
  shouldRestart: boolean
  cancelled: boolean
}

export interface TrelloConfig {
  apiKey: string
  token: string
  boardId: string
}

export interface TrelloCard {
  id: string
  name: string
  idShort: number
  shortLink: string
  url: string
  idList: string
}

export interface TrelloList {
  id: string
  name: string
}

export interface BranchStrategyConfig {
  separator: '-' | '_'
  lastNamingStrategy?: 'title-full' | 'title-ai' | 'ai' | 'trello' | 'manual'
  lastTrelloList?: string // Last selected Trello list ID
}

export type TaskPlatform = 'trello' | 'none'

export interface TaskPlatformOption {
  name: string
  value: TaskPlatform
  enabled: boolean
}

export interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>
    }
  }>
  error?: { message: string }
}

export interface BranchNamingResult {
  workingBranch: string
  shouldRestart: boolean
  cancelled: boolean
}

export interface GeminiConfig {
  apiKey: string
  model: string
}

export interface OpenRouterConfig {
  apiKey: string
}
