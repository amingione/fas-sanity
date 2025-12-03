import React, {useMemo, useState} from 'react'
import {Button, Flex, Stack, Text} from '@sanity/ui'
import {
  PaginatedDocumentTable,
  formatCurrency,
  formatDate,
} from './PaginatedDocumentTable'
import {DocumentBadge, formatBadgeLabel, resolveBadgeTone} from './DocumentBadge'

type VendorRowData = {
  vendorNumber?: string | null
  companyName?: string | null
  status?: string | null
  pricingTier?: string | null
  creditLimit?: number | null
  currentBalance?: number | null
  city?: string | null
  state?: string | null
  updatedAt?: string | null
}

type VendorRow = VendorRowData & {
  _id: string
  _type: string
}

type StatusFilterId = 'all' | 'active' | 'on_hold' | 'over_limit'
type TierFilterId = 'all' | 'standard' | 'preferred' | 'platinum' | 'custom'

const VENDOR_PROJECTION = `{
  vendorNumber,
  companyName,
  status,
  pricingTier,
  creditLimit,
  currentBalance,
  "city": coalesce(businessAddress.city, shippingAddress.city),
  "state": coalesce(businessAddress.state, shippingAddress.state),
  "updatedAt": coalesce(_updatedAt, _createdAt)
}`

const STATUS_FILTERS: Array<{id: StatusFilterId; title: string; filter?: string}> = [
  {id: 'all', title: 'All'},
  {id: 'active', title: 'Active', filter: 'status == "active"'},
  {id: 'on_hold', title: 'On Hold', filter: 'status == "on_hold"'},
  {
    id: 'over_limit',
    title: 'Over Credit Limit',
    filter: 'defined(creditLimit) && creditLimit > 0 && currentBalance > creditLimit',
  },
]

const TIER_FILTERS: Array<{id: TierFilterId; title: string; filter?: string}> = [
  {id: 'all', title: 'All tiers'},
  {id: 'standard', title: 'Standard', filter: 'pricingTier == "standard"'},
  {id: 'preferred', title: 'Preferred', filter: 'pricingTier == "preferred"'},
  {id: 'platinum', title: 'Platinum', filter: 'pricingTier == "platinum"'},
  {id: 'custom', title: 'Custom pricing', filter: 'pricingTier == "custom"'},
]

const formatLocation = (row: VendorRowData) => {
  const parts = [row.city, row.state].filter((value) => value && value.trim())
  return parts.length ? parts.join(', ') : '—'
}

const isOverCreditLimit = (row: VendorRowData) => {
  if (typeof row.creditLimit !== 'number' || row.creditLimit <= 0) return false
  if (typeof row.currentBalance !== 'number') return false
  return row.currentBalance > row.creditLimit
}

const formatCredit = (row: VendorRowData) => {
  const balance = formatCurrency(row.currentBalance ?? null, 'USD')
  const limit = typeof row.creditLimit === 'number' ? formatCurrency(row.creditLimit, 'USD') : '—'
  return `${balance} / ${limit}`
}

export default function VendorsDocumentTable({title = 'Vendors'}: {title?: string}) {
  const [statusFilterId, setStatusFilterId] = useState<StatusFilterId>('all')
  const [tierFilterId, setTierFilterId] = useState<TierFilterId>('all')

  const activeStatus = useMemo(
    () => STATUS_FILTERS.find((option) => option.id === statusFilterId) ?? STATUS_FILTERS[0],
    [statusFilterId],
  )

  const activeTier = useMemo(
    () => TIER_FILTERS.find((option) => option.id === tierFilterId) ?? TIER_FILTERS[0],
    [tierFilterId],
  )

  const combinedFilter = useMemo(() => {
    const clauses: string[] = []
    if (activeStatus.filter) clauses.push(`(${activeStatus.filter})`)
    if (activeTier.filter) clauses.push(`(${activeTier.filter})`)
    return clauses.join(' && ')
  }, [activeStatus.filter, activeTier.filter])

  const headerActions = (
    <Stack space={3}>
      <Flex align="center" gap={2} wrap="wrap">
        <Text size={1} muted>
          Status
        </Text>
        {STATUS_FILTERS.map((option) => (
          <Button
            key={option.id}
            text={option.title}
            tone={option.id === activeStatus.id ? 'primary' : undefined}
            mode={option.id === activeStatus.id ? 'default' : 'ghost'}
            onClick={() => setStatusFilterId(option.id)}
          />
        ))}
      </Flex>
      <Flex align="center" gap={2} wrap="wrap">
        <Text size={1} muted>
          Pricing tier
        </Text>
        {TIER_FILTERS.map((option) => (
          <Button
            key={option.id}
            text={option.title}
            tone={option.id === activeTier.id ? 'primary' : undefined}
            mode={option.id === activeTier.id ? 'default' : 'ghost'}
            onClick={() => setTierFilterId(option.id)}
          />
        ))}
      </Flex>
    </Stack>
  )

  return (
    <PaginatedDocumentTable<VendorRowData>
      title={title}
      documentType="vendor"
      projection={VENDOR_PROJECTION}
      orderings={[
        {field: 'coalesce(_updatedAt, _createdAt)', direction: 'desc'},
        {field: 'vendorNumber', direction: 'asc'},
      ]}
      pageSize={12}
      filter={combinedFilter}
      headerActions={headerActions}
      columns={[
        {
          key: 'name',
          header: 'Vendor',
          render: (row: VendorRow) => (
            <Stack space={1}>
              <Text weight="medium" size={1}>
                {row.companyName || 'Vendor'}
              </Text>
              <Text size={1} muted>
                {row.vendorNumber ? `#${row.vendorNumber}` : '—'}
              </Text>
              <Text size={0} muted>
                {formatLocation(row)}
              </Text>
            </Stack>
          ),
        },
        {
          key: 'status',
          header: 'Status',
          render: (row: VendorRow) => {
            const label = formatBadgeLabel(row.status) ?? 'Status'
            const statusBadge = <DocumentBadge label={label} tone={resolveBadgeTone(row.status)} />
            const creditBadge = isOverCreditLimit(row) ? (
              <DocumentBadge label="Over limit" tone="critical" />
            ) : null
            return (
              <Flex gap={1} wrap="wrap">
                {statusBadge}
                {creditBadge}
              </Flex>
            )
          },
        },
        {
          key: 'pricingTier',
          header: 'Pricing Tier',
          render: (row: VendorRow) => (
            <DocumentBadge
              label={formatBadgeLabel(row.pricingTier) ?? 'Pricing'}
              tone="primary"
              title="Pricing tier"
            />
          ),
        },
        {
          key: 'credit',
          header: 'Credit',
          render: (row: VendorRow) => (
            <Stack space={1}>
              <Text size={1}>{formatCredit(row)}</Text>
              <Text size={0} muted>
                {isOverCreditLimit(row) ? 'Over limit' : 'Within limit'}
              </Text>
            </Stack>
          ),
        },
        {
          key: 'updated',
          header: 'Updated',
          render: (row: VendorRow) => <Text size={1}>{formatDate(row.updatedAt)}</Text>,
        },
      ]}
    />
  )
}
