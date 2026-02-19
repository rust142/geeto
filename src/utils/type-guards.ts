/**
 * Type guard utilities
 */

export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value)
}

export function isError(value: unknown): value is Error {
  return value instanceof Error
}

export function getErrorMessage(error: unknown): string {
  if (isError(error)) return error.message
  if (isString(error)) return error
  return String(error)
}

export function assertNonNull<T>(value: T | null | undefined, message?: string): T {
  if (value == null) {
    throw new Error(message ?? 'Unexpected null/undefined value')
  }
  return value
}

export function isDefined<T>(value: T | null | undefined): value is T {
  return value != null
}
