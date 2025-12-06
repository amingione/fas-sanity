export const formatApiError = (value: unknown): string => {
  if (!value) return 'Unknown error'
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.message
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

