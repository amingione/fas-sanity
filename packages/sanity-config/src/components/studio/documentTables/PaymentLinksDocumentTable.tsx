import React from 'react'
import {Text} from '@sanity/ui'
import {PaginatedDocumentTable, formatBoolean, formatDate} from './PaginatedDocumentTable'
import {DocumentBadge, formatBadgeLabel, resolveBadgeTone} from './DocumentBadge'
import {formatOrderNumber} from '../../../utils/orderNumber'

type PaymentLinkRowData = {
  title?: string | null
  status?: string | null
  url?: string | null
  active?: boolean | null
  livemode?: boolean | null
  stripeLastSyncedAt?: string | null
  customerName?: string | null
  orderNumber?: string | null
}

const PAYMENT_LINK_PROJECTION = `{
  title,
  status,
  url,
  active,
  livemode,
  stripeLastSyncedAt,
  "customerName": coalesce(customerRef->name, customerRef->email),
  "orderNumber": orderRef->orderNumber
}`

export default function PaymentLinksDocumentTable() {
  type PaymentLinkRow = PaymentLinkRowData & {_id: string; _type: string}

  return (
    <PaginatedDocumentTable<PaymentLinkRowData>
      title="Payment links"
      documentType="paymentLink"
      projection={PAYMENT_LINK_PROJECTION}
      orderings={[{field: 'coalesce(stripeLastSyncedAt, _updatedAt)', direction: 'desc'}]}
      pageSize={12}
      emptyState="No payment links"
      columns={[
        {
          key: 'link',
          header: 'Link',
          render: (data: PaymentLinkRow) => {
            const title = data.title || data.url || 'Payment link'
            return (
              <StackColumn>
                <Text size={1} weight="medium">
                  {title}
                </Text>
                {data.url ? (
                  <Text size={0} muted>
                    {data.url}
                  </Text>
                ) : null}
              </StackColumn>
            )
          },
        },
        {
          key: 'customer',
          header: 'Customer',
          render: (data: PaymentLinkRow) => <Text size={1}>{data.customerName || '—'}</Text>,
        },
        {
          key: 'status',
          header: 'Status',
          render: (data: PaymentLinkRow) => {
            const label = formatBadgeLabel(data.status)
            if (!label) return <Text size={1}>—</Text>
            return (
              <DocumentBadge
                label={label}
                tone={resolveBadgeTone(data.status)}
                title={`Status: ${label}`}
              />
            )
          },
        },
        {
          key: 'active',
          header: 'Active',
          render: (data: PaymentLinkRow) => <Text size={1}>{formatBoolean(data.active)}</Text>,
        },
        {
          key: 'livemode',
          header: 'Mode',
          render: (data: PaymentLinkRow) => (
            <Text size={1}>
              {typeof data.livemode === 'boolean' ? (data.livemode ? 'Live' : 'Test') : '—'}
            </Text>
          ),
        },
        {
          key: 'order',
          header: 'Order',
          render: (data: PaymentLinkRow) => {
            const formatted = formatOrderNumber(data.orderNumber)
            return <Text size={1}>{formatted || data.orderNumber || '—'}</Text>
          },
        },
        {
          key: 'synced',
          header: 'Last synced',
          render: (data: PaymentLinkRow) => (
            <Text size={1}>{formatDate(data.stripeLastSyncedAt)}</Text>
          ),
        },
      ]}
    />
  )
}

function StackColumn({children}: {children: React.ReactNode}) {
  return <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>{children}</div>
}
