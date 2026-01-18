import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const createClientMock = vi.fn(() => ({}))

vi.mock('@sanity/client', () => ({
  createClient: createClientMock,
}))

describe('stripeWebhook productRef normalization', () => {
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
    }
  })

  afterEach(() => {
    process.env = env
  })

  it('strips drafts prefix from product references', async () => {
    vi.resetModules()
    const {__test__} = await import('../stripeWebhook')
    const normalized = __test__.normalizeProductRef({
      _type: 'reference',
      _ref: 'drafts.product-abc123',
    })

    expect(normalized).toEqual({_type: 'reference', _ref: 'product-abc123'})
  })

  it('preserves published product references', async () => {
    vi.resetModules()
    const {__test__} = await import('../stripeWebhook')
    const normalized = __test__.normalizeProductRef({
      _type: 'reference',
      _ref: 'product-xyz789',
    })

    expect(normalized).toEqual({_type: 'reference', _ref: 'product-xyz789'})
  })
})
