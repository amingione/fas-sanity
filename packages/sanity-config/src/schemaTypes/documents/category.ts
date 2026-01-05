import {defineType, defineField} from 'sanity'

export default defineType({
  name: 'category',
  title: 'Category',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {source: 'title', maxLength: 96},
      validation: (Rule) => Rule.required(),
    }),
    /**
     * DRIFT ACKNOWLEDGEMENT:
     * `mpnPrefix` is legacy metadata and is intentionally prevented
     * from colliding with canonical ENGINE codes.
     *
     * This restriction is intentional governance drift.
     * See docs/ai-governance/PROD_IDENTIFICATION_RULES.md
     */
    // GOVERNANCE NOTE:
    // `mpnPrefix` is legacy/category-scoped metadata.
    // It must NOT be used to derive canonical SKU/MPN values.
    // Canonical identifier logic lives in docs/ai-governance/PROD_IDENTIFICATION_RULES.md.
    defineField({
      name: 'mpnPrefix',
      title: 'MPN Prefix',
      type: 'string',
      description:
        'LEGACY / CONTROLLED. Historical category-level prefix. NOT the canonical SKU engine code. Canonical SKU/MPN logic is governed by docs/ai-governance/PROD_IDENTIFICATION_RULES.md.',
      options: {
        list: [
          {title: 'Hellcat platform', value: 'HC'},
          {title: 'Ram TRX', value: 'TRX'},
          {title: 'Trackhawk/Durango', value: 'THDG'},
          {title: 'Charger/Challenger', value: 'CHCH'},
          {title: 'Tools & Accessories', value: 'TOOL'},
          {title: 'Universal part', value: 'UNI'},
          {title: 'Pulleys', value: 'PUL'},
          {title: 'Supercharger snouts', value: 'SNOUT'},
          {title: 'Intakes', value: 'INTK'},
          {title: 'MISC packages', value: 'MPKG'},
          {title: 'Electronics / sensors', value: 'ELEC'},
          {title: 'Fuel system', value: 'FUEL'},
          {title: 'Cooling components', value: 'COOL'},
          {title: 'Billet parts', value: 'BILT'},
          {title: 'Superchargers', value: 'SPCH'},
          {title: 'Supercharger components', value: 'SCCP'},
          {title: 'Truck Packages', value: 'TRPK'},
          {title: 'Power Packages', value: 'PWPK'},
          {title: 'Rebuild', value: 'REBLD'},
          {title: 'Performance Upgrade', value: 'PERF'},
          {title: 'Porting', value: 'PORT'},
          {title: 'Custom Coating', value: 'COAT'},
          {title: 'Diesel', value: 'DIES'},
        ],
      },
      validation: (Rule) =>
        Rule.required()
          .min(2)
          .max(6)
          .regex(/^[A-Z0-9]+$/, {name: 'uppercase code'})
          .custom((value) => {
            if (typeof value !== 'string') return true

            // Prevent collision with canonical ENGINE codes used in SKU/MPN
            const RESERVED_ENGINE_CODES = ['HC', 'LS', 'CO', 'HE', 'PS']
            const normalized = value.trim().toUpperCase()

            if (RESERVED_ENGINE_CODES.includes(normalized)) {
              return 'This value collides with canonical ENGINE codes. Category MPN prefixes must not equal SKU engine identifiers.'
            }

            return true
          })
          .error('MPN prefix is required (uppercase letters/numbers only, 2–6 chars).'),
    }),
    defineField({
      name: 'image',
      title: 'Image',
      type: 'image',
      options: {hotspot: true},
      description: 'Displayed for this category on the storefront.',
    }),
    // Optional curated list of products for this category.
    // This matches existing documents that already have a `products` array of product references
    // and prevents Studio from showing an "Unknown field" warning.
    defineField({
      name: 'products',
      title: 'Products (curated)',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'product'}]}],
      description:
        'Optional curated list of products for this category. Products also reference categories themselves.',
    }),
  ],
})
