// Lightweight alternative to lodash.get for string paths like `foo.bar[0].baz`.
export function getFieldValue(source: unknown, path?: string): unknown {
  if (!source || typeof source !== 'object' || !path || !path.trim()) return undefined

  const segments = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean)

  if (!segments.length) return undefined

  return segments.reduce<unknown>((value, segment) => {
    if (value === undefined || value === null) return undefined

    if (Array.isArray(value)) {
      const index = Number(segment)
      if (!Number.isInteger(index)) return undefined
      return value[index]
    }

    if (typeof value === 'object') {
      return (value as Record<string, unknown>)[segment]
    }

    return undefined
  }, source)
}
