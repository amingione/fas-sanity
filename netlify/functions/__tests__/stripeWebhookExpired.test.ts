import {describe, expect, it, vi, beforeEach, afterEach} from 'vitest'

const patchChain = {
  set: vi.fn().mockReturnThis(),
  setIfMissing: vi.fn().mockReturnThis(),
  append: vi.fn().mockReturnThis(),
  commit: vi.fn().mockResolvedValue({}),
}
const patchMock = vi.fn(() => patchChain)
const fetchMock = vi.fn()
const createClientMock = vi.fn(() => ({
  patch: patchMock,
  fetch: fetchMock,
  create: vi.fn(),
  createIfNotExists: vi.fn(),
  createOrReplace: vi.fn(),
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

const linkOrderToCustomerMock = vi.fn()
const linkOrderToInvoiceMock = vi.fn()
const linkInvoiceToCustomerMock = vi.fn()
const runOrderPlacedAutomationsMock = vi.fn()

vi.mock('../../lib/referenceIntegrity', () => ({
  linkCheckoutSessionToCustomer: vi.fn(),
  linkInvoiceToCustomer: linkInvoiceToCustomerMock,
  linkOrderToCustomer: linkOrderToCustomerMock,
  linkOrderToInvoice: linkOrderToInvoiceMock,
}))

vi.mock('../../lib/emailAutomations', () => ({
  runOrderPlacedAutomations: runOrderPlacedAutomationsMock,
}))

vi.mock('../../../utils/functionLogger', () => ({
  logFunctionExecution: vi.fn().mockResolvedValue(undefined),
}))

describe('stripeWebhook checkout.session.expired', () => {
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
    patchMock.mockClear()
    fetchMock.mockClear()
    patchChain.set.mockClear()
    patchChain.setIfMissing.mockClear()
    patchChain.append.mockClear()
    patchChain.commit.mockClear()
    resendSendMock.mockClear()
    linkOrderToCustomerMock.mockClear()
    linkOrderToInvoiceMock.mockClear()
    linkInvoiceToCustomerMock.mockClear()
    runOrderPlacedAutomationsMock.mockClear()
  })

  afterEach(() => {
    process.env = env
  })

  it('records cart-only data and never touches order helpers', async () => {
    vi.resetModules()
    fetchMock.mockResolvedValue({
      _id: 'cart_123',
      customerEmail: 'customer@example.com',
      customerName: 'Test Customer',
      customerPhone: '555-0100',
    })
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

    if (!response) {
      throw new Error('Expected handler response for checkout.session.expired')
    }

    if (!response.body) {
      throw new Error('Expected response body for checkout.session.expired')
    }

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      received: true,
      event: 'checkout.session.expired',
    })
    expect(patchMock).toHaveBeenCalledWith('cart_123')
    expect(patchMock).toHaveBeenCalledWith('productTable')
    expect(patchChain.append).toHaveBeenCalledTimes(1)
    expect(patchChain.commit).toHaveBeenCalledTimes(2)

    expect(linkOrderToCustomerMock).not.toHaveBeenCalled()
    expect(linkOrderToInvoiceMock).not.toHaveBeenCalled()
    expect(linkInvoiceToCustomerMock).not.toHaveBeenCalled()
    expect(runOrderPlacedAutomationsMock).not.toHaveBeenCalled()
  })
})
