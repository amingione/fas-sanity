import {describe, it, expect} from 'vitest'
import { isWebhookHandler } from '../lib/classifiers/webhook-handler.mjs'
import {
  detectIdempotencyViolation,
  hasIdempotencyGuard,
  hasSideEffects,
} from '../lib/detectors/idempotency.mjs'
import {
  detectUnsafePayloadAccess,
  findPayloadAccess,
  hasValidationBefore,
} from '../lib/detectors/payload-access.mjs'
import {
  detectApiContractViolation,
  extractInlineObjectFields,
} from '../lib/detectors/api-contract.mjs'

const webhookContent = `
export default async function handler(req, res) {
  const signature = req.headers['stripe-signature']
  const event = stripe.webhooks.constructEvent(req.body, signature, secret)
  console.log(event.id, event.type)
}
`

describe('unified audit detectors', () => {
  it('webhook handler classification', () => {
  const cases = [
    {
      filePath: 'netlify/functions/easypostWebhook.ts',
      content: '',
      expected: true,
    },
    {
      filePath: 'src/pages/api/webhooks.ts',
      content: '',
      expected: true,
    },
    {
      filePath: 'netlify/functions/stripe-shipping-webhook.ts',
      content: '',
      expected: true,
    },
    {
      filePath: 'netlify/functions/emailEvents.ts',
      content: '',
      expected: true,
    },
    {
      filePath: 'src/pages/api/salesWebhook.ts',
      content: '',
      expected: true,
    },
    {
      filePath: 'api/handlers/stripe.ts',
      content: webhookContent,
      expected: true,
    },
    {
      filePath: 'packages/sanity-config/src/schemaTypes/documents/stripeWebhook.ts',
      content: 'export default {}',
      expected: false,
    },
    {
      filePath: 'tools/unified-audit/cli.mjs',
      content: webhookContent,
      expected: false,
    },
    {
      filePath: 'scripts/test-webhook.js',
      content: webhookContent,
      expected: false,
    },
    {
      filePath: 'netlify/lib/easypostWebhook.ts',
      content: webhookContent,
      expected: false,
    },
    {
      filePath: 'src/lib/webhook.ts',
      content: webhookContent,
      expected: false,
    },
    {
      filePath: 'api/handlers/no-signature.ts',
      content: 'export default async function handler(req, res) { event.id; event.type; }',
      expected: false,
    },
    {
      filePath: 'api/handlers/no-event.ts',
      content: 'export default async function handler(req, res) { constructEvent(); }',
      expected: false,
    },
    {
      filePath: 'api/handlers/no-handler.ts',
      content: 'const event = stripe.webhooks.constructEvent()',
      expected: false,
    },
    {
      filePath: 'api/handlers/react.tsx',
      content: "import React from 'react'; export default () => <div />;",
      expected: false,
    },
    {
      filePath: 'api/handlers/schema.ts',
      content: "defineType({ _type: 'document', fields: [] })",
      expected: false,
    },
    {
      filePath: 'api/handlers/types.d.ts',
      content: 'export type StripeWebhookEvent = {}',
      expected: false,
    },
    {
      filePath: 'netlify/functions/stripeCustomer.ts',
      content: webhookContent,
      expected: true,
    },
    {
      filePath: 'src/pages/api/status.ts',
      content: 'export default function handler(req, res) { res.status(200).end() }',
      expected: false,
    },
    {
      filePath: 'netlify/functions/stripeWebhook/helper.ts',
      content: webhookContent,
      expected: true,
    },
  ]

    for (const entry of cases) {
      expect(isWebhookHandler(entry.filePath, entry.content)).toBe(entry.expected)
    }
  })

  it('idempotency detection', () => {
  const base = `
export default async function handler(req, res) {
  const signature = req.headers['stripe-signature']
  const event = stripe.webhooks.constructEvent(req.body, signature, secret)
  console.log(event.id, event.type)
}
`

    expect(hasSideEffects('sanityClient.create({})')).toBe(true)
    expect(hasSideEffects('client.fetch()')).toBe(false)
    expect(hasIdempotencyGuard('createIfNotExists({})')).toBe(true)
    expect(hasIdempotencyGuard('console.log("noop")')).toBe(false)

  const violation = detectIdempotencyViolation(
    'netlify/functions/stripe-webhook.ts',
    `${base}\nsanityClient.create({ _type: 'order' })`,
    null,
  )
    expect(Boolean(violation)).toBe(true)

  const guarded = detectIdempotencyViolation(
    'netlify/functions/stripe-webhook.ts',
    `${base}\nclient.createIfNotExists({ _id: 'webhook.' + event.id })`,
    null,
  )
    expect(guarded).toBeNull()

  const readOnly = detectIdempotencyViolation(
    'netlify/functions/stripe-webhook.ts',
    `${base}\nclient.fetch('*[_type == "order"]')`,
    null,
  )
    expect(readOnly).toBeNull()

  const testEndpoint = detectIdempotencyViolation(
    'netlify/functions/test/stripe-webhook.ts',
    `${base}\nsanityClient.create({ _type: 'order' })`,
    null,
  )
    expect(testEndpoint).toBeNull()

  const nonWebhook = detectIdempotencyViolation(
    'src/lib/stripe.ts',
    `${base}\nsanityClient.create({ _type: 'order' })`,
    null,
  )
    expect(nonWebhook).toBeNull()
  })

  it('payload access detection', () => {
  const base = `
export default async function handler(req, res) {
  const signature = req.headers['stripe-signature']
  const event = verifySignature(req.body, signature)
  console.log(event.id, event.type)
}
`

    expect(findPayloadAccess('event.data.object.amount').length).toBe(1)
    expect(hasValidationBefore('webhookSchema.parse(event)\n', 30)).toBe(true)

  const unsafe = detectUnsafePayloadAccess(
    'netlify/functions/stripe-webhook.ts',
    `${base}\nconst amount = event.data.object.amount_total`,
    null,
  )
    expect(Array.isArray(unsafe)).toBe(true)
    expect(unsafe?.length).toBe(1)

  const safe = detectUnsafePayloadAccess(
    'netlify/functions/stripe-webhook.ts',
    `${base}\nwebhookSchema.parse(event.data.object)\nconst amount = event.data.object.amount_total`,
    null,
  )
    expect(safe).toBeNull()

  const safeByConstruct = detectUnsafePayloadAccess(
    'netlify/functions/stripe-webhook.ts',
    `${base}\nstripe.webhooks.constructEvent(req.body, signature, secret)\nconst obj = event.data.object`,
    null,
  )
    expect(safeByConstruct).toBeNull()

  const nonWebhook = detectUnsafePayloadAccess(
    'src/lib/webhook.ts',
    `${base}\nconst obj = event.data.object`,
    null,
  )
    expect(nonWebhook).toBeNull()
  })

  it('api contract detection', () => {
  const easypostMissing = `
const shipmentData = { to_address, from_address }
await easypost.Shipment.create(shipmentData)
`
  const easypostOk = `
const baseData = { to_address, from_address }
const fullData = { ...baseData, parcel }
await easypost.Shipment.create(fullData)
`
  const resendMissing = `
await resend.emails.send({ to, from, html: '<p>Hi</p>' })
`
  const resendOk = `
await resend.emails.send({ to, from, subject, text: 'Hi' })
`

    const violationsA = detectApiContractViolation('netlify/functions/fulfillOrder.ts', easypostMissing, null)
    expect(violationsA.length > 0).toBe(true)

    const violationsB = detectApiContractViolation('netlify/functions/fulfillOrder.ts', easypostOk, null)
    expect(violationsB.length).toBe(0)

    const violationsC = detectApiContractViolation('netlify/functions/send-email.ts', resendMissing, null)
    expect(violationsC.length > 0).toBe(true)

    const violationsD = detectApiContractViolation('netlify/functions/send-email.ts', resendOk, null)
    expect(violationsD.length).toBe(0)

    const skipValidation = detectApiContractViolation(
      'netlify/lib/easypostValidation.ts',
      easypostMissing,
      null,
    )
    expect(skipValidation.length).toBe(0)

    const inlineFields = extractInlineObjectFields(0, 'foo({ to_address, from_address, parcel })')
    expect(inlineFields.has('parcel')).toBe(true)
  })
})
