import React, {useCallback, useEffect, useMemo, useRef, useState, type CSSProperties} from 'react'
import {useClient} from 'sanity'
import {useRouter} from 'sanity/router'
import {Spinner, useToast} from '@sanity/ui'
import {formatOrderNumber} from '../../utils/orderNumber'

type RawInvoice = {
  _id: string
  _createdAt: string
  _updatedAt?: string
  invoiceNumber?: string
  orderNumber?: string
  invoiceDate?: string
  dueDate?: string
  status?: string
  total?: number
  amount?: number
  amountSubtotal?: number
  amountTax?: number
  billTo?: {name?: string; email?: string}
  customerRef?: {name?: string; email?: string; firstName?: string; lastName?: string}
}

type InvoiceRecord = {
  id: string
  invoiceNumber: string
  customerName: string
  status: 'pending' | 'paid' | 'refunded' | 'partially_refunded' | 'cancelled'
  statusLabel: string
  amount: number
  invoiceDateIso: string
  invoiceDateMs: number
  dueDateIso: string | null
  dueDateMs: number | null
  isOverdue: boolean
  isClosed: boolean
  reference: string
}

const DAY = 24 * 60 * 60 * 1000
const CLOSED_STATUSES = new Set(['paid', 'refunded', 'partially_refunded', 'cancelled'])

const STATUS_OPTIONS: Array<{value: string; label: string}> = [
  {value: 'all', label: 'All'},
  {value: 'open', label: 'Open'},
  {value: 'overdue', label: 'Overdue'},
  {value: 'pending', label: 'Pending'},
  {value: 'paid', label: 'Paid'},
  {value: 'refunded', label: 'Refunded'},
  {value: 'cancelled', label: 'Cancelled'},
]

const DATE_OPTIONS: Array<{value: string; label: string; days?: number}> = [
  {value: '12m', label: 'Last 12 months', days: 365},
  {value: '90d', label: 'Last 90 days', days: 90},
  {value: '30d', label: 'Last 30 days', days: 30},
  {value: 'all', label: 'All time'},
]

const currency = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'})
const shortDate = new Intl.DateTimeFormat('en-US', {
  month: 'numeric',
  day: 'numeric',
  year: '2-digit',
})

const GRID_TEMPLATE_COLUMNS = '40px 160px 140px 160px minmax(220px, 1fr) 140px 160px 140px'
const GRID_COLUMN_GAP = 12
const INVOICE_STICKY_LEFT = 40 + GRID_COLUMN_GAP
const HEADER_BACKGROUND_COLOR = '#ffffff'
const ROW_BACKGROUND_COLOR = '#ffffff'
const ROW_SELECTED_BACKGROUND = 'rgba(16, 185, 129, 0.12)'
const STICKY_INVOICE_BOX_SHADOW = '2px 0 0 rgba(15, 23, 42, 0.08)'

const STICKY_CHECKBOX_BASE: CSSProperties = {
  position: 'sticky',
  left: 0,
  zIndex: 3,
  display: 'inline-flex',
  alignItems: 'center',
  height: '100%',
}

const STICKY_INVOICE_BASE: CSSProperties = {
  position: 'sticky',
  left: INVOICE_STICKY_LEFT,
  zIndex: 2,
  display: 'inline-flex',
  alignItems: 'center',
  height: '100%',
  boxShadow: STICKY_INVOICE_BOX_SHADOW,
}

function normalizeAmount(document: RawInvoice): number {
  const direct = Number(document.total ?? document.amount)
  const subtotal = Number(document.amountSubtotal) || 0
  const tax = Number(document.amountTax) || 0
  let amount = 0

  if (Number.isFinite(direct) && direct !== 0) {
    amount = direct
  } else if (subtotal || tax) {
    amount = subtotal + tax
  }

  if (amount >= 100000) {
    amount = amount / 100
  }

  return Number.isFinite(amount) ? amount : 0
}

function resolveCustomerName(invoice: RawInvoice): string {
  const candidates = [
    invoice.billTo?.name,
    invoice.customerRef?.name,
    [invoice.customerRef?.firstName, invoice.customerRef?.lastName].filter(Boolean).join(' '),
    invoice.billTo?.email,
    invoice.customerRef?.email,
  ]
  const name = candidates.map((value) => (value || '').trim()).find(Boolean)
  return name || 'Unnamed customer'
}

