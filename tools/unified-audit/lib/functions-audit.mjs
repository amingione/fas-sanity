import path from 'node:path'
import {lineNumberForIndex, sortBy, uniqueSorted} from './utils.mjs'

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']
const BUILTIN_MODULES = new Set([
  'assert',
  'buffer',
  'child_process',
  'cluster',
  'console',
  'constants',
  'crypto',
  'dgram',
  'dns',
  'domain',
  'events',
  'fs',
  'http',
  'https',
  'module',
  'net',
  'os',
  'path',
  'punycode',
  'process',
  'querystring',
  'readline',
  'repl',
  'stream',
  'string_decoder',
  'timers',
  'tls',
  'tty',
  'url',
  'util',
  'vm',
  'worker_threads',
  'zlib',
])

const EXTERNAL_API_KEYWORDS = [
  {label: 'stripe', pattern: /stripe/i},
  {label: 'easypost', pattern: /easypost/i},
  {label: 'resend', pattern: /resend/i},
  {label: 'sendgrid', pattern: /sendgrid/i},
  {label: 'mailgun', pattern: /mailgun/i},
  {label: 'shopify', pattern: /shopify/i},
  {label: 'shippo', pattern: /shippo/i},
  {label: 'calcom', pattern: /cal\.com|calcom/i},
]

