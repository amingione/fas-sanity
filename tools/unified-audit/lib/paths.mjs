import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import config from '../config.json' assert { type: 'json' }

export function resolveRepos() {
  const override = process.env.AUDIT_REPOS
  const names = override
    ? override.split(',').map((v) => v.trim()).filter(Boolean)
    : config.repos.map((repo) => repo.name)

  const repoMap = new Map(config.repos.map((repo) => [repo.name, repo]))
  const resolved = []

  for (const name of names) {
    const repo = repoMap.get(name)
    if (!repo) {
      resolved.push({ name, path: null, status: 'MISSING', reason: 'Repo not in config.json' })
      continue
    }

    const baseDir = path.dirname(fileURLToPath(import.meta.url))
    const basePath = path.resolve(baseDir, '..', repo.path)
    const candidates = [basePath]

    if (name === 'fas-cms') {
      const fallback = path.resolve(baseDir, '..', '../fas-cms-fresh')
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
  return path.resolve(baseDir, '..', 'out', stamp)
}
