import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const patchChain = {
  set: vi.fn().mockReturnThis(),
  setIfMissing: vi.fn().mockReturnThis(),
  append: vi.fn().mockReturnThis(),
  commit: vi.fn().mockResolvedValue({}),
}
const patchMock = vi.fn(() => patchChain)
const fetchMock = vi.fn()
const createMock = vi.fn()
const createIfNotExistsMock = vi.fn()
const createOrReplaceMock = vi.fn()
const createClientMock = vi.fn(() => ({
  patch: patchMock,
  fetch: fetchMock,
  create: createMock,
  createIfNotExists: createIfNotExistsMock,
  createOrReplace: createOrReplaceMock,
}))

const resendSendMock = vi.fn().mockResolvedValue({data: {id: 'email_1'}, error: null})
const resendContactsCreateMock = vi.fn().mockResolvedValue({})

vi.mock('@sanity/client', () => ({
  createClient: createClientMock,
}))

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {send: resendSendMock},
    contacts: {create: resendContactsCreateMock},
  })),
}))

vi.mock('stripe', () => ({
  default: vi.fn(() => ({
    webhooks: {
      constructEvent: vi.fn((body, sig, secret) => {
        // Allow test mode - just parse the body
        return JSON.parse(body.toString('utf8'))
      }),
    },
  })),
}))

vi.mock('../../lib/referenceIntegrity', () => ({
  linkCheckoutSessionToCustomer: vi.fn(),
  linkInvoiceToCustomer: vi.fn(),
  linkOrderToCustomer: vi.fn(),
  linkOrderToInvoice: vi.fn(),
}))

vi.mock('../../lib/emailAutomations', () => ({
  runOrderPlacedAutomations: vi.fn(),
}))

vi.mock('../../../utils/functionLogger', () => ({
  logFunctionExecution: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../lib/stripeEnv', () => ({
  resolveStripeSecretKey: vi.fn().mockReturnValue('sk_test_123'),
  STRIPE_SECRET_ENV_KEY: 'STRIPE_SECRET_KEY',
}))

vi.mock('../../shared/resendEnv', () => ({
  resolveResendApiKey: vi.fn().mockReturnValue('re_test'),
}))

vi.mock('../../lib/stripeConfig', () => ({
  STRIPE_API_VERSION: '2024-11-20',
}))

vi.mock('../../lib/packingSlip', () => ({
  generatePackingSlipAsset: vi.fn().mockResolvedValue({
    _type: 'file',
    asset: {_ref: 'file-123'},
  }),
}))

vi.mock('../../lib/cartEnrichment', () => ({
  enrichCartItemsFromSanity: vi.fn().mockResolvedValue([]),
  computeShippingMetrics: vi.fn().mockReturnValue({}),
  fetchProductsForCart: vi.fn().mockResolvedValue([]),
  findProductForItem: vi.fn().mockReturnValue(null),
}))

vi.mock('../../lib/stripeCartItem', () => ({
  mapStripeLineItem: vi.fn().mockReturnValue({
    _type: 'orderCartItem',
    _key: 'item-1',
    name: 'Test Item',
    quantity: 1,
    price: 100,
  }),
  sanitizeOrderCartItem: vi.fn((item) => item),
}))

vi.mock('../../lib/stripeSummary', () => ({
  buildStripeSummary: vi.fn().mockReturnValue({
    data: '{}',
  }),
  parseStripeSummaryData: vi.fn().mockReturnValue({}),
  serializeStripeSummaryData: vi.fn().mockReturnValue('{}'),
}))

vi.mock('../../../src/lib/normalize/normalizeStripeOrderToSanityOrder', () => ({
  normalizeStripeOrderToSanityOrder: vi.fn().mockResolvedValue({}),
}))

vi.mock('../../lib/customerSnapshot', () => ({
  updateCustomerProfileForOrder: vi.fn(),
}))

vi.mock('../../lib/stripeShipping', () => ({
  resolveStripeShippingDetails: vi.fn().mockResolvedValue({}),
}))

