import type {Handler} from '@netlify/functions'
import fs from 'fs'
import path from 'path'

type Snapshot = {
  packages: Array<{name: string; version: string; source: string}>
  functions: string[]
  recognizedPlatforms: string[]
}

const tryReadJSON = (filePath: string) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

const collectDeps = (pkgPath: string, source: string) => {
  const pkg = tryReadJSON(pkgPath)
  if (!pkg) return []
  const entries = Object.entries({
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  })
  return entries.map(([name, version]) => ({name, version: String(version), source}))
}

const detectPlatforms = (packages: Snapshot['packages']) => {
  const names = new Set(packages.map((p) => p.name))
  const found: string[] = []
  const check = (needle: string, label?: string) => {
    if (names.has(needle)) found.push(label || needle)
  }
  check('stripe', 'Stripe')
  check('@stripe/stripe-js', 'Stripe JS')
  check('twilio', 'Twilio')
  check('@easypost/api', 'EasyPost')
  check('shipengine', 'ShipEngine')
  check('googleapis', 'Google APIs')
  check('axios', 'Axios')
  check('sanity', 'Sanity')
  check('@netlify/functions', 'Netlify Functions')
  check('natural', 'natural (NLP)')
  check('fuse.js', 'Fuse.js')
  check('zod', 'Zod')
  return Array.from(new Set(found))
}

const listFunctions = (root: string) => {
  const fnDir = path.join(root, 'netlify', 'functions')
  if (!fs.existsSync(fnDir)) return []
  const entries = fs.readdirSync(fnDir)
  return entries.filter((file) => /\.(ts|js|tsx)$/.test(file)).sort()
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {statusCode: 405, body: 'Method Not Allowed'}
  }

  const roots = [
    path.resolve(__dirname, '..', '..', '..'),
    path.resolve(process.cwd()),
    path.resolve(__dirname, '..'),
  ]

  const seenPackages: Snapshot['packages'] = []
  roots.forEach((root) => {
    const rootPkg = path.join(root, 'package.json')
    if (fs.existsSync(rootPkg)) {
      seenPackages.push(...collectDeps(rootPkg, rootPkg))
    }
    const sanityPkg = path.join(root, 'packages', 'sanity-config', 'package.json')
    if (fs.existsSync(sanityPkg)) {
      seenPackages.push(...collectDeps(sanityPkg, sanityPkg))
    }
  })

  const functions = listFunctions(roots[0])

  const snapshot: Snapshot = {
    packages: seenPackages,
    functions,
    recognizedPlatforms: detectPlatforms(seenPackages),
  }

  return {
    statusCode: 200,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(snapshot),
  }
}

export {handler}
