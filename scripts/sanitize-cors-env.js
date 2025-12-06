#!/usr/bin/env node

/**
 * Sanitize CORS_ALLOW so wildcard values like "https://*" don't break RegExp().
 * - Escapes regex special chars
 * - Converts literal '*' to '.*'
 * - Wraps with ^...$ for strict matching
 * - Falls back to allowing any https origin if parsing fails
 */
function sanitizePattern(raw) {
  const fallback = '^https://.*$'
  if (!raw || typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  try {
    // If it's already a valid regex string, keep it.
    new RegExp(trimmed)
    return trimmed
  } catch {
    // Escape regex chars, then restore wildcards
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*')
    const normalized = escaped.startsWith('^') ? escaped : `^${escaped}`
    const withEnd = normalized.endsWith('$') ? normalized : `${normalized}$`
    try {
      new RegExp(withEnd)
      return withEnd
    } catch (err) {
      console.warn(`[sanitize-cors-env] Failed to sanitize pattern "${trimmed}": ${err.message}`)
      return fallback
    }
  }
}

const raw = process.env.CORS_ALLOW
if (raw) {
  const sanitized = raw
    .split(',')
    .map((entry) => sanitizePattern(entry))
    .filter(Boolean)
    .join(',')

  if (sanitized) {
    process.env.CORS_ALLOW = sanitized
    console.log(`[sanitize-cors-env] Using sanitized CORS_ALLOW="${sanitized}"`)
  } else {
    process.env.CORS_ALLOW = '^https://.*$'
    console.log('[sanitize-cors-env] CORS_ALLOW empty after sanitization, set to ^https://.*$')
  }
}
