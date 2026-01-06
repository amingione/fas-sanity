import {createClient} from '@sanity/client'
import {createHash} from 'crypto'

type EmailLogContext = {
  contextKey: string
  to: string
  subject?: string
  orderId?: string
  customerId?: string
  campaignId?: string
  templateId?: string
  automationId?: string
}

type EmailReservation = {
  shouldSend: boolean
  logId?: string
  reason?: string
}

const PROJECT_ID = process.env.SANITY_STUDIO_PROJECT_ID
const DATASET = process.env.SANITY_STUDIO_DATASET
const TOKEN = process.env.SANITY_API_TOKEN
const API_VERSION = process.env.SANITY_STUDIO_API_VERSION || '2024-10-01'

const emailLogClient =
  PROJECT_ID && DATASET && TOKEN
    ? createClient({
        projectId: PROJECT_ID,
        dataset: DATASET,
        apiVersion: API_VERSION,
        token: TOKEN,
        useCdn: false,
      })
    : null

const hashKey = (value: string) => createHash('sha256').update(value).digest('hex')

const makeLogId = (contextKey: string) => `emailLog.${hashKey(contextKey)}`

export const reserveEmailLog = async (context: EmailLogContext): Promise<EmailReservation> => {
  if (!emailLogClient) {
    console.warn('[emailIdempotency] Sanity client not configured; skipping dedupe.')
    return {shouldSend: true, reason: 'sanity-missing'}
  }

  const logId = makeLogId(context.contextKey)
  const doc: Record<string, any> = {
    _id: logId,
    _type: 'emailLog',
    to: context.to,
    subject: context.subject,
    status: 'queued',
    contextKey: context.contextKey,
  }

  if (context.orderId) doc.order = {_type: 'reference', _ref: context.orderId}
  if (context.customerId) doc.customer = {_type: 'reference', _ref: context.customerId}
  if (context.campaignId) doc.campaign = {_type: 'reference', _ref: context.campaignId}
  if (context.templateId) doc.template = {_type: 'reference', _ref: context.templateId}
  if (context.automationId) doc.automation = {_type: 'reference', _ref: context.automationId}

  try {
    await emailLogClient.create(doc)
    return {shouldSend: true, logId}
  } catch (err: any) {
    if (err?.statusCode === 409) {
      return {shouldSend: false, logId, reason: 'duplicate'}
    }
    console.warn('[emailIdempotency] Failed to reserve email log', err)
    return {shouldSend: true, logId, reason: 'reserve-failed'}
  }
}

const updateEmailLog = async (logId?: string, patch?: Record<string, any>) => {
  if (!emailLogClient || !logId || !patch) return
  try {
    await emailLogClient.patch(logId).set(patch).commit({autoGenerateArrayKeys: true})
  } catch (err) {
    console.warn('[emailIdempotency] Failed to update email log', err)
  }
}

export const markEmailLogSent = async (logId?: string, resendMessageId?: string | null) => {
  await updateEmailLog(logId, {
    status: 'sent',
    sentAt: new Date().toISOString(),
    resendMessageId: resendMessageId || undefined,
  })
}

export const markEmailLogFailed = async (logId?: string, error?: unknown) => {
  await updateEmailLog(logId, {
    status: 'failed',
    error: error instanceof Error ? error.message : String(error || 'Email failed'),
  })
}
