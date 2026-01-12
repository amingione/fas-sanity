import {beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('@easypost/api', () => ({
  default: class EasyPostMock {},
  Shipment: class ShipmentMock {},
}))

const destination = {
  addressLine1: '123 Main St',
  city: 'Orlando',
  state: 'FL',
  postalCode: '32801',
  country: 'US',
}

describe('Shipping quote helpers', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('builds a deterministic quote key for the same cart/address', async () => {
    const {buildLocalQuoteKey} = await import('../netlify/functions/getShippingQuoteBySkus')
    const cartA = [
      {identifier: 'SKU-1', quantity: 2},
      {identifier: 'SKU-2', quantity: 1},
    ]
    const cartB = [
      {identifier: 'SKU-2', quantity: 1},
      {identifier: 'SKU-1', quantity: 2},
    ]
    const keyA = buildLocalQuoteKey(cartA, destination)
    const keyB = buildLocalQuoteKey(cartB, destination)
    expect(keyA).toBe(keyB)
  })

  it('summarizes the cart items for logging', async () => {
    const {buildCartSummary} = await import('../netlify/functions/getShippingQuoteBySkus')
    const summary = buildCartSummary([
      {identifier: 'SKU-1', quantity: 1},
      {identifier: 'SKU-2', quantity: 3},
    ])
    expect(summary).toBe('SKU-1 x1, SKU-2 x3')
  })
})
