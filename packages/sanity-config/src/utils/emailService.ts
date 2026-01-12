import {createClient} from '@sanity/client'
import {Resend} from 'resend'
import {resolveResendApiKey} from '../../../../shared/resendEnv'
import {getMessageId} from '../../../../shared/messageResponse.js'

export type EmailProvider = 'resend'

export type SendEmailOptions = {
  to: string
  subject: string
  html?: string
  text?: string
  from?: string
  replyTo?: string
  templateId?: string
  variables?: Record<string, string | number | null | undefined>
  emailLogId?: string
}

export type SendEmailResult = {
  provider: EmailProvider
  id?: string
  status: 'queued' | 'sent'
}

export type EmailWebhookInput = {
  provider: EmailProvider
  payload: any
}

type EmailEventUpdate = {
  emailLogId: string
  status: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed'
  timestamp?: string
  url?: string
  error?: string
}

const RESEND_API_KEY = resolveResendApiKey()
const DEFAULT_FROM =
  process.env.RESEND_FROM || 'FAS Motorsports <info@fasmotorsports.com>'

const SANITY_STUDIO_PROJECT_ID = process.env.SANITY_STUDIO_PROJECT_ID
const SANITY_STUDIO_DATASET = process.env.SANITY_STUDIO_DATASET
const SANITY_API_TOKEN = process.env.SANITY_API_TOKEN
const RESEND_CLIENT = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null

const emailLogClient =
  SANITY_STUDIO_PROJECT_ID && SANITY_STUDIO_DATASET && SANITY_API_TOKEN
    ? createClient({
        projectId: SANITY_STUDIO_PROJECT_ID,
        dataset: SANITY_STUDIO_DATASET,
        apiVersion: '2024-10-01',
        token: SANITY_API_TOKEN,
        useCdn: false,
      })
    : null

if (!emailLogClient) {
  console.warn(
    'emailService: SANITY_STUDIO_PROJECT_ID/SANITY_STUDIO_DATASET/SANITY_API_TOKEN missing; email logs disabled.',
  )
}

const nowIso = () => new Date().toISOString()

const sanitizeFrom = (from?: string) => from?.trim() || DEFAULT_FROM

const updateEmailLog = async (emailLogId?: string, patch?: Record<string, any>, append?: any) => {
  if (!emailLogClient || !emailLogId || !patch) return
  let builder = emailLogClient.patch(emailLogId).set(patch)
  if (append && append.path && append.items) {
    builder = builder.setIfMissing({[append.path]: []}).append(append.path, append.items)
  }
  try {
    await builder.commit({autoGenerateArrayKeys: true})
  } catch (err) {
    console.warn('emailService: failed to update email log', err)
  }
}

const sendViaResend = async (options: SendEmailOptions): Promise<SendEmailResult> => {
  if (!RESEND_CLIENT) throw new Error('RESEND_API_KEY missing')
  const from = sanitizeFrom(options.from)
  const missing: string[] = []
  if (!options.to || !options.to.trim()) missing.push('to')
  if (!from) missing.push('from')
  if (!options.subject || !options.subject.trim()) missing.push('subject')
  if (missing.length) {
    throw new Error(`Missing email fields: ${missing.join(', ')}`)
  }
  // @ts-expect-error Resend types require a React email payload, but we supply raw HTML/text
  const response = await RESEND_CLIENT.emails.send({
    from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
    replyTo: options.replyTo,
  })
  const errorMessage =
    (response as any)?.error?.message || (response as any)?.error || (response as any)?.message
  if (errorMessage) {
    throw new Error(`Resend API error: ${errorMessage}`)
  }
  const id = getMessageId(response)
  return {provider: 'resend', id, status: 'sent'}
}

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const normalized: SendEmailOptions = {
    ...options,
    subject: options.subject || 'Notification',
    html: options.html || undefined,
    text: options.text || undefined,
  }
  return sendViaResend(normalized)
}

export async function sendBulk(
  recipients: Array<{email: string; name?: string}>,
  template: Omit<SendEmailOptions, 'to'>,
  variables?: Record<string, string | number | null | undefined>,
): Promise<SendEmailResult[]> {
  const results: SendEmailResult[] = []
  for (const recipient of recipients) {
    const payload: SendEmailOptions = {
      ...template,
      to: recipient.email,
      variables: {
        ...(template.variables || {}),
        ...(variables || {}),
        recipientName: recipient.name,
      },
    }
    results.push(await sendEmail(payload))
  }
  return results
}

export async function trackOpen(emailLogId: string): Promise<void> {
  await updateEmailLog(emailLogId, {status: 'opened', openedAt: nowIso()})
}

export async function trackClick(emailLogId: string, url: string): Promise<void> {
  await updateEmailLog(
    emailLogId,
    {status: 'clicked', clickedAt: nowIso()},
    url
      ? {
          path: 'clickEvents',
          items: [{url, timestamp: nowIso()}],
        }
      : undefined,
  )
}

export async function handleWebhook(_input: EmailWebhookInput): Promise<EmailEventUpdate[]> {
  return []
}
