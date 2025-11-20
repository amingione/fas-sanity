import jsPDF from 'jspdf'

export type ProfitLossSnapshot = {
  period?: string
  grossRevenue?: number
  returns?: number
  netRevenue?: number
  revenueOnline?: number
  revenueInStore?: number
  revenueWholesale?: number
  cogs?: number
  grossProfit?: number
  grossMargin?: number
  totalExpenses?: number
  operatingProfit?: number
  netProfit?: number
  netMargin?: number
  totalOrders?: number
  avgOrderValue?: number
  avgProfitPerOrder?: number
}

export type ExpenseExportRow = {
  expenseNumber?: string
  date?: string
  vendorName?: string
  category?: string
  amount?: number
  taxDeductible?: boolean
  paymentMethod?: string
  status?: string
  notes?: string
  recurring?: boolean
  recurringFrequency?: string
}

export type RevenueExportRow = {
  label: string
  revenue: number
  cogs?: number
  grossProfit?: number
  grossMargin?: number
  unitsSold?: number
  contribution?: number
  channel?: string
}

const currency = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'})
const percent = new Intl.NumberFormat('en-US', {style: 'percent', maximumFractionDigits: 1})

function triggerDownload(blob: Blob, filename: string) {
  if (typeof window === 'undefined') return
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  window.URL.revokeObjectURL(url)
}

