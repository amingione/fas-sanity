import {describe, expect, it, vi} from 'vitest'
import {buildStripeCustomerAliasPatch} from '../stripeCustomerAliases'

describe('buildStripeCustomerAliasPatch', () => {
  it('appends alias without overriding primary', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = buildStripeCustomerAliasPatch(
      {stripeCustomerId: 'cus_primary', stripeCustomerIds: ['cus_primary']},
      'cus_alias',
      'test@example.com',
    )
    expect(result.didAppend).toBe(true)
    expect(result.patch.stripeCustomerId).toBeUndefined()
    expect(result.patch.stripeCustomerIds).toEqual(['cus_primary', 'cus_alias'])
    warnSpy.mockRestore()
  })

  it('seeds primary and alias list when missing', () => {
    const result = buildStripeCustomerAliasPatch({stripeCustomerId: null}, 'cus_new')
    expect(result.didAppend).toBe(false)
    expect(result.patch.stripeCustomerId).toBe('cus_new')
    expect(result.patch.stripeCustomerIds).toEqual(['cus_new'])
  })
})
