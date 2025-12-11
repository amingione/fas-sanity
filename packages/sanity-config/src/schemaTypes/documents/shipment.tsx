import React from 'react'
import {defineField, defineType} from 'sanity'
import {RocketIcon} from '@sanity/icons'
import PDFThumbnail from '../../components/media/PDFThumbnail'
import {ShipmentStatusIcon} from '../../components/media/ShipmentStatusIcon'

export default defineType({
  name: 'shipment',
  title: 'Shipments',
  type: 'document',
  icon: RocketIcon,
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
    }),
    defineField({
      name: 'easypostId',
      title: 'EasyPost Shipment ID',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'mode',
      title: 'Mode',
      type: 'string',
    }),
    defineField({
      name: 'reference',
      title: 'Reference',
      type: 'string',
    }),
    defineField({
      name: 'stripePaymentIntentId',
      title: 'Stripe Payment Intent ID',
      type: 'string',
      description: 'External Stripe payment intent identifier used to charge this shipment',
    }),
    defineField({
      name: 'trackingCode',
      title: 'Tracking Code',
      type: 'string',
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
    }),

    // REMOVE these duplicate fields - use selectedRate instead
    // defineField({
    //   name: 'carrier',
    //   title: 'Carrier',
    //   type: 'string',
    // }),
    // defineField({
    //   name: 'service',
    //   title: 'Service',
    //   type: 'string',
    // }),
    // defineField({
    //   name: 'rate',
    //   title: 'Rate',
    //   type: 'number',
    // }),

    defineField({
      name: 'currency',
      title: 'Currency',
      type: 'string',
    }),
    defineField({
      name: 'transitDays',
      title: 'Transit Days',
      type: 'number',
    }),
    defineField({
      name: 'recipient',
      title: 'Recipient',
      type: 'string',
    }),
    defineField({
      name: 'labelUrl',
      title: 'Label URL',
      type: 'url',
    }),
    defineField({
      name: 'toAddress',
      title: 'To Address',
      type: 'object',
      fields: [
        {name: 'name', type: 'string'},
        {name: 'street1', type: 'string'},
        {name: 'street2', type: 'string'},
        {name: 'city', type: 'string'},
        {name: 'state', type: 'string'},
        {name: 'zip', type: 'string'},
        {name: 'country', type: 'string'},
        {name: 'phone', type: 'string'},
        {name: 'email', type: 'string'},
      ],
    }),
    defineField({
      name: 'fromAddress',
      title: 'From Address',
      type: 'object',
      fields: [
        {name: 'name', type: 'string'},
        {name: 'street1', type: 'string'},
        {name: 'street2', type: 'string'},
        {name: 'city', type: 'string'},
        {name: 'state', type: 'string'},
        {name: 'zip', type: 'string'},
        {name: 'country', type: 'string'},
        {name: 'phone', type: 'string'},
        {name: 'email', type: 'string'},
      ],
    }),
    defineField({
      name: 'parcel',
      title: 'Parcel',
      type: 'object',
      fields: [
        {name: 'length', type: 'number'},
        {name: 'width', type: 'number'},
        {name: 'height', type: 'number'},
        {name: 'weight', type: 'number'},
      ],
    }),
    defineField({
      name: 'selectedRate',
      title: 'Selected Rate',
      type: 'object',
      fields: [
        {name: 'carrier', type: 'string'},
        {name: 'service', type: 'string'},
        {name: 'rate', type: 'string'},
        {name: 'currency', type: 'string'},
      ],
    }),
    defineField({
      name: 'rates',
      title: 'Rates',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {name: 'carrier', type: 'string'},
            {name: 'service', type: 'string'},
            {name: 'rate', type: 'string'},
            {name: 'currency', type: 'string'},
            {name: 'deliveryDays', type: 'number'},
          ],
        },
      ],
    }),
    defineField({
      name: 'postageLabel',
      title: 'Postage Label',
      type: 'object',
      fields: [
        {name: 'labelUrl', type: 'url'},
        {name: 'labelPdfUrl', type: 'url'},
      ],
    }),
    defineField({
      name: 'tracker',
      title: 'Tracker',
      type: 'object',
      fields: [
        {name: 'id', type: 'string'},
        {name: 'status', type: 'string'},
        {name: 'carrier', type: 'string'},
        {name: 'public_url', type: 'url'},
        {name: 'tracking_code', type: 'string'},
      ],
    }),
    defineField({
      name: 'trackingDetails',
      title: 'Tracking Details',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {name: 'message', type: 'string'},
            {name: 'status', type: 'string'},
            {name: 'datetime', type: 'datetime'},
            {
              name: 'trackingLocation',
              type: 'object',
              fields: [
                {name: 'city', type: 'string'},
                {name: 'state', type: 'string'},
                {name: 'zip', type: 'string'},
                {name: 'country', type: 'string'},
              ],
            },
          ],
        },
      ],
    }),
    defineField({
      name: 'forms',
      title: 'Forms',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {name: 'formId', type: 'string', title: 'Form ID'},
            {name: 'formType', type: 'string', title: 'Type'},
            {name: 'formUrl', type: 'url', title: 'URL'},
            {name: 'createdAt', type: 'datetime', title: 'Created At'},
          ],
        },
      ],
    }),
    defineField({
      name: 'customsInfo',
      title: 'Customs Info',
      type: 'object',
      fields: [
        {name: 'id', type: 'string'},
        {name: 'contents_type', type: 'string'},
      ],
    }),
    defineField({
      name: 'insurance',
      title: 'Insurance',
      type: 'object',
      fields: [
        {name: 'amount', type: 'string'},
        {name: 'provider', type: 'string'},
      ],
    }),
    defineField({
      name: 'batchId',
      title: 'Batch ID',
      type: 'string',
    }),
    defineField({
      name: 'batchStatus',
      title: 'Batch Status',
      type: 'string',
    }),
    defineField({
      name: 'batchMessage',
      title: 'Batch Message',
      type: 'string',
    }),
    defineField({
      name: 'scanForm',
      title: 'Scan Form',
      type: 'object',
      fields: [
        {name: 'id', type: 'string'},
        {name: 'form_url', type: 'url'},
      ],
    }),
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
    }),
    defineField({
      name: 'updatedAt',
      title: 'Updated At',
      type: 'datetime',
    }),
    defineField({
      name: 'rawWebhookData',
      title: 'Raw Webhook Data',
      type: 'text',
    }),
    defineField({
      name: 'details',
      title: 'Details (JSON)',
      type: 'text',
    }),
    defineField({
      name: 'order',
      title: 'Linked Order',
      type: 'reference',
      to: [{type: 'order'}],
      description: 'Sanity order document that originated this shipment',
    }),
  ],

  preview: {
    select: {
      customerName: 'order.customerName',
      orderNumber: 'order.orderNumber',
      trackingCode: 'trackingCode',
      recipient: 'toAddress.name',
      carrier: 'selectedRate.carrier',
      service: 'selectedRate.service',
      rate: 'selectedRate.rate',
      currency: 'selectedRate.currency',
      labelUrl: 'labelUrl',
      postageLabelUrl: 'postageLabel.labelPdfUrl',
      status: 'status',
    },
    prepare({
      customerName,
      orderNumber,
      trackingCode,
      recipient,
      carrier,
      service,
      rate,
      currency,
      labelUrl,
      postageLabelUrl,
      status,
    }) {
      // Title: Customer name
      const title = customerName || recipient || 'Unknown Customer'

      // Subtitle: Order number on first line, then tracking/service/cost inline
      const subtitleParts = []
      if (orderNumber) subtitleParts.push(orderNumber)
      if (trackingCode) subtitleParts.push(trackingCode)
      if (service) subtitleParts.push(service)
      if (rate) {
        const formattedRate = `$${parseFloat(rate).toFixed(2)}`
        subtitleParts.push(formattedRate)
      }

      const subtitle = subtitleParts.length > 0 ? subtitleParts.join(' • ') : 'No tracking info'

      const pdfUrl = postageLabelUrl || labelUrl

      return {
        title,
        subtitle,
        media: () =>
          pdfUrl ? <PDFThumbnail pdfUrl={pdfUrl} /> : <ShipmentStatusIcon status={status} />,
      }
    },
  },
})
