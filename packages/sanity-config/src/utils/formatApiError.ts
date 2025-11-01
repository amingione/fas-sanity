const extractMessage = (
  value: unknown,
  visited: WeakSet<object>,
  depth = 0,
): string | undefined => {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.message
  if (depth > 4) return undefined

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => extractMessage(item, visited, depth + 1))
      .filter((part): part is string => Boolean(part && part.trim()))
    return parts.length ? parts.join('; ') : undefined
  }

  if (typeof value === 'object') {
    if (visited.has(value as object)) return undefined
    visited.add(value as object)

    const obj = value as Record<string, unknown>

    const directKeys: Array<keyof typeof obj> = [
      'message',
      'error',
      'errorMessage',
      'error_description',
      'detail',
      'description',
    ]

    for (const key of directKeys) {
      const candidate = extractMessage(obj[key], visited, depth + 1)
      if (candidate) return candidate
    }

    if (obj.errors) {
      const candidate = extractMessage(obj.errors, visited, depth + 1)
      if (candidate) return candidate
    }

    if (obj.details) {
      const candidate = extractMessage(obj.details, visited, depth + 1)
      if (candidate) return candidate
    }
  }

  return undefined
}

export function formatApiError(error: unknown): string {
  const visited = new WeakSet<object>()
  const message = extractMessage(error, visited)
  if (message && message.trim()) return message.trim()

  try {
    if (typeof error === 'object' && error !== null) {
      return JSON.stringify(error)
    }
    return String(error)
  } catch {
    return 'Unknown error'
  }
}
