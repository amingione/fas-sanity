import { lineNumberForIndex } from '../utils.mjs'
import { isWebhookHandler } from '../classifiers/webhook-handler.mjs'

const PAYLOAD_ACCESS_PATTERN = /(event|req\.body|payload)\.data\.object/g

const VALIDATION_PATTERNS = [
  /\.parse\(/,
  /webhookSchema/,
  /constructEvent\(/,
  /if\s*\(!.*data\.object.*typeof/,
  /zod\..*\.parse/,
]

export function findPayloadAccess(fileContent) {
  const matches = []
  PAYLOAD_ACCESS_PATTERN.lastIndex = 0
  let match
  while ((match = PAYLOAD_ACCESS_PATTERN.exec(fileContent)) !== null) {
    matches.push({ index: match.index, match: match[0] })
  }
  return matches
}

export function hasValidationBefore(fileContent, index) {
  const preceding = fileContent.slice(0, index)
  return VALIDATION_PATTERNS.some((pattern) => pattern.test(preceding))
}

export function detectUnsafePayloadAccess(filePath, fileContent, ast) {
  if (!isWebhookHandler(filePath, fileContent)) return null

  const matches = findPayloadAccess(fileContent)
  if (matches.length === 0) return null

  const violations = []
  for (const match of matches) {
    if (hasValidationBefore(fileContent, match.index)) continue
    violations.push({
      type: 'payloadAccess',
      file: filePath,
      lineNo: lineNumberForIndex(fileContent, match.index),
      detail: 'Webhook payload accessed without validation',
      severity: 'MEDIUM',
      snippet: fileContent.slice(match.index, match.index + 50),
    })
  }

  return violations.length ? violations : null
}
