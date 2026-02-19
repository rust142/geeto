import type { CopilotModel } from '../api/copilot.js'
import type { GeminiModel } from '../api/gemini.js'
import type { OpenRouterModel } from '../api/openrouter.js'

export interface SelectOption {
  label: string
  value: string
}

export interface GeetoState {
  step: number
  workingBranch: string
  targetBranch: string
  currentBranch: string
  timestamp: string
  aiProvider?: 'gemini' | 'copilot' | 'openrouter' | 'manual'
  copilotModel?: CopilotModel
  openrouterModel?: OpenRouterModel
  geminiModel?: GeminiModel
  // Flags for explicitly skipped steps
  skippedCommit?: boolean
  skippedPush?: boolean
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

export interface TrelloChecklistItem {
  id: string
  name: string
  state?: 'complete' | 'incomplete'
}

export interface TrelloChecklist {
  id: string
  name: string
  checkItems: TrelloChecklistItem[]
}

export interface TrelloCard {
  id: string
  name: string
  desc?: string
  idShort: number
  shortLink: string
  url: string
  idList: string
  checklists?: TrelloChecklist[]
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
}

export interface OpenRouterConfig {
  apiKey: string
}
