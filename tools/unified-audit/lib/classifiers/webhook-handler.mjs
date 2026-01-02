import path from 'node:path'

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/')
}

function hasSchemaDefinition(content) {
  if (!content) return false
  const hasTypeKey = /_type\s*:\s*['"][^'"]+['"]/.test(content)
  if (!hasTypeKey) return false
  return /\b(fields|defineType|defineField|schemaTypes)\b/.test(content)
}

function isReactComponent(content, filePath) {
  if (!content) return false
  if (!/\.(jsx|tsx)$/.test(filePath)) return false
  return /from\s+['"]react['"]/.test(content) || /return\s*\(\s*<[^>]+/.test(content)
}

export function isExcluded(filePath, fileContent = '') {
  const normalized = normalizePath(filePath)
  const exclusions = [
    /packages\/sanity-config\//,
    /packages\/sanity-config\/src\/schemaTypes\//,
    /packages\/sanity-config\/src\/desk\//,
    /packages\/sanity-config\/src\/components\//,
    /packages\/sanity-config\/src\/views\//,
    /packages\/sanity-config\/src\/types\//,
    /packages\/sanity-config\/src\/utils\//,
    /packages\/sanity-config\/src\/autoMapper\//,
    /tools\//,
    /scripts\//,
    /netlify\/lib\//,
    /src\/lib\//,
    /test-.*\.(js|ts)$/,
  ]

  if (exclusions.some((pattern) => pattern.test(normalized))) {
    if (/scripts\/stripe-maintenance\/webhook-handler-fixed\.js$/.test(normalized)) {
      return false
    }
    return true
  }

  if (hasSchemaDefinition(fileContent)) return true
  if (/from\s+['"]sanity['"]/.test(fileContent)) return true
  if (/from\s+['"]@sanity\/types['"]/.test(fileContent)) return true
  if (/\.d\.ts$/.test(normalized) && /webhook/i.test(fileContent)) return true
  if (isReactComponent(fileContent, normalized)) return true

  return false
}

export function isWebhookHandler(filePath, fileContent = '') {
  const normalized = normalizePath(filePath)
  const pathPatterns = [
    /src\/pages\/api\/webhooks\.ts$/,
    /src\/pages\/api\/.*webhook.*\.ts$/,
    /src\/pages\/api\/webhooks\//,
    /netlify\/functions\/.*webhook.*\.(ts|mjs)$/,
    /netlify\/functions\/stripe.*\.ts$/,
    /netlify\/functions\/easypost.*\.ts$/,
    /netlify\/functions\/.*Events\.ts$/,
  ]

  if (pathPatterns.some((pattern) => pattern.test(normalized))) {
    return !isExcluded(filePath, fileContent)
  }

  if (isExcluded(filePath, fileContent)) return false

  const hasHandler =
    /export\s+default\s+(async\s+)?function.*\(req,\s*res\)/.test(fileContent) ||
    /handler\s*=\s*async\s*\(event/.test(fileContent)
  const hasSignature =
    /(constructEvent|verifySignature|stripe-signature|x-easypost-signature|svix-signature)/.test(
      fileContent,
    )
  const hasEventRef =
    (/event\.id/.test(fileContent) && /event\.type/.test(fileContent)) ||
    /payload\.event_type/.test(fileContent) ||
    /data\.object/.test(fileContent)

  return Boolean(hasHandler && hasSignature && hasEventRef)
}
