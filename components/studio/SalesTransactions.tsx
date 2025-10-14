import React, { useEffect, useMemo, useState } from 'react'
import { useClient } from 'sanity'
import {
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Flex,
  Grid,
  Select,
  Spinner,
  Stack,
  Text,
  TextInput,
} from '@sanity/ui'

type RawOrder = {
  _id: string
  orderNumber?: string
  stripeSessionId?: string
  customerName?: string
  customerEmail?: string
  totalAmount?: number
  status?: string
  createdAt?: string
  _createdAt?: string
}

type RawInvoice = {
  _id: string
  invoiceNumber?: string
  orderNumber?: string
  billTo?: { name?: string | null } | null
  total?: number
  status?: string
  invoiceDate?: string
  _createdAt?: string
}

type TransactionKind = 'order' | 'invoice'

type Transaction = {
  id: string
  kind: TransactionKind
  dateLabel: string
  ref: string
  customer: string
  status: string
  total: number
  dateISO: string
  dateValue: number
}

const numberFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' })

const DATE_OPTIONS = [
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '180', label: 'Last 6 months' },
  { value: '365', label: 'Last 12 months' },
  { value: 'all', label: 'All time' },
]

const TYPE_OPTIONS: Array<{ value: 'all' | TransactionKind; label: string }> = [
  { value: 'all', label: 'All transactions' },
  { value: 'order', label: 'Orders' },
  { value: 'invoice', label: 'Invoices' },
]

const query = `{
  "orders": *[_type == "order"] | order(coalesce(createdAt, _createdAt) desc)[0...75]{
    _id,
    orderNumber,
    stripeSessionId,
    customerName,
    customerEmail,
    totalAmount,
    status,
    createdAt,
    _createdAt
  },
  "invoices": *[_type == "invoice"] | order(coalesce(invoiceDate, _createdAt) desc)[0...75]{
    _id,
    invoiceNumber,
    orderNumber,
    billTo,
    total,
    status,
    invoiceDate,
    _createdAt
  }
}`

function normalizeTransactions(payload: { orders?: RawOrder[]; invoices?: RawInvoice[] }): Transaction[] {
  const orders = Array.isArray(payload?.orders) ? payload.orders : []
  const invoices = Array.isArray(payload?.invoices) ? payload.invoices : []

  const mappedOrders: Transaction[] = orders.map((order) => {
    const dateISO = order.createdAt || order._createdAt || ''
    const dateValue = dateISO ? Date.parse(dateISO) : NaN
    const ref = order.orderNumber || order.stripeSessionId || order._id
    const customer = order.customerName || order.customerEmail || 'Customer'
    const total =
      typeof order.totalAmount === 'number' && Number.isFinite(order.totalAmount) ? order.totalAmount : 0
    return {
      id: order._id,
      kind: 'order',
      dateLabel: dateISO ? dateFormatter.format(new Date(dateISO)) : '—',
      ref,
      customer,
      status: order.status || 'pending',
      total,
      dateISO: dateISO || new Date().toISOString(),
      dateValue: Number.isFinite(dateValue) ? dateValue : Date.now(),
    }
  })

  const mappedInvoices: Transaction[] = invoices.map((invoice) => {
    const dateISO = invoice.invoiceDate || invoice._createdAt || ''
    const dateValue = dateISO ? Date.parse(dateISO) : NaN
    const ref = invoice.invoiceNumber || invoice.orderNumber || invoice._id
    const customer = invoice.billTo?.name || 'Invoice'
    const total = typeof invoice.total === 'number' && Number.isFinite(invoice.total) ? invoice.total : 0
    return {
      id: invoice._id,
      kind: 'invoice',
      dateLabel: dateISO ? dateFormatter.format(new Date(dateISO)) : '—',
      ref,
      customer,
      status: invoice.status || 'pending',
      total,
      dateISO: dateISO || new Date().toISOString(),
      dateValue: Number.isFinite(dateValue) ? dateValue : Date.now(),
    }
  })

  return [...mappedOrders, ...mappedInvoices].sort((a, b) => b.dateValue - a.dateValue)
}