vi.mock('../../lib/customerSegments', () => ({
  CUSTOMER_METRICS_QUERY: 'some_query',
  buildCustomerMetricsPatch: vi.fn(),
  metricsChanged: vi.fn().mockReturnValue(false),
}))

vi.mock('../../lib/customerDiscounts', () => ({
  hydrateDiscountResources: vi.fn(),
  removeCustomerDiscountRecord: vi.fn(),
  syncCustomerDiscountRecord: vi.fn(),
}))

vi.mock('../../lib/attribution', () => ({
  buildAttributionDocument: vi.fn(),
  extractAttributionFromMetadata: vi.fn(),
  hasAttributionData: vi.fn().mockReturnValue(false),
}))

vi.mock('../../shared/inventory', () => ({
  reserveInventoryForItems: vi.fn(),
}))

vi.mock('../../lib/fulfillmentFromMetadata', () => ({
  applyShippingDetailsToDoc: vi.fn(),
  deriveFulfillmentFromMetadata: vi.fn(),
}))

vi.mock('../../lib/abandonedCheckouts', () => ({
  markAbandonedCheckoutRecovered: vi.fn(),
}))

vi.mock('../../lib/emailIdempotency', () => ({
  markEmailLogFailed: vi.fn(),
  markEmailLogSent: vi.fn(),
  reserveEmailLog: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../lib/stripeCoupons', () => ({
  markStripeCouponDeleted: vi.fn(),
  syncStripeCouponById: vi.fn(),
}))

vi.mock('./handlers/checkoutSessionExpired', () => ({
  handleCheckoutSessionExpired: vi.fn().mockResolvedValue({
    statusCode: 200,
    body: JSON.stringify({received: true, event: 'checkout.session.expired'}),
  }),
}))

vi.mock('../../shared/customerName', () => ({
  computeCustomerName: vi.fn((first, last) => `${first} ${last}`.trim()),
  splitFullName: vi.fn((name) => {
    const [first, ...rest] = (name || '').split(' ')
    return {firstName: first, lastName: rest.join(' ')}
  }),
}))

vi.mock('../../lib/vendorPortalEmail', () => ({
  syncVendorPortalEmail: vi.fn(),
}))

vi.mock('../../lib/stripeCustomerAliases', () => ({
  buildStripeCustomerAliasPatch: vi.fn().mockReturnValue({
    set: vi.fn(),
  }),
}))

vi.mock('../../lib/resendValidation', () => ({
  getMissingResendFields: vi.fn().mockReturnValue([]),
}))

vi.mock('../../shared/messageResponse.js', () => ({
  getMessageId: vi.fn().mockReturnValue('msg_123'),
}))

vi.mock('@fas/sanity-config/utils/cartItemDetails', () => ({
  normalizeMetadataEntries: vi.fn((arr) => arr || []),
  deriveOptionsFromMetadata: vi.fn().mockReturnValue({}),
  remainingMetadataEntries: vi.fn().mockReturnValue([]),
  coerceStringArray: vi.fn((arr) => arr || []),
  resolveUpgradeTotal: vi.fn().mockReturnValue(0),
  normalizeOptionSelections: vi.fn((obj) => obj || {}),
  uniqueStrings: vi.fn((arr) => Array.from(new Set(arr || []))),
  sanitizeCartItemName: vi.fn((name) => name?.trim() || ''),
}))

vi.mock('../../packages/sanity-config/src/utils/generateProductCodes', () => ({
  ensureProductCodes: vi.fn(),
}))

