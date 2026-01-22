import {describe, expect, it, vi} from 'vitest'

vi.mock('@easypost/api', () => ({
  default: class EasyPostMock {},
  Shipment: class ShipmentMock {},
}))

describe('create-shipping-label source guard', () => {
  it('rejects requests without source flag', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const request = new Request('https://example.com', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({orderId: 'order-123'}),
    }) as any
    try {
      const {POST} = await import('../src/pages/api/create-shipping-label')
      const context = {
        request,
        site: undefined,
        generator: '',
        url: new URL('https://example.com'),
        params: {},
        props: {},
        locals: {},
        getStaticPaths: async () => [],
        redirect: () => new Response(),
      } as any
      const response = await POST(context)
      expect(response.status).toBe(403)
      const payload = await response.json()
      expect(payload.error).toBe('LABEL_PURCHASE_REQUIRES_MANUAL_SANITY_ACTION')
    } finally {
      warnSpy.mockRestore()
    }
  })
})
