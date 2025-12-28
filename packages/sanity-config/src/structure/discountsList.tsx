import React, {useCallback, useEffect, useMemo, useState} from 'react'
import {useClient} from 'sanity'
import {useRouter} from 'sanity/router'
import {
  Autocomplete,
  Badge,
  Box,
  Button,
  Card,
  Dialog,
  Flex,
  Select,
  Stack,
  Text,
  TextInput,
  useToast,
} from '@sanity/ui'
import {
  ArrowRightIcon,
  CheckmarkCircleIcon,
  CloseIcon,
  SearchIcon,
} from '@sanity/icons'
import {SiStripe} from 'react-icons/si'
import {formatDistanceToNow} from 'date-fns'
import DataTable, {DataTableColumn} from '../components/studio/dashboard/DataTable'
import {getNetlifyFnBase} from '../schemaTypes/documentActions/netlifyFnBase'

const API_VERSION = '2024-10-01'

type DiscountStatus = 'active' | 'expired' | 'scheduled'
type DiscountMode = 'percent' | 'amount'
type DiscountDuration = 'once' | 'repeating' | 'forever'
type DiscountType = 'Customer' | 'Vendor' | 'Promo'

type StripeMetadataEntry = {key?: string | null; value?: string | null}

type DiscountRow = {
  _key?: string | null
  stripeDiscountId?: string | null
  stripeCouponId?: string | null
  promotionCodeId?: string | null
  couponName?: string | null
  percentOff?: number | null
  amountOff?: number | null
  currency?: string | null
  duration?: string | null
  durationInMonths?: number | null
  status?: DiscountStatus | string | null
  valid?: boolean | null
  createdAt?: string | null
  metadata?: StripeMetadataEntry[] | null
  _customerId?: string | null
  _customerName?: string | null
  _customerEmail?: string | null
  _customerStripeId?: string | null
  code?: string
  customerLabel?: string
}

type CustomerOption = {
  value: string
  label: string
  subtitle?: string
  payload: {
    _id: string
    name?: string | null
    email?: string | null
    stripeCustomerId?: string | null
  }
}

const STATUS_TONE: Record<string, 'positive' | 'primary' | 'default'> = {
  active: 'positive',
  scheduled: 'primary',
  expired: 'default',
}

const TYPE_TONE: Record<DiscountType, 'primary' | 'caution' | 'default'> = {
  Customer: 'primary',
  Vendor: 'caution',
  Promo: 'default',
}

const STRIPE_COLOR = '#635bff'

const resolveDiscountQuery = (status?: DiscountStatus | 'all') => {
  const base =
    '*[_type == "customer" && defined(discounts)].discounts' +
    (status && status !== 'all' ? `[status == $status]` : '[]')
  return `${base}{
    _key,
    stripeDiscountId,
    stripeCouponId,
    promotionCodeId,
    couponName,
    percentOff,
    amountOff,
    currency,
    duration,
    durationInMonths,
    status,
    valid,
    createdAt,
    metadata,
    "_customerId": ^._id,
    "_customerName": ^.name,
    "_customerEmail": ^.email,
    "_customerStripeId": ^.stripeCustomerId
  } | order(createdAt desc)`
}

const normalizeStatus = (value?: string | null) =>
  typeof value === 'string' ? value.trim().toLowerCase() : ''

