import fs from 'node:fs'
import path from 'node:path'

export function nowStamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds()),
  ].join('')
}

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

export function stableStringify(value) {
  return JSON.stringify(sortKeys(value), null, 2)
}

function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeys)
  }
  if (value && typeof value === 'object') {
    const out = {}
    for (const key of Object.keys(value).sort()) {
      out[key] = sortKeys(value[key])
    }
    return out
  }
  return value
}

export function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, stableStringify(data) + '\n')
}

export function writeText(filePath, text) {
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, text)
}

export function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

export function lineNumberForIndex(text, index) {
  if (index <= 0) return 1
  return text.slice(0, index).split('\n').length
}

export function uniqueSorted(values) {
  return Array.from(new Set(values)).sort()
}

export function sortBy(values, keyFn) {
  return [...values].sort((a, b) => {
    const ak = keyFn(a)
    const bk = keyFn(b)
    return ak < bk ? -1 : ak > bk ? 1 : 0
  })
}

export function safeJson(value) {
  return value === undefined ? null : value
}
