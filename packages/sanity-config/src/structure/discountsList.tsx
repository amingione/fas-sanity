import React, {useCallback, useEffect, useMemo, useState} from 'react'
import {useClient} from 'sanity'
import {useRouter} from 'sanity/router'
import {Badge, Box, Button, Card, Dialog, Flex, Select, Stack, Text} from '@sanity/ui'
import {SiStripe} from 'react-icons/si'
import DataTable, {DataTableColumn} from '../components/studio/dashboard/DataTable'
import StripeCouponPreview from '../components/previews/StripeCouponPreview'

const API_VERSION = '2024-10-01'
const STRIPE_COLOR = '#635bff'

type StatusFilter = 'all' | 'active' | 'expired' | 'deleted'
type DurationFilter = 'all' | 'once' | 'repeating' | 'forever'
type DiscountTypeFilter = 'all' | 'percent' | 'amount'

type StripeCouponRow = {
  _id: string
  stripeId?: string | null
  name?: string | null
  percentOff?: number | null
  amountOff?: number | null
  currency?: string | null
  duration?: string | null
  durationInMonths?: number | null
  valid?: boolean | null
  createdAt?: string | null
  updatedAt?: string | null
  redeemBy?: string | null
  maxRedemptions?: number | null
  timesRedeemed?: number | null
  metadata?: Record<string, string> | null
  deletedAt?: string | null
  metadataText?: string
}

const STATUS_TONE: Record<string, 'positive' | 'default' | 'critical'> = {
  active: 'positive',
  expired: 'default',
  deleted: 'critical',
}

const resolveStatusKey = (row: StripeCouponRow) => {
  if (row.deletedAt) return 'deleted'
  if (row.valid === false) return 'expired'
  if (row.valid === true) return 'active'
  return 'unknown'
}

const resolveStatusLabel = (row: StripeCouponRow) => {
  const key = resolveStatusKey(row)
  if (key === 'deleted') return 'Deleted'
  if (key === 'expired') return 'Expired'
  if (key === 'active') return 'Active'
  return 'Unknown'
}

const formatCurrency = (amount: number, currency?: string | null) => {
  const code = currency ? currency.toUpperCase() : 'USD'
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `$${amount.toFixed(2)}`
  }
}

const resolveDiscountLabel = (row: StripeCouponRow) => {
  if (typeof row.percentOff === 'number') return `${row.percentOff}% off`
  if (typeof row.amountOff === 'number') {
    return `${formatCurrency(row.amountOff / 100, row.currency)} off`
  }
  return 'Unknown'
}

const resolveDurationLabel = (row: StripeCouponRow) => {
  const duration = (row.duration || '').toString().trim()
  if (duration === 'once') return 'Once'
  if (duration === 'forever') return 'Forever'
  if (duration === 'repeating') {
    return typeof row.durationInMonths === 'number'
      ? `${row.durationInMonths} months`
      : 'Repeating'
  }
  return 'Unknown'
}

const resolveRedemptionsLabel = (row: StripeCouponRow) => {
  const times = row.timesRedeemed
  const max = row.maxRedemptions
  if (typeof times === 'number' && typeof max === 'number') return `${times} / ${max}`
  if (typeof times === 'number') return `${times}`
  return '—'
}

const resolveDiscountType = (row: StripeCouponRow) => {
  if (typeof row.percentOff === 'number') return 'percent'
  if (typeof row.amountOff === 'number') return 'amount'
  return 'unknown'
}

const resolveCouponQuery = () => `
  *[_type == "stripeCoupon"] | order(createdAt desc){
    _id,
    stripeId,
    name,
    percentOff,
    amountOff,
    currency,
    duration,
    durationInMonths,
    valid,
    createdAt,
    updatedAt,
    redeemBy,
    maxRedemptions,
    timesRedeemed,
    metadata,
    deletedAt
  }
`

