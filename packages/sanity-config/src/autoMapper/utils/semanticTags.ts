import {FieldSemanticTag} from '../types'
import {tokenizeName} from './stringMetrics'

const containsAny = (value: string, needles: string[]) =>
  needles.some((needle) => value.includes(needle))

export const detectSemanticTags = (name: string, type: string): FieldSemanticTag[] => {
  const normalized = name.toLowerCase()
  const tags: FieldSemanticTag[] = []

  if (containsAny(normalized, ['price', 'amount', 'total', 'balance', 'currency'])) {
    tags.push('monetary')
  }

  if (
    containsAny(normalized, ['date', 'time', 'timestamp', 'created', 'updated', 'at', 'period'])
  ) {
    tags.push('temporal')
  }

  if (containsAny(normalized, ['id', 'uuid', 'slug', 'key', 'number', 'code'])) {
    tags.push('identifier')
  }

  if (containsAny(normalized, ['email', 'phone', 'contact'])) {
    tags.push('contact')
  }

  if (containsAny(normalized, ['address', 'city', 'state', 'country', 'zip'])) {
    tags.push('location')
  }

  if (containsAny(normalized, ['status', 'state', 'stage'])) {
    tags.push('status')
  }

  if (containsAny(normalized, ['quantity', 'qty', 'count', 'items', 'units'])) {
    tags.push('quantity')
  }

  if (containsAny(normalized, ['metadata', 'meta'])) {
    tags.push('metadata')
  }

  if (type === 'boolean') {
    tags.push('boolean')
  }

  if (['text', 'string'].includes(type)) {
    tags.push('text')
  }

  // Avoid duplicate entries
  return Array.from(new Set(tags))
}

export const buildSearchTerms = (name: string, title?: string) => {
  const tokens = Array.from(new Set([...tokenizeName(name), ...(title ? tokenizeName(title) : [])]))
  return tokens.filter(Boolean)
}
