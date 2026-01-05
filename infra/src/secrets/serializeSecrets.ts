export function serializeSecrets(secrets: Record<string, unknown>): string {
  return JSON.stringify(
    secrets,
    (_key, value) => {
      if (value === undefined) return undefined

      if (typeof value === 'object' && value !== null) {
        return value
      }

      return String(value)
    },
    2,
  )
}
