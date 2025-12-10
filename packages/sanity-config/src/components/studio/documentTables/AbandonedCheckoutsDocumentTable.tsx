import React from 'react'
import {Badge, Box, Stack, Text} from '@sanity/ui'
import {
  PaginatedDocumentTable,
  PaginatedColumn,
  formatCurrency,
  formatDate,
} from './PaginatedDocumentTable'

const ABANDONED_CHECKOUT_PROJECTION = `{
  customerEmail,
  customerName,
  status,
  cartSummary,
  amountTotal,
  shippingCost,
  recoveryEmailSent,
  recoveryEmailSentAt,
  sessionCreatedAt,
  sessionExpiredAt
}`

type AbandonedCheckoutRow = {
  customerEmail?: string | null
  customerName?: string | null
  status?: string | null
  cartSummary?: string | null
  amountTotal?: number | null
  shippingCost?: number | null
  recoveryEmailSent?: boolean | null
  recoveryEmailSentAt?: string | null
  sessionCreatedAt?: string | null
  sessionExpiredAt?: string | null
}

const STATUS_TONES: Record<string, 'critical' | 'positive' | 'caution'> = {
  expired: 'critical',
  recovered: 'positive',
  ignored: 'caution',
}

const columns: PaginatedColumn<AbandonedCheckoutRow>[] = [
  {
    key: 'customer',
    header: 'Customer',
    width: 220,
    render: (row) => {
      const name = row.customerName || row.customerEmail || 'Anonymous'
      return (
        <Stack space={2}>
          <Text weight="medium">{name}</Text>
          {row.customerEmail ? (
            <Text size={1} muted>
              {row.customerEmail}
            </Text>
          ) : null}
        </Stack>
      )
    },
  },
  {
    key: 'status',
    header: 'Status',
    width: 140,
    render: (row) => {
      const value = (row.status || 'expired').toLowerCase()
      const tone = STATUS_TONES[value] || 'critical'
      return <Badge tone={tone}>{value ? value.replace(/_/g, ' ') : 'expired'}</Badge>
    },
  },
  {
    key: 'cartSummary',
    header: 'Cart Summary',
    width: 320,
    render: (row) => (
      <Text size={1} muted>
        {row.cartSummary?.trim() || 'No summary available'}
      </Text>
    ),
  },
  {
    key: 'amount',
    header: 'Total',
    width: 120,
    align: 'right',
    render: (row) => (
      <Stack space={1}>
        <Text weight="medium">{formatCurrency(row.amountTotal)}</Text>
        {typeof row.shippingCost === 'number' ? (
          <Text size={1} muted>
            Shipping {formatCurrency(row.shippingCost)}
          </Text>
        ) : null}
      </Stack>
    ),
  },
  {
    key: 'recovery',
    header: 'Recovery Email',
    width: 180,
    render: (row) => {
      if (row.recoveryEmailSent) {
        return (
          <Stack space={1}>
            <Badge tone="primary">Sent</Badge>
            <Text size={1} muted>
              {formatDate(row.recoveryEmailSentAt)}
            </Text>
          </Stack>
        )
      }
      return <Text size={1}>Not sent</Text>
    },
  },
  {
    key: 'created',
    header: 'Session Created',
    width: 150,
    render: (row) => (
      <Box>
        <Text size={1}>{formatDate(row.sessionCreatedAt)}</Text>
      </Box>
    ),
  },
  {
    key: 'expired',
    header: 'Expired At',
    width: 150,
    render: (row) => (
      <Box>
        <Text size={1}>{formatDate(row.sessionExpiredAt)}</Text>
      </Box>
    ),
  },
]

export default function AbandonedCheckoutsDocumentTable() {
  return (
    <PaginatedDocumentTable<AbandonedCheckoutRow>
      title="Abandoned Checkouts"
      documentType="abandonedCheckout"
      projection={ABANDONED_CHECKOUT_PROJECTION}
      columns={columns}
      orderings={[{field: 'sessionExpiredAt', direction: 'desc'}]}
      pageSize={12}
      emptyState="No abandoned checkouts found"
      includeDrafts={false}
    />
  )
}
