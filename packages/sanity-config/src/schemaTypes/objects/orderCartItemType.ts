import React from 'react'
import {defineField, defineType} from 'sanity'
import {sanitizeCartItemName} from '../../utils/cartItemDetails'

export const orderCartItemType = defineType({
  name: 'orderCartItem',
  title: 'Cart Item',
  type: 'object',
  preview: {
    select: {
      title: 'name',
      quantity: 'quantity',
      price: 'price',
      total: 'total',
      lineTotal: 'lineTotal',
      variant: 'selectedVariant',
      variantFallback: 'optionDetails',
      addOns: 'addOns',
      upgrades: 'upgrades',
      upgradesTotal: 'upgradesTotal',
      image: 'image',
    },
    prepare(selection) {
      const {
        title,
        quantity,
        price,
        total,
        lineTotal,
        variant,
        variantFallback,
        addOns,
        upgrades,
        upgradesTotal,
        image,
      } = selection as {
        title?: unknown
        quantity?: unknown
        price?: unknown
        total?: unknown
        lineTotal?: unknown
        variant?: unknown
        variantFallback?: unknown
        addOns?: unknown
        upgrades?: unknown
        upgradesTotal?: unknown
        image?: unknown
      }

      let cleanVariant = typeof variant === 'string' && variant.trim() ? variant.trim() : undefined

      if (!cleanVariant && Array.isArray(variantFallback) && variantFallback.length > 0) {
        const firstOption = variantFallback.find(
          (opt) => typeof opt === 'string' && !opt.toLowerCase().includes('upgrade'),
        ) as string | undefined
        if (firstOption) {
          const parts = firstOption.split(':')
          cleanVariant = parts.length > 1 ? parts[parts.length - 1].trim() : firstOption
        }
      }

      const collectAddOns = (input?: unknown): string[] => {
        if (!Array.isArray(input)) return []
        return input
          .map((u) => {
            if (typeof u !== 'string') return ''
            let val = u.trim()
            if (!val) return ''
            if (/:/.test(val)) {
              const parts = val
                .split(':')
                .map((p) => p.trim())
                .filter(Boolean)
              if (parts.length > 1) val = parts[parts.length - 1]
            }
            val = val.replace(/^option\s*\d*\s*:?\s*/i, '').trim()
            val = val.replace(/^(upgrade|add[-\s]?on)s?\s*:?\s*/i, '').trim()
            return val
          })
          .filter(Boolean)
      }

      const cleanAddOns = Array.from(
        new Set([...collectAddOns(addOns), ...collectAddOns(upgrades)]),
      )

      const qty = typeof quantity === 'number' && Number.isFinite(quantity) ? quantity : 1
      const unitPrice = typeof price === 'number' && Number.isFinite(price) ? price : 0
      const addOnTotal =
        typeof upgradesTotal === 'number' && Number.isFinite(upgradesTotal) ? upgradesTotal : 0
      const computedBase = unitPrice * qty
      const computedTotal = computedBase + addOnTotal
      const existingTotals = [total, lineTotal]
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
        .map((v) => Number(v))
      const maxExisting = existingTotals.length ? Math.max(...existingTotals) : undefined
      const itemTotal =
        maxExisting !== undefined && Number.isFinite(maxExisting)
          ? Math.max(maxExisting, computedTotal)
          : computedTotal

      const parts: string[] = []
      if (cleanVariant) parts.push(`${cleanVariant}`)
      if (cleanAddOns.length > 0) {
        parts.push(`${cleanAddOns.join(', ')}`)
      }
      let calc = `Qty: ${qty} × $${unitPrice.toFixed(2)}`
      if (addOnTotal > 0) calc += ` + $${addOnTotal.toFixed(2)}`
      calc += ` = $${itemTotal.toFixed(2)}`
      parts.push(calc)

      const cleanTitle =
        sanitizeCartItemName(typeof title === 'string' ? title : undefined) ||
        (typeof title === 'string' && title.trim()) ||
        'Item'
      const imageUrl = typeof image === 'string' ? image.trim() : undefined

      return {
        title: cleanTitle,
        subtitle: parts.join(' • '),
        media: imageUrl
          ? React.createElement('img', {
              src: imageUrl,
              alt: cleanTitle,
              style: {width: '100%', height: '100%', objectFit: 'cover', borderRadius: '2px'},
              referrerPolicy: 'strict-origin-when-cross-origin',
              loading: 'lazy',
            })
          : undefined,
      }
    },
  },
  fields: [
    // Visible
    defineField({name: 'name', type: 'string', title: 'Product Name', readOnly: false}),
    defineField({
      name: 'productRef',
      type: 'reference',
      title: 'Sanity Product',
      to: [{type: 'product'}],
      readOnly: false,
      hidden: true,
    }),
    defineField({name: 'sku', type: 'string', title: 'SKU', readOnly: false}),
    defineField({
      name: 'image',
      type: 'url',
      title: 'Product Image',
      readOnly: false,
      hidden: true,
      description: 'Product image URL from Stripe (used for previews)',
    }),
    defineField({name: 'quantity', type: 'number', title: 'Quantity', readOnly: false}),
    defineField({name: 'price', type: 'number', title: 'Unit Price', readOnly: false}),
    defineField({name: 'total', type: 'number', title: 'Line Total', readOnly: false}),
    defineField({
      name: 'selectedVariant',
      type: 'string',
      title: 'Variant',
      readOnly: false,
    }),
    defineField({
      name: 'addOns',
      type: 'array',
      title: 'Upgrades',
      of: [{type: 'string'}],
      readOnly: false,
    }),

    // Hidden but kept
    defineField({
      name: 'optionDetails',
      title: 'Option Details (Raw)',
      type: 'array',
      of: [{type: 'string'}],
      readOnly: false,
      hidden: true,
      description: 'Raw option data from Stripe - used for variant display',
    }),
    defineField({
      name: 'optionSummary',
      title: 'Option Summary',
      type: 'string',
      readOnly: false,
      hidden: true,
    }),
    defineField({
      name: 'upgrades',
      title: 'Upgrades (Raw)',
      type: 'array',
      of: [{type: 'string'}],
      readOnly: false,
      hidden: true,
      description: 'Raw upgrade data from Stripe - used for add-ons display',
    }),
    defineField({
      name: 'upgradesTotal',
      title: 'Upgrades Total',
      type: 'number',
      readOnly: false,
      hidden: true,
    }),
    defineField({
      name: 'productSlug',
      type: 'string',
      readOnly: false,
      hidden: true,
    }),
    defineField({
      name: 'productUrl',
      type: 'string',
      readOnly: false,
      hidden: true,
    }),
    defineField({
      name: 'lineTotal',
      type: 'number',
      readOnly: false,
      hidden: true,
    }),

    // Stripe metadata - hidden
    defineField({
      name: 'metadata',
      title: 'Stripe Metadata',
      type: 'object',
      readOnly: false,
      hidden: true,
      fields: [
        {
          name: 'raw',
          type: 'text',
          title: 'Raw Metadata',
          hidden: true,
          readOnly: false,
        },
      ],
    }),
    defineField({
      name: 'metadataEntries',
      title: 'Metadata Entries',
      type: 'array',
      of: [{type: 'orderCartItemMeta'}],
      readOnly: false,
      hidden: true,
    }),

    // Stripe IDs - hidden
    defineField({name: 'id', type: 'string', readOnly: false, hidden: true}),
    defineField({name: 'stripePriceId', type: 'string', readOnly: false, hidden: true}),
    defineField({name: 'stripeProductId', type: 'string', readOnly: false, hidden: true}),
  ],
})
