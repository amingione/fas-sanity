import {spawn} from 'child_process'
import path from 'path'

const REQUIRED_WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'payment_intent.succeeded',
  'invoice.payment_succeeded',
]

const REQUIRED_METADATA_KEYS = [
  'sanity_order_id',
  'order_id',
  'orderId',
  'sanityOrderId',
  'sanity_order_number',
  'sanityOrderNumber',
  'order_number',
  'orderNumber',
  'orderNo',
  'website_order_number',
  'websiteOrderNumber',
  'cart',
  'cart_items',
  'cartItems',
  'line_items',
  'lineItems',
]

const WEBHOOK_URL_ENV_KEYS = [
  'NETLIFY_STRIPE_WEBHOOK_URL',
  'NETLIFY_WEBHOOK_URL',
  'STRIPE_WEBHOOK_URL',
  'STRIPE_NETLIFY_WEBHOOK_URL',
  'NETLIFY_SITE_URL',
  'SITE_URL',
  'DEPLOY_URL',
  'URL',
]
const NETLIFY_WEBHOOK_PATH = '/.netlify/functions/stripeWebhook'

type CommandResult = {
  command: string
  args: string[]
  stdout: string
  stderr: string
  exitCode: number | null
  ok: boolean
}

type StripeAuditReport = {
  timestamp: string
  account: {
    raw: CommandResult
  }
  config: {
    raw: CommandResult
    mode: string | null
  }
  webhookEndpoints: {
    raw: CommandResult
    expectedUrl: string | null
    endpointMatch: boolean | null
    enabledEvents: string[]
    requiredEventsPresent: boolean
  }
  recentEvent: {
    raw: CommandResult
    eventId: string | null
    eventType: string | null
    eventCreated: string | null
    webhookEligible: boolean | null
  }
  session: {
    raw: CommandResult | null
    sessionId: string | null
    requiredMetadataPresent: boolean | null
    metadataKeysPresent: string[]
  }
  misconfigurations: string[]
  criticalFailures: string[]
}

export type {StripeAuditReport}

function runCommand(command: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {stdio: 'pipe'})
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('close', (exitCode) => {
      resolve({
        command,
        args,
        stdout,
        stderr,
        exitCode,
        ok: exitCode === 0,
      })
    })
  })
}

function parseJson<T>(value: string): T | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const first = trimmed[0]
  if (first !== '{' && first !== '[') return null
  try {
    return JSON.parse(trimmed) as T
  } catch {
    return null
  }
}

function extractWebhookUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s"']+/g)
  return matches ? Array.from(new Set(matches)) : []
}

function resolveExpectedWebhookUrl(): string | null {
  for (const key of WEBHOOK_URL_ENV_KEYS) {
    const value = process.env[key]
    if (value && value.trim()) return value.trim()
  }
  return null
}

function expandWebhookUrlCandidates(value: string): string[] {
  const trimmed = value.trim()
  if (!trimmed) return []
  const candidates = new Set<string>([trimmed])
  if (!trimmed.includes(NETLIFY_WEBHOOK_PATH)) {
    const base = trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
    candidates.add(`${base}${NETLIFY_WEBHOOK_PATH}`)
  }
  return Array.from(candidates)
}

function hasNetlifyWebhookEndpoint(urls: string[]): boolean {
  return urls.some((url) => url.includes(NETLIFY_WEBHOOK_PATH))
}

function parseModeFromConfig(output: string): string | null {
  const lines = output.split('\n')
  for (const line of lines) {
    if (line.toLowerCase().includes('mode')) {
      const parts = line.split(':')
      if (parts.length > 1) return parts.slice(1).join(':').trim()
      const alt = line.split('=').map((part) => part.trim())
      if (alt.length > 1) return alt.slice(1).join('=').trim()
    }
  }
  return null
}

function findCheckoutEvent(output: string): {eventId: string | null; created: string | null} {
  const lines = output.split('\n')
  for (const line of lines) {
    if (!line.includes('checkout.session.completed')) continue
    const idMatch = line.match(/evt_[A-Za-z0-9_]+/)
    const createdMatch = line.match(/\d{4}-\d{2}-\d{2}[^\s]*/)
    return {
      eventId: idMatch ? idMatch[0] : null,
      created: createdMatch ? createdMatch[0] : null,
    }
  }
  return {eventId: null, created: null}
}