function toMs(value?: string | null): number | null {
  if (!value) return null
  const ts = Date.parse(value)
  return Number.isFinite(ts) ? ts : null
}

function normalizeStatus(value?: string): 'pending' | 'paid' | 'refunded' | 'cancelled' {
  const normalized = (value || 'pending').toLowerCase()
  if (normalized === 'paid' || normalized === 'refunded' || normalized === 'cancelled') {
    return normalized
  }
  return 'pending'
}

function statusLabel(status: InvoiceRecord['status']): string {
  switch (status) {
    case 'paid':
      return 'Paid'
    case 'refunded':
      return 'Refunded'
    case 'cancelled':
      return 'Cancelled'
    default:
      return 'Pending'
  }
}

const InvoiceDashboard = React.forwardRef<HTMLDivElement, Record<string, never>>((_props, ref) => {
  const client = useClient({apiVersion: '2024-10-01'})
  const router = useRouter()
  const toast = useToast()

  const [invoices, setInvoices] = useState<InvoiceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('12m')
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchMenuOpen, setBatchMenuOpen] = useState(false)
  const selectAllRef = useRef<HTMLInputElement | null>(null)
  const batchButtonRef = useRef<HTMLButtonElement | null>(null)
  const batchMenuRef = useRef<HTMLDivElement | null>(null)
  const [compactHeader, setCompactHeader] = useState(false)

  const hasSelections = selectedIds.size > 0

  const fetchInvoices = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result: RawInvoice[] = await client.fetch(
        `*[_type == "invoice" && !(_id in path("drafts.**"))]{
          _id,
          _createdAt,
          _updatedAt,
          invoiceNumber,
          orderNumber,
          invoiceDate,
          dueDate,
          status,
          total,
          amount,
          amountSubtotal,
          amountTax,
          billTo{ name, email },
          customerRef->{ name, email, firstName, lastName }
        } | order(coalesce(dueDate, invoiceDate, _createdAt) desc)`,
      )

      const now = Date.now()
      const normalized = result.map((invoice) => {
        const amount = normalizeAmount(invoice)
        const invoiceDateIso = invoice.invoiceDate || invoice._createdAt
        const invoiceDateMs = toMs(invoiceDateIso) ?? now
        const dueDateIso = invoice.dueDate || null
        const dueDateMs = toMs(dueDateIso) ?? null
        const status = normalizeStatus(invoice.status)
        const isClosed = CLOSED_STATUSES.has(status)
        const isOverdue = !isClosed && Boolean(dueDateMs) && dueDateMs! < now

        const orderRef = formatOrderNumber(invoice.orderNumber) || invoice.orderNumber

        return {
          id: invoice._id,
          invoiceNumber: invoice.invoiceNumber || orderRef || invoice._id.slice(-6),
          customerName: resolveCustomerName(invoice),
          status,
          statusLabel: statusLabel(status),
          amount,
          invoiceDateIso,
          invoiceDateMs,
          dueDateIso,
          dueDateMs,
          isOverdue,
          isClosed,
          reference: invoice.invoiceNumber || orderRef || '',
        } satisfies InvoiceRecord
      })

      setInvoices(normalized)
    } catch (err: any) {
      setError(err?.message || 'Failed to load invoices')
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    fetchInvoices()
  }, [fetchInvoices])

  const metrics = useMemo(() => {
    const now = Date.now()
    const yearAgo = now - 365 * DAY
    const monthAgo = now - 30 * DAY

    let unpaidYear = 0
    let overdue = 0
    let notDue = 0
    let paidRecent = 0

    invoices.forEach((invoice) => {
      const amount = invoice.amount
      if (!Number.isFinite(amount) || amount <= 0) return

      if (!invoice.isClosed && invoice.invoiceDateMs >= yearAgo) {
        unpaidYear += amount
      }

      if (!invoice.isClosed) {
        if (invoice.isOverdue) overdue += amount
        else notDue += amount
      }

      if (invoice.status === 'paid' && invoice.invoiceDateMs >= monthAgo) {
        paidRecent += amount
      }
    })

    return {
      unpaidYear,
      overdue,
      notDue,
      paidRecent,
    }
  }, [invoices])

  const filteredInvoices = useMemo(() => {
    const now = Date.now()
    const searchTerm = search.trim().toLowerCase()
    const {days} = DATE_OPTIONS.find((option) => option.value === dateFilter) || {}
    const minDate = days ? now - days * DAY : null

    return invoices
      .filter((invoice) => {
        if (statusFilter === 'overdue' && !invoice.isOverdue) return false
        if (statusFilter === 'open' && invoice.isClosed) return false
        if (
          statusFilter !== 'all' &&
          statusFilter !== 'open' &&
          statusFilter !== 'overdue' &&
          invoice.status !== statusFilter
        ) {
          return false
        }

        if (minDate && invoice.invoiceDateMs < minDate) return false

        if (!searchTerm) return true

        return (
          invoice.invoiceNumber.toLowerCase().includes(searchTerm) ||
          invoice.reference.toLowerCase().includes(searchTerm) ||
          invoice.customerName.toLowerCase().includes(searchTerm)
        )
      })
      .sort((a, b) => {
        const aDue = a.dueDateMs ?? a.invoiceDateMs
        const bDue = b.dueDateMs ?? b.invoiceDateMs
        return bDue - aDue
      })
  }, [invoices, statusFilter, dateFilter, search])

  const handleSelect = useCallback((invoiceId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(invoiceId)
      else next.delete(invoiceId)
      return next
    })
  }, [])

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (!checked) {
        setSelectedIds(new Set())
        return
      }
      setSelectedIds(new Set(filteredInvoices.map((invoice) => invoice.id)))
    },
    [filteredInvoices],
  )

  useEffect(() => {
    setSelectedIds((prev) => {
      const allowed = new Set(filteredInvoices.map((invoice) => invoice.id))
      const next = new Set<string>()
      prev.forEach((id) => {
        if (allowed.has(id)) next.add(id)
      })
      return next
    })
  }, [filteredInvoices])

  useEffect(() => {
    if (!selectAllRef.current) return
    const total = filteredInvoices.length
    const selected = selectedIds.size
    selectAllRef.current.indeterminate = selected > 0 && selected < total
    if (total === 0) {
      selectAllRef.current.checked = false
    } else {
      selectAllRef.current.checked = selected > 0 && selected === total
    }
  }, [filteredInvoices, selectedIds])

  const runBatchMarkPaid = useCallback(async () => {
    if (selectedIds.size === 0) {
      toast.push({status: 'warning', title: 'Select invoices first'})
      return
    }
    if (
      !window.confirm(
        `Mark ${selectedIds.size} invoice${selectedIds.size === 1 ? '' : 's'} as paid?`,
      )
    ) {
      return
    }

    try {
      setBatchLoading(true)
      const tx = client.transaction()
      selectedIds.forEach((id) => {
        tx.patch(id, {set: {status: 'paid'}})
      })
      await tx.commit({autoGenerateArrayKeys: true})
      toast.push({status: 'success', title: 'Invoices updated'})
      setSelectedIds(new Set())
      await fetchInvoices()
    } catch (err: any) {
      console.error('InvoiceDashboard batch mark paid failed', err)
      toast.push({
        status: 'error',
        title: 'Could not update invoices',
        description: err?.message || 'Check console for details',
      })
    } finally {
      setBatchLoading(false)
    }
  }, [client, fetchInvoices, selectedIds, toast])

  const handleBatchMarkPaidClick = useCallback(() => {
    setBatchMenuOpen(false)
    void runBatchMarkPaid()
  }, [runBatchMarkPaid])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handleScroll = () => {
      const offset = window.scrollY || 0
      setCompactHeader(offset > 80)
    }
    handleScroll()
    window.addEventListener('scroll', handleScroll, {passive: true})
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (!batchMenuOpen) return undefined

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (batchButtonRef.current?.contains(target) || batchMenuRef.current?.contains(target)) {
        return
      }
      setBatchMenuOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setBatchMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [batchMenuOpen])

  useEffect(() => {
    if (!hasSelections) {
      setBatchMenuOpen(false)
    }
  }, [hasSelections])

  useEffect(() => {
    if (batchLoading) {
      setBatchMenuOpen(false)
    }
  }, [batchLoading])

  const openInvoice = (invoiceId: string) => {
    router.navigateIntent('edit', {id: invoiceId, type: 'invoice'})
  }

  const createInvoice = () => {
    router.navigateIntent('create', {type: 'invoice'})
  }

  const badgeClass = (invoice: InvoiceRecord) => {
    if (invoice.isOverdue) return 'text-rose-600 bg-rose-50 border border-rose-100'
    if (invoice.status === 'paid') return 'text-emerald-600 bg-emerald-50 border border-emerald-100'
    if (invoice.status === 'refunded') return 'text-sky-600 bg-sky-50 border border-sky-100'
    if (invoice.status === 'partially_refunded')
      return 'text-amber-600 bg-amber-50 border border-amber-100'
    if (invoice.status === 'cancelled')
      return 'text-[var(--studio-muted)] bg-[var(--studio-surface-soft)] border border-[var(--studio-border)]'
    return 'text-amber-600 bg-amber-50 border border-amber-100'
  }

  return (
    <div ref={ref} className="studio-surface flex h-full min-h-0 flex-col rounded-3xl">
      <div
        className="border-b border-[var(--studio-border)] backdrop-blur"
        style={{background: 'var(--studio-surface-strong)'}}
      >
        <div
          className={`sticky top-0 z-20 flex flex-col gap-4 px-4 transition-all duration-200 backdrop-blur sm:px-6 ${
            compactHeader
              ? 'py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between'
              : 'py-5 sm:flex-row sm:items-start sm:justify-between'
          }`}
          style={{background: 'var(--studio-surface-strong)'}}
        >
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1
                className={`text-xs font-semibold uppercase tracking-wide text-[var(--studio-muted)] transition-all duration-200 ${
                  compactHeader ? 'opacity-80' : ''
                }`}
              >
                Invoices
              </h1>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={createInvoice}
                className="inline-flex items-center justify-center whitespace-nowrap rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
              >
                Create Invoice
              </button>
              <div className="relative">
                <button
                  type="button"
                  ref={batchButtonRef}
                  onClick={() => {
                    if (batchLoading) return
                    setBatchMenuOpen((prev) => !prev)
                  }}
                  disabled={batchLoading}
                  aria-haspopup="menu"
                  aria-expanded={batchMenuOpen}
                  className={`inline-flex items-center justify-center whitespace-nowrap rounded-md border border-[var(--studio-border-strong)] px-3 py-1.5 text-xs font-medium shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 ${
                    hasSelections
                      ? 'text-[var(--studio-muted)] hover:bg-[var(--studio-surface-soft)]'
                      : 'text-[rgba(148,163,184,0.7)] hover:bg-[var(--studio-surface-strong)]'
                  } ${batchMenuOpen ? 'bg-[var(--studio-surface-soft)]' : ''} disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {batchLoading ? 'Working…' : 'Batch actions'}
                </button>
                {batchMenuOpen ? (
                  <div
                    ref={batchMenuRef}
                    role="menu"
                    aria-label="Batch actions"
                    className="absolute right-0 top-full z-30 mt-2 w-44 overflow-hidden rounded-md border border-[var(--studio-border)] bg-[var(--studio-surface-strong)] shadow-lg"
                  >
                    <button
                      type="button"
                      onClick={handleBatchMarkPaidClick}
                      role="menuitem"
                      disabled={!hasSelections || batchLoading}
                      className="flex w-full items-center justify-between px-3 py-2 text-sm text-[var(--studio-text)] transition hover:bg-[var(--studio-surface-soft)] disabled:cursor-not-allowed disabled:text-[rgba(148,163,184,0.7)]"
                    >
                      <span>Mark selected paid</span>
                      {hasSelections ? (
                        <span className="text-xs text-[rgba(148,163,184,0.7)]">
                          {selectedIds.size}
                        </span>
                      ) : null}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className="border-b border-[var(--studio-border)]"
        style={{background: 'var(--studio-surface-strong)'}}
      >
        <div className="-mx-2 flex gap-3 overflow-x-auto px-4 pb-4 pt-4 sm:-mx-3 sm:px-6 lg:grid lg:grid-cols-5 lg:gap-3 lg:overflow-visible lg:px-6 lg:pb-6 lg:pt-6">
          <div className="min-w-[150px] flex-shrink-0 sm:min-w-[170px] lg:min-w-0 lg:flex-shrink">
            <SummaryCard title="Unpaid" subtitle="Last 12 months" amount={metrics.unpaidYear} />
          </div>
          <div className="min-w-[150px] flex-shrink-0 sm:min-w-[170px] lg:min-w-0 lg:flex-shrink">
            <SummaryCard title="Overdue" subtitle="Outstanding now" amount={metrics.overdue} />
          </div>
          <div className="min-w-[150px] flex-shrink-0 sm:min-w-[170px] lg:min-w-0 lg:flex-shrink">
            <SummaryCard title="Not due yet" subtitle="Pending invoices" amount={metrics.notDue} />
          </div>
          <div className="min-w-[150px] flex-shrink-0 sm:min-w-[170px] lg:min-w-0 lg:flex-shrink">
            <SummaryCard title="Paid" subtitle="Last 30 days" amount={metrics.paidRecent} />
          </div>
          <div className="min-w-[150px] flex-shrink-0 sm:min-w-[170px] lg:min-w-0 lg:flex-shrink">
            <SummaryCard
              title="Outstanding"
              subtitle="Current balance"
              amount={metrics.overdue + metrics.notDue}
              footer={
                <div className="mt-2 space-y-1 text-[11px] text-[var(--studio-muted)]">
                  <div>Overdue {currency.format(metrics.overdue)}</div>
                  <div>Not due {currency.format(metrics.notDue)}</div>
                </div>
              }
            />
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
        <div
          className="border-b border-[var(--studio-border)] px-6 py-4 backdrop-blur"
          style={{background: 'var(--studio-surface-strong)'}}
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <label className="flex items-center gap-2 text-sm text-[var(--studio-muted)]">
                Status
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.currentTarget.value)}
                  className="rounded-md border border-[var(--studio-border-strong)] px-2 py-1 text-sm text-[var(--studio-text)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2 text-sm text-[var(--studio-muted)]">
                Date
                <select
                  value={dateFilter}
                  onChange={(event) => setDateFilter(event.currentTarget.value)}
                  className="rounded-md border border-[var(--studio-border-strong)] px-2 py-1 text-sm text-[var(--studio-text)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  {DATE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="search"
                placeholder="Search number or customer…"
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                className="w-full rounded-md border border-[var(--studio-border-strong)] px-3 py-2 text-sm text-[var(--studio-text)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 lg:w-64"
              />
              {loading ? (
                <div className="flex items-center justify-center rounded-md border border-[var(--studio-border)] px-3 py-2">
                  <Spinner />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={fetchInvoices}
                  className="rounded-md border border-[var(--studio-border-strong)] px-3 py-2 text-sm text-[var(--studio-muted)] shadow-sm"
                >
                  Refresh
                </button>
              )}
            </div>
          </div>
        </div>

        <div
          className="flex-1 min-h-0 overflow-auto"
          style={{background: 'var(--studio-surface-overlay)'}}
        >
          <div className="px-6 py-4">
            <div className="rounded-xl border border-[var(--studio-border)] bg-[var(--studio-surface-strong)] shadow-sm">
              <div style={{overflowX: 'auto'}}>
                <div style={{borderBottom: '1px solid var(--card-border-color)'}}>
                  <div
                    style={{
                      padding: '12px 16px',
                      display: 'grid',
                      gridTemplateColumns: GRID_TEMPLATE_COLUMNS,
                      gap: `${GRID_COLUMN_GAP}px`,
                      fontSize: 12,
                      textTransform: 'uppercase',
                      letterSpacing: '0.02em',
                      color: 'var(--card-muted-fg-color)',
                      width: 'max-content',
                      background: HEADER_BACKGROUND_COLOR,
                    }}
                  >
                    <span
                      style={{
                        ...STICKY_CHECKBOX_BASE,
                        background: HEADER_BACKGROUND_COLOR,
                        zIndex: 4,
                      }}
                    >
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        className="h-4 w-4 rounded border-[var(--studio-border-strong)] text-emerald-600 focus:ring-emerald-500"
                        onChange={(event) => handleSelectAll(event.currentTarget.checked)}
                      />
                    </span>
                    <span
                      style={{
                        ...STICKY_INVOICE_BASE,
                        background: HEADER_BACKGROUND_COLOR,
                        zIndex: 3,
                        fontWeight: 600,
                      }}
                    >
                      Invoice
                    </span>
                    <span>Date</span>
                    <span>Due</span>
                    <span>Customer</span>
                    <span style={{textAlign: 'right'}}>Amount</span>
                    <span>Status</span>
                    <span style={{textAlign: 'right'}}>Action</span>
                  </div>
                </div>
                <div>
                  {error ? (
                    <div
                      className="text-sm text-rose-600"
                      style={{
                        padding: '20px 24px',
                        width: 'max-content',
                        background: ROW_BACKGROUND_COLOR,
                      }}
                    >
                      {error}
                    </div>
                  ) : loading ? (
                    <div
                      className="text-sm text-[var(--studio-muted)]"
                      style={{
                        padding: '20px 24px',
                        width: 'max-content',
                        background: ROW_BACKGROUND_COLOR,
                      }}
                    >
                      Loading invoices…
                    </div>
                  ) : filteredInvoices.length === 0 ? (
                    <div
                      className="text-sm text-[var(--studio-muted)]"
                      style={{
                        padding: '20px 24px',
                        width: 'max-content',
                        background: ROW_BACKGROUND_COLOR,
                      }}
                    >
                      No invoices match the current filters.
                    </div>
                  ) : (
                    filteredInvoices.map((invoice) => {
                      const isSelected = selectedIds.has(invoice.id)
                      const rowBackground = isSelected
                        ? ROW_SELECTED_BACKGROUND
                        : ROW_BACKGROUND_COLOR

                      return (
                        <div
                          key={invoice.id}
                          onClick={() => openInvoice(invoice.id)}
                          style={{
                            padding: '14px 16px',
                            display: 'grid',
                            gridTemplateColumns: GRID_TEMPLATE_COLUMNS,
                            gap: `${GRID_COLUMN_GAP}px`,
                            alignItems: 'center',
                            cursor: 'pointer',
                            borderBottom: '1px solid var(--card-border-color)',
                            width: 'max-content',
                            backgroundColor: rowBackground,
                          }}
                          className="hover:bg-[var(--studio-surface-overlay)]"
                        >
                          <span
                            onClick={(event) => {
                              event.stopPropagation()
                            }}
                            style={{...STICKY_CHECKBOX_BASE, background: rowBackground}}
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-[var(--studio-border-strong)] text-emerald-600 focus:ring-emerald-500"
                              checked={isSelected}
                              onChange={(event) => {
                                event.stopPropagation()
                                handleSelect(invoice.id, event.currentTarget.checked)
                              }}
                            />
                          </span>
                          <span
                            style={{
                              ...STICKY_INVOICE_BASE,
                              background: rowBackground,
                              fontWeight: 600,
                              color: '#0f172a',
                            }}
                          >
                            {invoice.invoiceNumber}
                          </span>
                          <span className="text-[var(--studio-muted)]">
                            {invoice.invoiceDateIso
                              ? shortDate.format(new Date(invoice.invoiceDateIso))
                              : '—'}
                          </span>
                          <span className="text-[var(--studio-muted)]">
                            {invoice.dueDateIso
                              ? shortDate.format(new Date(invoice.dueDateIso))
                              : '—'}
                          </span>
                          <span className="text-[var(--studio-text)]">{invoice.customerName}</span>
                          <span
                            style={{textAlign: 'right', fontVariantNumeric: 'tabular-nums'}}
                            className="font-medium text-[var(--studio-text)]"
                          >
                            {currency.format(invoice.amount || 0)}
                          </span>
                          <span>
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass(
                                invoice,
                              )}`}
                            >
                              {invoice.isOverdue ? 'Overdue' : invoice.statusLabel}
                            </span>
                          </span>
                          <span style={{textAlign: 'right'}}>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                openInvoice(invoice.id)
                              }}
                              className="text-sm font-semibold text-blue-600 hover:text-blue-500"
                            >
                              View / Edit
                            </button>
                          </span>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

InvoiceDashboard.displayName = 'InvoiceDashboard'

const SummaryCard: React.FC<{
  title: string
  subtitle: string
  amount: number
  footer?: React.ReactNode
}> = ({title, subtitle, amount, footer}) => {
  return (
    <div className="flex h-full min-h-[115px] flex-col justify-between rounded-md border border-[var(--studio-border)] bg-[var(--studio-surface-strong)] px-3 py-2.5 shadow-sm">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--studio-muted)]">
          {subtitle}
        </p>
        <h3 className="mt-1 text-sm font-semibold text-[var(--studio-text)]">{title}</h3>
      </div>
      <div>
        <p className="text-base font-semibold text-[var(--studio-text)]">
          {currency.format(amount || 0)}
        </p>
        {footer ? footer : null}
      </div>
    </div>
  )
}

export default InvoiceDashboard