const PERSISTENCE_KEYWORDS = [
  {label: 'sanity', pattern: /@sanity\/client|createClient\(|sanityClient/i},
  {label: 'prisma', pattern: /prisma/i},
  {label: 'mongodb', pattern: /mongodb|mongoose/i},
  {label: 'postgres', pattern: /pg|postgres/i},
  {label: 'mysql', pattern: /mysql/i},
  {label: 'supabase', pattern: /supabase/i},
  {label: 'firestore', pattern: /firestore|firebase/i},
  {label: 'redis', pattern: /redis/i},
]

const CONTRACTS = [
  {
    name: 'stripe-webhook',
    envKeys: ['STRIPE_WEBHOOK_SECRET', 'STRIPE_WEBHOOK_SIGNING_SECRET'],
    matchFn: (fn) =>
      fn.externalApis.includes('stripe') && fn.name.toLowerCase().includes('webhook'),
  },
  {
    name: 'easypost-webhook',
    envKeys: ['EASYPOST_WEBHOOK_SECRET', 'EASYPOST_WEBHOOK_SIGNING_KEY'],
    matchFn: (fn) =>
      fn.externalApis.includes('easypost') && fn.name.toLowerCase().includes('webhook'),
  },
  {
    name: 'resend-webhook',
    envKeys: ['RESEND_WEBHOOK_SECRET', 'RESEND_SIGNING_SECRET'],
    matchFn: (fn) =>
      fn.externalApis.includes('resend') && fn.name.toLowerCase().includes('webhook'),
  },
  {
    name: 'calcom-webhook',
    envKeys: ['CALCOM_WEBHOOK_SECRET'],
    matchFn: (fn) =>
      fn.name.toLowerCase().includes('calcom') && fn.name.toLowerCase().includes('webhook'),
  },
]

function stripExt(filePath) {
  const ext = path.extname(filePath)
  return ext ? filePath.slice(0, -ext.length) : filePath
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/')
}

function inferRoute(filePath) {
  const normalized = normalizePath(filePath)
  const netlifyIdx = normalized.indexOf('/netlify/functions/')
  if (netlifyIdx !== -1) {
    const rel = normalized.slice(netlifyIdx + '/netlify/functions/'.length)
    return `/.netlify/functions/${stripExt(rel)}`
  }
  const apiIdx = normalized.indexOf('/src/pages/api/')
  if (apiIdx !== -1) {
    const rel = normalized.slice(apiIdx + '/src/pages/api/'.length)
    return `/api/${stripExt(rel)}`
  }
  const pagesApiIdx = normalized.indexOf('/pages/api/')
  if (pagesApiIdx !== -1) {
    const rel = normalized.slice(pagesApiIdx + '/pages/api/'.length)
    return `/api/${stripExt(rel)}`
  }
  const apiRootIdx = normalized.indexOf('/api/')
  if (apiRootIdx !== -1) {
    const rel = normalized.slice(apiRootIdx + '/api/'.length)
    return `/api/${stripExt(rel)}`
  }
  const functionsIdx = normalized.indexOf('/functions/')
  if (functionsIdx !== -1) {
    const rel = normalized.slice(functionsIdx + '/functions/'.length)
    return `/functions/${stripExt(rel)}`
  }
  const serverIdx = normalized.indexOf('/server/')
  if (serverIdx !== -1) {
    const rel = normalized.slice(serverIdx + '/server/'.length)
    return `/server/${stripExt(rel)}`
  }
  return null
}

function extractHandlerNames(contents) {
  const handlers = new Set()
  const handlerRegexes = [
    /export\s+const\s+handler\b/g,
    /export\s+async\s+function\s+handler\b/g,
    /exports\.handler\b/g,
    /module\.exports\.handler\b/g,
    /export\s+default\b/g,
  ]
  for (const regex of handlerRegexes) {
    if (regex.test(contents)) handlers.add('handler')
  }

  for (const method of HTTP_METHODS) {
    const methodRegex = new RegExp(`export\\s+(const|function)\\s+${method}\\b`, 'g')
    if (methodRegex.test(contents)) handlers.add(method)
  }

  return Array.from(handlers).sort()
}

function extractHttpMethods(contents) {
  const methods = new Set()
  for (const method of HTTP_METHODS) {
    const methodRegex = new RegExp(`export\\s+(const|function)\\s+${method}\\b`, 'g')
    if (methodRegex.test(contents)) methods.add(method)
  }

  const allowMatch = contents.match(/Access-Control-Allow-Methods['"]?\s*:\s*['"]([^'"]+)['"]/i)
  if (allowMatch) {
    for (const raw of allowMatch[1].split(',')) {
      const method = raw.trim().toUpperCase()
      if (HTTP_METHODS.includes(method)) methods.add(method)
    }
  }

  if (methods.size === 0) {
    return ['ANY']
  }
  return Array.from(methods).sort()
}

function extractEnvVars(contents) {
  const envKeys = new Set()
  const evidence = []
  const regex = /(process\.env\.|import\.meta\.env\.)([A-Z0-9_]+)/g
  let match
  while ((match = regex.exec(contents)) !== null) {
    envKeys.add(match[2])
    evidence.push({key: match[2], index: match.index})
  }
  return {
    envKeys: Array.from(envKeys).sort(),
    evidence,
  }
}

function extractExternalApis(contents) {
  const apis = new Set()
  const evidence = []
  for (const entry of EXTERNAL_API_KEYWORDS) {
    if (entry.pattern.test(contents)) {
      apis.add(entry.label)
      evidence.push({label: entry.label, index: contents.search(entry.pattern)})
    }
  }

  const urlRegex = /https?:\/\/[a-z0-9._:-]+/gi
  let match
  while ((match = urlRegex.exec(contents)) !== null) {
    const url = match[0]
    const hostname = url.replace(/^https?:\/\//i, '').split('/')[0]
    if (hostname) {
      apis.add(hostname)
      evidence.push({label: hostname, index: match.index})
    }
  }

  return {
    externalApis: Array.from(apis).sort(),
    evidence,
  }
}

function extractPersistence(contents) {
  const persistence = new Set()
  for (const entry of PERSISTENCE_KEYWORDS) {
    if (entry.pattern.test(contents)) {
      persistence.add(entry.label)
    }
  }
  return Array.from(persistence).sort()
}

function extractImports(contents) {
  const imports = new Set()
  const importRegex = /import\s+[^'"]*['"]([^'"]+)['"]/g
  const requireRegex = /require\(\s*['"]([^'"]+)['"]\s*\)/g

  let match
  while ((match = importRegex.exec(contents)) !== null) {
    imports.add(match[1])
  }
  while ((match = requireRegex.exec(contents)) !== null) {
    imports.add(match[1])
  }

  return Array.from(imports)
}

function packageNameFromImport(specifier) {
  if (specifier.startsWith('.') || specifier.startsWith('/')) return null
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/')
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier
  }
  return specifier.split('/')[0]
}

function extractUnsafeUrls(contents) {
  const evidence = []
  const regex = /http:\/\/[a-z0-9._:-]+/gi
  let match
  while ((match = regex.exec(contents)) !== null) {
    evidence.push({url: match[0], index: match.index})
  }
  return evidence
}

function extractGroqFields(contents) {
  const fields = []
  const patterns = [
    /`([^`]*\*[_a-zA-Z][^`]*)`/g,
    /'([^']*\*[_a-zA-Z][^']*)'/g,
    /"([^"]*\*[_a-zA-Z][^"]*)"/g,
  ]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(contents)) !== null) {
      const snippet = match[1]
      const projectionMatch = snippet.match(/\{([^}]*)\}/s)
      if (!projectionMatch) continue
      const projection = projectionMatch[1]
      const tokens = projection
        .split(',')
        .map((token) => token.trim().split(':')[0].trim())
        .filter(Boolean)
        .map((token) => token.replace(/[\s[\](){}]/g, ''))
        .filter((token) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(token))
      for (const token of tokens) {
        fields.push({field: token, index: match.index})
      }
    }
  }

  return fields
}

