import path from 'path'
import {runNetlifyWebhookAudit} from './netlify-webhook-audit'
import {runStripeAudit} from './stripe-audit'

function classifyRootCause(params: {
  stripeCritical: boolean
  stripeMisconfig: boolean
  netlifyCritical: boolean
  signatureFailures: boolean
  earlyReturns: boolean
  ignoredEvents: boolean
  sanityFailures: boolean
}): string {
  if (params.stripeCritical || params.stripeMisconfig) return 'Stripe configuration'
  if (params.netlifyCritical) return 'Webhook delivery'
  if (params.signatureFailures) return 'Webhook delivery'
  if (params.earlyReturns || params.ignoredEvents) return 'Webhook logic'
  if (params.sanityFailures) return 'Sanity persistence'
  return 'Dashboard filtering'
}

function buildUnifiedReport(params: {
  stripeReport: Awaited<ReturnType<typeof runStripeAudit>>
  netlifyReport: Awaited<ReturnType<typeof runNetlifyWebhookAudit>>
  rootCause: string
  dashboardRisk: string
  pipelineHealthy: boolean
}): string {
  const {stripeReport, netlifyReport, rootCause, dashboardRisk, pipelineHealthy} = params
  const lines: string[] = []
  lines.push('Stripe')
  lines.push(`eventId: ${stripeReport.recentEvent.eventId ?? 'unknown'}`)
  lines.push(`eventType: ${stripeReport.recentEvent.eventType ?? 'unknown'}`)
  lines.push(`webhookEligible: ${stripeReport.recentEvent.webhookEligible ?? 'unknown'}`)
  lines.push(
    `requiredMetadataPresent: ${
      stripeReport.session.requiredMetadataPresent === null
        ? 'unknown'
        : stripeReport.session.requiredMetadataPresent
    }`
  )
  if (stripeReport.misconfigurations.length > 0) {
    lines.push('misconfigurations:')
    for (const item of stripeReport.misconfigurations) lines.push(`- ${item}`)
  }

  lines.push('Netlify')
  lines.push(`signatureFailures: ${netlifyReport.signatureFailures.length}`)
  lines.push(`earlyReturns: ${netlifyReport.earlyReturns.length}`)
  lines.push(`ignoredEvents: ${netlifyReport.ignoredEvents.length}`)
  lines.push(`sanityFailures: ${netlifyReport.sanityFailures.length}`)
  lines.push(`netlifyCriticalFailures: ${netlifyReport.criticalFailures.length}`)
  lines.push(`correlatedEventIds: ${netlifyReport.correlatedEventIds.join(', ') || 'none'}`)

  lines.push('Sanity')
  lines.push(
    `status: ${netlifyReport.sanityFailures.length > 0 ? 'failures-detected' : 'no-failures-detected'}`
  )

  lines.push('Dashboard')
  lines.push(`visibilityRisk: ${dashboardRisk}`)

  lines.push(`rootCause: ${rootCause}`)

  if (!pipelineHealthy) {
    lines.push('# PATCH-ONLY recommendation')
    lines.push('# Address the critical failures above with minimal, targeted patches only.')
  } else {
    lines.push('pipeline: healthy')
  }

  return lines.join('\n')
}

async function main(): Promise<void> {
  const stripeReport = await runStripeAudit()
  const netlifyReport = await runNetlifyWebhookAudit({
    expectedEventId: stripeReport.recentEvent.eventId,
  })

  const stripeCritical = stripeReport.criticalFailures.length > 0
  const stripeMisconfig = stripeReport.misconfigurations.length > 0
  const signatureFailures = netlifyReport.signatureFailures.length > 0
  const earlyReturns = netlifyReport.earlyReturns.length > 0
  const ignoredEvents = netlifyReport.ignoredEvents.length > 0
  const sanityFailures = netlifyReport.sanityFailures.length > 0
  const netlifyCritical = netlifyReport.criticalFailures.length > 0

  const rootCause = classifyRootCause({
    stripeCritical,
    stripeMisconfig,
    netlifyCritical,
    signatureFailures,
    earlyReturns,
    ignoredEvents,
    sanityFailures,
  })

  const dashboardRisk = stripeCritical || signatureFailures || sanityFailures ? 'elevated' : 'low'
  const hasFindings =
    stripeCritical ||
    stripeMisconfig ||
    netlifyCritical ||
    signatureFailures ||
    earlyReturns ||
    ignoredEvents ||
    sanityFailures
  const pipelineHealthy = !hasFindings

  const report = buildUnifiedReport({
    stripeReport,
    netlifyReport,
    rootCause,
    dashboardRisk,
    pipelineHealthy,
  })

  process.stdout.write(`${report}\n`)
  if (stripeCritical || netlifyCritical) process.exit(1)
}

if (path.basename(process.argv[1] || '') === 'run-stripe-audit.ts') {
  void main()
}
