/**
 * Sanity schema: vendorActivityEvent
 *
 * Read-only audit log documents written by the vendor-timeline-webhook Netlify function.
 * These are system-generated records — never manually created or edited in Studio.
 *
 * Source of truth: fas-sanity/docs/SourceOfTruths/vendor-portal-webhook-contract.md
 */

import {defineType, defineField} from 'sanity'
import {ActivityIcon} from '@sanity/icons'

export default defineType({
  name: 'vendorActivityEvent',
  title: 'Vendor Activity Events',
  type: 'document',
  icon: ActivityIcon,
  // System document — fields are read-only and written by integration flows only.
  fields: [
    defineField({
      name: 'eventId',
      title: 'Event ID',
      type: 'string',
      description: 'Stable idempotency key — unique per event emission from Medusa.',
      readOnly: true,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'eventType',
      title: 'Event Type',
      type: 'string',
      description: 'Canonical event type from Medusa (e.g. vendor.order.fulfilled).',
      readOnly: true,
      options: {
        list: [
          {title: 'Quote Created', value: 'vendor.quote.created'},
          {title: 'Order Processing', value: 'vendor.order.processing'},
          {title: 'Order Backordered', value: 'vendor.order.backordered'},
          {title: 'Order Partially Fulfilled', value: 'vendor.order.partially_fulfilled'},
          {title: 'Payment Link Sent', value: 'vendor.payment.link_sent'},
          {title: 'Shipment In Transit', value: 'vendor.shipment.in_transit'},
          {title: 'Shipment Delivered', value: 'vendor.shipment.delivered'},
          {title: 'Message Sent', value: 'vendor.message.sent'},
          {title: 'Message Opened', value: 'vendor.message.opened'},
          // Backward-compatible legacy events retained during cutover:
          {title: 'Quote Approved', value: 'vendor.quote.approved'},
          {title: 'Quote Rejected', value: 'vendor.quote.rejected'},
          {title: 'Order Placed', value: 'vendor.order.placed'},
          {title: 'Order Confirmed', value: 'vendor.order.confirmed'},
          {title: 'Order Fulfilled', value: 'vendor.order.fulfilled'},
          {title: 'Order Cancelled', value: 'vendor.order.cancelled'},
          {title: 'Shipment Label Purchased', value: 'vendor.shipment.label_purchased'},
          {title: 'Shipment Tracking Updated', value: 'vendor.shipment.tracking_updated'},
          {title: 'Payment Received', value: 'vendor.payment.received'},
          {title: 'Payment Failed', value: 'vendor.payment.failed'},
          {title: 'Invoice Created', value: 'vendor.invoice.created'},
          {title: 'Invoice Paid', value: 'vendor.invoice.paid'},
          {title: 'Return Started', value: 'vendor.return.started'},
          {title: 'Return Completed', value: 'vendor.return.completed'},
          {title: 'Refund Completed', value: 'vendor.refund.completed'},
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'occurredAt',
      title: 'Occurred At',
      type: 'datetime',
      description: 'Timestamp from Medusa when the business event occurred.',
      readOnly: true,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'source',
      title: 'Source System',
      type: 'string',
      description: 'System that emitted the event (e.g. fas-medusa).',
      readOnly: true,
    }),
    defineField({
      name: 'aggregateType',
      title: 'Aggregate Type',
      type: 'string',
      description: 'The domain entity type (order, invoice, shipment, payment, return, quote).',
      readOnly: true,
      options: {
        list: [
          {title: 'Order', value: 'order'},
          {title: 'Invoice', value: 'invoice'},
          {title: 'Shipment', value: 'shipment'},
          {title: 'Payment', value: 'payment'},
          {title: 'Return', value: 'return'},
          {title: 'Quote', value: 'quote'},
          {title: 'Vendor', value: 'vendor'},
        ],
      },
    }),
    defineField({
      name: 'aggregateId',
      title: 'Aggregate ID',
      type: 'string',
      description: 'ID of the domain entity in Medusa.',
      readOnly: true,
    }),
    defineField({
      name: 'vendorId',
      title: 'Vendor ID',
      type: 'string',
      description: 'Sanity vendor document ID (without drafts. prefix).',
      readOnly: true,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'vendorRef',
      title: 'Vendor',
      type: 'reference',
      description: 'Reference to the vendor document (resolved from vendorId after write).',
      to: [{type: 'vendor'}],
      readOnly: true,
      options: {disableNew: true},
    }),
    defineField({
      name: 'orderRef',
      title: 'Order Reference',
      type: 'string',
      description: 'Optional order identifier for quick filtering/debugging.',
      readOnly: true,
    }),
    defineField({
      name: 'summary',
      title: 'Summary',
      type: 'string',
      description: 'Human-readable one-line summary generated by the webhook handler.',
      readOnly: true,
    }),
    defineField({
      name: 'payload',
      title: 'Raw Payload',
      type: 'text',
      description: 'Full JSON payload from Medusa for audit/debugging purposes.',
      readOnly: true,
      rows: 6,
    }),
    defineField({
      name: 'readOnly',
      title: 'Read Only Mirror',
      type: 'boolean',
      description: 'Always true for webhook mirrored timeline events.',
      readOnly: true,
      initialValue: true,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'version',
      title: 'Schema Version',
      type: 'string',
      description: 'Webhook envelope version (e.g. 1.0).',
      readOnly: true,
    }),
    defineField({
      name: 'processingStatus',
      title: 'Processing Status',
      type: 'string',
      readOnly: true,
      options: {
        list: [
          {title: 'Received', value: 'received'},
          {title: 'Processed', value: 'processed'},
          {title: 'Failed', value: 'failed'},
          {title: 'Duplicate (skipped)', value: 'duplicate'},
        ],
      },
      initialValue: 'received',
    }),
  ],
  preview: {
    select: {
      eventType: 'eventType',
      vendorId: 'vendorId',
      occurredAt: 'occurredAt',
      summary: 'summary',
    },
    prepare({eventType, vendorId, occurredAt, summary}: {
      eventType?: string
      vendorId?: string
      occurredAt?: string
      summary?: string
    }) {
      const date = occurredAt ? new Date(occurredAt).toLocaleDateString() : '?'
      return {
        title: summary || eventType || 'Vendor Event',
        subtitle: `${vendorId ?? 'unknown vendor'} · ${date}`,
      }
    },
  },
  orderings: [
    {
      title: 'Newest First',
      name: 'occurredAtDesc',
      by: [{field: 'occurredAt', direction: 'desc'}],
    },
  ],
})