export function buildFunctionsAudit({
  functionFiles,
  fileContentsByPath,
  codeFiles,
  schemaFields,
  envIndex,
  dependenciesByRepo,
  scheduleMap,
  repoByFile,
}) {
  const functions = []

  for (const filePath of functionFiles) {
    const contents = fileContentsByPath.get(filePath)
    if (contents == null) continue
    const name = path.basename(filePath).replace(path.extname(filePath), '')
    const route = inferRoute(filePath)

    const handlerNames = extractHandlerNames(contents)
    const httpMethods = extractHttpMethods(contents)
    const envData = extractEnvVars(contents)
    const externalData = extractExternalApis(contents)
    const persistence = extractPersistence(contents)

    const envEvidence = envData.evidence.map((item) => ({
      type: 'env',
      key: item.key,
      lineNumber: lineNumberForIndex(contents, item.index),
    }))

    const externalEvidence = externalData.evidence.map((item) => ({
      type: 'externalApi',
      detail: item.label,
      lineNumber: lineNumberForIndex(contents, item.index),
    }))

    const entries = {
      filePath,
      repo: repoByFile.get(filePath) || null,
      name,
      handlerNames,
      httpMethods,
      route,
      envKeys: envData.envKeys,
      externalApis: externalData.externalApis,
      persistence,
      evidence: {
        env: envEvidence,
        externalApis: externalEvidence,
      },
    }

    functions.push(entries)
  }

  const functionsSorted = sortBy(functions, (fn) => fn.filePath)

  const routeMap = new Map()
  for (const fn of functionsSorted) {
    if (!fn.route) continue
    const aliases = new Set([fn.route, fn.route.replace('/.netlify', '')])
    routeMap.set(fn.route, fn)
    fn.routeAliases = Array.from(aliases).sort()
  }

  const usageEvidenceByFunction = new Map()
  const addUsageEvidence = (fn, evidence) => {
    if (!fn) return
    if (!usageEvidenceByFunction.has(fn.filePath)) {
      usageEvidenceByFunction.set(fn.filePath, [])
    }
    usageEvidenceByFunction.get(fn.filePath).push(evidence)
  }

  const routeRegex =
    /(\/\.netlify\/functions\/[A-Za-z0-9/_-]+|\/netlify\/functions\/[A-Za-z0-9/_-]+|\/api\/[A-Za-z0-9/_-]+|\/functions\/[A-Za-z0-9/_-]+|\/server\/[A-Za-z0-9/_-]+)/g

  for (const file of codeFiles) {
    const contents = fileContentsByPath.get(file)
    if (!contents) continue
    let match
    while ((match = routeRegex.exec(contents)) !== null) {
      const route = match[1]
      const normalizedRoute = route.startsWith('/.netlify')
        ? route
        : route.startsWith('/netlify/functions/')
          ? route.replace('/netlify', '/.netlify')
          : route
      const fn = routeMap.get(normalizedRoute)
      if (!fn) continue
      addUsageEvidence(fn, {
        type: 'callSite',
        detail: route,
        filePath: file,
        lineNumber: lineNumberForIndex(contents, match.index),
      })
    }

    const importRegex = /from\s+['"]([^'"]+)['"]/g
    while ((match = importRegex.exec(contents)) !== null) {
      const spec = match[1]
      if (!spec) continue
      for (const fn of functionsSorted) {
        const token = fn.route?.replace('/.netlify', '') || fn.route
        if (!token) continue
        if (spec.includes(token)) {
          addUsageEvidence(fn, {
            type: 'import',
            detail: spec,
            filePath: file,
            lineNumber: lineNumberForIndex(contents, match.index),
          })
        }
      }
    }
  }

  for (const [fnName, schedule] of scheduleMap.entries()) {
    const fn = functionsSorted.find((entry) => entry.name === fnName)
    if (fn) {
      addUsageEvidence(fn, {
        type: 'schedule',
        detail: schedule,
        filePath: schedule.sourceFile,
        lineNumber: schedule.lineNumber,
      })
    }
  }

  const contractUsage = new Map()
  for (const fn of functionsSorted) {
    const matches = []
    for (const contract of CONTRACTS) {
      const hasEnv = contract.envKeys.some((key) => envIndex.has(key))
      if (!hasEnv) continue
      if (contract.matchFn(fn)) {
        matches.push(contract.name)
      }
    }
    if (matches.length > 0) {
      contractUsage.set(fn.filePath, matches)
    }
  }

  const shouldBeUsed = []
  for (const contract of CONTRACTS) {
    const hasEnv = contract.envKeys.some((key) => envIndex.has(key))
    if (!hasEnv) continue
    const matched = functionsSorted.some((fn) => contract.matchFn(fn))
    if (matched) continue
    const envEvidence = []
    for (const key of contract.envKeys) {
      const evidence = envIndex.get(key) || []
      for (const item of evidence) {
        envEvidence.push({
          type: 'contract',
          detail: `${contract.name} env ${key}`,
          filePath: item.filePath,
          lineNumber: item.lineNumber,
        })
      }
    }
    if (envEvidence.length === 0) {
      envEvidence.push({
        type: 'contract',
        detail: `${contract.name} env keys present`,
        filePath: null,
        lineNumber: null,
      })
    }
    shouldBeUsed.push({
      classification: 'SHOULD_BE_USED',
      reason: `Contract ${contract.name} present with no handler wired`,
      filePath: envEvidence[0]?.filePath || null,
      lineNumbers: envEvidence.map((item) => item.lineNumber).filter((line) => line != null),
      evidence: envEvidence,
    })
  }

  const inUseFindings = []
  const brokenFindings = []
  const obsoleteFindings = []
  const duplicateFindings = []

  const duplicateGroups = new Map()

  for (const fn of functionsSorted) {
    const usageEvidence = usageEvidenceByFunction.get(fn.filePath) || []
    const contractMatches = contractUsage.get(fn.filePath) || []
    const inUse = usageEvidence.length > 0 || contractMatches.length > 0

    if (inUse) {
      const evidence = usageEvidence.map((item) => ({
        ...item,
        detail: item.detail,
      }))
      for (const contractName of contractMatches) {
        const envEvidence = CONTRACTS.find((c) => c.name === contractName)?.envKeys || []
        for (const key of envEvidence) {
          const entries = envIndex.get(key) || []
          for (const entry of entries) {
            evidence.push({
              type: 'contract',
              detail: `${contractName} env ${key}`,
              filePath: entry.filePath,
              lineNumber: entry.lineNumber,
            })
          }
        }
      }
      inUseFindings.push({
        classification: 'IN_USE',
        reason:
          contractMatches.length > 0
            ? 'Integration contract requires handler'
            : 'Static call-site detected',
        filePath: fn.filePath,
        lineNumbers: uniqueSorted(
          evidence.map((item) => item.lineNumber).filter((line) => line != null),
        ),
        evidence,
      })
    }

    const brokenReasons = []
    const brokenEvidence = []
    if (fn.handlerNames.length === 0) {
      brokenReasons.push('No handler export detected')
      brokenEvidence.push({
        type: 'handler',
        detail: 'No handler export detected',
        filePath: fn.filePath,
        lineNumber: 1,
      })
    }

    for (const envKey of fn.envKeys) {
      if (!envIndex.has(envKey)) {
        brokenReasons.push(`Missing env var ${envKey}`)
        brokenEvidence.push({
          type: 'env',
          detail: `Missing env var ${envKey}`,
          filePath: fn.filePath,
          lineNumber: null,
        })
      }
    }

    const imports = extractImports(fileContentsByPath.get(fn.filePath) || '')
    const repoName = fn.repo
    const deps = dependenciesByRepo.get(repoName) || new Set()
    for (const spec of imports) {
      const pkg = packageNameFromImport(spec)
      if (!pkg || BUILTIN_MODULES.has(pkg)) continue
      if (!deps.has(pkg)) {
        brokenReasons.push(`Missing dependency ${pkg}`)
        brokenEvidence.push({
          type: 'dependency',
          detail: `Missing dependency ${pkg}`,
          filePath: fn.filePath,
          lineNumber: 1,
        })
      }
    }

    const unsafeUrls = extractUnsafeUrls(fileContentsByPath.get(fn.filePath) || '')
    for (const item of unsafeUrls) {
      brokenReasons.push('Unsafe external API access (http://)')
      brokenEvidence.push({
        type: 'unsafeExternalApi',
        detail: item.url,
        filePath: fn.filePath,
        lineNumber: lineNumberForIndex(fileContentsByPath.get(fn.filePath) || '', item.index),
      })
    }

    const groqFields = extractGroqFields(fileContentsByPath.get(fn.filePath) || '')
    for (const field of groqFields) {
      if (schemaFields && schemaFields.length > 0 && !schemaFields.includes(field.field)) {
        brokenReasons.push(`Invalid schema field ${field.field}`)
        brokenEvidence.push({
          type: 'schemaField',
          detail: `Invalid schema field ${field.field}`,
          filePath: fn.filePath,
          lineNumber: lineNumberForIndex(fileContentsByPath.get(fn.filePath) || '', field.index),
        })
      }
    }

    if (brokenReasons.length > 0) {
      brokenFindings.push({
        classification: 'BROKEN',
        reason: uniqueSorted(brokenReasons).join('; '),
        filePath: fn.filePath,
        lineNumbers: uniqueSorted(
          brokenEvidence.map((item) => item.lineNumber).filter((line) => line != null),
        ),
        evidence: brokenEvidence,
      })
    }

    const isWebhook =
      fn.name.toLowerCase().includes('webhook') || (fn.route || '').includes('webhook')
    const hasSchedule = usageEvidence.some((item) => item.type === 'schedule')
    const hasEnv = fn.envKeys.length > 0
    const contractRequired = contractMatches.length > 0
    if (!inUse && !contractRequired && !hasSchedule && !hasEnv && !isWebhook) {
      obsoleteFindings.push({
        classification: 'OBSOLETE',
        reason: 'No usage, contract requirement, schedule, webhook, or env dependency detected',
        filePath: fn.filePath,
        lineNumbers: [],
        evidence: [],
      })
    }

    const fingerprint = [
      `methods:${fn.httpMethods.join(',')}`,
      `external:${fn.externalApis.join(',')}`,
      `persistence:${fn.persistence.join(',')}`,
    ].join('|')
    if (!duplicateGroups.has(fingerprint)) {
      duplicateGroups.set(fingerprint, [])
    }
    duplicateGroups.get(fingerprint).push(fn)
  }

  for (const [fingerprint, items] of duplicateGroups.entries()) {
    if (items.length < 2) continue
    const sortedItems = sortBy(items, (item) => item.filePath)
    for (const fn of sortedItems) {
      duplicateFindings.push({
        classification: 'DUPLICATE',
        reason: `Duplicate behavior fingerprint ${fingerprint}`,
        filePath: fn.filePath,
        lineNumbers: [],
        evidence: [
          {type: 'fingerprint', detail: fingerprint, filePath: fn.filePath, lineNumber: null},
        ],
      })
    }
  }

  return {
    functions: functionsSorted.map((fn) => ({
      ...fn,
      routeAliases: fn.routeAliases || [],
    })),
    usageFindings: sortBy(inUseFindings, (item) => item.filePath || ''),
    shouldBeUsedFindings: sortBy(shouldBeUsed, (item) => item.filePath || ''),
    brokenFindings: sortBy(brokenFindings, (item) => item.filePath || ''),
    duplicateFindings: sortBy(duplicateFindings, (item) => item.filePath || ''),
    obsoleteFindings: sortBy(obsoleteFindings, (item) => item.filePath || ''),
  }
}
