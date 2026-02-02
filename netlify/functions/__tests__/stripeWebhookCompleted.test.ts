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
  create: vi.fn().mockResolvedValue({}),
  createIfNotExists: vi.fn().mockResolvedValue({}),
  createOrReplace: vi.fn().mockResolvedValue({}),
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
const linkCheckoutSessionToCustomerMock = vi.fn()
const runOrderPlacedAutomationsMock = vi.fn()

vi.mock('../../lib/referenceIntegrity', () => ({
  linkCheckoutSessionToCustomer: linkCheckoutSessionToCustomerMock,
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
  enrichCartItemsFromSanity: vi.fn().mockImplementation(async (items: any, _client: any, opts: any) => {
    if (opts?.onProducts) opts.onProducts([])
    return items
  }),
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
    total: 100,
    sku: 'SKU_TEST',
    productRef: {_type: 'reference', _ref: 'product_123'},
    image: {_type: 'image', asset: {_ref: 'image-123'}},
  }),
  sanitizeOrderCartItem: vi.fn((item) => item),
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

// Mock Stripe module
vi.mock('stripe', () => {
  const MockStripe = vi.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        retrieve: vi.fn().mockResolvedValue({
          id: 'cs_test_123',
          payment_status: 'paid',
          payment_intent: 'pi_test_123',
          customer_details: {
            email: 'customer@example.com',
            name: 'Test Customer',
            phone: '555-0100',
          },
          shipping_details: {
            name: 'Test Customer',
            address: {
              line1: '123 Test St',
              line2: 'Apt 4',
              city: 'Test City',
              state: 'TS',
              postal_code: '12345',
              country: 'US',
            },
          },
          shipping_cost: {
            amount_total: 1000,
            shipping_rate: {
              id: 'shr_test_123',
              display_name: 'Standard Shipping',
              delivery_estimate: {
                minimum: {value: 3},
                maximum: {value: 5},
              },
            },
          },
          amount_total: 5000,
          amount_subtotal: 4000,
          total_details: {
            amount_tax: 500,
            amount_shipping: 500,
          },
          metadata: {cart_id: 'cart_123'},
          client_reference_id: 'cart_123',
        }),
        listLineItems: vi.fn().mockResolvedValue({data: [{id: 'li_test_123'}]}),
      },
    },
    paymentIntents: {
      retrieve: vi.fn().mockResolvedValue({
        id: 'pi_test_123',
        amount: 5000,
        charges: {
          data: [
            {
              id: 'ch_test_123',
              receipt_url: 'https://stripe.com/receipt',
              payment_method_details: {
                card: {
                  brand: 'visa',
                  last4: '4242',
                },
              },
              billing_details: {
                name: 'Test Customer',
                email: 'customer@example.com',
                address: {
                  line1: '123 Test St',
                  city: 'Test City',
                  state: 'TS',
                  postal_code: '12345',
                  country: 'US',
                },
              },
            },
          ],
        },
      }),
    },
    customers: {
      retrieve: vi.fn().mockResolvedValue({
        id: 'cus_test_123',
        email: 'customer@example.com',
        name: 'Test Customer',
      }),
    },
  }))
  return {default: MockStripe}
})

describe('stripeWebhook checkout.session.completed', () => {
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
    linkCheckoutSessionToCustomerMock.mockClear()
    runOrderPlacedAutomationsMock.mockClear()
  })

  afterEach(() => {
    process.env = env
  })

  it('updates checkoutSession with final details on completion', async () => {
    vi.resetModules()
    
    fetchMock.mockImplementation(async (query: string) => {
      if (query.startsWith('count(')) return 0
      if (query.includes('*[_type == "customer"')) {
        return {_id: 'customer_123', email: 'customer@example.com'}
      }
      if (query.includes('*[_type == "checkoutSession"')) {
        return {
          _id: 'cart_123',
          status: 'open',
          customerEmail: 'customer@example.com',
          customerName: 'Test Customer',
          cart: [
            {
              _type: 'orderCartItem',
              _key: 'item-1',
              name: 'Test Item',
              quantity: 1,
              price: 100,
              total: 100,
              sku: 'SKU_TEST',
              productRef: {_type: 'reference', _ref: 'product_123'},
              image: {_type: 'image', asset: {_ref: 'image-123'}},
            },
          ],
        }
      }
      if (query.includes('*[_id == "productTable"')) return null
      return null
    })

    const {handler} = await import('../stripeWebhook')

    const event = {
      httpMethod: 'POST',
      headers: {},
      isBase64Encoded: false,
      body: JSON.stringify({
        id: 'evt_test',
        type: 'checkout.session.completed',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'cs_test_123',
            payment_status: 'paid',
            payment_intent: 'pi_test_123',
            customer_details: {
              email: 'customer@example.com',
              name: 'Test Customer',
              phone: '555-0100',
            },
            shipping_details: {
              name: 'Test Customer',
              address: {
                line1: '123 Test St',
                line2: 'Apt 4',
                city: 'Test City',
                state: 'TS',
                postal_code: '12345',
                country: 'US',
              },
            },
            shipping_cost: {
              amount_total: 1000,
              shipping_rate: {
                id: 'shr_test_123',
                display_name: 'Standard Shipping',
                delivery_estimate: {
                  minimum: {value: 3},
                  maximum: {value: 5},
                },
              },
            },
            amount_total: 5000,
            amount_subtotal: 4000,
            total_details: {
              amount_tax: 500,
              amount_shipping: 500,
            },
            metadata: {cart_id: 'cart_123'},
            client_reference_id: 'cart_123',
          },
        },
      }),
    }

    const response = await handler(event as any, {} as any)

    if (!response) {
      throw new Error('Expected handler response for checkout.session.completed')
    }

    // Verify checkoutSession was patched
    const patchCalls = patchMock.mock.calls
    const checkoutSessionPatchCall = patchCalls.find((call: any) => call[0] === 'cart_123')
    expect(checkoutSessionPatchCall).toBeDefined()

    // Verify the set call includes expected fields
    const setCalls = patchChain.set.mock.calls
    const checkoutSessionSetCall = setCalls.find((call: any) => {
      const data = call[0]
      return data && (data.status === 'complete' || data.recovered === true)
    })
    
    expect(checkoutSessionSetCall).toBeDefined()
    if (checkoutSessionSetCall) {
      const updateData = checkoutSessionSetCall[0]
      expect(updateData).toHaveProperty('status', 'complete')
      expect(updateData).toHaveProperty('recovered', true)
      expect(updateData).toHaveProperty('customerEmail', 'customer@example.com')
      expect(updateData).toHaveProperty('customerName', 'Test Customer')
      expect(updateData).toHaveProperty('totalAmount', 50) // 5000 cents / 100
      expect(updateData).toHaveProperty('amountSubtotal', 40) // 4000 cents / 100
      expect(updateData).toHaveProperty('selectedShippingRate', 'shr_test_123')
    }

    expect(response.statusCode).toBe(200)
  })
})
