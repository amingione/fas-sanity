import type {Handler} from '@netlify/functions'
// Import package manifests directly so they are bundled into the function.
// If a manifest import fails, we fall back to empty data.
import rootPkg from '../../package.json'
import sanityPkg from '../../packages/sanity-config/package.json'
import manifest from './manifest.json'

type Snapshot = {
  packages: Array<{name: string; version: string; source: string}>
  functions: string[]
  recognizedPlatforms: string[]
}

const collectDeps = (pkg: any, source: string) => {
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
  check('googleapis', 'Google APIs')
  check('axios', 'Axios')
  check('sanity', 'Sanity')
  check('@netlify/functions', 'Netlify Functions')
  check('natural', 'natural (NLP)')
  check('fuse.js', 'Fuse.js')
  check('zod', 'Zod')
  return Array.from(new Set(found))
}

const listFunctions = () => {
  const files = Array.isArray((manifest as any)?.functions)
    ? ((manifest as any).functions as Array<{name: string}>).map((fn) => fn.name)
    : []
  return files
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {statusCode: 405, body: 'Method Not Allowed'}
  }

  const seenPackages: Snapshot['packages'] = [
    ...collectDeps(rootPkg, 'package.json'),
    ...collectDeps(sanityPkg, 'packages/sanity-config/package.json'),
  ]

  const functions = listFunctions()

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
