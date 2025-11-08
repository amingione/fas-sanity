import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {useClient} from 'sanity'
import {useRouter} from 'sanity/router'
import {Spinner, useToast} from '@sanity/ui'

type RawQuote = {
  _id: string
  _createdAt: string
  _updatedAt?: string
  quoteNumber?: string
  quoteDate?: string
  expirationDate?: string
  status?: string
  conversionStatus?: string
  total?: number
  subtotal?: number
  taxAmount?: number
  customer?: {_ref?: string}
  customerRef?: {_ref?: string}
  billTo?: {name?: string; email?: string}
  lineItems?: any[]
}

type QuoteRecord = {
  id: string
  quoteNumber: string
  customerName: string
  status: string
  statusLabel: string
  conversionStatus: string
  amount: number
  quoteDateIso: string
  quoteDateMs: number
  expirationDateIso: string | null
  expirationDateMs: number | null
  isConverted: boolean
  reference: string
}

const DAY = 24 * 60 * 60 * 1000
const STATUS_OPTIONS = ['All', 'Draft', 'Sent', 'Approved', 'Invoiced', 'Converted']

const DATE_OPTIONS: Array<{value: string; label: string; days?: number}> = [
  {value: '12m', label: 'Last 12 months', days: 365},
  {value: '90d', label: 'Last 90 days', days: 90},
  {value: '30d', label: 'Last 30 days', days: 30},
  {value: 'all', label: 'All time'},
]

const GRID_TEMPLATE_COLUMNS = '40px 160px 160px 160px minmax(220px, 1fr) 140px 160px 140px'
const GRID_COLUMN_GAP = 12
const STICKY_LEFT = 40 + GRID_COLUMN_GAP
const HEADER_BACKGROUND = 'var(--card-background-color)'
const ROW_BACKGROUND = 'var(--card-background-color)'
const ROW_SELECTED_BACKGROUND = 'rgba(59, 130, 246, 0.12)'
const STICKY_SHADOW = '2px 0 0 rgba(15, 23, 42, 0.08)'

const STICKY_CHECKBOX_STYLE: React.CSSProperties = {
  position: 'sticky',
  left: 0,
  zIndex: 3,
  display: 'inline-flex',
  alignItems: 'center',
  height: '100%',
}

const STICKY_NUMBER_STYLE: React.CSSProperties = {
  position: 'sticky',
  left: STICKY_LEFT,
  zIndex: 2,
  display: 'inline-flex',
  alignItems: 'center',
  height: '100%',
  boxShadow: STICKY_SHADOW,
}

const shortDate = new Intl.DateTimeFormat('en-US', {
  month: 'numeric',
  day: 'numeric',
  year: '2-digit',
})

const currency = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'})

function normalizeAmount(quote: RawQuote): number {
  const direct = Number(quote.total)
  const subtotal = Number(quote.subtotal) || 0
  const tax = Number(quote.taxAmount) || 0
  if (Number.isFinite(direct) && direct !== 0) return Number(direct)
  if (subtotal || tax) return subtotal + tax
  return 0
}

function resolveCustomerName(quote: RawQuote): string {
  const name = (quote.billTo?.name || '').trim()
  if (name) return name
  const email = (quote.billTo?.email || '').trim()
  if (email) return email
  return 'Customer'
}

function normalizeStatus(value?: string): string {
  if (!value) return 'Draft'
  return value
}

