import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {useClient} from 'sanity'
import {useRouter} from 'sanity/router'
import {Spinner, useToast} from '@sanity/ui'

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
  status: 'pending' | 'paid' | 'refunded' | 'cancelled'
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
const CLOSED_STATUSES = new Set(['paid', 'refunded', 'cancelled'])

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
const shortDate = new Intl.DateTimeFormat('en-US', {month: 'numeric', day: 'numeric', year: '2-digit'})

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
  const selectAllRef = useRef<HTMLInputElement | null>(null)
  const [compactHeader, setCompactHeader] = useState(false)

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
        } | order(coalesce(dueDate, invoiceDate, _createdAt) desc)`
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

        return {
          id: invoice._id,
          invoiceNumber: invoice.invoiceNumber || invoice.orderNumber || invoice._id.slice(-6),
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
          reference: invoice.invoiceNumber || invoice.orderNumber || '',
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
    [filteredInvoices]
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
      !window.confirm(`Mark ${selectedIds.size} invoice${selectedIds.size === 1 ? '' : 's'} as paid?`)
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
    if (invoice.status === 'cancelled') return 'text-slate-500 bg-slate-100 border border-slate-200'
    return 'text-amber-600 bg-amber-50 border border-amber-100'
  }

  return (
    <div ref={ref} className="flex h-full flex-col overflow-hidden bg-slate-100">
      <div
        className={`sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur transition-all duration-200 ${
          compactHeader ? 'shadow-sm' : ''
        }`}
      >
        <div
          className={`flex flex-col gap-4 px-6 transition-all duration-200 ${
            compactHeader ? 'py-3 sm:flex-row sm:items-center sm:justify-between' : 'py-5 sm:flex-row sm:items-start sm:justify-between'
          }`}
        >
          <div className="min-w-0">
            <p
              className={`text-xs font-semibold uppercase tracking-wide text-slate-500 transition-all duration-200 ${
                compactHeader ? 'opacity-80' : ''
              }`}
            >
              Sales &amp; Payments
            </p>
            <h1
              className={`font-bold text-slate-900 transition-all duration-200 ${
                compactHeader ? 'text-xl' : 'text-2xl'
              }`}
            >
              Invoices
            </h1>
            <p
              className={`text-slate-500 transition-all duration-200 ${
                compactHeader ? 'hidden text-xs sm:block' : 'text-sm'
              }`}
            >
              Track overdue balances and jump straight into any invoice.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={runBatchMarkPaid}
              disabled={batchLoading || selectedIds.size === 0}
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {batchLoading ? 'Updating…' : 'Mark selected paid'}
            </button>
            <button
              type="button"
              onClick={createInvoice}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500"
            >
              Create invoice
            </button>
          </div>
        </div>
        <div
          className={`grid gap-4 border-t border-slate-200 bg-white px-6 transition-all duration-200 md:grid-cols-2 lg:grid-cols-4 ${
            compactHeader ? 'max-h-0 overflow-hidden py-0 opacity-0 pointer-events-none' : 'py-5 opacity-100'
          }`}
        >
          <SummaryCard title="Unpaid" subtitle="Last 12 months" amount={metrics.unpaidYear} tone="amber" />
          <SummaryCard title="Overdue" subtitle="Outstanding now" amount={metrics.overdue} tone="rose" />
          <SummaryCard title="Not due yet" subtitle="Pending invoices" amount={metrics.notDue} tone="sky" />
          <SummaryCard title="Paid" subtitle="Last 30 days" amount={metrics.paidRecent} tone="emerald" />
          <div className="md:col-span-2 lg:col-span-4">
            <ProgressBar overdue={metrics.overdue} notDue={metrics.notDue} />
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b border-slate-200 bg-white px-6 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                Status
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.currentTarget.value)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-600">
                Date
                <select
                  value={dateFilter}
                  onChange={(event) => setDateFilter(event.currentTarget.value)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
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
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 lg:w-64"
              />
              {loading ? (
                <div className="flex items-center justify-center rounded-md border border-slate-200 px-3 py-2">
                  <Spinner />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={fetchInvoices}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 shadow-sm"
                >
                  Refresh
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-slate-50">
          <div className="px-6 py-4">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-sm text-slate-700">
                <thead className="bg-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        onChange={(event) => handleSelectAll(event.currentTarget.checked)}
                      />
                    </th>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Due</th>
                    <th className="px-4 py-3 text-left">Invoice #</th>
                    <th className="px-4 py-3 text-left">Customer</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {error ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-sm text-rose-600">
                        {error}
                      </td>
                    </tr>
                  ) : loading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-500">
                        Loading invoices…
                      </td>
                    </tr>
                  ) : filteredInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-500">
                        No invoices match the current filters.
                      </td>
                    </tr>
                  ) : (
                    filteredInvoices.map((invoice) => (
                      <tr
                        key={invoice.id}
                        className="hover:bg-slate-50"
                        onClick={(event) => {
                          const target = event.target as HTMLElement
                          if (target.closest('button') || target.closest('input[type="checkbox"]')) return
                          openInvoice(invoice.id)
                        }}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            checked={selectedIds.has(invoice.id)}
                            onChange={(event) => handleSelect(invoice.id, event.currentTarget.checked)}
                          />
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {invoice.invoiceDateIso ? shortDate.format(new Date(invoice.invoiceDateIso)) : '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {invoice.dueDateIso ? shortDate.format(new Date(invoice.dueDateIso)) : '—'}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">{invoice.invoiceNumber}</td>
                        <td className="px-4 py-3 text-slate-700">{invoice.customerName}</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-900">
                          {currency.format(invoice.amount || 0)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass(
                              invoice
                            )}`}
                          >
                            {invoice.isOverdue ? 'Overdue' : invoice.statusLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => openInvoice(invoice.id)}
                            className="text-sm font-semibold text-blue-600 hover:text-blue-500"
                          >
                            View / Edit
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
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
  tone: 'amber' | 'rose' | 'sky' | 'emerald'
}> = ({title, subtitle, amount, tone}) => {
  const toneMap: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
    sky: 'bg-sky-50 text-sky-600 border-sky-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{subtitle}</p>
      <h3 className="mt-1 text-lg font-semibold text-slate-900">{title}</h3>
      <div className={`mt-3 inline-flex rounded-lg border px-3 py-2 text-sm font-semibold ${toneMap[tone]}`}>
        {currency.format(amount || 0)}
      </div>
    </div>
  )
}

const ProgressBar: React.FC<{overdue: number; notDue: number}> = ({overdue, notDue}) => {
  const sum = overdue + notDue
  const safeTotal = sum > 0 ? sum : 1
  const overduePct = Math.min(Math.max(overdue / safeTotal, 0), 1)
  const notDuePct = Math.min(Math.max(notDue / safeTotal, 0), 1)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-700">Outstanding balance</p>
      <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-200">
        <div className="flex h-full w-full">
          <div className="h-full bg-rose-500" style={{width: `${overduePct * 100}%`}} />
          <div className="h-full bg-emerald-500" style={{width: `${notDuePct * 100}%`}} />
        </div>
      </div>
      <div className="mt-3 flex justify-between text-xs font-medium uppercase tracking-wide text-slate-500">
        <span>
          Overdue {currency.format(overdue || 0)} ({Math.round(overduePct * 100)}%)
        </span>
        <span>
          Not due {currency.format(notDue || 0)} ({Math.round(notDuePct * 100)}%)
        </span>
      </div>
    </div>
  )
}

export default InvoiceDashboard
