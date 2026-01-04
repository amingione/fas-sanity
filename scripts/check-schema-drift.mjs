import fs from 'node:fs'
import path from 'node:path'

const schemaPath = path.resolve('packages/sanity-config/schema.json')
const reportPath = path.resolve('.docs/reports/field-to-api-map.md')

if (!fs.existsSync(schemaPath)) {
  console.warn('⚠️ Schema Drift Check: missing schema.json')
  process.exit(0)
}

if (!fs.existsSync(reportPath)) {
  console.warn('⚠️ Schema Drift Check: missing field-to-api map report')
  process.exit(0)
}

const schemaTypes = JSON.parse(fs.readFileSync(schemaPath, 'utf8'))
const reportLines = fs.readFileSync(reportPath, 'utf8').split(/\r?\n/)

const reportBySchema = new Map()
let currentSchema = null

for (const line of reportLines) {
  const schemaMatch = line.match(/^###\s+`([^`]+)`/)
  if (schemaMatch) {
    currentSchema = schemaMatch[1]
    if (!reportBySchema.has(currentSchema)) {
      reportBySchema.set(currentSchema, new Set())
    }
    continue
  }

  const fieldMatch = line.match(/^[-*]\s+`([^`]+)`/)
  if (fieldMatch && currentSchema) {
    reportBySchema.get(currentSchema).add(fieldMatch[1])
  }
}

const collectSchemaPaths = (attrs, prefix = [], out = new Set()) => {
  if (!attrs || typeof attrs !== 'object') return out

  for (const [key, attr] of Object.entries(attrs)) {
    if (key.startsWith('_')) continue
    if (!attr || typeof attr !== 'object') continue
    if (attr.type !== 'objectAttribute') continue

    const value = attr.value
    if (!value || typeof value !== 'object') continue

    const pathParts = [...prefix, key]
    const fieldPath = pathParts.join('.')

    if (value.type === 'string' || value.type === 'number' || value.type === 'boolean') {
      out.add(fieldPath)
      continue
    }

    if (value.type === 'object') {
      collectSchemaPaths(value.attributes, pathParts, out)
      continue
    }

    if (value.type === 'array') {
      out.add(`${fieldPath}[]`)
      const ofDef = value.of
      if (ofDef && typeof ofDef === 'object' && ofDef.type === 'object') {
        collectSchemaPaths(ofDef.attributes, [...prefix, `${key}[]`], out)
      }
    }
  }

  return out
}

const schemaByName = new Map()
for (const typeDef of schemaTypes) {
  if (!typeDef || !typeDef.name) continue
  const paths = collectSchemaPaths(typeDef.attributes)
  schemaByName.set(typeDef.name, paths)
}

const warnings = []

for (const [schemaName, schemaPaths] of schemaByName.entries()) {
  const reportPaths = reportBySchema.get(schemaName) || new Set()

  const newFields = [...schemaPaths].filter((p) => !reportPaths.has(p))
  const removedFields = [...reportPaths].filter((p) => !schemaPaths.has(p))

  if (newFields.length || removedFields.length) {
    warnings.push({schemaName, newFields, removedFields})
  }
}

if (!warnings.length) {
  console.log('✅ Schema Drift Check: no drift detected')
  process.exit(0)
}

console.warn('⚠️ Schema Drift Detected')
for (const warning of warnings) {
  console.warn(`Schema: ${warning.schemaName}`)
  if (warning.newFields.length) {
    console.warn('  New field(s) found:')
    for (const field of warning.newFields.sort()) {
      console.warn(`    - ${field}`)
    }
  }
  if (warning.removedFields.length) {
    console.warn('  Removed field(s) found:')
    for (const field of warning.removedFields.sort()) {
      console.warn(`    - ${field}`)
    }
  }
  console.warn('  This field is not documented in:')
  console.warn('    .docs/reports/field-to-api-map.md')
  console.warn('  Action required:')
  console.warn('    - Update the field-to-API map')
  console.warn('    - OR add a drift acknowledgement')
}

process.exit(0)
