import fs from 'node:fs/promises'
import { listRepoFiles, relativeToRepo } from '../lib/file-scan.mjs'
import { detectApiContractViolation } from '../lib/detectors/api-contract.mjs'

function findLineNumber(content, search) {
  const idx = content.indexOf(search)
  if (idx === -1) return null
  return content.slice(0, idx).split(/\r?\n/).length
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parseDestructuredBindings(binding) {
  const trimmed = binding.trim()
  if (!trimmed.startsWith('{')) return []
  const end = trimmed.lastIndexOf('}')
  if (end === -1) return []
  const inner = trimmed.slice(1, end)
  return inner
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [leftRaw, rightRaw] = part.split(':').map((value) => value.trim())
      const left = leftRaw?.split('=')[0]?.trim() || ''
      const right = rightRaw?.split('=')[0]?.trim() || ''
      return { key: left, name: right || left }
    })
}

function findResendUnsafeIdAccess(content) {
  const violations = []
  const sendRegex = /(const|let|var)\s+([^=]+?)=\s*await\s+resend\.emails\.send\s*\(/g
  const matches = [...content.matchAll(sendRegex)]

  for (const match of matches) {
    const binding = match[2]?.trim() || ''
    const windowStart = match.index ?? 0
    const snippet = content.slice(windowStart, windowStart + 2000)
    const bindings = []

    if (binding.startsWith('{')) {
      const destructured = parseDestructuredBindings(binding)
      for (const entry of destructured) {
        if (entry.key === 'data' || entry.key === 'id') {
          bindings.push(entry.name)
        }
      }
    } else {
      const varName = binding.split(':')[0].trim()
      if (varName) bindings.push(varName)
    }

    for (const name of bindings) {
      if (!name) continue
      const directId = new RegExp(`\\b${escapeRegExp(name)}\\.id\\b`)
      const dataId = new RegExp(`\\b${escapeRegExp(name)}\\.data\\.id\\b`)
      if (directId.test(snippet)) {
        violations.push({
          lineNo: findLineNumber(content, `${name}.id`),
          fieldPath: 'id',
          message: 'Guard Resend response id access and handle missing responses.'
        })
      } else if (dataId.test(snippet)) {
        violations.push({
          lineNo: findLineNumber(content, `${name}.data.id`),
          fieldPath: 'id',
          message: 'Guard Resend response id access and handle missing responses.'
        })
      }
    }
  }

  return violations
}

function shouldSkipFile(filePath) {
  return (
    /\/node_modules\//.test(filePath) ||
    /\/tools\/unified-audit\/test\//.test(filePath) ||
    /\/tools\/unified-audit\/out\//.test(filePath) ||
    /\/__tests__\//.test(filePath) ||
    /\.(test|spec)\.(t|j)sx?$/.test(filePath)
  )
}

export async function runApiContractViolations({ repos }) {
  const result = {
    status: 'PASS',
    requiresEnforcement: false,
    enforcementApproved: false,
    violations: []
  }

  const files = []
  for (const repo of repos) {
    const repoFiles = await listRepoFiles(repo.path, ['**/*.{ts,tsx,js,jsx,mjs,cjs}'])
    for (const file of repoFiles) files.push({ repo, file })
  }

  const easypostPersistFields = ['easyPostShipmentId', 'shippingLabelUrl', 'trackingNumber']
  const resendPersistFields = ['resendMessageId', 'resendId']

  let hasEasyPost = false
  let hasResend = false
  let persistEasyPost = false
  let persistResend = false

  for (const { repo, file } of files) {
    if (shouldSkipFile(file)) continue
    const content = await fs.readFile(file, 'utf8')
    const rel = relativeToRepo(repo.path, file)

    if (/easypost|EasyPost/i.test(content)) {
      hasEasyPost = true
      const payloadViolations = detectApiContractViolation(file, content, null)
        .filter((violation) => violation.service === 'easypost')
      for (const violation of payloadViolations) {
        result.violations.push({
          service: violation.service,
          type: violation.type,
          file: rel,
          repo: repo.name,
          lineNo: violation.lineNo,
          fieldPath: violation.fieldPath,
          recommendedFix: violation.recommendedFix
        })
      }
      for (const field of easypostPersistFields) {
        if (content.includes(`${field}:`)) persistEasyPost = true
      }
      if (content.includes('.tracking_code') && !content.includes('?.tracking_code')) {
        result.violations.push({
          service: 'easypost',
          type: 'unsafeAccess',
          file: rel,
          repo: repo.name,
          lineNo: findLineNumber(content, '.tracking_code'),
          fieldPath: 'tracking_code',
          recommendedFix: 'Guard tracking_code access with optional chaining or presence checks.'
        })
      }
    }

    if (/resend|RESEND_/i.test(content)) {
      hasResend = true
      const payloadViolations = detectApiContractViolation(file, content, null)
        .filter((violation) => violation.service === 'resend')
      for (const violation of payloadViolations) {
        result.violations.push({
          service: violation.service,
          type: violation.type,
          file: rel,
          repo: repo.name,
          lineNo: violation.lineNo,
          fieldPath: violation.fieldPath,
          recommendedFix: violation.recommendedFix
        })
      }
      for (const field of resendPersistFields) {
        if (content.includes(`${field}:`)) persistResend = true
      }
      const unsafeResendAccess = findResendUnsafeIdAccess(content)
      for (const violation of unsafeResendAccess) {
        result.violations.push({
          service: 'resend',
          type: 'unsafeAccess',
          file: rel,
          repo: repo.name,
          lineNo: violation.lineNo,
          fieldPath: violation.fieldPath,
          recommendedFix: violation.message
        })
      }
    }
  }

  if (hasEasyPost && !persistEasyPost) {
    result.violations.push({
      service: 'easypost',
      type: 'notPersisted',
      file: null,
      repo: null,
      lineNo: null,
      fieldPath: easypostPersistFields.join(', '),
      recommendedFix: 'Persist EasyPost shipment id, label URL, and tracking number to Sanity.'
    })
  }

  if (hasResend && !persistResend) {
    result.violations.push({
      service: 'resend',
      type: 'notPersisted',
      file: null,
      repo: null,
      lineNo: null,
      fieldPath: resendPersistFields.join(', '),
      recommendedFix: 'Persist Resend message id to Sanity for traceability.'
    })
  }

  if (result.violations.length > 0) {
    result.status = 'FAIL'
    result.requiresEnforcement = true
  }

  result.violations = result.violations.map(v => ({
    ...v,
    file: v.file || null
  })).sort((a, b) => {
    const aKey = `${a.service}:${a.repo || ''}:${a.file || ''}:${a.lineNo || 0}:${a.fieldPath}`
    const bKey = `${b.service}:${b.repo || ''}:${b.file || ''}:${b.lineNo || 0}:${b.fieldPath}`
    return aKey.localeCompare(bKey)
  })

  return result
}
