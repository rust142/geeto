/** Format an ISO timestamp to a locale-aware string (uses system locale). */
export const formatTimestampLocale = (iso?: string): string => {
  if (!iso) {
    return 'unknown'
  }

  const detectLocale = (): string | undefined => {
    const env =
      process.env.LC_ALL ?? process.env.LC_MESSAGES ?? process.env.LANG ?? process.env.LANGUAGE
    if (!env) {
      return undefined
    }
    const localePart = env.split('.')[0] ?? ''
    return localePart ? localePart.replace('_', '-') : undefined
  }

  const locale = detectLocale()

  try {
    if (locale && Intl?.DateTimeFormat) {
      const supported = Intl.DateTimeFormat.supportedLocalesOf([locale])
      if (supported?.length) {
        return new Date(iso).toLocaleString(supported[0])
      }
    }
  } catch {
    // ignore and fall back to runtime default
  }

  return new Date(iso).toLocaleString()
}

export default formatTimestampLocale
