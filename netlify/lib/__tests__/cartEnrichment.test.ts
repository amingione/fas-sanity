import {describe, expect, it, vi} from 'vitest'
import type {SanityClient} from '@sanity/client'
import {enrichCartItemsFromSanity, type CartItem} from '../cartEnrichment'

describe('enrichCartItemsFromSanity', () => {
  const baseCartItem: CartItem = {
    _type: 'orderCartItem',
    _key: 'test-1',
    id: 'product-123',
    name: 'Test Product',
    optionDetails: [],
    metadataEntries: [],
  }

  it('attaches product reference and validation issues when selections are missing', async () => {
    const fetch = vi.fn().mockResolvedValue([
      {
        _id: 'product-123',
        title: 'Test Product',
        sku: 'TEST-1',
        slug: {current: 'test-product'},
        optionRequirements: [{name: 'Size', required: true}],
        customizationRequirements: [{name: 'Engraving', required: true}],
      },
    ])

    const client = {fetch} as unknown as SanityClient

    const [item] = await enrichCartItemsFromSanity(
      [JSON.parse(JSON.stringify(baseCartItem)) as CartItem],
      client,
    )

    expect(item.productRef?._ref).toBe('product-123')
    expect(item.validationIssues).toEqual([
      'Missing selection for Size',
      'Missing customization: Engraving',
    ])
    expect(fetch).toHaveBeenCalled()
  })

  it('clears validation issues when requirements are satisfied', async () => {
    const fetch = vi.fn().mockResolvedValue([
      {
        _id: 'product-123',
        title: 'Test Product',
        slug: {current: 'test-product'},
        optionRequirements: [{name: 'Size', required: true}],
        customizationRequirements: [{name: 'Engraving', required: true}],
      },
    ])

    const client = {fetch} as unknown as SanityClient

    const [item] = await enrichCartItemsFromSanity(
      [
        {
          ...(JSON.parse(JSON.stringify(baseCartItem)) as CartItem),
          optionSummary: 'Size: Large',
          optionDetails: ['Size: Large'],
        },
      ],
      client,
    )

    expect(item.validationIssues).toBeUndefined()
  })
})
