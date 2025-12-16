export function resolveResendApiKey(): string | undefined {
  return (
    process.env.RESEND_API_KEY ||
    process.env.RESEND_KEY ||
    process.env.RESEND_SECRET ||
    process.env.RESEND_TOKEN ||
    process.env.RESEND_SECRET_KEY
  )?.trim() || undefined
}

export function hasResendApiKey(): boolean {
  return Boolean(resolveResendApiKey())
}
