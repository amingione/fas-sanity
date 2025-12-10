import {defineType, defineField} from 'sanity'

export const productAddOnType = defineType({
  name: 'productAddOn',
  title: 'Product Bundle Add-On',
  type: 'object',
  fields: [
    defineField({
      name: 'product',
      title: 'Product',
      type: 'reference',
      to: [{type: 'product'}],
      description: 'Link to the product that can be added as an optional bundle.',
      validation: (Rule) => Rule.required(),
      options: {
        filter: ({document}) => ({
          filter: '_id != $currentId && status == "active"',
          params: {currentId: document?._id},
        }),
      },
    }),
    defineField({
      name: 'quantity',
      title: 'Quantity',
      type: 'number',
      description: 'How many of this product are included in the bundle.',
      initialValue: 1,
      validation: (Rule) => Rule.required().min(1).integer(),
    }),
    defineField({
      name: 'bundleDiscount',
      title: 'Bundle Discount ($)',
      type: 'number',
      description: 'Discount when purchased together (e.g., 50 for $50 off).',
      validation: (Rule) => Rule.min(0).precision(2),
      placeholder: '0.00',
    }),
    defineField({
      name: 'bundleDiscountPercent',
      title: 'Bundle Discount (%)',
      type: 'number',
      description: 'Alternative: discount as percentage (e.g., 10 for 10% off).',
      validation: (Rule) => Rule.min(0).max(100).precision(2),
      placeholder: '0',
    }),
    defineField({
      name: 'customLabel',
      title: 'Custom Label (Optional)',
      type: 'string',
      description: 'Override product title (e.g., "Add Installation Kit").',
      placeholder: 'Leave empty to use product title',
    }),
    defineField({
      name: 'description',
      title: 'Bundle Description',
      type: 'text',
      rows: 2,
      description: 'Explain the benefit of adding this product.',
      placeholder: 'Save time and money by bundling...',
    }),
    defineField({
      name: 'defaultSelected',
      title: 'Pre-selected by Default?',
      type: 'boolean',
      description: 'Auto-add to cart (customer can remove).',
      initialValue: false,
    }),
    defineField({
      name: 'required',
      title: 'Required Add-On?',
      type: 'boolean',
      description: 'Customer must purchase this with the main product.',
      initialValue: false,
    }),
  ],
  preview: {
    select: {
      productTitle: 'product->title',
      productPrice: 'product->price',
      productImage: 'product->images.0',
      customLabel: 'customLabel',
      quantity: 'quantity',
      bundleDiscount: 'bundleDiscount',
      bundleDiscountPercent: 'bundleDiscountPercent',
      required: 'required',
    },
    prepare({
      productTitle,
      productPrice,
      productImage,
      customLabel,
      quantity,
      bundleDiscount,
      bundleDiscountPercent,
      required,
    }) {
      const safeQuantity = typeof quantity === 'number' && quantity > 0 ? quantity : 1
      const title = customLabel || productTitle || 'Product Bundle'
      const subtitleParts: string[] = []
      if (safeQuantity > 1) subtitleParts.push(`x${safeQuantity}`)

      const hasBasePrice = typeof productPrice === 'number'
      let finalPrice = hasBasePrice ? productPrice * safeQuantity : null

      if (typeof bundleDiscount === 'number' && bundleDiscount > 0 && finalPrice !== null) {
        finalPrice = Math.max(finalPrice - bundleDiscount, 0)
        subtitleParts.push(`$${finalPrice.toFixed(2)} (save $${bundleDiscount})`)
      } else if (
        typeof bundleDiscountPercent === 'number' &&
        bundleDiscountPercent > 0 &&
        finalPrice !== null
      ) {
        const discountAmount = (finalPrice * bundleDiscountPercent) / 100
        finalPrice = Math.max(finalPrice - discountAmount, 0)
        subtitleParts.push(`$${finalPrice.toFixed(2)} (${bundleDiscountPercent}% off)`)
      } else if (finalPrice !== null) {
        subtitleParts.push(`$${finalPrice.toFixed(2)}`)
      }

      if (required) subtitleParts.push('REQUIRED')

      return {
        title,
        subtitle: subtitleParts.join(' • ') || 'Bundle add-on',
        media: productImage,
      }
    },
  },
})
