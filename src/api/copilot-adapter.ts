import { exec } from '../utils/exec.js'
import { log } from '../utils/logging.js'

/**
 * Try SDK availability first; fallback to CLI ping for model enable checks.
 */
export const pingModel = async (model: string): Promise<boolean> => {
  try {
    const sdk = await import('./copilot-sdk.js')
    if (sdk && typeof sdk.isAvailable === 'function') {
      const ok = await sdk.isAvailable()
      if (ok) {
        return true
      }
    }
  } catch {
    // ignore
  }

  try {
    exec(`copilot -p "ping" --model ${model}`, true)
    return true
  } catch (error) {
    log.info('Copilot CLI ping failed: ' + String(error))
    return false
  }
}

export const isCliAvailable = (): boolean => {
  try {
    exec('copilot --version', true)
    return true
  } catch {
    return false
  }
}

export default {
  pingModel,
  isCliAvailable,
}
