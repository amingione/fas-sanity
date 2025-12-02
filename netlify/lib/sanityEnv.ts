const SANITY_PROJECT_ENV_KEYS = [
  'SANITY_STUDIO_PROJECT_ID',
  'SANITY_PROJECT_ID',
  'NEXT_PUBLIC_SANITY_PROJECT_ID',
  'SANITY_PROJECT',
] as const

const SANITY_DATASET_ENV_KEYS = [
  'SANITY_STUDIO_DATASET',
  'SANITY_DATASET',
  'NEXT_PUBLIC_SANITY_DATASET',
  'SANITY_PROJECT_DATASET',
  'SANITY_PROJECT_DATASET_NAME',
  'SANITY_DATASET_NAME',
] as const

const SANITY_TOKEN_ENV_KEYS = [
  'SANITY_API_TOKEN',
  'SANITY_WRITE_TOKEN',
  'SANITY_ACCESS_TOKEN',
  'SANITY_AUTH_TOKEN',
  'SANITY_TOKEN',
  'SANITY_READ_TOKEN',
] as const

function resolveEnvValue(keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function resolveSanityProjectId(): string | undefined {
  return resolveEnvValue(SANITY_PROJECT_ENV_KEYS)
}

function resolveSanityDataset(): string {
  return resolveEnvValue(SANITY_DATASET_ENV_KEYS) || 'production'
}

function resolveSanityToken(): string | undefined {
  return resolveEnvValue(SANITY_TOKEN_ENV_KEYS)
}

function requireSanityCredentials(): {projectId: string; dataset: string; token: string} {
  const projectId = resolveSanityProjectId()
  const dataset = resolveSanityDataset()
  const token = resolveSanityToken()

  if (!projectId || !dataset || !token) {
    throw new Error(
      `Missing Sanity configuration (projectId: ${SANITY_PROJECT_ENV_KEYS.join(
        ', ',
      )}; dataset: ${SANITY_DATASET_ENV_KEYS.join(', ')}; token: ${SANITY_TOKEN_ENV_KEYS.join(
        ', ',
      )}).`,
    )
  }

  return {projectId, dataset, token}
}

export {
  requireSanityCredentials,
  resolveSanityDataset,
  resolveSanityProjectId,
  resolveSanityToken,
  SANITY_DATASET_ENV_KEYS,
  SANITY_PROJECT_ENV_KEYS,
  SANITY_TOKEN_ENV_KEYS,
}