function evaluateMetadata(metadata: Record<string, unknown> | null | undefined): {
  present: boolean
  keys: string[]
} {
  if (!metadata) return {present: false, keys: []}
  const keys = REQUIRED_METADATA_KEYS.filter((key) => {
    const value = metadata[key]
    if (typeof value === 'string') return value.trim().length > 0
    return value !== undefined && value !== null
  })
  return {present: keys.length > 0, keys}
}

function buildReportOutput(report: StripeAuditReport): string {
  const lines: string[] = []
  lines.push('Stripe')
  lines.push(`eventId: ${report.recentEvent.eventId ?? 'unknown'}`)
  lines.push(`eventType: ${report.recentEvent.eventType ?? 'unknown'}`)
  lines.push(`webhookEligible: ${report.recentEvent.webhookEligible ?? 'unknown'}`)
  lines.push(
    `requiredMetadataPresent: ${
      report.session.requiredMetadataPresent === null
        ? 'unknown'
        : report.session.requiredMetadataPresent
    }`
  )
  if (report.misconfigurations.length > 0) {
    lines.push('misconfigurations:')
    for (const item of report.misconfigurations) lines.push(`- ${item}`)
  }
  if (report.criticalFailures.length > 0 || report.misconfigurations.length > 0) {
    lines.push('# PATCH-ONLY recommendation')
    lines.push('# Address the critical failures above with minimal, targeted patches only.')
  } else {
    lines.push('pipeline: healthy')
  }
  return lines.join('\n')
}

