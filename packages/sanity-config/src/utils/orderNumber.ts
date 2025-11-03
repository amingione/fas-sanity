export function formatOrderNumber(value?: string | null): string | null {
  if (!value) return null
  const trimmed = value.toString().trim().toUpperCase()
  if (!trimmed) return null
  if (/^FAS-\d{6}$/.test(trimmed)) return trimmed
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length >= 6) return `FAS-${digits.slice(-6)}`
  return trimmed
}

export function orderNumberSearchTokens(value?: string | null): string[] {
  const tokens: string[] = []
  const formatted = formatOrderNumber(value)
  if (formatted) {
    tokens.push(formatted, formatted.replace(/^FAS-/, ''))
  }
  if (value && value.toString().trim()) {
    const raw = value.toString().trim()
    tokens.push(raw.toUpperCase(), raw.toLowerCase())
  }
  return Array.from(new Set(tokens.filter(Boolean).map((token) => token.trim()))).filter(Boolean)
}