const formatStatusLabel = (value?: string | null) => {
  const normalized = normalizeStatus(value)
  if (!normalized) return 'Unknown'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

const formatCurrency = (amount?: number | null, currency?: string | null) => {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null
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

const resolveCode = (discount: DiscountRow) =>
  discount.promotionCodeId ||
  discount.stripeCouponId ||
  discount.stripeDiscountId ||
  discount.couponName ||
  'Unknown'

const resolveValueLabel = (discount: DiscountRow) => {
  if (typeof discount.percentOff === 'number') {
    return `${discount.percentOff}% off`
  }
  const amountLabel = formatCurrency(discount.amountOff, discount.currency)
  return amountLabel ? `${amountLabel} off` : 'Unknown'
}

const resolveDurationLabel = (discount: DiscountRow) => {
  const duration = normalizeStatus(discount.duration)
  if (duration === 'forever') return 'Forever'
  if (duration === 'once') return 'Once'
  if (duration === 'repeating') {
    const months =
      typeof discount.durationInMonths === 'number' && Number.isFinite(discount.durationInMonths)
        ? discount.durationInMonths
        : null
    return months ? `${months} months` : 'Repeating'
  }
  return 'Unknown'
}

const resolveType = (discount: DiscountRow): DiscountType => {
  const metaType = discount.metadata?.find(
    (entry) => entry?.key?.toLowerCase() === 'type' && entry?.value,
  )?.value
  if (metaType) {
    const normalized = metaType.toString().trim().toLowerCase()
    if (normalized === 'vendor') return 'Vendor'
    if (normalized === 'promo') return 'Promo'
    if (normalized === 'customer') return 'Customer'
  }

  const name = (discount.couponName || '').toString().trim().toUpperCase()
  if (name.startsWith('VENDOR_')) return 'Vendor'
  if (name.startsWith('PROMO_')) return 'Promo'
  return 'Customer'
}

const formatCreatedAt = (value?: string | null) => {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Unknown'
  return formatDistanceToNow(date, {addSuffix: true})
}

const buildRows = (rows: DiscountRow[]): DiscountRow[] =>
  rows.map((row) => ({
    ...row,
    code: resolveCode(row),
    customerLabel:
      row._customerName ||
      row._customerEmail ||
      (row._customerId ? `Customer ${row._customerId.slice(0, 6)}` : 'Customer'),
  }))

function CreateDiscountDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const client = useClient({apiVersion: API_VERSION})
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<CustomerOption[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null)
  const [mode, setMode] = useState<DiscountMode>('percent')
  const [value, setValue] = useState('')
  const [duration, setDuration] = useState<DiscountDuration>('once')
  const [durationMonths, setDurationMonths] = useState('')
  const [currency, setCurrency] = useState('usd')
  const [expiration, setExpiration] = useState('')
  const [promotionCode, setPromotionCode] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const term = query.trim()
    if (term.length < 2) {
      setOptions([])
      return
    }

    const timer = setTimeout(async () => {
      try {
        setLoading(true)
        const matches = await client.fetch<CustomerOption['payload'][]>(
          `*[_type == "customer" && defined(stripeCustomerId) && (name match $m || email match $m)][0...10]{
            _id, name, email, stripeCustomerId
          }`,
          {m: `${term}*`},
        )
        const normalized = (Array.isArray(matches) ? matches : [])
          .filter((entry) => entry?._id && entry?.stripeCustomerId)
          .map((entry) => ({
            value: entry._id,
            label: entry.name || entry.email || entry._id,
            subtitle: entry.email || undefined,
            payload: entry,
          }))
        setOptions(normalized)
      } catch {
        setOptions([])
      } finally {
        setLoading(false)
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [client, query])

  const optionLookup = useMemo(
    () => new Map(options.map((option) => [option.value, option])),
    [options],
  )

  const resetForm = () => {
    setSelectedCustomer(null)
    setMode('percent')
    setValue('')
    setDuration('once')
    setDurationMonths('')
    setCurrency('usd')
    setExpiration('')
    setPromotionCode('')
  }

  const handleSubmit = async () => {
    if (!selectedCustomer?.payload?.stripeCustomerId) {
      toast.push({
        status: 'warning',
        title: 'Select a customer',
        description: 'Choose a customer with a Stripe ID before creating a Stripe coupon.',
      })
      return
    }

    const parsedValue = Number(value)
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      toast.push({
        status: 'warning',
        title: 'Enter a value',
        description: 'Discount value must be a positive number.',
      })
      return
    }

    if (mode === 'percent' && parsedValue > 100) {
      toast.push({
        status: 'warning',
        title: 'Percent too high',
        description: 'Percent-off coupons must be 100 or less.',
      })
      return
    }

    let currencyCode = currency.trim().toLowerCase()
    if (mode === 'amount') {
      if (!currencyCode) {
        toast.push({
          status: 'warning',
          title: 'Choose currency',
          description: 'Select a currency for amount-based discounts.',
        })
        return
      }
      if (currencyCode.length !== 3) {
        toast.push({
          status: 'warning',
          title: 'Invalid currency',
          description: 'Currency codes should be three letters (e.g. USD).',
        })
        return
      }
    } else {
      currencyCode = ''
    }

    let durationMonthsValue: number | undefined
    if (duration === 'repeating') {
      durationMonthsValue = Number(durationMonths)
      if (!Number.isFinite(durationMonthsValue) || durationMonthsValue <= 0) {
        toast.push({
        status: 'warning',
        title: 'Set duration months',
        description: 'Enter how many months the coupon repeats.',
      })
        return
      }
    }

    let redeemBy: string | undefined
    if (expiration) {
      const timestamp = Date.parse(`${expiration}T23:59:59Z`)
      if (!Number.isFinite(timestamp)) {
        toast.push({
          status: 'warning',
          title: 'Invalid expiration',
          description: 'Use a valid date for the expiration field.',
        })
        return
      }
      redeemBy = new Date(timestamp).toISOString()
    }

    setSubmitting(true)
    try {
      const baseUrl = getNetlifyFnBase().replace(/\/$/, '')
      const res = await fetch(`${baseUrl}/.netlify/functions/createCustomerDiscount`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          customerId: selectedCustomer.payload._id,
          stripeCustomerId: selectedCustomer.payload.stripeCustomerId,
          mode,
          value: parsedValue,
          currency: currencyCode || undefined,
          duration,
          durationInMonths: durationMonthsValue,
          promotionCode: promotionCode.trim() || undefined,
          redeemBy,
          name: promotionCode.trim() || undefined,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.error) {
        throw new Error(data?.error || `Request failed (${res.status})`)
      }

      toast.push({
        status: 'success',
        title: 'Stripe coupon created',
        description: 'Stripe will sync the coupon back into this list shortly.',
      })
      resetForm()
      onCreated()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      toast.push({status: 'error', title: 'Failed to create Stripe coupon', description: message})
    } finally {
      setSubmitting(false)
    }
  }

  return open ? (
    <Dialog
      id="discounts-create-dialog"
      header="Create Stripe coupon"
      onClose={() => {
        if (!submitting) {
          resetForm()
          onClose()
        }
      }}
      width={1}
    >
      <Box padding={4}>
        <Stack space={4}>
          <Stack space={2}>
            <Text size={1} weight="semibold">
              Customer
            </Text>
            <Autocomplete<CustomerOption>
              id="discounts-customer-search"
              openButton
              icon={SearchIcon}
              loading={loading}
              options={options}
              value={selectedCustomer?.value}
              onQueryChange={(next) => setQuery(next || '')}
              placeholder="Search customers by name or email..."
              renderOption={(option) => (
                <Box padding={3}>
                  <Stack space={2}>
                    <Text weight="semibold">{option.label}</Text>
                    {option.subtitle ? (
                      <Text muted size={1}>
                        {option.subtitle}
                      </Text>
                    ) : null}
                  </Stack>
                </Box>
              )}
              renderValue={(value, option) => option?.label || value}
              onSelect={(selectedValue) => {
                const match = optionLookup.get(selectedValue)
                setSelectedCustomer(match || null)
              }}
            />
          </Stack>

          <Stack space={2}>
            <Text size={1} weight="semibold">
              Coupon type
            </Text>
            <Select
              value={mode}
              onChange={(event) => setMode(event.currentTarget.value as DiscountMode)}
              disabled={submitting}
            >
              <option value="percent">Percent off</option>
              <option value="amount">Fixed amount</option>
            </Select>
          </Stack>

          <Stack space={2}>
            <Text size={1} weight="semibold">
              Coupon value
            </Text>
            <TextInput
              value={value}
              type="number"
              onChange={(event) => setValue(event.currentTarget.value)}
              disabled={submitting}
              placeholder={mode === 'percent' ? '10 for 10% off' : '25 for $25 off'}
            />
          </Stack>

          {mode === 'amount' ? (
            <Stack space={2}>
              <Text size={1} weight="semibold">
                Currency
              </Text>
              <TextInput
                value={currency}
                onChange={(event) => setCurrency(event.currentTarget.value)}
                disabled={submitting}
                placeholder="usd"
                maxLength={3}
              />
            </Stack>
          ) : null}

          <Stack space={2}>
            <Text size={1} weight="semibold">
              Coupon duration
            </Text>
            <Select
              value={duration}
              onChange={(event) => setDuration(event.currentTarget.value as DiscountDuration)}
              disabled={submitting}
            >
              <option value="once">Once</option>
              <option value="repeating">Repeating</option>
              <option value="forever">Forever</option>
            </Select>
          </Stack>

          {duration === 'repeating' ? (
            <Stack space={2}>
            <Text size={1} weight="semibold">
              Duration in months
            </Text>
              <TextInput
                value={durationMonths}
                onChange={(event) => setDurationMonths(event.currentTarget.value)}
                disabled={submitting}
                placeholder="3"
                type="number"
              />
            </Stack>
          ) : null}

          <Stack space={2}>
            <Text size={1} weight="semibold">
              Coupon expiration (optional)
            </Text>
            <TextInput
              value={expiration}
              type="date"
              onChange={(event) => setExpiration(event.currentTarget.value)}
              disabled={submitting}
            />
          </Stack>

          <Stack space={2}>
            <Text size={1} weight="semibold">
              Stripe promotion code (optional)
            </Text>
            <TextInput
              value={promotionCode}
              onChange={(event) => setPromotionCode(event.currentTarget.value)}
              disabled={submitting}
              placeholder="CODE25"
            />
          </Stack>

          <Flex justify="flex-end" gap={3}>
            <Button
              mode="ghost"
              text="Cancel"
              onClick={() => {
                if (!submitting) {
                  resetForm()
                  onClose()
                }
              }}
              disabled={submitting}
            />
            <Button
              tone="primary"
              text="Create Stripe coupon"
              onClick={handleSubmit}
              disabled={submitting}
              loading={submitting}
            />
          </Flex>
        </Stack>
      </Box>
    </Dialog>
  ) : null
}

function DiscountsList({statusFilter}: {statusFilter?: DiscountStatus | 'all'}) {
  const client = useClient({apiVersion: API_VERSION})
  const router = useRouter()
  const [discounts, setDiscounts] = useState<DiscountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)

  const query = useMemo(() => resolveDiscountQuery(statusFilter), [statusFilter])
  const params = useMemo(
    () => (statusFilter && statusFilter !== 'all' ? {status: statusFilter} : {}),
    [statusFilter],
  )

  const loadDiscounts = useCallback(async () => {
    setLoading(true)
    try {
      const results = await client.fetch<DiscountRow[]>(query, params)
      setDiscounts(buildRows(Array.isArray(results) ? results : []))
    } catch (err) {
      console.warn('DiscountsList: failed to load discounts', err)
      setDiscounts([])
    } finally {
      setLoading(false)
    }
  }, [client, params, query])

  useEffect(() => {
    loadDiscounts()
  }, [loadDiscounts])

  const handleNavigate = useCallback(
    (row: DiscountRow) => {
      if (!row._customerId) return
      const path = row._key ? `discounts[_key=="${row._key}"]` : 'discounts'
      router.navigateIntent('edit', {id: row._customerId, type: 'customer', path})
    },
    [router],
  )

  const columns = useMemo<DataTableColumn<DiscountRow>[]>(
    () => [
      {
        key: 'code',
        title: 'Stripe Coupon',
        sortable: true,
        render: (row) => (
          <Flex align="center" gap={2}>
            <SiStripe aria-label="Stripe" color={STRIPE_COLOR} />
            <Text size={1}>{row.code || 'Unknown'}</Text>
          </Flex>
        ),
      },
      {
        key: 'value',
        title: 'Value',
        render: resolveValueLabel,
      },
      {
        key: 'status',
        title: 'Status',
        render: (row) => {
          const label = formatStatusLabel(row.status)
          const statusKey = normalizeStatus(row.status)
          const statusTone = STATUS_TONE[statusKey] || 'default'
          const typeLabel = resolveType(row)
          return (
            <Flex align="center" gap={2} wrap="wrap">
              <Badge tone={statusTone} mode="outline">
                {label}
              </Badge>
              <Badge tone={TYPE_TONE[typeLabel]} mode="outline">
                {typeLabel}
              </Badge>
            </Flex>
          )
        },
      },
      {
        key: 'duration',
        title: 'Duration',
        render: resolveDurationLabel,
      },
      {
        key: 'customer',
        title: 'Customer',
        render: (row) => (
          <Button
            mode="bleed"
            text={row.customerLabel || 'Customer'}
            iconRight={ArrowRightIcon}
            onClick={(event) => {
              event.stopPropagation()
              handleNavigate(row)
            }}
          />
        ),
      },
      {
        key: 'valid',
        title: 'Valid',
        align: 'center',
        render: (row) => {
          if (typeof row.valid !== 'boolean') return 'Unknown'
          const Icon = row.valid ? CheckmarkCircleIcon : CloseIcon
          return (
            <Flex align="center" justify="center">
              <Icon />
            </Flex>
          )
        },
      },
      {
        key: 'createdAt',
        title: 'Created',
        render: (row) => formatCreatedAt(row.createdAt),
      },
    ],
    [handleNavigate],
  )

  return (
    <Stack space={4}>
      <Card
        padding={4}
        radius={3}
        shadow={1}
        style={{backgroundColor: '#1a1a1a', border: '1px solid #333333'}}
        tone="default"
      >
        <Stack space={2}>
          <Text size={1} weight="semibold">
        About Customer Coupons (Stripe)
          </Text>
          <Text size={1}>
        This view shows only Stripe customer account-level coupons synced into customer
        records.
          </Text>
          <Text size={1}>
        For other discounts, use:
        <br />
        - Products &gt; Product Sales
        <br />
        - Quotes &gt; Quote Discounts
        <br />
        - Invoices &gt; Invoice Discounts
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
              Stripe-synced customer coupons. Open a row to jump to the customer record.
            </Text>
          </Stack>
          <Button
            tone="primary"
            text="Create Stripe Coupon"
            onClick={() => setDialogOpen(true)}
          />
        </Flex>
      </Card>

      <DataTable
        columns={columns}
        data={discounts}
        isLoading={loading}
        searchableKeys={['code', 'customerLabel', '_customerEmail', 'status']}
        onRowClick={handleNavigate}
        rowKey={(row) => row.stripeDiscountId || row._key || row.code || ''}
        emptyState="No Stripe coupons found."
      />

      <CreateDiscountDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={() => {
          setDialogOpen(false)
          loadDiscounts()
        }}
      />
    </Stack>
  )
}

export const DiscountsListAll = () => <DiscountsList statusFilter="all" />
export const DiscountsListActive = () => <DiscountsList statusFilter="active" />
export const DiscountsListExpired = () => <DiscountsList statusFilter="expired" />
export const DiscountsListScheduled = () => <DiscountsList statusFilter="scheduled" />
