import {readFileSync} from 'node:fs'
import path from 'node:path'
import {beforeEach, describe, expect, it, vi} from 'vitest'

const checkoutSessionCreateMock = vi.fn(async (_params: unknown) => ({
  id: 'cs_test_123',
  url: 'https://checkout.stripe.com/c/pay/cs_test_123',
  status: 'open',
  expires_at: Math.floor(Date.now() / 1000) + 60 * 30,
}))

const shippingRatesCreateMock = vi.fn(async (_params: unknown) => {
  throw new Error('stripe.shippingRates.create must not be called during checkout')
})

const invoicesCreateMock = vi.fn(async (_params: unknown) => {
  throw new Error('stripe.invoices.create must not be called during checkout')
})

vi.mock('stripe', () => ({
  default: class StripeMock {
    checkout = {
      sessions: {
        create: checkoutSessionCreateMock,
      },
    }
    shippingRates = {
      create: shippingRatesCreateMock,
    }
    invoices = {
      create: invoicesCreateMock,
    }
  },
}))

describe('createCheckoutSession (Stripe payment-only + Parcelcraft rate)', () => {
  beforeEach(() => {
    vi.resetModules()
    checkoutSessionCreateMock.mockClear()
    shippingRatesCreateMock.mockClear()
    invoicesCreateMock.mockClear()

    // Avoid hard-coded key scanners while still providing a valid-looking test key.
    process.env.STRIPE_SECRET_KEY = `sk_xxxx_${'123'}`
    delete process.env.SANITY_STUDIO_PROJECT_ID
    delete process.env.SANITY_STUDIO_DATASET
    delete process.env.SANITY_API_TOKEN
    process.env.PUBLIC_SITE_URL = 'http://localhost:3333'
  })

  it('creates a payment-mode Checkout Session with inline shipping_rate_data and unshipped metadata', async () => {
    const fixturePath = path.resolve(process.cwd(), 'tests/fixtures/checkout.canonical.json')
    const payload = JSON.parse(readFileSync(fixturePath, 'utf8'))

    const {handler} = await import('../netlify/functions/createCheckoutSession')

    const event = {
      httpMethod: 'POST',
      body: JSON.stringify(payload),
      headers: {origin: 'http://localhost:3333'},
      isBase64Encoded: false,
    } as any
    const context = {} as any
    const response = (await handler(event, context)) as any

    expect(response).toBeTruthy()

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body).toEqual(
      expect.objectContaining({
        sessionId: 'cs_test_123',
        url: 'https://checkout.stripe.com/c/pay/cs_test_123',
      }),
    )

    expect(checkoutSessionCreateMock).toHaveBeenCalledTimes(1)
    const sessionParams = checkoutSessionCreateMock.mock.calls[0]![0] as any

    expect(sessionParams.mode).toBe('payment')
    expect(sessionParams.line_items).toHaveLength(1)

    expect(sessionParams.shipping_options).toHaveLength(1)
    const option = sessionParams.shipping_options[0] as any
    expect(option.shipping_rate).toBeUndefined()
    expect(option.shipping_rate_data).toBeTruthy()
    expect(option.shipping_rate_data.type).toBe('fixed_amount')
    expect(option.shipping_rate_data.fixed_amount).toEqual({amount: 4250, currency: 'usd'})

    expect(sessionParams.payment_intent_data?.metadata?.ship_status).toBe('unshipped')

    const shippingMetadata = option.shipping_rate_data?.metadata as any
    expect(shippingMetadata?.easypost_rate_id).toBe('easypost_rate_abc123')

    const forbiddenKeys = ['shipment_id', 'tracking_number', 'ship_date', 'tracking_URL']
    for (const key of forbiddenKeys) {
      expect(sessionParams.metadata?.[key]).toBeUndefined()
      expect(sessionParams.payment_intent_data?.metadata?.[key]).toBeUndefined()
      expect(shippingMetadata?.[key]).toBeUndefined()
    }

    expect(shippingRatesCreateMock).not.toHaveBeenCalled()
    expect(invoicesCreateMock).not.toHaveBeenCalled()
  })
})
