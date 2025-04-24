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

const AdaptedShippingLabelActions = (props: StringInputProps) => {
  const doc = typeof props.value === 'object' && props.value !== null ? (props.value as Record<string, any>) : undefined
  if (!doc) return null
  return <LocalShippingLabelActions doc={doc} />
}

export default defineType({
  name: 'shippingLabel',
  title: 'Shipping Label',
  type: 'document',
  fields: [
    defineField({
      name: 'invoice',
      title: 'Related Invoice',
      type: 'reference',
      to: [{ type: 'invoice' }]
    }),
    defineField({ name: 'carrier', title: 'Carrier', type: 'string' }),
    defineField({ name: 'trackingNumber', title: 'Tracking Number', type: 'string' }),
    defineField({ name: 'trackingUrl', title: 'Tracking URL', type: 'url' }),
    defineField({ name: 'labelUrl', title: 'Label Download Link', type: 'url' }),
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
      description: 'Check this to include a 4x6 packing slip with the shipping label.'
    }),
    defineField({
      name: 'packingSlipButton',
      title: 'Packing Slip PDF',
      type: 'string',
      components: {
        input: AdaptedPackingSlipButton
      },
      readOnly: true
    }),
    defineField({
      name: 'actions',
      title: 'Actions',
      type: 'string',
      components: {
        input: AdaptedShippingLabelActions
      },
      readOnly: true
    })
  ]
})