function sanitizeFilename(value?: string) {
  const fallback = value?.trim() || 'report'
  return fallback.replace(/[^a-z0-9_-]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

function buildCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows
    .map((row) =>
      row
        .map((value) => {
          if (value === undefined || value === null) return ''
          const stringValue = String(value)
          if (stringValue.includes(',') || stringValue.includes('"')) {
            return `"${stringValue.replace(/"/g, '""')}"`
          }
          return stringValue
        })
        .join(','),
    )
    .join('\n')
}

function downloadCsv(rows: Array<Array<string | number | null | undefined>>, filename: string) {
  if (typeof window === 'undefined') return
  const csv = buildCsv(rows)
  const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'})
  triggerDownload(blob, filename)
}

export function exportProfitLossCsv(report: ProfitLossSnapshot, filename?: string) {
  const safeName = filename || `profit-loss-${sanitizeFilename(report.period)}.csv`
  const rows = [
    ['Metric', 'Value'],
    ['Period', report.period || ''],
    ['Gross Revenue', currency.format(report.grossRevenue || 0)],
    ['Returns', currency.format(report.returns || 0)],
    ['Net Revenue', currency.format(report.netRevenue || 0)],
    ['Revenue Online', currency.format(report.revenueOnline || 0)],
    ['Revenue In-Store', currency.format(report.revenueInStore || 0)],
    ['Revenue Wholesale', currency.format(report.revenueWholesale || 0)],
    ['COGS', currency.format(report.cogs || 0)],
    ['Gross Profit', currency.format(report.grossProfit || 0)],
    ['Gross Margin', `${Number(report.grossMargin || 0).toFixed(2)}%`],
    ['Operating Expenses', currency.format(report.totalExpenses || 0)],
    ['Operating Profit', currency.format(report.operatingProfit || 0)],
    ['Net Profit', currency.format(report.netProfit || 0)],
    ['Net Margin', `${Number(report.netMargin || 0).toFixed(2)}%`],
    ['Total Orders', report.totalOrders ?? 0],
    ['Avg Order Value', currency.format(report.avgOrderValue || 0)],
    ['Avg Profit per Order', currency.format(report.avgProfitPerOrder || 0)],
  ]
  downloadCsv(rows, safeName)
}

export function exportProfitLossPdf(report: ProfitLossSnapshot, filename?: string) {
  if (typeof window === 'undefined') return
  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.text('Profit & Loss Statement', 14, 20)
  doc.setFontSize(12)
  doc.text(`Period: ${report.period || 'N/A'}`, 14, 32)

  const entries: Array<[string, string]> = [
    ['Gross Revenue', currency.format(report.grossRevenue || 0)],
    ['Returns', currency.format(report.returns || 0)],
    ['Net Revenue', currency.format(report.netRevenue || 0)],
    ['COGS', currency.format(report.cogs || 0)],
    ['Gross Profit', currency.format(report.grossProfit || 0)],
    ['Gross Margin', percent.format((report.grossMargin || 0) / 100)],
    ['Total Expenses', currency.format(report.totalExpenses || 0)],
    ['Operating Profit', currency.format(report.operatingProfit || 0)],
    ['Net Profit', currency.format(report.netProfit || 0)],
    ['Net Margin', percent.format((report.netMargin || 0) / 100)],
    ['Total Orders', String(report.totalOrders ?? 0)],
    ['Avg Order Value', currency.format(report.avgOrderValue || 0)],
    ['Avg Profit / Order', currency.format(report.avgProfitPerOrder || 0)],
  ]

  let y = 48
  for (const [label, value] of entries) {
    doc.text(`${label}: ${value}`, 14, y)
    y += 12
  }

  doc.save(filename || `profit-loss-${sanitizeFilename(report.period)}.pdf`)
}

export function exportExpensesCsv(expenses: ExpenseExportRow[], filename?: string) {
  const safeName =
    filename || `expenses-${sanitizeFilename(new Date().toISOString().slice(0, 10))}.csv`
  const rows = [
    ['Expense #', 'Date', 'Vendor', 'Category', 'Amount', 'Status', 'Payment Method', 'Deductible', 'Recurring', 'Notes'],
    ...expenses.map((expense) => [
      expense.expenseNumber || '',
      expense.date || '',
      expense.vendorName || '',
      expense.category || '',
      Number(expense.amount ?? 0).toFixed(2),
      expense.status || '',
      expense.paymentMethod || '',
      expense.taxDeductible ? 'Yes' : 'No',
      expense.recurring
        ? `${expense.recurringFrequency || 'Recurring'}`
        : 'No',
      expense.notes || '',
    ]),
  ]
  downloadCsv(rows, safeName)
}

export function exportTaxSummaryCsv(expenses: ExpenseExportRow[], filename?: string) {
  const deductible = expenses.filter((expense) => expense.taxDeductible)
  const safeName = filename || `tax-summary-${new Date().getFullYear()}.csv`
  const rows = [
    ['Category', 'Amount', 'Expense Count'],
  ]

  const grouped = deductible.reduce<Record<string, {total: number; count: number}>>(
    (acc, expense) => {
      const key = expense.category || 'Uncategorized'
      const existing = acc[key] || {total: 0, count: 0}
      existing.total += Number(expense.amount || 0)
      existing.count += 1
      acc[key] = existing
      return acc
    },
    {},
  )

  for (const [category, info] of Object.entries(grouped)) {
    rows.push([category, info.total.toFixed(2), info.count])
  }

  downloadCsv(rows, safeName)
}

export function exportRevenueReportCsv(rows: RevenueExportRow[], filename?: string) {
  const safeName = filename || `revenue-report-${sanitizeFilename(new Date().toISOString())}.csv`
  const csvRows = [
    ['Label', 'Channel', 'Revenue', 'COGS', 'Gross Profit', 'Gross Margin', 'Units Sold', 'Contribution %'],
    ...rows.map((row) => [
      row.label,
      row.channel || '',
      Number(row.revenue ?? 0).toFixed(2),
      Number(row.cogs ?? 0).toFixed(2),
      Number(row.grossProfit ?? row.revenue - (row.cogs || 0)).toFixed(2),
      `${Number(row.grossMargin ?? 0).toFixed(2)}%`,
      row.unitsSold ?? '',
      row.contribution ? `${row.contribution.toFixed(2)}%` : '',
    ]),
  ]
  downloadCsv(csvRows, safeName)
}
