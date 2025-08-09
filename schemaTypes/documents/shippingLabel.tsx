import ShippingLabelActions from '../../components/studio/ShippingLabelActions'
import { defineType, defineField } from 'sanity'
import type { ObjectInputProps } from 'sanity'
import React from 'react'
import { StringInputProps } from 'sanity'

interface PrintPackingSlipButtonProps {
  doc: Record<string, any>
}

const PrintPackingSlipButton: React.FC<PrintPackingSlipButtonProps> = ({ doc }) => {
  const handleClick = () => {
    window.open(`/api/print-slip?id=${doc?._id}`, '_blank')
  }

  return <button onClick={handleClick}>📦 Print Packing Slip</button>
}

const AdaptedPackingSlipButton = (props: StringInputProps) => {
  const doc = typeof props.value === 'object' && props.value !== null ? (props.value as Record<string, any>) : undefined
  if (!doc) return null
  return <PrintPackingSlipButton doc={doc} />
}

interface ShippingLabelActionsProps {
  doc: Record<string, any>
}

const LocalShippingLabelActions: React.FC<ShippingLabelActionsProps> = ({ doc }) => {
  return <ShippingLabelActions doc={doc} />
}

const AdaptedShippingLabelActions = (props: ObjectInputProps) => {
  const { value } = props
  const doc = typeof value === 'object' && value !== null ? (value as Record<string, any>) : undefined
  if (!doc) return null
  return <LocalShippingLabelActions doc={doc} />
}

export default defineType({
  name: 'shippingLabel',
  title: 'Shipping Label',
  type: 'document',
  fieldsets: [
    { name: 'output', title: 'Generated Files', options: { collapsible: true, collapsed: false } }
  ],
  fields: [
    defineField({
      name: 'invoice',
      title: 'Related Invoice',
      type: 'reference',
      to: [{ type: 'invoice' }],
      options: {
        disableNew: false
      }
    }),
    defineField({ name: 'trackingNumber', title: 'Tracking Number', type: 'string' }),
    defineField({ name: 'trackingUrl', title: 'Tracking URL', type: 'url' }),
    defineField({
      name: 'status',
      title: 'Fulfillment Status',
      type: 'string',
      options: {
        list: ['unfulfilled', 'in transit', 'delivered', 'cancelled'],
        layout: 'dropdown'
      }
    }),
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
      readOnly: true
    }),
    defineField({
      name: 'printPackingSlip',
      title: 'Print Packing Slip (4x6)',
      type: 'boolean',
      description: 'Enable this if a 4x6 packing slip should be auto-included during label creation via ShipEngine.',
      fieldset: 'output'
    }),
    defineField({
      name: 'weight',
      title: 'Weight (lbs)',
      type: 'number',
      description: 'Enter total weight in pounds (conversion from ounces is handled automatically)'
    }),
    defineField({
      name: 'dimensions',
      title: 'Package Dimensions (in)',
      type: 'object',
      fields: [
        { name: 'length', type: 'number', title: 'Length' },
        { name: 'width', type: 'number', title: 'Width' },
        { name: 'height', type: 'number', title: 'Height' }
      ]
    }),
    defineField({
      name: 'carrier',
      title: 'Shipping Carrier',
      type: 'string',
      options: {
        list: ['usps', 'ups', 'fedex'],
        layout: 'dropdown'
      }
    }),
    defineField({
      name: 'generateLabel',
      title: 'Generate Shipping Label',
      type: 'object',
      fields: [
        {
          name: 'serviceCode',
          title: 'Service Code',
          type: 'string',
          description: 'Choose the service level (e.g., ground, 2-day, overnight)'
        },
        {
          name: 'rateEstimate',
          title: 'Estimated Rate',
          type: 'string',
          readOnly: true
        },
        {
          name: 'trigger',
          title: 'Generate Label',
          type: 'boolean',
          description: 'Click to generate label using the ShipEngine API'
        }
      ],
      components: {
        input: AdaptedShippingLabelActions
      },
      fieldset: 'output'
    })
  ]
})