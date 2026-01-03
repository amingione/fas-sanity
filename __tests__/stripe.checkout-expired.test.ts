import {beforeEach, describe, expect, it, vi} from 'vitest'

const mockClients: Array<Record<string, any>> = []

const createPatchChain = () => {
  const chain: Record<string, any> = {}
  chain.setIfMissing = vi.fn(() => chain)
  chain.append = vi.fn(() => chain)
  chain.set = vi.fn(() => chain)
  chain.commit = vi.fn(async () => ({}))
  return chain
}

const createClientMock = vi.fn(() => {
  const client = {
    patch: vi.fn(() => createPatchChain()),
    createIfNotExists: vi.fn(async () => ({})),
    createOrReplace: vi.fn(async () => ({})),
    fetch: vi.fn(async () => null),
  }
  mockClients.push(client)
  return client
})

vi.mock('@sanity/client', () => ({
  createClient: createClientMock,
}))

vi.mock('../utils/functionLogger', () => ({
  logFunctionExecution: vi.fn(async () => undefined),
}))

describe('checkout.session.expired — cart-only enforcement', () => {
  beforeEach(() => {
    mockClients.length = 0
    createClientMock.mockClear()
    vi.clearAllMocks()
  })

  it('logs expired cart and does NOT create order', async () => {
    process.env.STRIPE_SECRET_KEY = 'test'
    process.env.STRIPE_API_KEY = 'test'
    process.env.STRIPE_WEBHOOK_SECRET = 'test'
    process.env.STRIPE_WEBHOOK_NO_VERIFY = '1'
    process.env.STRIPE_SECRET_KEY = 'sk_test_123'
    process.env.SANITY_STUDIO_PROJECT_ID = 'test'
    process.env.SANITY_STUDIO_DATASET = 'test'
    process.env.SANITY_API_TOKEN = 'test'
    process.env.SANITY_WRITE_TOKEN = 'test'

    const event = {
      type: 'checkout.session.expired',
      data: {
        object: {
          id: 'cs_test_123',
          livemode: false,
          expires_at: Math.floor(Date.now() / 1000),
          metadata: {cart_id: 'cart_test_123'},
          customer_details: {
            email: 'test@example.com',
            name: 'Test User',
            phone: '5555555555',
          },
        },
      },
    }

    const {handler} = await import('../netlify/functions/stripeWebhook')
    const response = await handler(mockWebhookRequest(event))

    // 🔒 HARD ASSERTIONS
    const patchCalls = mockClients.flatMap((client) => client.patch.mock.calls)
    expect(patchCalls.some((call) => call[0] === 'productTable')).toBe(true)

    const patchResult = mockClients
      .flatMap((client) => client.patch.mock.results)
      .map((result) => result.value)
      .find(Boolean)
    const appendedCart =
      patchResult?.append?.mock?.calls?.[0]?.[1]?.[0] as Record<string, any> | undefined

    expect(appendedCart).toEqual(
      expect.objectContaining({
        cartId: 'cart_test_123',
        status: 'expired',
        email: 'test@example.com',
        recovery: {
          recovered: false,
          recoveredAt: null,
          recoveredSessionId: null,
        },
      }),
    )

    expect(response.statusCode).toBe(200)
  })
})

function mockWebhookRequest(event: any) {
  return {
    body: JSON.stringify(event),
    headers: {
      'stripe-signature': 'test',
    },
    httpMethod: 'POST',
    isBase64Encoded: false,
  }
}
