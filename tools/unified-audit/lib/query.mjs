import { parse } from 'groq-js'
import { lineNumberForIndex, uniqueSorted } from './utils.mjs'

const GROQ_TEMPLATE = /groq`([\s\S]*?)`/g
const FETCH_CALL = /(client|sanityClient|sanity)\.fetch\s*\(\s*([`'"])([\s\S]*?)\2/g
const FETCH_DIRECT = /\bfetch\s*\(\s*([`'"])([\s\S]*?)\1/g

function extractProjectionFields(query) {
  const fields = new Set()
  const text = query
  let inString = false
  let stringChar = ''
  let depth = 0
  let current = ''

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (inString) {
      if (char === stringChar && text[i - 1] !== '\\') {
        inString = false
      }
      current += char
      continue
    }

    if (char === '"' || char === '\'' || char === '`') {
      inString = true
      stringChar = char
      current += char
      continue
    }

    if (char === '{') {
      depth += 1
      if (depth === 1) {
        current = ''
        continue
      }
    }

    if (char === '}') {
      if (depth === 1) {
        const candidates = current.split(',')
        for (const candidate of candidates) {
          const trimmed = candidate.trim()
          if (!trimmed || trimmed.startsWith('...')) continue
          const aliasMatch = trimmed.match(/^"([^"]+)"\s*:\s*([A-Za-z0-9_]+)/)
          if (aliasMatch) {
            fields.add(aliasMatch[2])
            continue
          }
          const nameMatch = trimmed.match(/^([A-Za-z0-9_]+)/)
          if (nameMatch) {
            fields.add(nameMatch[1])
          }
        }
      }
      depth = Math.max(0, depth - 1)
      current = ''
      continue
    }

    if (depth >= 1) {
      current += char
    }
  }

  return Array.from(fields)
}

export function buildQueryIndex(files) {
  const queries = []
  const fieldsUsed = new Map()

  for (const file of files) {
    const text = file.contents
    let match

    const addQuery = (queryText, index) => {
      const lineNo = lineNumberForIndex(text, index)
      let parseError = null
      try {
        parse(queryText)
      } catch (error) {
        parseError = error?.message || String(error)
      }
      const fields = extractProjectionFields(queryText)
      for (const field of fields) {
        const existing = fieldsUsed.get(field) || []
        existing.push({ file: file.path, lineNo })
        fieldsUsed.set(field, existing)
      }
      queries.push({
        file: file.path,
        lineNo,
        query: queryText,
        parseError,
        fields: fields.sort(),
      })
    }

    GROQ_TEMPLATE.lastIndex = 0
    while ((match = GROQ_TEMPLATE.exec(text))) {
      addQuery(match[1], match.index)
    }

    FETCH_CALL.lastIndex = 0
    while ((match = FETCH_CALL.exec(text))) {
      addQuery(match[3], match.index)
    }

    FETCH_DIRECT.lastIndex = 0
    while ((match = FETCH_DIRECT.exec(text))) {
      const prevChar = match.index > 0 ? text[match.index - 1] : ''
      if (prevChar === '.') continue
      addQuery(match[2], match.index)
    }
  }

  const fieldsUsedObj = {}
  for (const key of uniqueSorted(Array.from(fieldsUsed.keys()))) {
    const locations = fieldsUsed
      .get(key)
      .map((entry) => ({ file: entry.file, lineNo: entry.lineNo }))
      .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.lineNo - b.lineNo))
    fieldsUsedObj[key] = locations
  }

  return {
    status: 'OK',
    generatedAt: new Date().toISOString(),
    queries: queries.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.lineNo - b.lineNo)),
    fieldsUsed: fieldsUsedObj,
  }
}
