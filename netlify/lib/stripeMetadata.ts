export type StripeMetadata = Record<string, unknown> | null | undefined

export type StripeMetadataEntry = {
  _type: 'stripeMetadataEntry'
  key: string
  value: string
}

export function mapStripeMetadata(metadata: StripeMetadata): StripeMetadataEntry[] | undefined {
  if (!metadata) return undefined
  const entries = Object.entries(metadata).reduce<StripeMetadataEntry[]>((acc, [key, raw]) => {
    const normalizedKey = key?.toString().trim()
    if (!normalizedKey) return acc
    if (raw === undefined || raw === null) return acc
    let value: string
    if (typeof raw === 'string') {
      value = raw
    } else if (typeof raw === 'number' || typeof raw === 'boolean') {
      value = String(raw)
    } else {
      try {
        value = JSON.stringify(raw)
      } catch {
        value = String(raw)
      }
    }
    const trimmedValue = value.trim()
    if (!trimmedValue) return acc
    acc.push({_type: 'stripeMetadataEntry', key: normalizedKey, value: trimmedValue})
    return acc
  }, [])
  return entries.length ? entries : undefined
}
