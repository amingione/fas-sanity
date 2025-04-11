import ShippingLabelActions from '../../components/studio/ShippingLabelActions'
import { defineType, defineField } from 'sanity'
import type { ObjectInputProps } from 'sanity'
import React from 'react'

interface ShippingLabelActionsProps {
  doc: Record<string, any>;
}

const LocalShippingLabelActions: React.FC<ShippingLabelActionsProps> = ({ doc }) => {
  // Component logic here
  return <div>Actions for {doc?.name || 'this document'}</div>;
};

const AdaptedShippingLabelActions = (props: ObjectInputProps) => {
  const doc = props.value
  if (!doc) return null
  return <LocalShippingLabelActions doc={doc} />;
}

interface PrintPackingSlipButtonProps {
  doc: Record<string, any>;
}

const PrintPackingSlipButton: React.FC<PrintPackingSlipButtonProps> = ({ doc }) => {
  // Component logic here
  return <button>Print Packing Slip for {doc?.name || 'this document'}</button>;
};

const AdaptedPackingSlipButton = (props: ObjectInputProps) => {
  const doc = props.value
  if (!doc) return null
  return <PrintPackingSlipButton doc={doc} />
}

export default defineType({
    name: 'shippingLabel',
    title: 'Shipping Label',
    type: 'document',
    // removed: Sanity does not support components.input on defineType
    fields: [
      defineField({
        name: 'invoice',
        title: 'Related Invoice',
        type: 'reference',
        to: [{ type: 'invoice' }]
      }),
      defineField({
        name: 'carrier',
        title: 'Carrier',
        type: 'string'
      }),
      defineField({
        name: 'trackingNumber',
        title: 'Tracking Number',
        type: 'string'
      }),
      defineField({
        name: 'trackingUrl',
        title: 'Tracking URL',
        type: 'url'
      }),
      defineField({
        name: 'labelUrl',
        title: 'Label Download Link',
        type: 'url'
      }),
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
        description: 'Custom rendering logic for this field should be handled in the Studio UI.'
      }),
      defineField({
        name: 'actions',
        title: 'Actions',
        type: 'string',
        // Custom rendering logic for this field should be handled in the Studio UI or elsewhere
      })
    ]
})