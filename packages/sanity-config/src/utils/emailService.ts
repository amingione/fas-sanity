import crypto from 'node:crypto'
import {createClient} from '@sanity/client'
import {Resend} from 'resend'
import {hasResendApiKey, resolveResendApiKey} from '../../../../shared/resendEnv'

export type EmailProvider = 'sendgrid' | 'mailgun' | 'ses' | 'postmark' | 'resend'

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

const SUPPORTED_PROVIDERS: EmailProvider[] = ['sendgrid', 'mailgun', 'ses', 'postmark', 'resend']
const providerEnv = (process.env.EMAIL_PROVIDER || '').toLowerCase()
const RESEND_API_KEY = resolveResendApiKey()
const hasResendKey = hasResendApiKey()
const EMAIL_PROVIDER: EmailProvider =
  (SUPPORTED_PROVIDERS.includes(providerEnv as EmailProvider)
    ? (providerEnv as EmailProvider)
    : undefined) || 'resend'
const DEFAULT_FROM =
  process.env.EMAIL_FROM || process.env.RESEND_FROM || 'FAS Motorsports <info@fasmotorsports.com>'

const SANITY_PROJECT_ID = process.env.SANITY_STUDIO_PROJECT_ID
const SANITY_DATASET = process.env.SANITY_STUDIO_DATASET
const SANITY_TOKEN = process.env.SANITY_API_TOKEN
const RESEND_CLIENT = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null

