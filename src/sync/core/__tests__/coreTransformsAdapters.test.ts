import {describe, expect, it, vi} from 'vitest'
import {sanityProductToCanonical, medusaProductToCanonical} from '../transforms'
import {patchSanityProduct, patchMedusaProduct} from '../adapters'
import type {Product as CanonicalProduct} from '../types'

describe('sync/core transforms', () => {
  it('maps core Sanity inventory and product fields to canonical', () => {
    const canonical = sanityProductToCanonical({
      _id: 'sanity-product-1',
      title: 'Blower Kit',
      slug: {current: 'blower-kit'},
      description: 'Stage 2 kit',
      status: 'active',
      productType: 'physical',
      tags: ['boost', 'gen3'],
      sku: 'FAS-123',
      price: 1299,
      trackInventory: true,
      manualInventoryCount: 8,
      availability: 'in_stock',
      shippingConfig: {requiresShipping: true},
      medusaProductId: 'medusa-prod-1',
      medusaVariantId: 'medusa-var-1',
    })

    expect(canonical.title).toBe('Blower Kit')
    expect(canonical.slug).toBe('blower-kit')
    expect(canonical.medusaId).toBe('medusa-prod-1')
    expect(canonical.status).toBe('active')
    expect(canonical.type).toBe('physical')
    expect(canonical.tags).toEqual(['boost', 'gen3'])
    expect(canonical.variants[0]).toMatchObject({
      sku: 'FAS-123',
      price_cents: 129900,
      inventory_quantity: 8,
      manage_inventory: true,
      allow_backorder: false,
      requires_shipping: true,
      medusaId: 'medusa-var-1',
      sanityId: 'sanity-product-1',
    })
  })

  it('maps core Medusa inventory and product fields to canonical', () => {
    const canonical = medusaProductToCanonical({
      id: 'medusa-prod-2',
      title: 'Pulley',
      handle: 'pulley',
      description: 'Aluminum pulley',
      status: 'published',
      type: {value: 'physical'},
      tags: [{value: 'hardware'}],
      options: [{title: 'Color', values: [{value: 'Black'}]}],
      variants: [
        {
          id: 'medusa-var-2',
          title: 'Default',
          sku: 'PULLEY-1',
          prices: [{amount: 21900, currency_code: 'usd'}],
          inventory_quantity: 3,
          allow_backorder: true,
          manage_inventory: true,
          requires_shipping: true,
          options: [{option: {title: 'Color'}, value: 'Black'}],
        },
      ],
    })

    expect(canonical.medusaId).toBe('medusa-prod-2')
    expect(canonical.status).toBe('active')
    expect(canonical.options).toEqual([{name: 'Color', values: ['Black']}])
    expect(canonical.variants[0]).toMatchObject({
      medusaId: 'medusa-var-2',
      sku: 'PULLEY-1',
      price_cents: 21900,
      inventory_quantity: 3,
      allow_backorder: true,
      manage_inventory: true,
      requires_shipping: true,
      options: {Color: 'Black'},
    })
  })
})

describe('sync/core adapters', () => {
  const canonicalProduct: CanonicalProduct = {
    sanityId: 'sanity-1',
    medusaId: 'medusa-1',
    title: 'Throttle Body',
    slug: 'throttle-body',
    description: 'Ported throttle body',
    images: [],
    options: [],
    variants: [
      {
        sanityId: 'sanity-1',
        medusaId: 'medusa-var-1',
        sku: 'TB-001',
        title: 'Default',
        price_cents: 59900,
        inventory_quantity: 4,
        allow_backorder: false,
        manage_inventory: true,
        requires_shipping: true,
        options: {},
      },
    ],
    status: 'active',
    tags: ['airflow'],
    type: 'physical',
  }

  it('patches Sanity with core mapped fields', async () => {
    const commit = vi.fn().mockResolvedValue(undefined)
    const set = vi.fn().mockReturnValue({commit})
    const patch = vi.fn().mockReturnValue({set})
    const client = {patch} as unknown as Parameters<typeof patchSanityProduct>[0]

    await patchSanityProduct(client, canonicalProduct)

    expect(patch).toHaveBeenCalledWith('sanity-1')
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Throttle Body',
        sku: 'TB-001',
        price: 599,
        trackInventory: true,
        manualInventoryCount: 4,
        availability: 'in_stock',
        medusaProductId: 'medusa-1',
        medusaVariantId: 'medusa-var-1',
      }),
    )
    expect(commit).toHaveBeenCalledWith({autoGenerateArrayKeys: true})
  })

  it('updates Medusa product when medusaId exists', async () => {
    const update = vi.fn().mockResolvedValue(undefined)
    const client = {products: {update}}

    await patchMedusaProduct(client, canonicalProduct)

    expect(update).toHaveBeenCalledWith(
      'medusa-1',
      expect.objectContaining({
        title: 'Throttle Body',
        handle: 'throttle-body',
        status: 'published',
      }),
    )
  })
})
