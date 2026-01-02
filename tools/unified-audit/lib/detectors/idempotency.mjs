import { lineNumberForIndex } from '../utils.mjs'
import { isWebhookHandler } from '../classifiers/webhook-handler.mjs'

const SIDE_EFFECT_PATTERNS = [
  /sanityClient\.create\(/,
  /client\.createIfNotExists\(/,
  /transaction\.create\(/,
  /resend\.emails\.send\(/,
  /easypost\.Shipment\.create\(/,
  /\.patch\(.*\)\.set\(/,
]

const GUARD_PATTERNS = [
  /createIfNotExists/,
  /\*\[webhookEventId\s*==\s*\$id\]/,
  /\*\[stripeEventId\s*==\s*\$id\]/,
  /\*\[easypostEventId\s*==\s*\$id\]/,
  /const\s+existing\s*=.*fetch.*event\.id/,
  /if\s*\(existing\)/,
  /idempotency[_-]?key/i,
  /Idempotency-Key/,
]

export function hasSideEffects(fileContent) {
  return SIDE_EFFECT_PATTERNS.some((pattern) => pattern.test(fileContent))
}

export function hasIdempotencyGuard(fileContent) {
  return GUARD_PATTERNS.some((pattern) => pattern.test(fileContent))
}

function firstSideEffectIndex(fileContent) {
  let earliest = -1
  for (const pattern of SIDE_EFFECT_PATTERNS) {
    const idx = fileContent.search(pattern)
    if (idx !== -1 && (earliest === -1 || idx < earliest)) {
      earliest = idx
    }
  }
  return earliest
}

export function detectIdempotencyViolation(filePath, fileContent, ast) {
  if (!isWebhookHandler(filePath, fileContent)) return null
  if (!hasSideEffects(fileContent)) return null
  if (/\/(test|debug|selfCheck)/i.test(filePath)) return null
  if (hasIdempotencyGuard(fileContent)) return null

  const index = firstSideEffectIndex(fileContent)
  return {
    type: 'idempotency',
    file: filePath,
    lineNo: lineNumberForIndex(fileContent, index === -1 ? 0 : index),
    detail: 'Webhook handler performs side-effects without idempotency guard',
    severity: 'HIGH',
  }
}
