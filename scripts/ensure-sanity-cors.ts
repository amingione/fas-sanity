import 'dotenv/config'
import fetch from 'node-fetch'

const projectId =
  process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID || 'r4og35qd'
const token =
  process.env.SANITY_API_TOKEN ||
  process.env.SANITY_AUTH_TOKEN ||
  process.env.SANITY_DEPLOY_TOKEN ||
  process.env.SANITY_WRITE_TOKEN

class SanityCorsPermissionError extends Error {
  constructor(status: number, body: string) {
    super(`Missing Sanity CORS permission (${status}): ${body}`)
    this.name = 'SanityCorsPermissionError'
  }
}

async function getRequiredOrigins() {
  const configured = (process.env.SANITY_REQUIRED_CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  const defaults = [
    'http://localhost:3333',
    'http://localhost:8888',
    'http://localhost:48752',
    'https://fassanity.fasmotorsports.com',
  ]

  const fusionOrigin = process.env.FUSION_ENV_ORIGIN || ''

  return Array.from(new Set([...defaults, ...configured, fusionOrigin].filter(Boolean)))
}

async function fetchExistingOrigins() {
  const response = await fetch(`https://api.sanity.io/v2023-03-01/projects/${projectId}/cors`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  const status = typeof response.status === 'number' ? response.status : Number(response.status)

  if (status === 401 || status === 403) {
    const message = await response.text()
    throw new SanityCorsPermissionError(status, message)
  }

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Failed to load existing CORS origins: ${status} ${message}`)
  }

  return (await response.json()) as {origin: string}[]
}

async function addOrigin(origin: string) {
  const response = await fetch(`https://api.sanity.io/v2023-03-01/projects/${projectId}/cors`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({origin, allowCredentials: true}),
  })

  const status = typeof response.status === 'number' ? response.status : Number(response.status)

  if (status === 401 || status === 403) {
    const message = await response.text()
    throw new SanityCorsPermissionError(status, message)
  }

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Failed to add CORS origin ${origin}: ${status} ${message}`)
  }
}

async function ensureCors() {
  if (!token) {
    console.warn(
      'Skipping Sanity CORS configuration: set SANITY_API_TOKEN (or SANITY_AUTH_TOKEN / SANITY_DEPLOY_TOKEN / SANITY_WRITE_TOKEN).',
    )
    return
  }

  const requiredOrigins = await getRequiredOrigins()
  if (!requiredOrigins.length) {
    return
  }

  let existingOrigins: Set<string>
  try {
    existingOrigins = new Set(
      (await fetchExistingOrigins()).map((entry) => entry.origin.toLowerCase()),
    )
  } catch (error) {
    if (error instanceof SanityCorsPermissionError) {
      console.warn(`${error.message} — skipping automatic Sanity CORS updates.`)
      return
    }

    throw error
  }

  for (const origin of requiredOrigins) {
    if (existingOrigins.has(origin.toLowerCase())) {
      continue
    }

    try {
      await addOrigin(origin)
      console.log(`Added missing Sanity CORS origin: ${origin}`)
    } catch (error) {
      if (error instanceof SanityCorsPermissionError) {
        console.warn(`${error.message} — unable to add ${origin}.`)
        return
      }

      throw error
    }
  }
}

ensureCors().catch((error) => {
  if (error instanceof SanityCorsPermissionError) {
    console.warn(`${error.message} — skipping automatic Sanity CORS updates.`)
    return
  }

  console.error(error)
  process.exitCode = 1
})