function getBadgeTone(kind: TransactionKind, status: string): 'positive' | 'caution' | 'primary' | 'critical' {
  const normalized = status.toLowerCase()
  if (normalized === 'paid' || normalized === 'fulfilled' || normalized === 'succeeded') return 'positive'
  if (normalized === 'pending' || normalized === 'processing') return 'caution'
  if (normalized === 'cancelled' || normalized === 'refunded' || normalized === 'failed') return 'critical'
  return kind === 'order' ? 'primary' : 'caution'
}

export default function SalesTransactions() {
  const client = useClient({ apiVersion: '2024-10-01' })
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionKind>('all')
  const [dateFilter, setDateFilter] = useState<string>('365')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [customerSearch, setCustomerSearch] = useState<string>('')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await client.fetch(query)
        if (!cancelled) {
          setTransactions(normalizeTransactions(data))
        }
      } catch (err: any) {
        if (!cancelled) setError(String(err?.message || err || 'Failed to load transactions'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    const sub = client.listen(query, {}, { tag: 'sales-transactions', visibility: 'query' }).subscribe(load)
    return () => {
      cancelled = true
      try { sub.unsubscribe() } catch {}
    }
  }, [client])

  const filtered = useMemo(() => {
    const term = customerSearch.trim().toLowerCase()
    const days = dateFilter === 'all' ? null : Number(dateFilter)
    const cutoff = days && Number.isFinite(days) ? Date.now() - days * 24 * 60 * 60 * 1000 : null

    return transactions.filter((txn) => {
      if (typeFilter !== 'all' && txn.kind !== typeFilter) return false
      if (cutoff && txn.dateValue < cutoff) return false
      if (statusFilter !== 'all' && txn.status.toLowerCase() !== statusFilter) return false
      if (term && !`${txn.customer} ${txn.ref}`.toLowerCase().includes(term)) return false
      return true
    })
  }, [transactions, typeFilter, dateFilter, statusFilter, customerSearch])

  const summary = useMemo(() => {
    const totalRevenue = filtered.reduce((sum, txn) => sum + txn.total, 0)
    const orderCount = filtered.filter((txn) => txn.kind === 'order').length
    const invoiceCount = filtered.filter((txn) => txn.kind === 'invoice').length
    return { totalRevenue, orderCount, invoiceCount }
  }, [filtered])

  const statusBuckets = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>()
    filtered.forEach((txn) => {
      const key = txn.status.toLowerCase()
      if (!map.has(key)) map.set(key, { count: 0, total: 0 })
      const bucket = map.get(key)!
      bucket.count += 1
      bucket.total += txn.total
    })
    return Array.from(map.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5)
  }, [filtered])

  const allStatuses = useMemo(() => {
    const set = new Set<string>()
    transactions.forEach((txn) => set.add(txn.status.toLowerCase()))
    return Array.from(set)
  }, [transactions])

  const activeTransaction = useMemo(
    () => filtered.find((txn) => txn.id === activeId) || null,
    [filtered, activeId]
  )

  function handleOpenDocument(txn: Transaction) {
    const docType = txn.kind === 'order' ? 'order' : 'invoice'
    const href = `#/desk/${docType};${txn.id}`
    if (typeof window !== 'undefined') {
      window.open(href, '_blank', 'noopener')
    }
  }

  function handleSelect(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function handleSelectAll(checked: boolean) {
    if (!checked) {
      setSelectedIds(new Set())
      return
    }
    setSelectedIds(new Set(filtered.map((txn) => txn.id)))
  }

  return (
    <Flex height="fill">
      <Box padding={4} style={{ flex: 1, overflow: 'auto' }}>
        <Stack space={4}>
          <Flex justify="space-between" align="center">
            <Text size={3} weight="bold">
              Sales Transactions
            </Text>
            <Flex gap={3}>
              <Button text="Batch actions" mode="ghost" tone="positive" disabled={selectedIds.size === 0} />
              <Button text="New transaction" tone="primary" />
            </Flex>
          </Flex>

          <Grid columns={[1, 3]} gap={3}>
            <Card padding={3} radius={3} shadow={1}>
              <Stack space={2}>
                <Text size={1} muted>
                  Total Revenue
                </Text>
                <Text size={3} weight="bold">
                  {numberFormatter.format(summary.totalRevenue)}
                </Text>
              </Stack>
            </Card>
            <Card padding={3} radius={3} shadow={1}>
              <Stack space={2}>
                <Text size={1} muted>
                  Orders
                </Text>
                <Text size={3} weight="bold">
                  {summary.orderCount}
                </Text>
              </Stack>
            </Card>
            <Card padding={3} radius={3} shadow={1}>
              <Stack space={2}>
                <Text size={1} muted>
                  Invoices
                </Text>
                <Text size={3} weight="bold">
                  {summary.invoiceCount}
                </Text>
              </Stack>
            </Card>
          </Grid>

          {statusBuckets.length > 0 && (
            <Flex gap={2}>
              {statusBuckets.map(([status, info], index) => {
                const palette = ['#2563eb', '#8b5cf6', '#f97316', '#9ca3af', '#16a34a']
                const color = palette[index % palette.length]
                return (
                  <Card key={status} padding={3} radius={2} shadow={1} style={{ borderLeft: `6px solid ${color}` }}>
                    <Stack space={2}>
                      <Text size={1} muted>
                        {status.toUpperCase()}
                      </Text>
                      <Text size={3} weight="bold">
                        {numberFormatter.format(info.total)}
                      </Text>
                      <Text size={1} muted>
                        {info.count} transactions
                      </Text>
                    </Stack>
                  </Card>
                )
              })}
            </Flex>
          )}

          <Card padding={3} radius={3} shadow={1}>
            <Flex wrap="wrap" gap={3}>
              <Flex direction="column" style={{ minWidth: 200 }}>
                <Text size={1} muted>
                  Type
                </Text>
                <Select value={typeFilter} onChange={(event) => setTypeFilter(event.currentTarget.value as any)}>
                  {TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </Flex>
              <Flex direction="column" style={{ minWidth: 200 }}>
                <Text size={1} muted>
                  Date
                </Text>
                <Select value={dateFilter} onChange={(event) => setDateFilter(event.currentTarget.value)}>
                  {DATE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </Flex>
              <Flex direction="column" style={{ minWidth: 220 }}>
                <Text size={1} muted>
                  Customer
                </Text>
                <TextInput
                  value={customerSearch}
                  placeholder="Search"
                  onChange={(event) => setCustomerSearch(event.currentTarget.value)}
                />
              </Flex>
              <Flex direction="column" style={{ minWidth: 200 }}>
                <Text size={1} muted>
                  Status
                </Text>
                <Select value={statusFilter} onChange={(event) => setStatusFilter(event.currentTarget.value)}>
                  <option value="all">All statuses</option>
                  {allStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status.toUpperCase()}
                    </option>
                  ))}
                </Select>
              </Flex>
            </Flex>
          </Card>

          {loading ? (
            <Flex align="center" justify="center" padding={5}>
              <Spinner muted />
            </Flex>
          ) : error ? (
            <Card padding={3} radius={3} tone="critical">
              <Text>{error}</Text>
            </Card>
          ) : filtered.length === 0 ? (
            <Card padding={3} radius={3} tone="transparent">
              <Text muted>No transactions match the current filters.</Text>
            </Card>
          ) : (
            <Card padding={0} radius={3} shadow={1} tone="transparent">
              <Box style={{ borderBottom: '1px solid var(--card-border-color)' }}>
                <Flex
                  style={{
                    padding: '12px 16px',
                    display: 'grid',
                    gridTemplateColumns: '40px 120px 120px 140px 1fr 140px 120px 140px',
                    gap: '12px',
                    fontSize: 12,
                    textTransform: 'uppercase',
                    letterSpacing: '0.02em',
                    color: 'var(--card-muted-fg-color)',
                  }}
                >
                  <span>
                    <Checkbox
                      checked={selectedIds.size === filtered.length && filtered.length > 0}
                      indeterminate={selectedIds.size > 0 && selectedIds.size < filtered.length}
                      onChange={(event) => handleSelectAll(event.currentTarget.checked)}
                    />
                  </span>
                  <span>Date</span>
                  <span>Type</span>
                  <span>No.</span>
                  <span>Customer</span>
                  <span>Memo</span>
                  <span style={{ textAlign: 'right' }}>Amount</span>
                  <span>Status</span>
                </Flex>
              </Box>
              <Box>
                {filtered.map((txn) => (
                  <Flex
                    key={txn.id}
                    onClick={() => setActiveId(txn.id)}
                    style={{
                      padding: '12px 16px',
                      display: 'grid',
                      gridTemplateColumns: '40px 120px 120px 140px 1fr 140px 120px 140px',
                      gap: '12px',
                      alignItems: 'center',
                      cursor: 'pointer',
                      backgroundColor: txn.id === activeId ? '#f1f5f9' : undefined,
                      borderBottom: '1px solid var(--card-border-color)',
                    }}
                  >
                    <span>
                      <Checkbox
                        checked={selectedIds.has(txn.id)}
                        onChange={(event) => {
                          event.stopPropagation()
                          handleSelect(txn.id, event.currentTarget.checked)
                        }}
                      />
                    </span>
                    <span>{txn.dateLabel}</span>
                    <span>{txn.kind === 'order' ? 'Order' : 'Invoice'}</span>
                    <span>{txn.ref}</span>
                    <span>{txn.customer}</span>
                    <span>{txn.kind === 'order' ? 'Website checkout' : 'Invoice'}</span>
                    <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {numberFormatter.format(txn.total)}
                    </span>
                    <span>
                      <Badge tone={getBadgeTone(txn.kind, txn.status)}>{txn.status || 'unknown'}</Badge>
                    </span>
                  </Flex>
                ))}
              </Box>
              <Flex justify="flex-end" padding={3}>
                <Text size={1} muted>
                  Total: {numberFormatter.format(filtered.reduce((sum, txn) => sum + txn.total, 0))}
                </Text>
              </Flex>
            </Card>
          )}
        </Stack>
      </Box>

      <Box
        padding={4}
        style={{
          width: 360,
          borderLeft: '1px solid var(--card-border-color)',
          background: 'var(--card-background-color)',
          overflow: 'auto',
        }}
      >
        {activeTransaction ? (
          <Stack space={4}>
            <Flex justify="space-between" align="flex-start">
              <Stack space={1}>
                <Text size={1} muted>
                  {activeTransaction.status.toUpperCase()}
                </Text>
                <Text size={4} weight="bold">
                  {numberFormatter.format(activeTransaction.total)}
                </Text>
                <Text size={1} muted>
                  {dateFormatter.format(new Date(activeTransaction.dateISO))}
                </Text>
              </Stack>
              <Button
                mode="ghost"
                text="Open record"
                onClick={() => handleOpenDocument(activeTransaction)}
              />
            </Flex>

            <Stack space={3}>
              <Card padding={3} radius={2} shadow={1}>
                <Stack space={2}>
                  <Text size={1} muted>
                    Customer
                  </Text>
                  <Text size={2} weight="medium">
                    {activeTransaction.customer}
                  </Text>
                </Stack>
              </Card>

              <Card padding={3} radius={2} shadow={1}>
                <Stack space={2}>
                  <Text size={1} muted>
                    Transaction Details
                  </Text>
                  <Text size={2}>Reference: {activeTransaction.ref}</Text>
                  <Text size={1} muted>
                    Type: {activeTransaction.kind === 'order' ? 'Order' : 'Invoice'}
                  </Text>
                </Stack>
              </Card>

              <Flex gap={2}>
                <Button text="More actions" tone="positive" mode="ghost" />
                <Button
                  text="Edit"
                  tone="primary"
                  mode="ghost"
                  onClick={() => handleOpenDocument(activeTransaction)}
                />
              </Flex>
            </Stack>
          </Stack>
        ) : (
          <Flex height="fill" align="center" justify="center">
            <Text muted>Select a transaction to view details</Text>
          </Flex>
        )}
      </Box>
    </Flex>
  )
}
