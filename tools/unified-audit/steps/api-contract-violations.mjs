import fs from 'node:fs'
import path from 'node:path'
import { scanCodeFiles } from '../lib/scan.mjs'
import { lineNumberForIndex } from '../lib/utils.mjs'
import { writeJson } from '../lib/utils.mjs'
import {
  detectApiContractViolation,
  extractInlineObjectFields,
} from '../lib/detectors/api-contract.mjs'

const SANITY_CREATE = /\b(?:sanityClient|client)\.create\s*\(/g
const SANITY_PATCH_SET = /\.patch\([^)]*\)\.set\s*\(/g

function collectSanityWriteFields(filePath, fileContent) {
  const writes = []

  SANITY_CREATE.lastIndex = 0
  let match
  while ((match = SANITY_CREATE.exec(fileContent))) {
    const fields = extractInlineObjectFields(match.index, fileContent)
    for (const field of fields) {
      writes.push({
        field,
        lineNo: lineNumberForIndex(fileContent, match.index),
      })
    }
  }

  SANITY_PATCH_SET.lastIndex = 0
  while ((match = SANITY_PATCH_SET.exec(fileContent))) {
    const fields = extractInlineObjectFields(match.index, fileContent)
    for (const field of fields) {
      writes.push({
        field,
        lineNo: lineNumberForIndex(fileContent, match.index),
      })
    }
  }

  return writes.map((entry) => ({ ...entry, file: filePath }))
}

function addSchemaMismatchViolations(files, schemaFields) {
  const violations = []
  const knownFields = new Set(schemaFields || [])
  const ignoreFields = new Set(['_id', '_type', '_rev'])
  const seen = new Set()

  for (const file of files) {
    const writes = collectSanityWriteFields(file.path, file.contents)
    for (const write of writes) {
      if (!write.field || write.field.startsWith('_')) continue
      if (ignoreFields.has(write.field)) continue
      if (knownFields.has(write.field)) continue
      const key = `${write.file}:${write.field}`
      if (seen.has(key)) continue
      seen.add(key)
      violations.push({
        service: 'sanity',
        type: 'schemaMismatch',
        severity: 'INFO',
        file: write.file,
        lineNo: write.lineNo,
        fieldPath: write.field,
        recommendedFix: 'Align persisted fields with Sanity schema or remove the write.',
      })
    }
  }

  return violations
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
    const fileViolations = detectApiContractViolation(file.path, file.contents, null)
    for (const violation of fileViolations) {
      violations.push({
        ...violation,
        severity: 'FAIL',
      })
    }
  }

  const schemaViolations = addSchemaMismatchViolations(
    files,
    mappingIndex?.allSchemaFields || [],
  )
  violations.push(...schemaViolations)

  const hasBlocking = violations.some((item) => item.severity !== 'INFO')

  const output = {
    status: hasBlocking ? 'FAIL' : 'PASS',
    generatedAt: new Date().toISOString(),
    requiresEnforcement: hasBlocking,
    enforcementApproved: false,
    enforcementPhase: 'FAIL',
    violations,
  }

  writeJson(path.join(outputDir, 'api-contract-violations.json'), output)
  return output
}