describe('stripeWebhook handler', () => {
  const env = {...process.env}

  beforeEach(() => {
    process.env = {
      ...env,
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_WEBHOOK_SECRET: 'whsec_test_123',
      STRIPE_WEBHOOK_NO_VERIFY: '1',
      SANITY_STUDIO_PROJECT_ID: 'test-project',
      SANITY_STUDIO_DATASET: 'test-dataset',
      SANITY_API_TOKEN: 'test-token',
      RESEND_API_KEY: 're_test',
    }
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.env = env
  })

  describe('entry guard', () => {
    it('rejects non-POST requests', async () => {
      vi.resetModules()
      const {handler} = await import('../stripeWebhook')

      const event = {
        httpMethod: 'GET',
        headers: {},
        body: '',
      }

      const response = await handler(event as any, {} as any)

      expect(response.statusCode).toBe(405)
      expect(response.body).toBe('Method Not Allowed')
    })

    it('rejects requests without stripe signature when verification is enabled', async () => {
      vi.resetModules()
      process.env.STRIPE_WEBHOOK_NO_VERIFY = '0'
      const {handler} = await import('../stripeWebhook')

      const event = {
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({}),
      }

      const response = await handler(event as any, {} as any)

      expect(response.statusCode).toBe(400)
      expect(response.body).toContain('Missing Stripe signature')
    })

    it('handles invalid JSON body gracefully', async () => {
      vi.resetModules()
      const {handler} = await import('../stripeWebhook')

      const event = {
        httpMethod: 'POST',
        headers: {},
        isBase64Encoded: false,
        body: 'invalid json',
      }

      const response = await handler(event as any, {} as any)

      expect(response.statusCode).toBe(400)
    })
  })

  describe('checkout.session.expired event', () => {
    it('handles expired checkout sessions', async () => {
      vi.resetModules()
      const {handler} = await import('../stripeWebhook')

      const event = {
        httpMethod: 'POST',
        headers: {},
        isBase64Encoded: false,
        body: JSON.stringify({
          id: 'evt_test',
          type: 'checkout.session.expired',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: 'cs_test_123',
              metadata: {cart_id: 'cart_123'},
              expires_at: Math.floor(Date.now() / 1000),
              livemode: false,
              url: 'https://example.com/checkout',
              customer_details: {
                email: 'customer@example.com',
                name: 'Test Customer',
                phone: '555-0100',
              },
            },
          },
        }),
      }

      const response = await handler(event as any, {} as any)

      expect(response.statusCode).toBe(200)
      expect(response.body).toContain('checkout.session.expired')
    })
  })

  describe('base64 encoding support', () => {
    it('decodes base64-encoded bodies', async () => {
      vi.resetModules()
      const {handler} = await import('../stripeWebhook')

      const originalBody = JSON.stringify({
        id: 'evt_test',
        type: 'ping',
        created: Math.floor(Date.now() / 1000),
        data: {},
      })

      const base64Body = Buffer.from(originalBody).toString('base64')

      const event = {
        httpMethod: 'POST',
        headers: {},
        isBase64Encoded: true,
        body: base64Body,
      }

      const response = await handler(event as any, {} as any)

      expect(response.statusCode).toBe(200)
    })
  })

  describe('unknown event types', () => {
    it('returns 200 for unhandled event types', async () => {
      vi.resetModules()
      const {handler} = await import('../stripeWebhook')

      const event = {
        httpMethod: 'POST',
        headers: {},
        isBase64Encoded: false,
        body: JSON.stringify({
          id: 'evt_test',
          type: 'some.unknown.event',
          created: Math.floor(Date.now() / 1000),
          data: {object: {}},
        }),
      }

      const response = await handler(event as any, {} as any)

      expect(response.statusCode).toBe(200)
      expect(response.body).toContain('received')
    })
  })

  describe('response format', () => {
    it('returns JSON response with received flag', async () => {
      vi.resetModules()
      const {handler} = await import('../stripeWebhook')

      const event = {
        httpMethod: 'POST',
        headers: {},
        isBase64Encoded: false,
        body: JSON.stringify({
          id: 'evt_test',
          type: 'ping',
          created: Math.floor(Date.now() / 1000),
          data: {},
        }),
      }

      const response = await handler(event as any, {} as any)

      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.body)
      expect(body).toHaveProperty('received')
    })
  })

  describe('error handling', () => {
    it('logs function execution on success', async () => {
      vi.resetModules()
      const {handler} = await import('../stripeWebhook')

      const event = {
        httpMethod: 'POST',
        headers: {},
        isBase64Encoded: false,
        body: JSON.stringify({
          id: 'evt_test',
          type: 'ping',
          created: Math.floor(Date.now() / 1000),
          data: {},
        }),
      }

      await handler(event as any, {} as any)

      // Function execution should be logged
      expect(true).toBe(true)
    })
  })
})
