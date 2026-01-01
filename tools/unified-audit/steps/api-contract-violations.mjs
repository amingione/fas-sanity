import fs from 'node:fs'
import path from 'node:path'
import { scanCodeFiles } from '../lib/scan.mjs'
import { lineNumberForIndex, uniqueSorted } from '../lib/utils.mjs'
import { writeJson } from '../lib/utils.mjs'

const EASYPOST_CALL = /\bShipment\.create\s*\(|\.shipments\.create\s*\(/g
const RESEND_CALL = /resend\.emails\.send\s*\(/g

function extractObjectLiteral(text, startIndex) {
  const openIndex = text.indexOf('{', startIndex)
  if (openIndex === -1) return null
  let depth = 0
  let inString = false
  let stringChar = ''
  for (let i = openIndex; i < text.length; i += 1) {
    const char = text[i]
    if (inString) {
      if (char === stringChar && text[i - 1] !== '\\') {
        inString = false
      }
      continue
    }
    if (char === '"' || char === '\'' || char === '`') {
      inString = true
      stringChar = char
      continue
    }
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return text.slice(openIndex, i + 1)
      }
    }
  }
  return null
}

function parseObjectKeys(objectLiteral) {
  if (!objectLiteral) return []
  const keys = []
  let depth = 0
  let inString = false
  let stringChar = ''
  let token = ''
  let readingKey = true

  for (let i = 0; i < objectLiteral.length; i += 1) {
    const char = objectLiteral[i]
    if (inString) {
      if (char === stringChar && objectLiteral[i - 1] !== '\\') {
        inString = false
      }
      token += char
      continue
    }
    if (char === '"' || char === '\'' || char === '`') {
      inString = true
      stringChar = char
      token += char
      continue
    }
    if (char === '{' || char === '[' || char === '(') {
      depth += 1
      token = ''
      continue
    }
    if (char === '}' || char === ']' || char === ')') {
      depth = Math.max(0, depth - 1)
      token = ''
      continue
    }
    if (depth === 1) {
      if (char === ':') {
        const keyMatch = token.trim().match(/^"([^"]+)"$|^([A-Za-z0-9_]+)$/)
        if (keyMatch) {
          const key = keyMatch[1] || keyMatch[2]
          if (key) keys.push(key)
        }
        token = ''
        readingKey = false
        continue
      }
      if (char === ',') {
        token = ''
        readingKey = true
        continue
      }
      if (readingKey) {
        token += char
      }
    }
  }

  return uniqueSorted(keys)
}

function collectFieldUsage(files, fieldNames) {
  const hits = {}
  for (const field of fieldNames) {
    hits[field] = []
  }
  for (const file of files) {
    for (const field of fieldNames) {
      const index = file.contents.indexOf(field)
      if (index !== -1) {
        hits[field].push({
          file: file.path,
          lineNo: lineNumberForIndex(file.contents, index),
        })
      }
    }
  }
  return hits
}

export async function runApiContractViolations(context) {
  const { repos, outputDir, mappingIndex } = context
  const files = []

  for (const repo of repos) {
    if (repo.status !== 'OK') continue
    const filePaths = scanCodeFiles(repo.path)
    for (const filePath of filePaths) {
      const contents = fs.readFileSync(filePath, 'utf8')
      files.push({ path: filePath, contents })
    }
  }

  const violations = []

  for (const file of files) {
    let match

    EASYPOST_CALL.lastIndex = 0
    while ((match = EASYPOST_CALL.exec(file.contents))) {
      const literal = extractObjectLiteral(file.contents, match.index)
      const keys = parseObjectKeys(literal)
      const required = ['to_address', 'from_address', 'parcel']
      for (const key of required) {
        if (!keys.includes(key)) {
          violations.push({
            service: 'easypost',
            type: 'missingField',
            file: file.path,
            lineNo: lineNumberForIndex(file.contents, match.index),
            fieldPath: key,
            recommendedFix: 'Ensure required EasyPost shipment field is set before create call.',
          })
        }
      }
    }

    RESEND_CALL.lastIndex = 0
    while ((match = RESEND_CALL.exec(file.contents))) {
      const literal = extractObjectLiteral(file.contents, match.index)
      const keys = parseObjectKeys(literal)
      const required = ['to', 'from', 'subject']
      for (const key of required) {
        if (!keys.includes(key)) {
          violations.push({
            service: 'resend',
            type: 'missingField',
            file: file.path,
            lineNo: lineNumberForIndex(file.contents, match.index),
            fieldPath: key,
            recommendedFix: 'Ensure required Resend email field is set before send call.',
          })
        }
      }
    }
  }

  const easypostFields = ['easyPostShipmentId', 'trackingNumber', 'shippingLabelUrl']
  const resendFields = ['resendMessageId', 'messageId']
  const persistenceHits = collectFieldUsage(files, easypostFields.concat(resendFields))
  const schemaFields = new Set(mappingIndex?.allSchemaFields || [])

  if (files.some((file) => /easypost|EasyPost/.test(file.contents))) {
    for (const field of easypostFields) {
      if (!schemaFields.has(field)) {
        violations.push({
          service: 'easypost',
          type: 'schemaMismatch',
          file: null,
          lineNo: null,
          fieldPath: field,
          recommendedFix: 'Align persisted EasyPost fields with Sanity schema fields.',
        })
      }
      if (!persistenceHits[field].length) {
        violations.push({
          service: 'easypost',
          type: 'notPersisted',
          file: null,
          lineNo: null,
          fieldPath: field,
          recommendedFix: 'Persist EasyPost response fields to Sanity to preserve shipment audit trail.',
        })
      }
    }
  }

  if (files.some((file) => /resend/.test(file.contents))) {
    for (const field of resendFields) {
      if (!schemaFields.has(field)) {
        violations.push({
          service: 'resend',
          type: 'schemaMismatch',
          file: null,
          lineNo: null,
          fieldPath: field,
          recommendedFix: 'Align persisted Resend fields with Sanity schema fields.',
        })
      }
      if (!persistenceHits[field].length) {
        violations.push({
          service: 'resend',
          type: 'notPersisted',
          file: null,
          lineNo: null,
          fieldPath: field,
          recommendedFix: 'Persist Resend response identifier to Sanity to preserve delivery audit trail.',
        })
      }
    }
  }

  const output = {
    status: violations.length ? 'FAIL' : 'PASS',
    generatedAt: new Date().toISOString(),
    requiresEnforcement: violations.length > 0,
    enforcementApproved: false,
    violations,
  }

  writeJson(path.join(outputDir, 'api-contract-violations.json'), output)
  return output
}
