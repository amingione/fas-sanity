let dotenvLoaded = false
try {
  const dotenv = require('dotenv')
  dotenv.config()
  dotenvLoaded = true
} catch (err) {
  if (err && err.code !== 'MODULE_NOT_FOUND') {
    throw err
  }
}

/**
 * Copy secrets injected by @netlify/plugin-secrets-manager (prefixed, e.g. NETLIFY_AWS_SECRET_FOO)
 * to their original env var names when the unprefixed version is missing. Also attempts to hydrate
 * environment variables from AWS Secrets Manager when configured, and falls back to existing
 * Netlify environment variables. Runs via NODE_OPTIONS="--require ./scripts/aws-secrets-shim.cjs".
 */

const shimLabel = '[aws-secrets-shim]'

const log = (message, ...rest) => console.log(`${shimLabel} ${message}`, ...rest)
const warn = (message, ...rest) => console.warn(`${shimLabel} ${message}`, ...rest)
const error = (message, ...rest) => console.error(`${shimLabel} ${message}`, ...rest)

log(`🔐 AWS Secrets Shim starting...${dotenvLoaded ? ' (dotenv loaded)' : ' (dotenv missing)'}`)

const disableShim =
  process.env.NETLIFY_DISABLE_SECRETS_SHIM === 'true' ||
  process.env.NETLIFY_DISABLE_SECRETS_SHIM === '1'

if (disableShim) {
  warn('Shim disabled via NETLIFY_DISABLE_SECRETS_SHIM')
} else {
  const resolvedKeys = new Set()

  const applyKey = (key, value, source) => {
    if (!key || value === undefined) return
    if (process.env[key] === undefined) {
      process.env[key] = value
      resolvedKeys.add(key)
    }
    log(`Set ${key} from ${source}`)
  }

  const copyPrefixedSecrets = () => {
    const prefix = process.env.NETLIFY_AWS_SECRET_PREFIX || 'NETLIFY_AWS_SECRET_'
    if (!prefix) {
      warn('NETLIFY_AWS_SECRET_PREFIX empty; skipping prefixed copy')
      return
    }

    let copied = 0
    for (const [key, value] of Object.entries(process.env)) {
      if (!key.startsWith(prefix)) continue
      const unprefixed = key.slice(prefix.length)
      if (unprefixed && process.env[unprefixed] === undefined) {
        process.env[unprefixed] = value
        resolvedKeys.add(unprefixed)
        copied += 1
      }
    }
    if (copied) log(`✅ Copied ${copied} prefixed secrets into process.env`)
    else log('ℹ️ No prefixed secrets were copied')
  }

  const loadFromAwsSecretsManager = async () => {
    const configuredIds =
      process.env.AWS_SECRETS_MANAGER_SECRET_IDS || process.env.AWS_SECRETS_SHIM_SECRETS || ''
    const secretIds = configuredIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)

    if (!secretIds.length) {
      log('No AWS_SECRETS_MANAGER_SECRET_IDS provided; skipping AWS fetch')
      return
    }

    const region =
      process.env.AWS_REGION ||
      process.env.AWS_DEFAULT_REGION ||
      process.env.NETLIFY_AWS_DEFAULT_REGION

    if (!region) {
      warn('AWS region not set; cannot fetch secrets from AWS')
      return
    }

    let awsSdk
    try {
      awsSdk = require('@aws-sdk/client-secrets-manager')
    } catch (sdkErr) {
      warn('AWS SDK not installed; skipping AWS Secrets Manager load', sdkErr)
      return
    }

    const {SecretsManagerClient, GetSecretValueCommand} = awsSdk

    const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.NETLIFY_AWS_ACCESS_KEY_ID
    const secretAccessKey =
      process.env.AWS_SECRET_ACCESS_KEY || process.env.NETLIFY_AWS_SECRET_ACCESS_KEY
    const sessionToken = process.env.AWS_SESSION_TOKEN

    const credentials =
      accessKeyId && secretAccessKey
        ? {accessKeyId, secretAccessKey, sessionToken: sessionToken || undefined}
        : undefined

    const client = new SecretsManagerClient({region, credentials})
    const loaded = []

    for (const secretId of secretIds) {
      try {
        const result = await client.send(new GetSecretValueCommand({SecretId: secretId}))
        const rawSecret =
          result.SecretString || (result.SecretBinary ? result.SecretBinary.toString() : '')
        if (!rawSecret) {
          warn(`Secret ${secretId} returned empty payload`)
          continue
        }

        let parsed
        try {
          parsed = JSON.parse(rawSecret)
        } catch {
          parsed = rawSecret
        }

        if (parsed && typeof parsed === 'object') {
          for (const [key, value] of Object.entries(parsed)) {
            applyKey(key, value, `aws:${secretId}`)
          }
        } else {
          const envKey = secretId.toUpperCase().replace(/[^A-Z0-9_]/g, '_')
          applyKey(envKey, parsed, `aws:${secretId}`)
        }
        loaded.push(secretId)
      } catch (awsErr) {
        error(`Failed to load secret ${secretId} from AWS`, awsErr)
      }
    }

    if (loaded.length) log(`✅ Secrets loaded from AWS: ${loaded.join(', ')}`)
    else warn('No secrets loaded from AWS')
  }

  const hydrateEnv = async () => {
    try {
      await loadFromAwsSecretsManager()
    } catch (err) {
      error('AWS Secrets Manager hydration failed', err)
    }

    try {
      copyPrefixedSecrets()
    } catch (err) {
      error('Failed to copy prefixed secrets', err)
    }

    const requiredKeys = [
      'RESEND_API_KEY',
      'SANITY_WRITE_TOKEN',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'EASYPOST_API_KEY',
      'EASYPOST_WEBHOOK_SECRET',
    ]

    const summary = requiredKeys.map((key) => `${key}:${process.env[key] ? '✅' : '❌'}`).join(', ')
    log(`Runtime env availability -> ${summary}`)
    if (resolvedKeys.size) {
      log(`Env keys set by shim: ${Array.from(resolvedKeys).join(', ')}`)
    }
  }

  hydrateEnv().catch((err) => {
    error('Unexpected error in secrets shim', err)
    throw err
  })
}
