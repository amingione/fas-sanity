import fs from 'node:fs/promises'
import { parse } from 'groq-js'
import { listRepoFiles, relativeToRepo } from '../lib/file-scan.mjs'
import { cleanSnippet, stableSort, uniqueArray } from '../lib/utils.mjs'

function extractQueriesFromContent(content) {
  const queries = []
  const groqRegex = /groq`([\s\S]*?)`/g
  let match
  while ((match = groqRegex.exec(content))) {
    queries.push({ query: match[1], kind: 'groq' })
  }

  const fetchRegex = /\.fetch\((`|')([\s\S]*?)\1\s*[),]/g
  while ((match = fetchRegex.exec(content))) {
    queries.push({ query: match[2], kind: 'fetch' })
  }

  return queries
}

function extractProjectionFields(query) {
  const fields = new Set()
  let parseError = null
  try {
    parse(query)
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error)
  }

  const chars = query.split('')
  let depth = 0
  let inString = false
  let stringChar = ''
  let start = -1
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i]
    if (inString) {
      if (ch === stringChar && chars[i - 1] !== '\\') {
        inString = false
        stringChar = ''
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      inString = true
      stringChar = ch
      continue
    }
    if (ch === '{') {
      depth += 1
      if (depth === 1) start = i
      continue
    }
    if (ch === '}') {
      if (depth === 1 && start !== -1) {
        const segment = query.slice(start + 1, i)
        const lines = segment.split(/\r?\n/)
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith('//')) continue
          const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?:[:\s,}]|$)/)
          if (match) fields.add(match[1])
        }
        break
      }
      depth = Math.max(depth - 1, 0)
    }
  }

  return { fields: [...fields], parseError }
}

export async function runQueryIndex({ repos }) {
  const result = {
    status: 'PASS',
    requiresEnforcement: false,
    enforcementApproved: false,
    queries: [],
    fieldsUsed: {},
    parseErrors: []
  }

  const files = []
  for (const repo of repos) {
    const repoFiles = await listRepoFiles(repo.path, ['**/*.{ts,tsx,js,jsx}'])
    for (const file of repoFiles) files.push({ repo, file })
  }

  for (const { repo, file } of files) {
    const content = await fs.readFile(file, 'utf8')
    const queries = extractQueriesFromContent(content)
    if (queries.length === 0) continue

    const relPath = relativeToRepo(repo.path, file)
    for (const query of queries) {
      const { fields, parseError } = extractProjectionFields(query.query)
      result.queries.push({
        repo: repo.name,
        file: relPath,
        kind: query.kind,
        query: query.query,
        fields,
        parseError
      })
      for (const field of fields) {
        if (!result.fieldsUsed[field]) {
          result.fieldsUsed[field] = { files: [] }
        }
        result.fieldsUsed[field].files.push(`${repo.name}/${relPath}`)
      }
      if (parseError) {
        result.parseErrors.push({
          repo: repo.name,
          file: relPath,
          error: parseError,
          snippet: cleanSnippet(query.query)
        })
      }
    }
  }

  for (const [field, usage] of Object.entries(result.fieldsUsed)) {
    usage.files = stableSort(uniqueArray(usage.files))
    result.fieldsUsed[field] = usage
  }

  result.queries = result.queries.map(entry => ({
    ...entry,
    fields: stableSort(uniqueArray(entry.fields))
  }))
  result.queries = result.queries.sort((a, b) => {
    const aKey = `${a.repo}/${a.file}`
    const bKey = `${b.repo}/${b.file}`
    return aKey.localeCompare(bKey)
  })
  result.parseErrors = result.parseErrors.sort((a, b) => {
    const aKey = `${a.repo}/${a.file}`
    const bKey = `${b.repo}/${b.file}`
    return aKey.localeCompare(bKey)
  })

  return result
}
