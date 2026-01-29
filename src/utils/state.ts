/**
 * State management for checkpoint recovery
 */

import type { GeetoState } from '../types/index.js'

import fs from 'node:fs'

import { ensureGeetoIgnored } from './config.js'
import { STEP } from '../core/constants.js'

const STATE_FILE = '.geeto/geeto-state.json'

/**
 * Save state to checkpoint file
 */
export const saveState = (state: GeetoState): void => {
  // Ensure .geeto is in .gitignore
  ensureGeetoIgnored()

  // Ensure .geeto directory exists
  const stateDir = STATE_FILE.slice(0, STATE_FILE.lastIndexOf('/'))
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true })
  }

  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

/**
 * Load state from checkpoint file
 */
export const loadState = (): GeetoState | null => {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as GeetoState
    }
  } catch {
    // Ignore errors
  }
  return null
}

/**
 * Reset checkpoint but preserve configured AI provider and models.
 * Useful for "Start fresh" while keeping AI settings.
 */
export const preserveProviderState = (state: GeetoState): void => {
  try {
    const minimal: GeetoState = {
      step: STEP.INIT,
      workingBranch: '',
      targetBranch: '',
      currentBranch: state.currentBranch ?? '',
      timestamp: new Date().toISOString(),
      aiProvider: state.aiProvider,
      copilotModel: state.copilotModel,
      openrouterModel: state.openrouterModel,
      geminiModel: state.geminiModel,
    }

    // Reuse save logic to ensure .geeto exists and is ignored
    saveState(minimal)
  } catch {
    // Ignore errors
  }
}

/**
 * Get human-readable step name
 */
export const getStepName = (step: number): string => {
  const stepNames: Record<number, string> = {
    0: 'Initial',
    1: 'Staging completed',
    2: 'Branch created',
    3: 'Commit completed',
    4: 'Push completed',
    5: 'Merge completed',
    6: 'Cleanup',
    7: 'Done',
  }
  return stepNames[step] ?? 'Unknown'
}
