/**
 * Copilot adapter — availability checks via REST API.
 *
 * Since v0.8.0, Geeto uses the Copilot REST API directly.
 * No Copilot CLI binary needed.
 */

/**
 * Check if Copilot API is accessible for the given model.
 */
export const pingModel = async (_model: string): Promise<boolean> => {
  try {
    const sdk = await import('./copilot-sdk.js')
    return await sdk.isAvailable()
  } catch {
    return false
  }
}

/**
 * Check if Copilot API is available (replaces old CLI version check).
 */
export const isCliAvailable = async (): Promise<boolean> => {
  try {
    const sdk = await import('./copilot-sdk.js')
    return await sdk.isAvailable()
  } catch {
    return false
  }
}

export default {
  pingModel,
  isCliAvailable,
}