const emailLogClient =
  SANITY_PROJECT_ID && SANITY_DATASET && SANITY_TOKEN
    ? createClient({
        projectId: SANITY_PROJECT_ID,
        dataset: SANITY_DATASET,
        apiVersion: '2024-10-01',
        token: SANITY_TOKEN,
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

const toBase64 = (value: string) => Buffer.from(value).toString('base64')

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

const formatAddress = (address: string) => {
  const match = address.match(/(.*)<(.+)>/)
  if (match) {
    const name = match[1].trim()
    const email = match[2].trim()
    return {name, email}
  }
  return {email: address}
}

const buildContent = (html?: string, text?: string) => {
  const content = []
  if (text) content.push({type: 'text/plain', value: text})
  if (html) content.push({type: 'text/html', value: html})
  if (content.length === 0) {
    content.push({type: 'text/plain', value: 'Notification'})
  }
  return content
}

const fetchJson = async (url: string, init: RequestInit): Promise<any> => {
  const res = await fetch(url, init)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Email provider request failed (${res.status}): ${body}`)
  }
  if (res.headers.get('content-type')?.includes('application/json')) {
    return res.json()
  }
  return res.text()
}

const sendViaSendGrid = async (options: SendEmailOptions): Promise<SendEmailResult> => {
  const apiKey = process.env.SENDGRID_API_KEY
  if (!apiKey) throw new Error('SENDGRID_API_KEY missing')
  const payload: Record<string, any> = {
    personalizations: [
      {
        to: [{email: options.to}],
        dynamic_template_data: options.variables,
        custom_args: options.emailLogId ? {emailLogId: options.emailLogId} : undefined,
      },
    ],
    from: formatAddress(sanitizeFrom(options.from)),
    reply_to: options.replyTo ? formatAddress(options.replyTo) : undefined,
    subject: options.subject,
    content: buildContent(options.html, options.text),
  }
  if (options.templateId) payload.template_id = options.templateId

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok && res.status !== 202) {
    const errorBody = await res.text().catch(() => '')
    throw new Error(`SendGrid API error: ${errorBody || res.statusText}`)
  }

  const messageId = res.headers.get('x-message-id') || undefined
  return {provider: 'sendgrid', id: messageId, status: 'sent'}
}

const sendViaMailgun = async (options: SendEmailOptions): Promise<SendEmailResult> => {
  const apiKey = process.env.MAILGUN_API_KEY
  const domain = process.env.MAILGUN_DOMAIN
  if (!apiKey || !domain) throw new Error('MAILGUN_API_KEY or MAILGUN_DOMAIN missing')
  const params = new URLSearchParams()
  params.append('from', sanitizeFrom(options.from))
  params.append('to', options.to)
  params.append('subject', options.subject)
  if (options.text) params.append('text', options.text)
  if (options.html) params.append('html', options.html)
  if (options.replyTo) params.append('h:Reply-To', options.replyTo)
  if (options.emailLogId) params.append('v:emailLogId', options.emailLogId)
  Object.entries(options.variables || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return
    params.append(`v:${key}`, String(value))
  })

  const result = await fetchJson(`https://api.mailgun.net/v3/${domain}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${toBase64(`api:${apiKey}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })
  const id = typeof result?.id === 'string' ? result.id : undefined
  return {provider: 'mailgun', id, status: 'sent'}
}

const sendViaPostmark = async (options: SendEmailOptions): Promise<SendEmailResult> => {
  const apiKey = process.env.POSTMARK_SERVER_TOKEN
  if (!apiKey) throw new Error('POSTMARK_SERVER_TOKEN missing')
  const payload: any = {
    From: sanitizeFrom(options.from),
    To: options.to,
    Subject: options.subject,
    HtmlBody: options.html,
    TextBody: options.text,
    ReplyTo: options.replyTo,
    MessageStream: process.env.POSTMARK_MESSAGE_STREAM || 'outbound',
    Headers: options.emailLogId
      ? [{Name: 'X-Email-Log-Id', Value: options.emailLogId}]
      : undefined,
    Metadata: options.variables,
  }
  if (options.templateId) {
    payload.TemplateId = options.templateId
    payload.TemplateModel = options.variables
  }

  const result = await fetchJson('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'X-Postmark-Server-Token': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const id = result?.MessageID ? String(result.MessageID) : undefined
  return {provider: 'postmark', id, status: 'sent'}
}

const sendViaSes = async (options: SendEmailOptions): Promise<SendEmailResult> => {
  const region = process.env.AWS_SES_REGION || process.env.AWS_REGION
  const accessKey = process.env.AWS_SES_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID
  const secretKey = process.env.AWS_SES_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY
  if (!region || !accessKey || !secretKey) throw new Error('AWS SES credentials missing')
  const body = {
    FromEmailAddress: sanitizeFrom(options.from),
    Destination: {ToAddresses: [options.to]},
    ReplyToAddresses: options.replyTo ? [options.replyTo] : undefined,
    EmailTags: options.emailLogId ? [{Name: 'emailLogId', Value: options.emailLogId}] : undefined,
    Content: {
      Simple: {
        Subject: {Data: options.subject},
        Body: {
          Html: options.html ? {Data: options.html} : undefined,
          Text: options.text ? {Data: options.text} : undefined,
        },
      },
    },
  }
  const endpoint = `https://email.${region}.amazonaws.com/v2/email/outbound-emails`
  const payload = JSON.stringify(body)
  const headers = signAwsRequest({
    method: 'POST',
    service: 'ses',
    region,
    host: `email.${region}.amazonaws.com`,
    path: '/v2/email/outbound-emails',
    body: payload,
    accessKey,
    secretKey,
  })
  const result = await fetchJson(endpoint, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: payload,
  })
  const id = result?.MessageId || result?.MessageID || undefined
  return {provider: 'ses', id, status: 'sent'}
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
  const id = (response as any)?.data?.id || (response as any)?.id
  return {provider: 'resend', id, status: 'sent'}
}

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const normalized: SendEmailOptions = {
    ...options,
    subject: options.subject || 'Notification',
    html: options.html || undefined,
    text: options.text || undefined,
  }
  switch (EMAIL_PROVIDER) {
    case 'mailgun':
      return sendViaMailgun(normalized)
    case 'postmark':
      return sendViaPostmark(normalized)
    case 'ses':
      return sendViaSes(normalized)
    case 'resend':
      return sendViaResend(normalized)
    case 'sendgrid':
    default:
      return sendViaSendGrid(normalized)
  }
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

export async function handleWebhook(input: EmailWebhookInput): Promise<EmailEventUpdate[]> {
  const updates = parseWebhookEvents(input.provider, input.payload)
  await applyEventUpdates(updates)
  return updates
}

const applyEventUpdates = async (updates: EmailEventUpdate[]) => {
  for (const update of updates) {
    const patch: Record<string, any> = {status: mapEventStatus(update.status)}
    if (update.timestamp) {
      if (update.status === 'delivered') patch.deliveredAt = update.timestamp
      if (update.status === 'opened') patch.openedAt = update.timestamp
      if (update.status === 'clicked') patch.clickedAt = update.timestamp
    }
    if (update.error) patch.error = update.error
    await updateEmailLog(
      update.emailLogId,
      patch,
      update.url
        ? {
            path: 'clickEvents',
            items: [{url: update.url, timestamp: update.timestamp || nowIso()}],
          }
        : undefined,
    )
  }
}

const mapEventStatus = (status: EmailEventUpdate['status']) => {
  switch (status) {
    case 'opened':
      return 'opened'
    case 'clicked':
      return 'clicked'
    case 'delivered':
      return 'delivered'
    case 'bounced':
      return 'bounced'
    case 'failed':
      return 'failed'
    default:
      return status
  }
}

const parseWebhookEvents = (provider: EmailProvider, payload: any): EmailEventUpdate[] => {
  switch (provider) {
    case 'mailgun':
      return parseMailgunEvents(payload)
    case 'postmark':
      return parsePostmarkEvents(payload)
    case 'ses':
      return parseSesEvents(payload)
    case 'sendgrid':
    default:
      return parseSendGridEvents(payload)
  }
}

const parseSendGridEvents = (payload: any): EmailEventUpdate[] => {
  const events = Array.isArray(payload) ? payload : []
  return events
    .map((event) => {
      const type = (event?.event || '').toString()
      const logId = event?.custom_args?.emailLogId || event?.emailLogId
      if (!logId) return null
      const timestamp = event?.timestamp
        ? new Date(Number(event.timestamp) * 1000).toISOString()
        : undefined
      switch (type) {
        case 'delivered':
          return {emailLogId: logId, status: 'delivered', timestamp}
        case 'open':
          return {emailLogId: logId, status: 'opened', timestamp}
        case 'click':
          return {emailLogId: logId, status: 'clicked', timestamp, url: event?.url}
        case 'bounce':
          return {emailLogId: logId, status: 'bounced', timestamp, error: event?.reason}
        case 'dropped':
        case 'spamreport':
          return {emailLogId: logId, status: 'failed', timestamp, error: event?.reason}
        default:
          return null
      }
    })
    .filter(Boolean) as EmailEventUpdate[]
}

const parseMailgunEvents = (payload: any): EmailEventUpdate[] => {
  const eventData = payload?.['event-data']
  if (!eventData) return []
  const logId =
    eventData?.['user-variables']?.emailLogId ||
    eventData?.message?.headers?.['message-id'] ||
    null
  if (!logId) return []
  const timestamp = eventData?.timestamp
    ? new Date(Number(eventData.timestamp) * 1000).toISOString()
    : undefined
  const eventType = eventData?.event
  switch (eventType) {
    case 'delivered':
      return [{emailLogId: logId, status: 'delivered', timestamp}]
    case 'opened':
      return [{emailLogId: logId, status: 'opened', timestamp}]
    case 'clicked':
      return [
        {
          emailLogId: logId,
          status: 'clicked',
          timestamp,
          url: eventData?.url,
        },
      ]
    case 'bounced':
    case 'failed':
      return [
        {
          emailLogId: logId,
          status: eventType === 'bounced' ? 'bounced' : 'failed',
          timestamp,
          error: eventData?.delivery_status?.description,
        },
      ]
    default:
      return []
  }
}

const parsePostmarkEvents = (payload: any): EmailEventUpdate[] => {
  const recordType = payload?.RecordType
  const logId = payload?.Metadata?.emailLogId || payload?.MessageID || payload?.MessageIDString
  const timestamp = payload?.ReceivedAt || payload?.Timestamp
  if (!logId) return []
  switch (recordType) {
    case 'Delivery':
      return [{emailLogId: logId, status: 'delivered', timestamp}]
    case 'Open':
      return [{emailLogId: logId, status: 'opened', timestamp}]
    case 'Click':
      return [{emailLogId: logId, status: 'clicked', timestamp, url: payload?.OriginalLink}]
    case 'Bounce':
      return [{emailLogId: logId, status: 'bounced', timestamp, error: payload?.Description}]
    default:
      return []
  }
}

const parseSesEvents = (payload: any): EmailEventUpdate[] => {
  const message = unwrapSesMessage(payload)
  if (!message) return []
  const mail = message.mail || {}
  const logId =
    mail?.tags?.emailLogId?.[0] ||
    mail?.messageId ||
    payload?.mail?.tags?.emailLogId?.[0] ||
    null
  if (!logId) return []
  const type = message.notificationType || payload?.notificationType
  switch (type) {
    case 'Delivery':
      return [
        {
          emailLogId: logId,
          status: 'delivered',
          timestamp: message.delivery?.timestamp,
        },
      ]
    case 'Open':
      return [
        {
          emailLogId: logId,
          status: 'opened',
          timestamp: message.open?.timestamp,
        },
      ]
    case 'Click':
      return [
        {
          emailLogId: logId,
          status: 'clicked',
          timestamp: message.click?.timestamp,
          url: message.click?.link,
        },
      ]
    case 'Bounce':
      return [
        {
          emailLogId: logId,
          status: 'bounced',
          timestamp: message.bounce?.timestamp,
          error: message.bounce?.bounceSubType,
        },
      ]
    case 'Complaint':
      return [
        {
          emailLogId: logId,
          status: 'failed',
          timestamp: message.complaint?.timestamp,
          error: 'complaint',
        },
      ]
    default:
      return []
  }
}

const unwrapSesMessage = (payload: any) => {
  if (payload?.Message) {
    try {
      return JSON.parse(payload.Message)
    } catch {
      return null
    }
  }
  return payload
}

const signAwsRequest = ({
  method,
  service,
  region,
  host,
  path,
  body,
  accessKey,
  secretKey,
}: {
  method: string
  service: string
  region: string
  host: string
  path: string
  body: string
  accessKey: string
  secretKey: string
}) => {
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n`
  const signedHeaders = 'content-type;host;x-amz-date'
  const payloadHash = crypto.createHash('sha256').update(body).digest('hex')
  const canonicalRequest = [
    method,
    path,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n')
  const signingKey = getSignatureKey(secretKey, dateStamp, region, service)
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex')
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  return {
    Authorization: authorization,
    'x-amz-date': amzDate,
  }
}

const getSignatureKey = (secretKey: string, dateStamp: string, regionName: string, serviceName: string) => {
  const kDate = crypto.createHmac('sha256', `AWS4${secretKey}`).update(dateStamp).digest()
  const kRegion = crypto.createHmac('sha256', kDate).update(regionName).digest()
  const kService = crypto.createHmac('sha256', kRegion).update(serviceName).digest()
  return crypto.createHmac('sha256', kService).update('aws4_request').digest()
}
