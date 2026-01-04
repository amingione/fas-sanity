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

const resendSendMock = vi.fn(async () => ({id: 'email_test_123'}))

vi.mock('@sanity/client', () => ({
  createClient: createClientMock,
}))

vi.mock('resend', () => ({
  Resend: class {
    emails = {send: resendSendMock}
  },
}))

vi.mock('../netlify/lib/stripeEnv', () => ({
  resolveStripeSecretKey: () => 'sk_test_123',
  STRIPE_SECRET_ENV_KEY: 'STRIPE_SECRET_KEY',
}))

vi.mock('../shared/resendEnv', () => ({
  resolveResendApiKey: () => 're_test_123',
}))

vi.mock('../utils/functionLogger', () => ({
  logFunctionExecution: vi.fn(async () => undefined),
}))

vi.mock('stripe', () => ({
  default: class StripeMock {
    checkout = {
      sessions: {
        retrieve: vi.fn(),
      },
    }
    webhooks = {
      constructEvent: vi.fn(),
    }
  },
}))

describe('checkout.session.expired enforcement', () => {
  beforeEach(() => {
    mockClients.length = 0
    createClientMock.mockClear()
    resendSendMock.mockClear()
    process.env.STRIPE_WEBHOOK_NO_VERIFY = '1'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
    process.env.SANITY_STUDIO_PROJECT_ID = 'test-project'
    process.env.SANITY_STUDIO_DATASET = 'test-dataset'
    process.env.SANITY_API_TOKEN = 'test-token'
  })

  it('logs cart only and never creates an order', async () => {
    vi.resetModules()
    const {handler} = await import('../netlify/functions/stripeWebhook')

    const event = {
      type: 'checkout.session.expired',
      data: {
        object: {
          id: 'cs_test_123',
          livemode: false,
          expires_at: Math.floor(Date.now() / 1000),
          url: 'https://checkout.stripe.com/c/pay/cs_test_123',
          metadata: {cart_id: 'cart_test_123'},
          customer_details: {
            email: 'test@example.com',
            name: 'Test User',
            phone: '5555555555',
          },
        },
      },
    }

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify(event),
      headers: {},
      isBase64Encoded: false,
    } as any)

    const allCreates = mockClients.flatMap((client) => [
      ...client.createIfNotExists.mock.calls.map((call) => call[0]),
      ...client.createOrReplace.mock.calls.map((call) => call[0]),
    ])
    const orderWrites = allCreates.filter(
      (doc) => doc?._type === 'order' || doc?._type === 'invoice' || doc?._type === 'customer',
    )

    expect(orderWrites).toHaveLength(0)

    const patchCalls = mockClients.flatMap((client) => client.patch.mock.calls)
    expect(patchCalls.some((call) => call[0] === 'productTable')).toBe(true)

    const productTableCallIndex = patchCalls.findIndex((call) => call[0] === 'productTable')
    const patchResult =
      productTableCallIndex >= 0
        ? mockClients
            .flatMap((client) => client.patch.mock.results)
            .map((result) => result.value)
            .find(Boolean)
        : null
    const appendedCart =
      patchResult?.append?.mock?.calls?.[0]?.[1]?.[0] as Record<string, any> | undefined

    expect(appendedCart).toEqual(
      expect.objectContaining({
        cartId: 'cart_test_123',
        status: 'expired',
        email: 'test@example.com',
      }),
    )

    expect(response.statusCode).toBe(200)
  })
})