const QuotesDashboard = React.forwardRef<HTMLDivElement, Record<string, never>>((_props, ref) => {
  const client = useClient({apiVersion: '2024-10-01'})
  const router = useRouter()
  const toast = useToast()

  const [quotes, setQuotes] = useState<QuoteRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('All')
  const [dateFilter, setDateFilter] = useState('12m')
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [convertingIds, setConvertingIds] = useState<Set<string>>(new Set())
  const selectAllRef = useRef<HTMLInputElement>(null)

  const hasSelections = selectedIds.size > 0

  const fetchQuotes = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result: RawQuote[] = await client.fetch(
        `*[_type == "quote" && !(_id in path("drafts.**"))]{
          _id,
          _createdAt,
          _updatedAt,
          quoteNumber,
          quoteDate,
          expirationDate,
          status,
          conversionStatus,
          total,
          subtotal,
          taxAmount,
          billTo{ name, email }
        } | order(coalesce(quoteDate, _createdAt) desc)`,
      )

      const now = Date.now()
      const normalized = result.map((quote) => {
        const amount = normalizeAmount(quote)
        const quoteDateIso = quote.quoteDate || quote._createdAt
        const quoteDateMs = Date.parse(quoteDateIso || '') || now
        const expirationDateIso = quote.expirationDate || null
        const expirationDateMs = expirationDateIso ? Date.parse(expirationDateIso) : null
        const status = normalizeStatus(quote.status)
        const conversionStatus =
          quote.conversionStatus || (status === 'Invoiced' ? 'Converted' : 'Open')
        const isConverted =
          conversionStatus?.toLowerCase() === 'converted' || status?.toLowerCase() === 'invoiced'

        return {
          id: quote._id,
          quoteNumber: quote.quoteNumber || quote._id.slice(-6),
          customerName: resolveCustomerName(quote),
          status,
          statusLabel: status,
          conversionStatus,
          amount,
          quoteDateIso,
          quoteDateMs,
          expirationDateIso,
          expirationDateMs,
          isConverted,
          reference: quote.quoteNumber || '',
        } satisfies QuoteRecord
      })

      setQuotes(normalized)
    } catch (err: any) {
      setError(err?.message || 'Failed to load quotes')
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    fetchQuotes()
  }, [fetchQuotes])

  const filteredQuotes = useMemo(() => {
    const term = search.trim().toLowerCase()
    const now = Date.now()

    let cutoff: number | null = null
    if (dateFilter === '12m') cutoff = now - 365 * DAY
    else if (dateFilter === '90d') cutoff = now - 90 * DAY
    else if (dateFilter === '30d') cutoff = now - 30 * DAY

    return quotes.filter((quote) => {
      if (cutoff && quote.quoteDateMs < cutoff) return false
      if (statusFilter !== 'All') {
        if (statusFilter === 'Converted') {
          if (!quote.isConverted) return false
        } else if (quote.status.toLowerCase() !== statusFilter.toLowerCase()) {
          return false
        }
      }
      if (term) {
        const haystack =
          `${quote.quoteNumber}|${quote.customerName}|${quote.status}|${quote.conversionStatus}`.toLowerCase()
        if (!haystack.includes(term)) return false
      }
      return true
    })
  }, [quotes, statusFilter, dateFilter, search])

  useEffect(() => {
    const checkbox = selectAllRef.current
    if (!checkbox) return
    checkbox.indeterminate = hasSelections && selectedIds.size < filteredQuotes.length
  }, [filteredQuotes.length, hasSelections, selectedIds])

  useEffect(() => {
    setSelectedIds(new Set())
  }, [statusFilter, dateFilter, search, quotes])

  const handleSelect = (id: string, next: boolean) => {
    setSelectedIds((prev) => {
      const updated = new Set(prev)
      if (next) updated.add(id)
      else updated.delete(id)
      return updated
    })
  }

  const handleSelectAll = (next: boolean) => {
    if (!next) {
      setSelectedIds(new Set())
      return
    }
    setSelectedIds(new Set(filteredQuotes.map((quote) => quote.id)))
  }

  const handleConvert = async (quoteId: string) => {
    setConvertingIds((prev) => new Set(prev).add(quoteId))
    try {
      const quote = await client.fetch<
        RawQuote & {lineItems?: any[]; customer?: {_ref?: string}; customerRef?: {_ref?: string}}
      >(
        `*[_type == "quote" && _id == $id][0]{
          _id,
          quoteNumber,
          quoteDate,
          status,
          conversionStatus,
          customer{_ref},
          customerRef{_ref},
          billTo,
          total,
          subtotal,
          taxAmount,
          lineItems
        }`,
        {id: quoteId},
      )

      if (!quote?._id) throw new Error('Quote not found')

      const hasCustomerRef = quote.customer?._ref || quote.customerRef?._ref
      if (!hasCustomerRef) throw new Error('Quote must be linked to a customer before converting')

      const lineItems = Array.isArray(quote.lineItems) ? quote.lineItems : []

      const created = await client.create(
        {
          _type: 'invoice',
          quote: {_type: 'reference', _ref: quote._id},
          customerRef: {
            _type: 'reference',
            _ref: (quote.customer?._ref || quote.customerRef?._ref)!,
          },
          billTo: quote.billTo || undefined,
          lineItems,
          total: typeof quote.total === 'number' ? quote.total : undefined,
          subtotal: typeof quote.subtotal === 'number' ? quote.subtotal : undefined,
          amountSubtotal: typeof quote.subtotal === 'number' ? quote.subtotal : undefined,
          amountTax: typeof quote.taxAmount === 'number' ? quote.taxAmount : undefined,
          invoiceDate: new Date().toISOString().slice(0, 10),
          status: 'pending',
        },
        {autoGenerateArrayKeys: true},
      )

      await client
        .patch(quote._id)
        .set({
          conversionStatus: 'Converted',
          status: 'Invoiced',
        })
        .commit({autoGenerateArrayKeys: true})

      toast.push({
        status: 'success',
        title: 'Quote converted to invoice',
        description: `Invoice ${created._id}`,
      })

      fetchQuotes()
    } catch (err: any) {
      toast.push({
        status: 'error',
        title: 'Conversion failed',
        description: err?.message || 'Could not convert quote',
      })
    } finally {
      setConvertingIds((prev) => {
        const updated = new Set(prev)
        updated.delete(quoteId)
        return updated
      })
    }
  }

  return (
    <div ref={ref} className="studio-surface flex h-full min-h-0 flex-col rounded-3xl">
      <header
        className="border-b border-[var(--studio-border)] backdrop-blur"
        style={{background: 'var(--studio-surface-strong)'}}
      >
        <div className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--studio-text)]">
              Quotes &amp; Estimates
            </h2>
            <p className="text-sm text-[var(--studio-muted)]">
              Track drafts, send proposals, and convert accepted quotes to invoices.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-[var(--studio-muted)]">
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.currentTarget.value)}
                className="rounded-lg border border-[var(--studio-border-strong)] bg-[var(--studio-surface)] px-2 py-1 text-sm text-[var(--studio-text)] shadow-sm transition focus:border-[var(--studio-accent)] focus:outline-none focus:ring-2 focus:ring-[rgba(37,99,235,0.25)]"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--studio-muted)]">
              Date
              <select
                value={dateFilter}
                onChange={(event) => setDateFilter(event.currentTarget.value)}
                className="rounded-lg border border-[var(--studio-border-strong)] bg-[var(--studio-surface)] px-2 py-1 text-sm text-[var(--studio-text)] shadow-sm transition focus:border-[var(--studio-accent)] focus:outline-none focus:ring-2 focus:ring-[rgba(37,99,235,0.25)]"
              >
                {DATE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="search"
                placeholder="Search quote or customer…"
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                className="w-full rounded-xl border border-[var(--studio-border-strong)] bg-[var(--studio-surface)] px-3 py-2 text-sm text-[var(--studio-text)] shadow-sm transition focus:border-[var(--studio-accent)] focus:outline-none focus:ring-2 focus:ring-[rgba(37,99,235,0.25)] lg:w-64"
              />
              <button
                type="button"
                onClick={() => router.navigateIntent('create', {type: 'quote'})}
                className="inline-flex items-center rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500"
              >
                Create quote
              </button>
            </div>
          </div>
        </div>
      </header>

      <main
        className="flex flex-1 min-h-0 flex-col"
        style={{background: 'var(--studio-surface-overlay)'}}
      >
        <div className="px-6 py-4">
          <div className="rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-surface-strong)] shadow-lg">
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
                    background: HEADER_BACKGROUND,
                  }}
                >
                  <span
                    style={{...STICKY_CHECKBOX_STYLE, background: HEADER_BACKGROUND, zIndex: 4}}
                  >
                    <input
                      type="checkbox"
                      ref={selectAllRef}
                      className="h-4 w-4 rounded border-[var(--studio-border-strong)] text-emerald-600 focus:ring-emerald-500"
                      checked={hasSelections && selectedIds.size === filteredQuotes.length}
                      onChange={(event) => handleSelectAll(event.currentTarget.checked)}
                    />
                  </span>
                  <span
                    style={{
                      ...STICKY_NUMBER_STYLE,
                      background: HEADER_BACKGROUND,
                      zIndex: 3,
                      fontWeight: 600,
                    }}
                  >
                    Quote
                  </span>
                  <span>Date</span>
                  <span>Expires</span>
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
                    style={{padding: '20px 24px', width: 'max-content', background: ROW_BACKGROUND}}
                  >
                    {error}
                  </div>
                ) : loading ? (
                  <div
                    className="flex items-center gap-2 text-sm text-[var(--studio-muted)]"
                    style={{padding: '20px 24px', width: 'max-content', background: ROW_BACKGROUND}}
                  >
                    <Spinner muted /> Loading quotes…
                  </div>
                ) : filteredQuotes.length === 0 ? (
                  <div
                    className="text-sm text-[var(--studio-muted)]"
                    style={{padding: '20px 24px', width: 'max-content', background: ROW_BACKGROUND}}
                  >
                    No quotes match the current filters.
                  </div>
                ) : (
                  filteredQuotes.map((quote) => {
                    const isSelected = selectedIds.has(quote.id)
                    const isConverting = convertingIds.has(quote.id)
                    const rowBackground = isSelected ? ROW_SELECTED_BACKGROUND : ROW_BACKGROUND

                    return (
                      <div
                        key={quote.id}
                        onClick={() => router.navigateIntent('edit', {id: quote.id, type: 'quote'})}
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
                          style={{...STICKY_CHECKBOX_STYLE, background: rowBackground}}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-[var(--studio-border-strong)] text-emerald-600 focus:ring-emerald-500"
                            checked={isSelected}
                            onChange={(event) => {
                              event.stopPropagation()
                              handleSelect(quote.id, event.currentTarget.checked)
                            }}
                          />
                        </span>
                        <span
                          style={{
                            ...STICKY_NUMBER_STYLE,
                            background: rowBackground,
                            fontWeight: 600,
                            color: '#0f172a',
                          }}
                        >
                          {quote.quoteNumber}
                        </span>
                        <span className="text-[var(--studio-muted)]">
                          {quote.quoteDateIso
                            ? shortDate.format(new Date(quote.quoteDateIso))
                            : '—'}
                        </span>
                        <span className="text-[var(--studio-muted)]">
                          {quote.expirationDateIso
                            ? shortDate.format(new Date(quote.expirationDateIso))
                            : '—'}
                        </span>
                        <span className="text-[var(--studio-text)]">{quote.customerName}</span>
                        <span
                          style={{textAlign: 'right', fontVariantNumeric: 'tabular-nums'}}
                          className="font-medium text-[var(--studio-text)]"
                        >
                          {currency.format(quote.amount || 0)}
                        </span>
                        <span className="text-xs font-semibold">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                              quote.isConverted
                                ? 'text-emerald-600 bg-emerald-50 border border-emerald-100'
                                : quote.status.toLowerCase() === 'sent'
                                  ? 'text-sky-600 bg-sky-50 border border-sky-100'
                                  : quote.status.toLowerCase() === 'approved'
                                    ? 'text-emerald-600 bg-emerald-50 border border-emerald-100'
                                    : 'text-[var(--studio-muted)] bg-[var(--studio-surface-soft)] border border-[var(--studio-border)]'
                            }`}
                          >
                            {quote.isConverted ? 'Converted' : quote.statusLabel || 'Draft'}
                          </span>
                        </span>
                        <span style={{textAlign: 'right'}}>
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                router.navigateIntent('edit', {id: quote.id, type: 'quote'})
                              }}
                              className="text-sm font-semibold text-blue-600 hover:text-blue-500"
                            >
                              View/Edit
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                handleConvert(quote.id)
                              }}
                              disabled={quote.isConverted || isConverting}
                              className={`text-sm font-semibold ${
                                quote.isConverted
                                  ? 'text-[rgba(148,163,184,0.7)]'
                                  : 'text-emerald-600 hover:text-emerald-500'
                              } disabled:cursor-not-allowed`}
                            >
                              {isConverting
                                ? 'Converting…'
                                : quote.isConverted
                                  ? 'Converted'
                                  : 'Convert'}
                            </button>
                          </div>
                        </span>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
})

QuotesDashboard.displayName = 'QuotesDashboard'

export default QuotesDashboard
