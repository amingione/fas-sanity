import {describe, expect, it} from 'vitest'
import {normalizeAddress} from '../address'

describe('normalizeAddress', () => {
  it('normalizes Stripe-style addresses', () => {
    const input = {
      line1: '6161 Riverside Dr',
      city: 'Punta Gorda',
      state: 'FL',
      postal_code: '33982',
      country: 'US',
    }
    expect(normalizeAddress(input)).toEqual({
      name: 'F.A.S. Motorsports LLC',
      line1: '6161 Riverside Dr',
      city: 'Punta Gorda',
      state: 'FL',
      postalCode: '33982',
      country: 'US',
      phone: '(812) 200-9012',
      email: 'sales@fasmotorsports.com',
    })
  })

  it('normalizes Sanity-style addresses', () => {
    const input = {
      addressLine1: '6161 Riverside Dr',
      addressLine2: '',
      city: 'Punta Gorda',
      state: 'FL',
      postalCode: '33982',
      country: 'US',
    }
    expect(normalizeAddress(input)).toEqual({
      name: 'F.A.S. Motorsports LLC',
      line1: '6161 Riverside Dr',
      line2: ``,
      city: 'Punta Gorda',
      state: 'FL',
      postalCode: '33982',
      country: 'US',
      phone: '(812) 200-9012',
      email: 'sales@fasmotorsports.com',
    })
  })

  it('normalizes EasyPost-style addresses and extras', () => {
    const input = {
      street1: '6161 Riverside Dr',
      city: 'Punta Gorda',
      state: 'FL',
      zip: '33982',
      country: 'US',
    }
    expect(
      normalizeAddress(input, {name: 'F.A.S. Motorsports LLC', email: 'sales@fasmotorsports.com'}),
    ).toEqual({
      name: 'F.A.S. Motorsports LLC',
      line1: '6161 Riverside Dr',
      city: 'Punta Gorda',
      state: 'FL',
      postalCode: '33982',
      country: 'US',
      phone: '(812) 200-9012',
      email: 'sales@fasmotorsports.com',
    })
  })

  it('returns null when no meaningful fields are present', () => {
    expect(normalizeAddress({})).toBeNull()
    expect(normalizeAddress(null)).toBeNull()
  })
})
