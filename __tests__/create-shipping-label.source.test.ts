import {Request} from 'node-fetch'
import {describe, expect, it, vi} from 'vitest'

vi.mock('@easypost/api', () => ({
  default: class EasyPostMock {},
  Shipment: class ShipmentMock {},
}))

describe('create-shipping-label source guard', () => {
  it('rejects requests without source flag', async () => {
    const request = new Request('https://example.com', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({orderId: 'order-123'}),
    })
    const {POST} = await import('../src/pages/api/create-shipping-label')
    const response = await POST({request})
    expect(response.status).toBe(403)
    const payload = await response.json()
    expect(payload.error).toBe('LABEL_PURCHASE_REQUIRES_MANUAL_SANITY_ACTION')
  })
})
