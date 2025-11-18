import React, {forwardRef, useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {useClient} from 'sanity'
import type {StripeAnalyticsPayload} from '../../server/stripe-analytics'

const API_VERSION = '2024-10-01'
const ACCENT = '#3b82f6'
const CARD_BG = '#151922'
const CARD_BORDER = '#1f2431'

const StripeAnalyticsDashboard = forwardRef<HTMLDivElement>((_props, ref) => {
  const client = useClient({apiVersion: API_VERSION})
  const [payload, setPayload] = useState<StripeAnalyticsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetchAnalytics = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError(null)

    try {
      const config = client.config()
      const response = await fetch('/api/stripe-analytics', {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'x-sanity-project-id': config.projectId || '',
          'x-sanity-dataset': config.dataset || '',
        },
      })

      const raw = await response.text()
      let parsed: any = {}
      if (raw) {
        try {
          parsed = JSON.parse(raw)
        } catch {
          parsed = {}
        }
      }

      if (!response.ok) {
        const message =
          typeof parsed?.error === 'string'
            ? parsed.error
            : `Request failed (${response.status})`
        throw new Error(message)
      }

      if (!isValidPayload(parsed)) {
        throw new Error('Invalid Stripe analytics payload')
      }

      setPayload(parsed as StripeAnalyticsPayload)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const message = err instanceof Error ? err.message : 'Unable to load Stripe analytics'
      setError(message)
    } finally {
      if (abortRef.current === controller && !controller.signal.aborted) {
        setLoading(false)
        abortRef.current = null
      }
    }
  }, [client])

  useEffect(() => {
    fetchAnalytics()
    return () => abortRef.current?.abort()
  }, [fetchAnalytics])

  const summary = useMemo(() => normalizeSummary(payload?.summary), [payload?.summary])
  const currencyCode = summary.currency || 'USD'
  const currencyFormatter = useMemo(() => {
    try {
      return new Intl.NumberFormat('en-US', {style: 'currency', currency: currencyCode})
    } catch {
      return new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'})
    }
  }, [currencyCode])

  const numberFormatter = useMemo(() => new Intl.NumberFormat('en-US'), [])

  const chartPoints = useMemo(() => {
    const source = Array.isArray(payload?.salesByDay) ? payload.salesByDay : []
    const points = source.map((point) => ({
      date: typeof point?.date === 'string' ? point.date : '',
      total: coerceNumber(point?.total),
    }))
    if (!points.length) return []
    const max = Math.max(...points.map((point) => point.total), 0.01)
    const length = points.length
    return points.map((point, index) => {
      const x = length > 1 ? (index / (length - 1)) * 100 : 0
      const y = 100 - (point.total / max) * 100
      return {...point, x, y}
    })
  }, [payload?.salesByDay])

  const chartPath = useMemo(() => {
    if (!chartPoints.length) return ''
    return chartPoints
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)},${point.y.toFixed(2)}`)
      .join(' ')
  }, [chartPoints])

  const summaryCards = [
    {
      label: 'Total Sales',
      value: currencyFormatter.format(summary.totalSalesAllTime),
      helper: 'All-time gross volume',
    },
    {
      label: 'Last 30 Days',
      value: currencyFormatter.format(summary.totalSales30d),
      helper: 'Gross sales in window',
    },
    {
      label: 'Total Orders',
      value: numberFormatter.format(summary.totalOrders),
      helper: 'Succeeded charges',
    },
    {
      label: 'Refunds',
      value: `${numberFormatter.format(summary.refundCount)} · ${currencyFormatter.format(summary.refundTotal)}`,
      helper: 'Count · total refunded',
    },
    {
      label: 'Avg. Order Value',
      value: currencyFormatter.format(summary.averageOrderValue),
      helper: 'Gross / orders',
    },
  ]

  const lastUpdated = payload?.generatedAt ? formatDateLabel(payload.generatedAt, true) : null

  const renderBody = () => {
    if (error && !payload) {
      return (
        <div style={styles.errorCard}>
          <p style={styles.errorText}>{error}</p>
          <button style={styles.button} onClick={fetchAnalytics}>
            Retry
          </button>
        </div>
      )
    }

    if (!payload) {
      return (
        <div style={styles.loadingCard}>
          <svg
            width="36"
            height="36"
            viewBox="0 0 50 50"
            style={{opacity: 0.85}}
            aria-hidden="true"
          >
            <circle
              cx="25"
              cy="25"
              r="20"
              stroke={ACCENT}
              strokeWidth="4"
              fill="none"
              strokeLinecap="round"
              strokeDasharray="31.4 31.4"
            >
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0 25 25"
                to="360 25 25"
                dur="1s"
                repeatCount="indefinite"
              />
            </circle>
          </svg>
          <p style={{marginTop: 12, color: '#d1d5db'}}>Loading Stripe analytics…</p>
        </div>
      )
    }

    const topProducts = normalizeProducts(payload?.topProducts)
    return (
      <>
        <section style={styles.cardsGrid}>
          {summaryCards.map((card) => (
            <article key={card.label} style={styles.card}>
              <p style={styles.cardLabel}>{card.label}</p>
              <p style={styles.cardValue}>{card.value}</p>
              <p style={styles.cardHelper}>{card.helper}</p>
            </article>
          ))}
        </section>

        <section style={styles.panel}>
          <header style={styles.panelHeader}>
            <div>
              <p style={styles.panelLabel}>Sales, last 30 days</p>
              <p style={styles.panelValue}>
                {currencyFormatter.format(summary.totalSales30d)}
              </p>
            </div>
            <div style={styles.rangeMeta}>
              <span>Window</span>
              <strong>
                {formatDateLabel(payload?.rangeStart) ?? 'Unknown'} –{' '}
                {formatDateLabel(payload?.rangeEnd) ?? 'Unknown'}
              </strong>
            </div>
          </header>
          {chartPoints.length > 1 ? (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={styles.chartSvg}>
              <defs>
                <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <path
                d={`${chartPath} L 100,100 L 0,100 Z`}
                fill="url(#chartFill)"
                stroke="none"
                opacity={0.5}
              />
              <path d={chartPath} fill="none" stroke={ACCENT} strokeWidth={1.5} />
            </svg>
          ) : (
            <p style={styles.cardHelper}>Not enough data to render chart.</p>
          )}
        </section>

        <section style={styles.panel}>
          <header style={styles.panelHeader}>
            <div>
              <p style={styles.panelLabel}>Top products</p>
              <p style={styles.cardHelper}>Based on checkout sessions</p>
            </div>
          </header>
          {topProducts.length ? (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th align="left" style={styles.tableHeader}>
                    Product
                  </th>
                  <th align="right" style={styles.tableHeader}>
                    Revenue
                  </th>
                  <th align="right" style={styles.tableHeader}>
                    Units Sold
                  </th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((product, index) => (
                  <tr key={`${product.name}-${index}`}>
                    <td
                      style={{
                        ...styles.tableCell,
                        borderBottom:
                          index === topProducts.length - 1
                            ? 'none'
                            : styles.tableCell.borderBottom,
                      }}
                    >
                      {product.name}
                    </td>
                    <td
                      align="right"
                      style={{
                        ...styles.tableCell,
                        borderBottom:
                          index === topProducts.length - 1
                            ? 'none'
                            : styles.tableCell.borderBottom,
                      }}
                    >
                      {currencyFormatter.format(product.revenue)}
                    </td>
                    <td
                      align="right"
                      style={{
                        ...styles.tableCell,
                        borderBottom:
                          index === topProducts.length - 1
                            ? 'none'
                            : styles.tableCell.borderBottom,
                      }}
                    >
                      {numberFormatter.format(product.unitsSold)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={styles.cardHelper}>No product breakdown available.</p>
          )}
        </section>
      </>
    )
  }

  return (
    <div ref={ref} style={styles.container}>
      <header style={styles.header}>
        <div>
          <h2 style={styles.title}>Stripe Analytics</h2>
          <p style={styles.subtitle}>Live data pulled directly from Stripe.</p>
        </div>
        <div style={styles.headerActions}>
          {lastUpdated && <span style={styles.updatedAt}>Updated {lastUpdated}</span>}
          <button
            style={{...styles.button, opacity: loading ? 0.6 : 1}}
            onClick={fetchAnalytics}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>
      {error && payload && (
        <div style={styles.inlineError}>
          <span>Refresh failed: {error}</span>
          <button style={styles.noticeButton} onClick={fetchAnalytics} disabled={loading}>
            Retry
          </button>
        </div>
      )}
      {renderBody()}
    </div>
  )
})

StripeAnalyticsDashboard.displayName = 'StripeAnalyticsDashboard'

export default StripeAnalyticsDashboard

type SummaryShape = StripeAnalyticsPayload['summary']
type ProductRow = StripeAnalyticsPayload['topProducts'][number]

function isValidPayload(payload: any): payload is StripeAnalyticsPayload {
  if (!payload || typeof payload !== 'object') return false
  const summary = payload.summary
  if (!summary || typeof summary !== 'object') return false
  return (
    typeof summary.totalSalesAllTime === 'number' &&
    typeof summary.totalSales30d === 'number' &&
    typeof summary.totalOrders === 'number'
  )
}

function normalizeSummary(summary?: unknown): SummaryShape {
  const source =
    summary && typeof summary === 'object' ? (summary as Partial<SummaryShape>) : undefined
  const fallbackCurrency = 'USD'
  const currency =
    typeof source?.currency === 'string' && source.currency.trim().length
      ? source.currency
      : fallbackCurrency

  return {
    currency,
    totalSalesAllTime: coerceNumber(source?.totalSalesAllTime),
    totalSales30d: coerceNumber(source?.totalSales30d),
    totalOrders: Math.max(0, Math.round(coerceNumber(source?.totalOrders))),
    refundCount: Math.max(0, Math.round(coerceNumber(source?.refundCount))),
    refundTotal: coerceNumber(source?.refundTotal),
    averageOrderValue: coerceNumber(source?.averageOrderValue),
  }
}

function normalizeProducts(rows: unknown): ProductRow[] {
  if (!Array.isArray(rows)) return []
  return rows
    .map((row): ProductRow | null => {
      if (!row || typeof row !== 'object') return null
      const candidate = row as Partial<ProductRow>
      const name =
        typeof candidate.name === 'string' && candidate.name.trim().length
          ? candidate.name.trim()
          : 'Unnamed product'
      return {
        name,
        revenue: coerceNumber(candidate.revenue),
        unitsSold: Math.max(0, Math.round(coerceNumber(candidate.unitsSold))),
      }
    })
    .filter((row): row is ProductRow => row !== null)
}

function formatDateLabel(value?: string | null, includeTime: boolean = false): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  if (includeTime) {
    return date.toLocaleString()
  }
  return date.toLocaleDateString()
}

function coerceNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: '#0f1117',
    color: '#f5f6f7',
    padding: '24px',
    fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    minHeight: '100%',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    marginBottom: '20px',
  },
  title: {
    fontSize: '20px',
    margin: 0,
  },
  subtitle: {
    margin: '6px 0 0',
    color: '#9ca3af',
    fontSize: '14px',
  },
  headerActions: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '6px',
  },
  updatedAt: {
    color: '#9ca3af',
    fontSize: '12px',
  },
  button: {
    backgroundColor: ACCENT,
    color: '#fff',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 600,
  },
  cardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
    marginBottom: '20px',
  },
  card: {
    backgroundColor: CARD_BG,
    border: `1px solid ${CARD_BORDER}`,
    borderRadius: '12px',
    padding: '16px',
  },
  cardLabel: {
    color: '#9ca3af',
    margin: '0 0 6px',
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  cardValue: {
    margin: 0,
    fontSize: '22px',
    fontWeight: 600,
  },
  cardHelper: {
    marginTop: '6px',
    color: '#738091',
    fontSize: '12px',
  },
  panel: {
    backgroundColor: CARD_BG,
    border: `1px solid ${CARD_BORDER}`,
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '20px',
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
    marginBottom: '12px',
  },
  panelLabel: {
    color: '#9ca3af',
    margin: 0,
    fontSize: '12px',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  panelValue: {
    margin: '6px 0 0',
    fontSize: '26px',
    fontWeight: 600,
  },
  rangeMeta: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    fontSize: '12px',
    color: '#9ca3af',
  },
  chartSvg: {
    width: '100%',
    height: '180px',
    borderRadius: '8px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px',
  },
  errorCard: {
    backgroundColor: '#2c1d24',
    border: '1px solid #7f1d1d',
    borderRadius: '12px',
    padding: '20px',
    textAlign: 'center',
  },
  errorText: {
    marginBottom: '12px',
  },
  loadingCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 0',
  },
  tableHeader: {
    color: '#9ca3af',
    fontSize: '12px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    fontWeight: 600,
    paddingBottom: '8px',
    borderBottom: `1px solid ${CARD_BORDER}`,
  },
  tableCell: {
    padding: '10px 0',
    borderBottom: `1px solid ${CARD_BORDER}`,
  },
  inlineError: {
    backgroundColor: '#2c1d24',
    border: '1px solid #7f1d1d',
    borderRadius: '10px',
    padding: '12px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    color: '#fecaca',
    fontSize: '13px',
    marginBottom: '16px',
    gap: '12px',
  },
  noticeButton: {
    backgroundColor: '#f87171',
    color: '#0f1117',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 12px',
    cursor: 'pointer',
    fontWeight: 600,
  },
}
