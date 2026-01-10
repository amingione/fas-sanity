import {describe, expect, it} from 'vitest'

import {buildCartSummary, buildLocalQuoteKey} from '../netlify/functions/getShippingQuoteBySkus'

const destination = {
  addressLine1: '123 Main St',
  city: 'Orlando',
  state: 'FL',
  postalCode: '32801',
  country: 'US',
}

describe('Shipping quote helpers', () => {
  it('builds a deterministic quote key for the same cart/address', () => {
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

  it('summarizes the cart items for logging', () => {
    const summary = buildCartSummary([
      {identifier: 'SKU-1', quantity: 1},
      {identifier: 'SKU-2', quantity: 3},
    ])
    expect(summary).toBe('SKU-1 x1, SKU-2 x3')
  })
})
