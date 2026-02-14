import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {
  contentSchemaFiles,
  forbiddenDocumentTypeReferences,
  forbiddenFieldNames,
  referenceLookaheadLines,
  forbiddenTypeNames,
} from './content-schema-commerce-authority.config.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '../..')

const escapeForRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const referenceTypeMatcher = /\btype\s*:\s*['"`]reference['"`]/

const findMatches = ({lines, matcher, filePath, kind, token}) => {
  const matches = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (matcher.test(line)) {
      matches.push({
        kind,
        token,
        filePath,
        lineNumber: index + 1,
        line: line.trim(),
      })
    }
  }
  return matches
}

const violations = []
const missingFiles = []

for (const relativePath of contentSchemaFiles) {
  const absolutePath = path.join(repoRoot, relativePath)
  if (!fs.existsSync(absolutePath)) {
    missingFiles.push(relativePath)
    continue
  }

  const lines = fs.readFileSync(absolutePath, 'utf8').split(/\r?\n/)

  for (const fieldName of forbiddenFieldNames) {
    const pattern = new RegExp(`\\bname\\s*:\\s*['"\`]${escapeForRegex(fieldName)}['"\`]`)
    violations.push(
      ...findMatches({
        lines,
        matcher: pattern,
        filePath: relativePath,
        kind: 'field',
        token: fieldName,
      }),
    )
  }

  for (const typeName of forbiddenTypeNames) {
    const pattern = new RegExp(`\\btype\\s*:\\s*['"\`]${escapeForRegex(typeName)}['"\`]`)
    violations.push(
      ...findMatches({
        lines,
        matcher: pattern,
        filePath: relativePath,
        kind: 'type',
        token: typeName,
      }),
    )
  }

  for (let index = 0; index < lines.length; index += 1) {
    if (!referenceTypeMatcher.test(lines[index])) {
      continue
    }

    const windowEnd = Math.min(lines.length, index + referenceLookaheadLines + 1)
    const windowLines = lines.slice(index, windowEnd)

    for (const documentTypeName of forbiddenDocumentTypeReferences) {
      const pattern = new RegExp(`\\btype\\s*:\\s*['"\`]${escapeForRegex(documentTypeName)}['"\`]`)
      for (let offset = 0; offset < windowLines.length; offset += 1) {
        if (!pattern.test(windowLines[offset])) {
          continue
        }

        violations.push({
          kind: 'reference',
          token: documentTypeName,
          filePath: relativePath,
          lineNumber: index + offset + 1,
          line: windowLines[offset].trim(),
        })
      }
    }
  }
}

if (missingFiles.length > 0) {
  console.error('❌ Content schema guard misconfigured: schema file(s) missing from allowlist path(s):')
  for (const missingPath of missingFiles) {
    console.error(` - ${missingPath}`)
  }
  console.error('Update scripts/ci/content-schema-commerce-authority.config.mjs before merging.')
  process.exit(1)
}

if (violations.length > 0) {
  console.error('❌ Commerce authority guard failed for content-focused Sanity schemas.')
  console.error('Medusa-owned pricing/inventory/commerce authority fields, types, or document references were detected.\n')
  for (const violation of violations) {
    console.error(
      ` - [${violation.kind}] ${violation.token} at ${violation.filePath}:${violation.lineNumber} -> ${violation.line}`,
    )
  }
  console.error(
    '\nAction: move commerce authority fields/types/references to Medusa-owned schemas or update guard config intentionally.',
  )
  process.exit(1)
}

console.log(
  `✅ Content schema commerce authority guard passed (${contentSchemaFiles.length} content schema files scanned).`,
)
