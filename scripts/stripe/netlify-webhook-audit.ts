import {spawn} from 'child_process'
import path from 'path'

const SIGNATURE_FAILURE_PATTERNS = [
  /invalid signature/i,
  /signature verification failed/i,
  /failed to verify.*signature/i,
]

const EARLY_RETURN_PATTERNS = [/statusCode\s*:\s*200/i, /returning 200/i, /acknowledge/i]

const IGNORED_EVENT_PATTERNS = [/\bignored\b/i, /\bskipping\b/i, /\bskipped\b/i]

const SANITY_FAILURE_PATTERNS = [
  /sanity.*fail/i,
  /failed to record webhook event/i,
  /failed to write webhook event/i,
  /failed to create.*sanity/i,
  /failed to upsert.*sanity/i,
]

type CommandResult = {
  command: string
  args: string[]
  stdout: string
  stderr: string
  exitCode: number | null
  ok: boolean
}

type NetlifyWebhookAuditReport = {
  timestamp: string
  raw: CommandResult
  signatureFailures: string[]
  earlyReturns: string[]
  ignoredEvents: string[]
  sanityFailures: string[]
  correlatedEventIds: string[]
  criticalFailures: string[]
}

export type {NetlifyWebhookAuditReport}

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

function extractEventIds(text: string): string[] {
  const matches = text.match(/evt_[A-Za-z0-9_]+/g)
  return matches ? Array.from(new Set(matches)) : []
}

function buildReportOutput(report: NetlifyWebhookAuditReport): string {
  const lines: string[] = []
  lines.push('Netlify')
  lines.push(`signatureFailures: ${report.signatureFailures.length}`)
  lines.push(`earlyReturns: ${report.earlyReturns.length}`)
  lines.push(`ignoredEvents: ${report.ignoredEvents.length}`)
  lines.push(`sanityFailures: ${report.sanityFailures.length}`)
  lines.push(`correlatedEventIds: ${report.correlatedEventIds.join(', ') || 'none'}`)
  if (
    report.criticalFailures.length > 0 ||
    report.signatureFailures.length > 0 ||
    report.earlyReturns.length > 0 ||
    report.ignoredEvents.length > 0 ||
    report.sanityFailures.length > 0
  ) {
    lines.push('# PATCH-ONLY recommendation')
    lines.push('# Address the critical failures above with minimal, targeted patches only.')
  } else {
    lines.push('pipeline: healthy')
  }
  lines.push('rawOutputs:')
  lines.push(`- netlify logs:function stripeWebhook --since 30m stdout:\n${report.raw.stdout}`)
  lines.push(`- netlify logs:function stripeWebhook --since 30m stderr:\n${report.raw.stderr}`)
  return lines.join('\n')
}

export async function runNetlifyWebhookAudit(options?: {
  expectedEventId?: string | null
}): Promise<NetlifyWebhookAuditReport> {
  // Older Netlify CLI versions do not support --since; stream current logs instead.
  const raw = await runCommand('netlify', ['logs:function', 'stripeWebhook'])
  const criticalFailures: string[] = []
  if (!raw.ok) criticalFailures.push('netlify logs:function stripeWebhook failed')

  const signatureFailures: string[] = []
  const earlyReturns: string[] = []
  const ignoredEvents: string[] = []
  const sanityFailures: string[] = []

  const lines = raw.stdout.split('\n')
  for (const line of lines) {
    if (!line.trim()) continue
    if (SIGNATURE_FAILURE_PATTERNS.some((pattern) => pattern.test(line))) {
      signatureFailures.push(line)
    }
    if (EARLY_RETURN_PATTERNS.some((pattern) => pattern.test(line))) {
      earlyReturns.push(line)
    }
    if (IGNORED_EVENT_PATTERNS.some((pattern) => pattern.test(line))) {
      ignoredEvents.push(line)
    }
    if (SANITY_FAILURE_PATTERNS.some((pattern) => pattern.test(line))) {
      sanityFailures.push(line)
    }
  }

  const correlatedEventIds = options?.expectedEventId
    ? extractEventIds(raw.stdout).filter((id) => id === options.expectedEventId)
    : extractEventIds(raw.stdout)

  if (signatureFailures.length > 0) criticalFailures.push('Stripe webhook signature verification failures')
  if (sanityFailures.length > 0) criticalFailures.push('Sanity persistence failures detected')

  return {
    timestamp: new Date().toISOString(),
    raw,
    signatureFailures,
    earlyReturns,
    ignoredEvents,
    sanityFailures,
    correlatedEventIds,
    criticalFailures,
  }
}

async function main(): Promise<void> {
  const report = await runNetlifyWebhookAudit()
  const output = buildReportOutput(report)
  process.stdout.write(`${output}\n`)
  if (report.criticalFailures.length > 0) process.exit(1)
}

if (path.basename(process.argv[1] || '') === 'netlify-webhook-audit.ts') {
  void main()
}
