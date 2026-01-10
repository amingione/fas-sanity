import {Request} from 'node-fetch'
import {describe, expect, it, vi} from 'vitest'

const fetchMock = vi.fn()
const createClientMock = vi.fn(() => ({fetch: fetchMock}))
const getEasyPostClientMock = vi.fn()

vi.mock('@sanity/client', () => ({
  createClient: createClientMock,
}))
vi.mock('../netlify/lib/easypostClient', () => ({
  getEasyPostClient: getEasyPostClientMock,
  resolveDimensions: vi.fn(),
  resolveWeight: vi.fn(),
}))
vi.mock('../netlify/lib/ship-from', () => ({
  getEasyPostFromAddress: vi.fn(),
}))
vi.mock('../netlify/lib/easypostValidation', () => ({
  getEasyPostAddressMissingFields: vi.fn(() => []),
  getEasyPostParcelMissingFields: vi.fn(() => []),
}))

describe('create-shipping-label idempotency', () => {
  it('returns existing label data when labelPurchased is true', async () => {
    process.env.SANITY_STUDIO_PROJECT_ID = 'test'
    process.env.SANITY_STUDIO_DATASET = 'test'
    process.env.SANITY_API_TOKEN = 'test'

    fetchMock.mockResolvedValueOnce({
      _id: 'order-123',
      labelPurchased: true,
      trackingNumber: 'TRK123',
      trackingUrl: 'https://tracking',
      shippingLabelUrl: 'https://label',
      carrier: 'UPS',
      service: 'Ground',
    })

    const request = new Request('https://example.com', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({orderId: 'order-123', source: 'sanity-manual'}),
    })

    const {POST} = await import('../src/pages/api/create-shipping-label')
    const response = await POST({request})
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      success: true,
      trackingNumber: 'TRK123',
      trackingUrl: 'https://tracking',
      labelUrl: 'https://label',
      carrier: 'UPS',
      service: 'Ground',
      message: 'Label already purchased',
    })
    expect(getEasyPostClientMock).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
