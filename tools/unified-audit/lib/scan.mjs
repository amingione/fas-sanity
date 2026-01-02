import fs from 'node:fs'
import path from 'node:path'
import fg from 'fast-glob'
import { detectIdempotencyViolation } from './detectors/idempotency.mjs'
import { detectUnsafePayloadAccess } from './detectors/payload-access.mjs'
import { isWebhookHandler } from './classifiers/webhook-handler.mjs'

const CODE_GLOBS = [
  '**/*.{js,jsx,ts,tsx,cjs,mjs}',
]

export function scanCodeFiles(repoPath) {
  return fg.sync(CODE_GLOBS, {
    cwd: repoPath,
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/out/**', '**/.git/**'],
  }).map((filePath) => path.normalize(filePath))
}

export function scanFunctionFiles(repoPath) {
  const patterns = [
    '**/netlify/functions/**/*.{js,jsx,ts,tsx,cjs,mjs}',
    '**/functions/**/*.{js,jsx,ts,tsx,cjs,mjs}',
    '**/api/**/*.{js,jsx,ts,tsx,cjs,mjs}',
    '**/server/**/*.{js,jsx,ts,tsx,cjs,mjs}',
  ]
  return fg.sync(patterns, {
    cwd: repoPath,
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/out/**', '**/.git/**'],
  }).map((filePath) => path.normalize(filePath))
}

export function scanSchemaFiles(repoPath) {
  return fg.sync('**/schemas/**/*.{js,jsx,ts,tsx}', {
    cwd: repoPath,
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/out/**', '**/.git/**'],
  }).map((filePath) => path.normalize(filePath))
}

export function scanWebhookFindings(repoPath) {
  const findings = []
  const filePaths = scanCodeFiles(repoPath)

  for (const filePath of filePaths) {
    const contents = fs.readFileSync(filePath, 'utf8')
    if (!isWebhookHandler(filePath, contents)) continue

    const idempotency = detectIdempotencyViolation(filePath, contents, null)
    if (idempotency) findings.push(idempotency)

    const payloadAccess = detectUnsafePayloadAccess(filePath, contents, null)
    if (payloadAccess) findings.push(...payloadAccess)
  }

  return findings
}

export function buildWebhookReport(findings) {
  return {
    status: findings.length ? 'WARN' : 'PASS',
    generatedAt: new Date().toISOString(),
    findings,
    requiresEnforcement: false,
    enforcementPhase: 'WARN',
  }
}
