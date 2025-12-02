/**
 * Copy secrets injected by @netlify/plugin-secrets-manager (prefixed, e.g. NETLIFY_AWS_SECRET_FOO)
 * to their original env var names when the unprefixed version is missing.
 * Runs via NODE_OPTIONS="--require ./scripts/aws-secrets-shim.cjs".
 */
const prefix = process.env.NETLIFY_AWS_SECRET_PREFIX || 'NETLIFY_AWS_SECRET_'

// If a user set an empty prefix, there's nothing to copy.
if (prefix) {
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith(prefix)) continue
    const unprefixed = key.slice(prefix.length)
    if (unprefixed && process.env[unprefixed] === undefined) {
      process.env[unprefixed] = value
    }
  }
}
