import {defineField, defineType} from 'sanity'

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
      if (cleanVariant) parts.push(`Variant: ${cleanVariant}`)
      if (cleanAddOns.length > 0) {
        parts.push(`Add-ons: ${cleanAddOns.join(', ')}`)
      }
      let calc = `Qty: ${qty} × $${unitPrice.toFixed(2)}`
      if (addOnTotal > 0) calc += ` + $${addOnTotal.toFixed(2)}`
      calc += ` = $${itemTotal.toFixed(2)}`
      parts.push(calc)

      return {
        title: (typeof title === 'string' && title.trim()) || 'Item',
        subtitle: parts.join(' • '),
      }
    },
  },
  fields: [
    // Visible
    defineField({name: 'name', type: 'string', title: 'Product Name', readOnly: true}),
    defineField({
      name: 'productRef',
      type: 'reference',
      title: 'Sanity Product',
      to: [{type: 'product'}],
      readOnly: true,
      hidden: true,
    }),
    defineField({name: 'sku', type: 'string', title: 'SKU', readOnly: true}),
    defineField({name: 'image', type: 'url', title: 'Product Image', readOnly: true}),
    defineField({name: 'quantity', type: 'number', title: 'Quantity', readOnly: true}),
    defineField({name: 'price', type: 'number', title: 'Unit Price', readOnly: true}),
    defineField({name: 'total', type: 'number', title: 'Line Total', readOnly: true}),
    defineField({
      name: 'selectedVariant',
      type: 'string',
      title: 'Selected Variant',
      description: 'Clean variant choice (e.g., "TRX")',
      readOnly: true,
    }),
    defineField({
      name: 'addOns',
      type: 'array',
      title: 'Add-Ons',
      of: [{type: 'string'}],
      description: 'Clean add-on names without "Upgrade:" prefix',
      readOnly: true,
    }),

    // Hidden but kept
    defineField({
      name: 'optionDetails',
      title: 'Option Details (Raw)',
      type: 'array',
      of: [{type: 'string'}],
      readOnly: true,
      hidden: true,
      description: 'Raw option data from Stripe - used for variant display',
    }),
    defineField({
      name: 'optionSummary',
      title: 'Option Summary',
      type: 'string',
      readOnly: true,
      hidden: true,
    }),
    defineField({
      name: 'upgrades',
      title: 'Upgrades (Raw)',
      type: 'array',
      of: [{type: 'string'}],
      readOnly: true,
      hidden: true,
      description: 'Raw upgrade data from Stripe - used for add-ons display',
    }),
    defineField({
      name: 'upgradesTotal',
      title: 'Upgrades Total',
      type: 'number',
      readOnly: true,
      hidden: true,
    }),
    defineField({
      name: 'productSlug',
      type: 'string',
      readOnly: true,
      hidden: true,
    }),
    defineField({
      name: 'productUrl',
      type: 'string',
      readOnly: true,
      hidden: true,
    }),
    defineField({
      name: 'lineTotal',
      type: 'number',
      readOnly: true,
      hidden: true,
    }),

    // Stripe metadata - hidden
    defineField({
      name: 'metadata',
      title: 'Stripe Metadata',
      type: 'object',
      readOnly: true,
      hidden: true,
      fields: [
        {
          name: 'raw',
          type: 'text',
          title: 'Raw Metadata',
          hidden: true,
          readOnly: true,
        },
      ],
    }),
    defineField({
      name: 'metadataEntries',
      title: 'Metadata Entries',
      type: 'array',
      of: [{type: 'orderCartItemMeta'}],
      readOnly: true,
      hidden: true,
    }),

    // Stripe IDs - hidden
    defineField({name: 'id', type: 'string', readOnly: true, hidden: true}),
    defineField({name: 'stripePriceId', type: 'string', readOnly: true, hidden: true}),
    defineField({name: 'stripeProductId', type: 'string', readOnly: true, hidden: true}),
  ],
})
