import fs from 'node:fs/promises'
import path from 'node:path'

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true })
}

export function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/')
}

export function stableSort(arr) {
  return [...arr].sort((a, b) => String(a).localeCompare(String(b)))
}

export function stableSortBy(arr, getter) {
  return [...arr].sort((a, b) => {
    const av = getter(a)
    const bv = getter(b)
    return String(av).localeCompare(String(bv))
  })
}

export function sortObjectDeep(value) {
  if (Array.isArray(value)) {
    return value.map(sortObjectDeep)
  }
  if (value && typeof value === 'object') {
    const sorted = {}
    const keys = Object.keys(value).sort()
    for (const key of keys) {
      sorted[key] = sortObjectDeep(value[key])
    }
    return sorted
  }
  return value
}

export async function writeJson(filePath, data) {
  const sorted = sortObjectDeep(data)
  const json = JSON.stringify(sorted, null, 2)
  await fs.writeFile(filePath, json + '\n', 'utf8')
}

export async function writeText(filePath, text) {
  await fs.writeFile(filePath, text, 'utf8')
}

export async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

export function normalizeKey(name) {
  return String(name).replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
}

export function nowStamp() {
  const iso = new Date().toISOString()
  return iso.replace(/[:.]/g, '-').replace('T', '_').replace('Z', 'Z')
}

export function uniqueArray(values) {
  return [...new Set(values)]
}

export function mergeSets(target, values) {
  for (const value of values) {
    target.add(value)
  }
}

export function cleanSnippet(line, max = 180) {
  const trimmed = line.trim().replace(/\s+/g, ' ')
  return trimmed.length > max ? trimmed.slice(0, max - 3) + '...' : trimmed
}

export function toLineMap(content) {
  return content.split(/\r?\n/)
}

export function lineNumberForIndex(content, index) {
  const safeIndex = Number.isFinite(index) ? index : 0
  if (safeIndex <= 0) {
    return 1
  }
  let line = 1
  const limit = Math.min(safeIndex, content.length)
  for (let i = 0; i < limit; i += 1) {
    if (content[i] === '\n') {
      line += 1
    }
  }
  return line
}
