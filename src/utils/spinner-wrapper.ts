/**
 * Spinner wrapper utilities for progress indication
 */

import { log } from './logging.js'

/**
 * Execute async function with spinner
 */
export async function withSpinner<T>(message: string, fn: () => Promise<T>): Promise<T> {
  const spinner = log.spinner()
  spinner.start(message)
  try {
    const result = await fn()
    spinner.stop()
    return result
  } catch (error) {
    spinner.stop()
    throw error
  }
}

/**
 * Execute async function with spinner and error handling
 */
export async function withSpinnerSafe<T>(
  message: string,
  fn: () => Promise<T>,
  onError?: (error: unknown) => T
): Promise<T | null> {
  const spinner = log.spinner()
  spinner.start(message)
  try {
    const result = await fn()
    spinner.stop()
    return result
  } catch (error) {
    spinner.stop()
    if (onError) {
      return onError(error)
    }
    return null
  }
}

/**
 * Execute sync function with spinner
 */
export function withSpinnerSync<T>(message: string, fn: () => T): T {
  const spinner = log.spinner()
  spinner.start(message)
  try {
    const result = fn()
    spinner.stop()
    return result
  } catch (error) {
    spinner.stop()
    throw error
  }
}