export async function runStripeAudit(): Promise<StripeAuditReport> {
  const misconfigurations: string[] = []
  const criticalFailures: string[] = []
  const expectedWebhookUrl = resolveExpectedWebhookUrl()

  const account = await runCommand('stripe', ['whoami'])
  const whoamiUnsupported =
    account.stdout.includes('Unknown command \"whoami\"') ||
    account.stderr.includes('Unknown command \"whoami\"')
  if (!account.ok && !whoamiUnsupported) criticalFailures.push('stripe whoami failed')

  const config = await runCommand('stripe', ['config', '--list'])
  if (!config.ok) criticalFailures.push('stripe config --list failed')
  const mode = parseModeFromConfig(config.stdout)

  const webhookEndpoints = await runCommand('stripe', ['webhook_endpoints', 'list'])
  if (!webhookEndpoints.ok) criticalFailures.push('stripe webhook_endpoints list failed')

  const webhookJson = parseJson<{data?: Array<{url?: string; enabled_events?: string[]}>}>(
    webhookEndpoints.stdout
  )
  const webhookUrls = webhookJson?.data?.map((item) => item.url).filter(Boolean) as string[]
  const urls = webhookUrls?.length ? webhookUrls : extractWebhookUrls(webhookEndpoints.stdout)
  const enabledEvents = new Set<string>()
  if (webhookJson?.data) {
    for (const endpoint of webhookJson.data) {
      if (!endpoint?.enabled_events) continue
      for (const evt of endpoint.enabled_events) enabledEvents.add(evt)
    }
  } else {
    for (const evt of REQUIRED_WEBHOOK_EVENTS) {
      if (webhookEndpoints.stdout.includes(evt)) enabledEvents.add(evt)
    }
  }
  const enabledEventsList = Array.from(enabledEvents)
  const requiredEventsPresent = REQUIRED_WEBHOOK_EVENTS.every((evt) =>
    enabledEvents.has('*') ? true : enabledEvents.has(evt)
  )

  let endpointMatch: boolean | null = null
  if (expectedWebhookUrl) {
    const expectedCandidates = expandWebhookUrlCandidates(expectedWebhookUrl)
    endpointMatch = urls.some((url) => expectedCandidates.some((candidate) => url.includes(candidate)))
    if (!endpointMatch) misconfigurations.push('Netlify webhook URL not found in Stripe endpoints')
  } else {
    endpointMatch = hasNetlifyWebhookEndpoint(urls)
    if (!endpointMatch) {
      misconfigurations.push('Netlify webhook endpoint not found in Stripe')
    }
  }
  if (!requiredEventsPresent) misconfigurations.push('Required webhook events not enabled')

  const events = await runCommand('stripe', ['events', 'list', '--limit', '5'])
  if (!events.ok) criticalFailures.push('stripe events list --limit 5 failed')
  let eventId: string | null = null
  let eventType: string | null = null
  let eventCreated: string | null = null
  let checkoutSessionId: string | null = null
  const eventsJson = parseJson<{data?: Array<any>}>((events.stdout || '').trim())
  if (eventsJson?.data?.length) {
    const checkoutEvent = eventsJson.data.find((event) => event?.type === 'checkout.session.completed')
    if (checkoutEvent) {
      eventId = checkoutEvent.id || null
      eventType = checkoutEvent.type || null
      if (typeof checkoutEvent.created === 'number') {
        eventCreated = new Date(checkoutEvent.created * 1000).toISOString()
      }
      const dataObject = checkoutEvent.data?.object
      if (dataObject && typeof dataObject === 'object') {
        checkoutSessionId = dataObject.id || null
      }
    }
  } else {
    const fallback = findCheckoutEvent(events.stdout)
    eventId = fallback.eventId
    eventType = eventId ? 'checkout.session.completed' : null
    eventCreated = fallback.created
  }

  if (!eventId) criticalFailures.push('No checkout.session.completed event found in recent list')

  const webhookEligible = eventType
    ? enabledEvents.has('*')
      ? true
      : enabledEvents.has(eventType)
    : null

  if (eventType && webhookEligible === false) {
    misconfigurations.push('Recent checkout.session.completed event is not enabled for webhooks')
  }

  let sessionResult: CommandResult | null = null
  let requiredMetadataPresent: boolean | null = null
  let metadataKeysPresent: string[] = []

  if (checkoutSessionId) {
    sessionResult = await runCommand('stripe', [
      'checkout',
      'sessions',
      'retrieve',
      checkoutSessionId,
      '--expand',
      'line_items',
      '--expand',
      'customer',
    ])
    if (!sessionResult.ok) criticalFailures.push('stripe checkout sessions retrieve failed')
    const sessionJson = parseJson<any>(sessionResult.stdout)
    const metadata = sessionJson?.metadata as Record<string, unknown> | null | undefined
    const metadataCheck = evaluateMetadata(metadata)
    requiredMetadataPresent = metadataCheck.present
    metadataKeysPresent = metadataCheck.keys
    if (!requiredMetadataPresent) {
      misconfigurations.push('Checkout session metadata missing required order identifiers')
      criticalFailures.push('Missing required checkout session metadata')
    }
  } else if (eventId) {
    misconfigurations.push('Checkout session ID missing from recent event payload')
  }

  if (endpointMatch === false) criticalFailures.push('Stripe webhook endpoint mismatch')
  if (!requiredEventsPresent) criticalFailures.push('Stripe webhook required events missing')

  return {
    timestamp: new Date().toISOString(),
    account: {raw: account},
    config: {raw: config, mode},
    webhookEndpoints: {
      raw: webhookEndpoints,
      expectedUrl: expectedWebhookUrl,
      endpointMatch,
      enabledEvents: enabledEventsList,
      requiredEventsPresent,
    },
    recentEvent: {
      raw: events,
      eventId,
      eventType,
      eventCreated,
      webhookEligible,
    },
    session: {
      raw: sessionResult,
      sessionId: checkoutSessionId,
      requiredMetadataPresent,
      metadataKeysPresent,
    },
    misconfigurations,
    criticalFailures,
  }
}

async function main(): Promise<void> {
  const report = await runStripeAudit()
  const output = buildReportOutput(report)
  process.stdout.write(`${output}\n`)
  if (report.criticalFailures.length > 0) process.exit(1)
}

if (path.basename(process.argv[1] || '') === 'stripe-audit.ts') {
  void main()
}
