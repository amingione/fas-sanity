import fs from 'node:fs/promises'
import { listRepoFiles, relativeToRepo } from '../lib/file-scan.mjs'

function findLineNumber(content, search) {
  const idx = content.indexOf(search)
  if (idx === -1) return null
  return content.slice(0, idx).split(/\r?\n/).length
}

function checkEasyPostPayload(content) {
  const violations = []
  const shipmentCall = content.match(/Shipment\.create\(([\s\S]*?)\)/)
  if (shipmentCall) {
    const body = shipmentCall[1]
    const required = ['to_address', 'from_address', 'parcel']
    for (const field of required) {
      if (!body.includes(field)) {
        violations.push({
          type: 'missingField',
          fieldPath: field,
          message: `EasyPost payload missing ${field}`
        })
      }
    }
  }
  return violations
}

function checkResendPayload(content) {
  const violations = []
  const sendCall = content.match(/emails\.send\(([\s\S]*?)\)/)
  if (sendCall) {
    const body = sendCall[1]
    const required = ['to', 'from', 'subject']
    for (const field of required) {
      if (!body.includes(field)) {
        violations.push({
          type: 'missingField',
          fieldPath: field,
          message: `Resend payload missing ${field}`
        })
      }
    }
  }
  return violations
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
    const content = await fs.readFile(file, 'utf8')
    const rel = relativeToRepo(repo.path, file)

    if (/easypost|EasyPost/i.test(content)) {
      hasEasyPost = true
      const payloadViolations = checkEasyPostPayload(content)
      for (const violation of payloadViolations) {
        result.violations.push({
          service: 'easypost',
          type: violation.type,
          file: rel,
          repo: repo.name,
          lineNo: findLineNumber(content, violation.fieldPath),
          fieldPath: violation.fieldPath,
          recommendedFix: violation.message
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
      const payloadViolations = checkResendPayload(content)
      for (const violation of payloadViolations) {
        result.violations.push({
          service: 'resend',
          type: violation.type,
          file: rel,
          repo: repo.name,
          lineNo: findLineNumber(content, violation.fieldPath),
          fieldPath: violation.fieldPath,
          recommendedFix: violation.message
        })
      }
      for (const field of resendPersistFields) {
        if (content.includes(`${field}:`)) persistResend = true
      }
      if (content.includes('.id') && content.includes('resend')) {
        const lineNo = findLineNumber(content, '.id')
        if (lineNo) {
          result.violations.push({
            service: 'resend',
            type: 'unsafeAccess',
            file: rel,
            repo: repo.name,
            lineNo,
            fieldPath: 'id',
            recommendedFix: 'Guard Resend response id access and handle missing responses.'
          })
        }
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
