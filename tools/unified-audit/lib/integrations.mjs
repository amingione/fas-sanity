import { lineNumberForIndex, uniqueSorted } from './utils.mjs'

const INTEGRATION_PATTERNS = [
  { category: 'sanity', regex: /@sanity\/client|createClient\s*\(|sanityClient/ },
  { category: 'easypost', regex: /easypost|EasyPost|api\.easypost\.com|EASYPOST_/ },
  { category: 'resend', regex: /resend|RESEND_/ },
  { category: 'shipengine', regex: /shipengine|ShipEngine|SHIPENGINE_/ },
  { category: 'stripe', regex: /Stripe\b|STRIPE_/ },
  { category: 'twilio', regex: /twilio|TWILIO_/ },
  { category: 'netlify', regex: /netlify|Netlify/ },
  { category: 'vercel', regex: /vercel|Vercel/ },
]

const ENV_REGEX = /process\.env\.([A-Z0-9_]+)/g
const META_ENV_REGEX = /import\.meta\.env\.([A-Z0-9_]+)/g

export function buildIntegrationInventory(files) {
  const hits = []
  const envKeys = new Map()

  for (const file of files) {
    const text = file.contents

    for (const pattern of INTEGRATION_PATTERNS) {
      const match = text.match(pattern.regex)
      if (!match) continue
      const index = text.search(pattern.regex)
      const lineNo = lineNumberForIndex(text, index)
      const line = text.split('\n')[lineNo - 1] || ''
      hits.push({
        category: pattern.category,
        file: file.path,
        lineNo,
        snippet: line.trim(),
      })
    }

    let envMatch
    ENV_REGEX.lastIndex = 0
    while ((envMatch = ENV_REGEX.exec(text))) {
      const key = envMatch[1]
      const locations = envKeys.get(key) || []
      locations.push({ file: file.path, lineNo: lineNumberForIndex(text, envMatch.index) })
      envKeys.set(key, locations)
    }

    META_ENV_REGEX.lastIndex = 0
    while ((envMatch = META_ENV_REGEX.exec(text))) {
      const key = envMatch[1]
      const locations = envKeys.get(key) || []
      locations.push({ file: file.path, lineNo: lineNumberForIndex(text, envMatch.index) })
      envKeys.set(key, locations)
    }
  }

  const envKeysObj = {}
  for (const key of uniqueSorted(Array.from(envKeys.keys()))) {
    envKeysObj[key] = envKeys
      .get(key)
      .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.lineNo - b.lineNo))
  }

  return {
    status: 'OK',
    generatedAt: new Date().toISOString(),
    hits: hits.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.lineNo - b.lineNo)),
    envKeys: envKeysObj,
  }
}