function DiscountsList({statusFilter: initialStatus}: {statusFilter?: StatusFilter}) {
  const client = useClient({apiVersion: API_VERSION})
  const router = useRouter()
  const [coupons, setCoupons] = useState<StripeCouponRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatus || 'all')
  const [durationFilter, setDurationFilter] = useState<DurationFilter>('all')
  const [discountTypeFilter, setDiscountTypeFilter] = useState<DiscountTypeFilter>('all')
  const [selected, setSelected] = useState<StripeCouponRow | null>(null)

  const loadCoupons = useCallback(async () => {
    setLoading(true)
    try {
      const results = await client.fetch<StripeCouponRow[]>(resolveCouponQuery())
      const normalized = (Array.isArray(results) ? results : []).map((row) => ({
        ...row,
        metadataText: row.metadata ? JSON.stringify(row.metadata) : '',
      }))
      setCoupons(normalized)
    } catch (err) {
      console.warn('DiscountsList: failed to load Stripe coupons', err)
      setCoupons([])
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    loadCoupons()
  }, [loadCoupons])

  const filteredCoupons = useMemo(() => {
    return coupons.filter((row) => {
      const statusKey = resolveStatusKey(row)
      if (statusFilter !== 'all' && statusKey !== statusFilter) return false
      if (durationFilter !== 'all' && row.duration !== durationFilter) return false
      if (discountTypeFilter !== 'all' && resolveDiscountType(row) !== discountTypeFilter) {
        return false
      }
      return true
    })
  }, [coupons, discountTypeFilter, durationFilter, statusFilter])

  const columns = useMemo<DataTableColumn<StripeCouponRow>[]>(
    () => [
      {
        key: 'stripeId',
        title: 'Coupon Code',
        sortable: true,
        render: (row) => (
          <Stack space={1}>
            <Flex align="center" gap={2}>
              <SiStripe aria-label="Stripe" color={STRIPE_COLOR} />
              <Text size={1} weight="semibold">
                {row.stripeId || 'Unknown'}
              </Text>
            </Flex>
            {row.name ? (
              <Text size={1} muted>
                {row.name}
              </Text>
            ) : null}
          </Stack>
        ),
      },
      {
        key: 'discount',
        title: 'Discount',
        render: resolveDiscountLabel,
      },
      {
        key: 'duration',
        title: 'Duration',
        render: (row) => (
          <Badge tone="primary" mode="outline">
            {resolveDurationLabel(row)}
          </Badge>
        ),
      },
      {
        key: 'status',
        title: 'Status',
        render: (row) => {
          const key = resolveStatusKey(row)
          return (
            <Badge tone={STATUS_TONE[key] || 'default'} mode="outline">
              {resolveStatusLabel(row)}
            </Badge>
          )
        },
      },
      {
        key: 'redemptions',
        title: 'Redemptions',
        render: resolveRedemptionsLabel,
      },
    ],
    [],
  )

  return (
    <Stack space={4}>
      <Card
        padding={4}
        radius={3}
        shadow={1}
        style={{backgroundColor: '#fdf6e7', border: '1px solid #f5d7a1'}}
        tone="default"
      >
        <Stack space={2}>
          <Text size={1} weight="semibold">
            Stripe Coupons (Read-Only)
          </Text>
          <Text size={1}>
            Coupons are managed in Stripe and synced automatically. Manual edits are disabled.
          </Text>
        </Stack>
      </Card>

      <Card padding={4} radius={3} shadow={1}>
        <Flex align="center" justify="space-between" wrap="wrap" gap={3}>
          <Stack space={1}>
            <Flex align="center" gap={2}>
              <SiStripe aria-label="Stripe" color={STRIPE_COLOR} size={18} />
              <Text size={2} weight="semibold">
                Customer Coupons (Stripe)
              </Text>
            </Flex>
            <Text size={1} muted>
              Stripe-synced coupons cached in Sanity for reporting and review.
            </Text>
          </Stack>
        </Flex>
      </Card>

      <Card padding={4} radius={3} shadow={1}>
        <Flex gap={3} wrap="wrap" align="center">
          <Box style={{minWidth: 180}}>
            <Text size={1} muted>
              Status
            </Text>
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.currentTarget.value as StatusFilter)}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="deleted">Deleted</option>
            </Select>
          </Box>
          <Box style={{minWidth: 180}}>
            <Text size={1} muted>
              Duration
            </Text>
            <Select
              value={durationFilter}
              onChange={(event) => setDurationFilter(event.currentTarget.value as DurationFilter)}
            >
              <option value="all">All</option>
              <option value="once">Once</option>
              <option value="repeating">Repeating</option>
              <option value="forever">Forever</option>
            </Select>
          </Box>
          <Box style={{minWidth: 180}}>
            <Text size={1} muted>
              Discount Type
            </Text>
            <Select
              value={discountTypeFilter}
              onChange={(event) =>
                setDiscountTypeFilter(event.currentTarget.value as DiscountTypeFilter)
              }
            >
              <option value="all">All</option>
              <option value="percent">Percent Off</option>
              <option value="amount">Amount Off</option>
            </Select>
          </Box>
        </Flex>
      </Card>

      <DataTable
        columns={columns}
        data={filteredCoupons}
        isLoading={loading}
        searchableKeys={['stripeId', 'name', 'metadataText']}
        filterPlaceholder="Search by code, name, or metadata…"
        onRowClick={(row) => setSelected(row)}
        rowKey={(row) => row._id}
        emptyState="No Stripe coupons found."
      />

      {selected ? (
        <Dialog
          id="stripe-coupon-preview"
          header="Stripe coupon preview"
          onClose={() => setSelected(null)}
          width={1}
        >
          <Box padding={4}>
            <Stack space={4}>
              <StripeCouponPreview value={selected} />
              <Flex justify="flex-end" gap={2}>
                <Button
                  mode="ghost"
                  text="Close"
                  onClick={() => setSelected(null)}
                />
                <Button
                  tone="primary"
                  text="Open in Studio"
                  onClick={() => {
                    router.navigateIntent('edit', {id: selected._id, type: 'stripeCoupon'})
                  }}
                />
              </Flex>
            </Stack>
          </Box>
        </Dialog>
      ) : null}
    </Stack>
  )
}

export const DiscountsListAll = () => <DiscountsList statusFilter="all" />
export const DiscountsListActive = () => <DiscountsList statusFilter="active" />
export const DiscountsListExpired = () => <DiscountsList statusFilter="expired" />
