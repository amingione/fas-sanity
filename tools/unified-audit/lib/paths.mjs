import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import config from '../config.json' with { type: 'json' }

export function resolveRepos() {
  const override = process.env.AUDIT_REPOS
  const names = override
    ? override.split(',').map((v) => v.trim()).filter(Boolean)
    : config.repos.map((repo) => repo.name)

  const repoMap = new Map(config.repos.map((repo) => [repo.name, repo]))
  const resolved = []
  const moduleDir = path.dirname(fileURLToPath(import.meta.url))
  const repoRoot = path.resolve(moduleDir, '..', '..', '..')

  for (const name of names) {
    const repo = repoMap.get(name)
    if (!repo) {
      resolved.push({ name, path: null, status: 'MISSING', reason: 'Repo not in config.json' })
      continue
    }

    const basePath = path.resolve(repoRoot, repo.path)
    const candidates = [basePath]

    if (name === 'fas-cms') {
      const fallback = path.resolve(repoRoot, '../fas-cms-fresh')
      candidates.push(fallback)
    }

    const existing = candidates.find((candidate) => fs.existsSync(candidate))
    if (!existing) {
      resolved.push({ name, path: basePath, status: 'MISSING', reason: 'Repo path not found' })
      continue
    }

    resolved.push({ name, path: existing, status: 'OK' })
  }

  return resolved
}

export function resolveOutDir(stamp) {
  const baseDir = path.dirname(fileURLToPath(import.meta.url))
  const outBase = path.resolve(baseDir, '..', 'out')
  let candidate = path.join(outBase, stamp)
  if (!fs.existsSync(candidate)) return candidate

  let counter = 2
  while (fs.existsSync(candidate)) {
    candidate = path.join(outBase, `${stamp}-${counter}`)
    counter += 1
  }

  return candidate
}
