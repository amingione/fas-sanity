export function resolveResendApiKey(): string | undefined {
  const value = process.env.RESEND_API_KEY
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function hasResendApiKey(): boolean {
  return Boolean(resolveResendApiKey())
}

export type ResendEnvStatus = {
  hasApiKey: boolean
  hasResendEnvVar: boolean
  keyLength: number
  keyPrefix: string
  environment?: string
  availableResendVars: string[]
}

export function getResendEnvStatus(): ResendEnvStatus {
  const apiKey = resolveResendApiKey()
  const availableResendVars = Object.keys(process.env)
    .filter((key) => key.includes('RESEND'))
    .sort()
  return {
    hasApiKey: Boolean(apiKey),
    hasResendEnvVar: Boolean(process.env.RESEND_API_KEY),
    keyLength: apiKey?.length || 0,
    keyPrefix: apiKey?.substring(0, 5) || 'none',
    environment: process.env.NODE_ENV,
    availableResendVars,
  }
}

export function logMissingResendApiKey(context: string): ResendEnvStatus {
  const status = getResendEnvStatus()
  console.error(`[${context}] RESEND_API_KEY is missing or empty`, {
    ...status,
    timestamp: new Date().toISOString(),
  })
  return status
}
