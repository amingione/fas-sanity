const SANITY_PROJECT_ENV_KEY = 'SANITY_STUDIO_PROJECT_ID'
const SANITY_DATASET_ENV_KEY = 'SANITY_STUDIO_DATASET'
const SANITY_TOKEN_ENV_KEY = 'SANITY_API_TOKEN'

function resolveSanityProjectId(): string | undefined {
  const value = process.env[SANITY_PROJECT_ENV_KEY]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function resolveSanityDataset(): string | undefined {
  const value = process.env[SANITY_DATASET_ENV_KEY]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function resolveSanityToken(): string | undefined {
  const value = process.env[SANITY_TOKEN_ENV_KEY]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function requireSanityCredentials(): {projectId: string; dataset: string; token: string} {
  const projectId = resolveSanityProjectId()
  const dataset = resolveSanityDataset()
  const token = resolveSanityToken()

  if (!projectId || !dataset || !token) {
    throw new Error(
      `Missing Sanity configuration (projectId: ${SANITY_PROJECT_ENV_KEY}; dataset: ${SANITY_DATASET_ENV_KEY}; token: ${SANITY_TOKEN_ENV_KEY}).`,
    )
  }

  return {projectId, dataset, token}
}

export {
  requireSanityCredentials,
  resolveSanityDataset,
  resolveSanityProjectId,
  resolveSanityToken,
  SANITY_DATASET_ENV_KEY,
  SANITY_PROJECT_ENV_KEY,
  SANITY_TOKEN_ENV_KEY,
}
