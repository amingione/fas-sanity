// NOTE: orderId is deprecated; prefer orderNumber for identifiers.
import React, {useMemo, useRef, useState} from 'react'
import {Button, Text} from '@sanity/ui'
import {getNetlifyFunctionBaseCandidates, resolveNetlifyBase} from '../../utils/netlifyBase'

type BackfillResponse = Record<string, any>

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--card-border-color)',
  borderRadius: 6,
  backgroundColor: 'var(--card-bg-color)',
  color: 'var(--card-fg-color)',
}

const inputBaseStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--input-border-color, var(--card-border-color))',
  borderRadius: 4,
  backgroundColor: 'var(--input-bg-color, var(--card-bg-color))',
  color: 'var(--input-fg-color, var(--card-fg-color))',
}

const inputStyle: React.CSSProperties = {
  ...inputBaseStyle,
}

const inlineInputStyle: React.CSSProperties = {
  ...inputBaseStyle,
  width: 180,
}

const fieldLabelStyle: React.CSSProperties = {
  color: 'var(--card-muted-fg-color)',
}

const descriptionStyle: React.CSSProperties = {
  color: 'var(--card-muted-fg-color)',
}

const DEFAULT_BASE = resolveNetlifyBase().replace(/\/$/, '')

const AdminTools = React.forwardRef<HTMLDivElement>(function AdminTools(_props, ref) {
  const netlifyBases = useMemo(
    () => getNetlifyFunctionBaseCandidates().map((candidate) => candidate.replace(/\/$/, '')),
    [],
  )
  const [activeBase, setActiveBase] = useState(() => (netlifyBases[0] || DEFAULT_BASE).replace(/\/$/, ''))
  const lastSuccessfulBase = useRef<string>(activeBase)
  const [globalDryRun, setGlobalDryRun] = useState(true)
  const [checkoutDryRun, setCheckoutDryRun] = useState(true)
  const [checkoutStatus, setCheckoutStatus] = useState<'all' | 'success' | 'failure'>('all')
  const [checkoutLimit, setCheckoutLimit] = useState('200')
  const [checkoutSessionId, setCheckoutSessionId] = useState('')
  const [checkoutOrderId, setCheckoutOrderId] = useState('')

  const [shippingDryRun, setShippingDryRun] = useState(true)
  const [shippingLimit, setShippingLimit] = useState('50')
  const [shippingOrderId, setShippingOrderId] = useState('')
  const [shippingSessionId, setShippingSessionId] = useState('')

  const [invoiceLimit, setInvoiceLimit] = useState('50')

  const [expiredDryRun, setExpiredDryRun] = useState(true)
  const [expiredLimit, setExpiredLimit] = useState('50')
  const [expiredSince, setExpiredSince] = useState('')
  const [expiredSessionId, setExpiredSessionId] = useState('')

  const [stripeKind, setStripeKind] = useState<'checkout' | 'paymentIntent' | 'charge'>('checkout')
  const [stripeDryRun, setStripeDryRun] = useState(true)
  const [stripeLimit, setStripeLimit] = useState('25')
  const [stripeId, setStripeId] = useState('')

  const [paymentFailuresDryRun, setPaymentFailuresDryRun] = useState(true)
  const [paymentFailuresLimit, setPaymentFailuresLimit] = useState('25')
  const [paymentFailuresOrderId, setPaymentFailuresOrderId] = useState('')
  const [paymentFailuresOrderNumber, setPaymentFailuresOrderNumber] = useState('')
  const [paymentFailuresPaymentIntent, setPaymentFailuresPaymentIntent] = useState('')

  const [refundsDryRun, setRefundsDryRun] = useState(true)
  const [refundsLimit, setRefundsLimit] = useState('25')
  const [refundsOrderId, setRefundsOrderId] = useState('')
  const [refundsPaymentIntent, setRefundsPaymentIntent] = useState('')

  const [productMode, setProductMode] = useState<'missing' | 'all'>('missing')
  const [productLimit, setProductLimit] = useState('25')
  const [productIds, setProductIds] = useState('')

  const [secret, setSecret] = useState<string>(() => {
    try {
      return (
        // @ts-ignore
        (typeof process !== 'undefined'
          ? (process as any)?.env?.SANITY_STUDIO_BACKFILL_SECRET
          : '') ||
        window.localStorage?.getItem('BACKFILL_SECRET') ||
        ''
      )
    } catch {
      return ''
    }
  })
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [messages, setMessages] = useState<Record<string, string>>({})

  function updateMessage(key: string, value: string) {
    setMessages((prev) => ({...prev, [key]: value}))
  }

  function parseLimit(value: string): number | undefined {
    if (!value) return undefined
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined
    return Math.floor(parsed)
  }

  async function performBackfillRequest(
    functionName: string,
    {
      dryRun,
      body = {},
      query = {},
      includeDryRunQuery = false,
    }: {
      dryRun?: boolean
      body?: Record<string, any>
      query?: Record<string, string | undefined>
      includeDryRunQuery?: boolean
    },
  ): Promise<BackfillResponse> {
    const params = new URLSearchParams()
    Object.entries(query).forEach(([name, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(name, value)
    })
    if (includeDryRunQuery && dryRun) {
      params.set('dryRun', 'true')
    }

    const payload: Record<string, any> = {...body}
    if (!includeDryRunQuery && typeof dryRun === 'boolean') {
      payload.dryRun = dryRun
    }

    const path = `/.netlify/functions/${functionName}${params.toString() ? `?${params.toString()}` : ''}`
    const headers: Record<string, string> = {'Content-Type': 'application/json'}
    if (secret) headers.Authorization = `Bearer ${secret.trim()}`

    const attempts = Array.from(
      new Set([lastSuccessfulBase.current, ...netlifyBases, DEFAULT_BASE]),
    ).filter((candidate): candidate is string => Boolean(candidate))
    let lastError: any = null

    for (const candidate of attempts) {
      const normalized = candidate.replace(/\/$/, '')
      try {
        const response = await fetch(`${normalized}${path}`, {
          method: 'POST',
          headers,
          body: Object.keys(payload).length ? JSON.stringify(payload) : undefined,
        })
        lastSuccessfulBase.current = normalized
        setActiveBase(normalized)
        try {
          window.localStorage?.setItem('NLFY_BASE', normalized)
        } catch {
          // ignore storage errors
        }
        const rawBody = await response.text()
        let data: BackfillResponse = {}
        try {
          data = rawBody ? JSON.parse(rawBody) : {}
        } catch {
          const snippet = rawBody ? rawBody.slice(0, 240) : '(empty body)'
          const statusInfo = `${response.status}${response.statusText ? ` ${response.statusText}` : ''}`
          const hint =
            response.status === 401
              ? ' • Check BACKFILL_SECRET and auth.'
              : response.status === 404
                ? ' • Verify Netlify base URL.'
                : ''
          throw new Error(
            `Unexpected response (${statusInfo}) from ${normalized}${hint}. Body: ${snippet}`,
          )
        }

        if (!response.ok || data?.error) {
          throw new Error(data?.error || `HTTP ${response.status}`)
        }

        return data
      } catch (err) {
        lastError = err
      }
    }

    throw lastError || new Error('All Netlify bases failed')
  }

  async function invokeBackfill(
    key: string,
    functionName: string,
    options: {
      dryRun?: boolean
      body?: Record<string, any>
      query?: Record<string, string | undefined>
      includeDryRunQuery?: boolean
    } = {},
  ) {
    if (busyKey) return
    const {dryRun, body = {}, query = {}, includeDryRunQuery = false} = options
    setBusyKey(key)
    updateMessage(key, '')
    try {
      const data = await performBackfillRequest(functionName, {
        dryRun,
        body,
        query,
        includeDryRunQuery,
      })
      updateMessage(key, formatSuccessMessage(key, data))
      try {
        if (secret) window.localStorage?.setItem('BACKFILL_SECRET', secret.trim())
      } catch (err) {
        console.warn('Failed to persist secret', err)
      }
    } catch (err: any) {
      updateMessage(key, `Error: ${err?.message || String(err)}`)
    } finally {
      setBusyKey(null)
    }
  }

  async function runStripeBatches() {
    if (busyKey) return
    const limitNumber = parseLimit(stripeLimit) || 25
    const maxBatches = 10
    const id = stripeId.trim() || undefined
    setBusyKey('orderStripe')
    updateMessage('orderStripe', '')

    const lines: string[] = []
    try {
      for (let batch = 0; batch < maxBatches; batch += 1) {
        const data = await performBackfillRequest('backfillOrderStripe', {
          dryRun: stripeDryRun,
          body: {kind: stripeKind, limit: limitNumber, id},
        })
        lines.push(`Batch ${batch + 1}: ${formatSuccessMessage('orderStripe', data)}`)

        const processed = Number(data?.processed || 0)
        const succeeded = Number(data?.succeeded || 0)
        if (id) break
        if (processed === 0 || succeeded === 0) break
        if (processed < limitNumber) break
      }
      updateMessage('orderStripe', lines.join('\n'))
    } catch (err: any) {
      updateMessage('orderStripe', `Error: ${err?.message || String(err)}`)
    } finally {
      setBusyKey(null)
    }
  }

  function formatSuccessMessage(key: string, data: BackfillResponse): string {
    switch (key) {
      case 'orders':
        return `OK${data.dryRun ? ' (dry run)' : ''}: processed=${data.total}, changed=${data.changed}, migratedCustomer=${data.migratedCustomer}, cartFixed=${data.cartFixed}, remainingLegacyCustomer=${data.remainingCustomer}`
      case 'invoices':
        return `OK${data.dryRun ? ' (dry run)' : ''}: processed=${data.total}, changed=${data.changed}, migratedCustomer=${data.migratedCustomer}, migratedOrder=${data.migratedOrder}, itemsFixed=${data.itemsFixed}`
      case 'customers':
        return `OK${data.dryRun ? ' (dry run)' : ''}: processed=${data.total}, changed=${data.changed}, userIdSet=${data.userIdSet}, optInDefaults=${data.optInDefaults}, updatedStamped=${data.updatedStamped}`
      case 'checkoutAsync':
        return `OK${data.dryRun ? ' (dry run)' : ''}: matched=${data.total}, processed=${data.processed}, skipped=${data.skipped}, filter=${data.statusFilter}`
      case 'orderShipping':
        return `OK${data.dryRun ? ' (dry run)' : ''}: matched=${data.total}, processed=${data.processed}, skipped=${data.skipped}, failures=${data.failures}`
      case 'orderStripe':
        return `OK${data.dryRun ? ' (dry run)' : ''}: mode=${data.kind}, processed=${data.processed}, succeeded=${data.succeeded}, failed=${data.failed}`
      case 'paymentFailures':
        return `OK${data.dryRun ? ' (dry run)' : ''}: matched=${data.total}, updated=${data.updated}, skipped=${data.skipped}`
      case 'refunds':
        return `OK${data.dryRun ? ' (dry run)' : ''}: orders=${data.ordersConsidered}, evaluated=${data.totalRefundsEvaluated}, applied=${data.applied}`
      case 'stripeProducts': {
        const successCount = Array.isArray(data.results)
          ? data.results.filter((r: any) => r?.status === 'synced').length
          : undefined
        const errorCount = Array.isArray(data.errors) ? data.errors.length : 0
        return [
          `OK: mode=${data.mode || 'missing'}`,
          `processed=${data.processed ?? 0}`,
          typeof successCount === 'number' ? `synced=${successCount}` : null,
          errorCount ? `errors=${errorCount}` : null,
        ]
          .filter(Boolean)
          .join(', ')
      }
      default:
        return 'OK'
    }
  }

  function renderMessage(key: string) {
    const value = messages[key]
    if (!value) return null
    return (
      <pre
        className="mt-space-3 p-space-2 rounded-md text-text-meta"
        style={{
          background: 'var(--code-bg-color, var(--card-muted-bg-color))',
          border: '1px solid var(--card-border-color)',
          whiteSpace: 'pre-wrap',
          color: 'var(--code-fg-color, var(--card-fg-color))',
        }}
      >
        {value}
      </pre>
    )
  }

  const sharedSecretField = (id: string) => (
    <div className="mb-space-2">
      <label className="block mb-space-1 text-text-caption" style={fieldLabelStyle} htmlFor={id}>
        Optional BACKFILL secret
      </label>
      <input
        id={id}
        name={id}
        type="password"
        value={secret}
        placeholder="Enter secret or leave blank"
        onChange={(event) => setSecret(event.target.value)}
        className="w-full p-space-2 text-text-body"
        style={inputStyle}
      />
    </div>
  )

  const renderActionButton = (
    key: string,
    label: string,
    onClick: () => void,
    tone: 'primary' | 'positive' | 'caution' | 'critical' | 'default' = 'critical',
  ) => (
    <Button
      tone={tone}
      text={busyKey === key ? 'Running…' : label}
      onClick={onClick}
      loading={busyKey === key}
      disabled={busyKey !== null}
    />
  )

  return (
    <div ref={ref} className="p-space-4" style={{maxWidth: 880}}>
      <h2 className="my-space-2">Admin Tools</h2>
      <Text size={1} className="mb-space-3">
        Netlify base: {activeBase}
      </Text>

      <section className="p-space-3 mb-space-3" style={cardStyle}>
        <h3 className="mt-0">Orders Backfill</h3>
        <p className="text-text-meta" style={descriptionStyle}>
          Runs a cleanup across Order documents: normalises cart items, migrates legacy customer
          fields, and removes deprecated properties.
        </p>
        <div className="flex items-center gap-space-2 mb-space-2">
          <label
            className="flex items-center gap-space-2"
            htmlFor="orders-global-dry-run"
          >
            <input
              id="orders-global-dry-run"
              name="globalDryRun"
              type="checkbox"
              checked={globalDryRun}
              onChange={(event) => setGlobalDryRun(event.target.checked)}
            />{' '}
            Dry run
          </label>
        </div>
        {sharedSecretField('orders-secret')}
        {renderActionButton('orders', 'Run Backfill', () => {
          invokeBackfill('orders', 'backfillOrders', {
            dryRun: globalDryRun,
            includeDryRunQuery: true,
          })
        })}
        {renderMessage('orders')}
      </section>

      <section className="p-space-3 mb-space-3" style={cardStyle}>
        <h3 className="mt-0">Invoices Backfill</h3>
        <p className="text-text-meta" style={descriptionStyle}>
          Fixes invoice line items, migrates legacy references, and reconciles numbering.
        </p>
        <div className="flex items-center gap-space-2 mb-space-2">
          <label
            className="flex items-center gap-space-2"
            htmlFor="invoices-global-dry-run"
          >
            <input
              id="invoices-global-dry-run"
              name="globalDryRun"
              type="checkbox"
              checked={globalDryRun}
              onChange={(event) => setGlobalDryRun(event.target.checked)}
            />{' '}
            Dry run
          </label>
          <label className="flex flex-col gap-space-1" htmlFor="invoices-limit">
            <span className="text-text-caption" style={fieldLabelStyle}>
              Limit
            </span>
            <input
              id="invoices-limit"
              name="invoicesLimit"
              type="number"
              min={1}
              value={invoiceLimit}
              onChange={(event) => setInvoiceLimit(event.target.value)}
              className="p-space-2 text-text-body"
              style={inlineInputStyle}
            />
          </label>
        </div>
        {sharedSecretField('invoices-secret')}
        {renderActionButton('invoices', 'Run Backfill', () => {
          invokeBackfill('invoices', 'backfillInvoices', {
            dryRun: globalDryRun,
            query: {
              limit: (() => {
                const limitValue = parseLimit(invoiceLimit)
                return typeof limitValue === 'number' ? String(limitValue) : undefined
              })(),
            },
            includeDryRunQuery: true,
          })
        })}
        {renderMessage('invoices')}
      </section>

      <section className="p-space-3 mb-space-3" style={cardStyle}>
        <h3 className="mt-0">Customers Backfill</h3>
        <p className="text-text-meta" style={descriptionStyle}>
          Cleans up legacy auth provider IDs, defaults opt-in flags, and refreshes metadata.
        </p>
        <div className="flex items-center gap-space-2 mb-space-2">
          <label
            className="flex items-center gap-space-2"
            htmlFor="customers-global-dry-run"
          >
            <input
              id="customers-global-dry-run"
              name="globalDryRun"
              type="checkbox"
              checked={globalDryRun}
              onChange={(event) => setGlobalDryRun(event.target.checked)}
            />{' '}
            Dry run
          </label>
        </div>
        {sharedSecretField('customers-secret')}
        {renderActionButton('customers', 'Run Backfill', () => {
          invokeBackfill('customers', 'backfillCustomers', {
            dryRun: globalDryRun,
            includeDryRunQuery: true,
          })
        })}
        {renderMessage('customers')}
      </section>

      <section className="p-space-3 mb-space-3" style={cardStyle}>
        <h3 className="mt-0">Checkout Async Payments</h3>
        <p className="text-text-meta" style={descriptionStyle}>
          Replays async Stripe Checkout outcomes to reconcile orders stuck in pending or cancelled
          states.
        </p>
        <div className="flex flex-wrap gap-space-3 mb-space-2">
          <label
            className="flex items-center gap-space-2"
            htmlFor="checkout-async-dry-run"
          >
            <input
              id="checkout-async-dry-run"
              name="checkoutDryRun"
              type="checkbox"
              checked={checkoutDryRun}
              onChange={(event) => setCheckoutDryRun(event.target.checked)}
            />{' '}
            Dry run
          </label>
          <label className="flex flex-col gap-space-1" htmlFor="checkout-status-filter">
            <span className="text-text-caption" style={fieldLabelStyle}>
              Status filter
            </span>
            <select
              id="checkout-status-filter"
              name="checkoutStatus"
              value={checkoutStatus}
              onChange={(event) =>
                setCheckoutStatus(event.target.value as 'all' | 'success' | 'failure')
              }
              className="p-space-2 text-text-body"
              style={inlineInputStyle}
            >
              <option value="all">All</option>
              <option value="success">Success only</option>
              <option value="failure">Failure only</option>
            </select>
          </label>
          <label className="flex flex-col gap-space-1" htmlFor="checkout-limit">
            <span className="text-text-caption" style={fieldLabelStyle}>
              Limit
            </span>
            <input
              id="checkout-limit"
              name="checkoutLimit"
              type="number"
              min={1}
              value={checkoutLimit}
              onChange={(event) => setCheckoutLimit(event.target.value)}
              className="p-space-2 text-text-body"
              style={inlineInputStyle}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-space-3 mb-space-2">
          <label
            className="flex flex-col gap-space-1"
            style={{flex: '1 1 220px'}}
            htmlFor="checkout-session-id"
          >
            <span className="text-text-caption" style={fieldLabelStyle}>
              Checkout session ID (optional)
            </span>
            <input
              id="checkout-session-id"
              name="checkoutSessionId"
              type="text"
              value={checkoutSessionId}
              onChange={(event) => setCheckoutSessionId(event.target.value)}
              placeholder="cs_..."
              className="w-full p-space-2 text-text-body"
              style={inputStyle}
            />
          </label>
          <label
            className="flex flex-col gap-space-1"
            style={{flex: '1 1 220px'}}
            htmlFor="checkout-order-id"
          >
            <span className="text-text-caption" style={fieldLabelStyle}>
              Order ID (optional)
            </span>
            <input
              id="checkout-order-id"
              name="checkoutOrderId"
              type="text"
              value={checkoutOrderId}
              onChange={(event) => setCheckoutOrderId(event.target.value)}
              placeholder="order document ID"
              className="w-full p-space-2 text-text-body"
              style={inputStyle}
            />
          </label>
        </div>
        {renderActionButton('checkoutAsync', 'Run Async Payment Backfill', () => {
          invokeBackfill('checkoutAsync', 'backfillCheckoutAsyncPayments', {
            dryRun: checkoutDryRun,
            body: {
              status: checkoutStatus,
              limit: parseLimit(checkoutLimit),
              sessionId: checkoutSessionId.trim() || undefined,
              orderId: checkoutOrderId.trim() || undefined,
            },
          })
        })}
        {renderMessage('checkoutAsync')}
      </section>

      <section className="p-space-3 mb-space-3" style={cardStyle}>
        <h3 className="mt-0">Expired Checkout Sessions</h3>
        <p className="text-text-meta" style={descriptionStyle}>
          Reprocesses Stripe checkout sessions that have expired to create the matching order and
          expired cart records in Sanity.
        </p>
        <div className="flex flex-wrap gap-space-3 mb-space-2">
          <label className="flex items-center gap-space-2" htmlFor="expired-dry-run">
            <input
              id="expired-dry-run"
              name="expiredDryRun"
              type="checkbox"
              checked={expiredDryRun}
              onChange={(event) => setExpiredDryRun(event.target.checked)}
            />{' '}
            Dry run
          </label>
          <label className="flex flex-col gap-space-1" htmlFor="expired-limit">
            <span className="text-text-caption" style={fieldLabelStyle}>
              Limit
            </span>
            <input
              id="expired-limit"
              name="expiredLimit"
              type="number"
              min={1}
              value={expiredLimit}
              onChange={(event) => setExpiredLimit(event.target.value)}
              className="p-space-2 text-text-body"
              style={inlineInputStyle}
            />
          </label>
          <label className="flex flex-col gap-space-1" htmlFor="expired-since">
            <span className="text-text-caption" style={fieldLabelStyle}>
              Created since (ISO or Unix)
            </span>
            <input
              id="expired-since"
              name="expiredSince"
              type="text"
              value={expiredSince}
              onChange={(event) => setExpiredSince(event.target.value)}
              placeholder="2025-10-01 or 1730332800"
              className="p-space-2 text-text-body"
              style={inlineInputStyle}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-space-3 mb-space-2">
          <label
            className="flex flex-col gap-space-1"
            style={{flex: '1 1 260px'}}
            htmlFor="expired-session-id"
          >
            <span className="text-text-caption" style={fieldLabelStyle}>
              Specific session ID (optional)
            </span>
            <input
              id="expired-session-id"
              name="expiredSessionId"
              type="text"
              value={expiredSessionId}
              onChange={(event) => setExpiredSessionId(event.target.value)}
              placeholder="cs_..."
              className="w-full p-space-2 text-text-body"
              style={inputStyle}
            />
          </label>
        </div>
        {sharedSecretField('expired-secret')}
        {renderActionButton('expired-checkouts', 'Run Expired Checkout Backfill', () => {
          invokeBackfill('expired-checkouts', 'backfillExpiredCheckouts', {
            dryRun: expiredDryRun,
            body: {
              dryRun: expiredDryRun,
              limit: parseLimit(expiredLimit),
              since: expiredSince.trim() || undefined,
              sessionId: expiredSessionId.trim() || undefined,
            },
          })
        })}
        {renderMessage('expired-checkouts')}
      </section>

      <section className="p-space-3 mb-space-3" style={cardStyle}>
        <h3 className="mt-0">Order Shipping Backfill</h3>
        <p className="text-text-meta" style={descriptionStyle}>
          Replays checkout sessions to backfill packing slips, carrier data, and selected shipping
          services.
        </p>
        <div className="flex flex-wrap gap-space-3 mb-space-2">
          <label className="flex items-center gap-space-2" htmlFor="shipping-dry-run">
            <input
              id="shipping-dry-run"
              name="shippingDryRun"
              type="checkbox"
              checked={shippingDryRun}
              onChange={(event) => setShippingDryRun(event.target.checked)}
            />{' '}
            Dry run
          </label>
          <label
            className="flex flex-col gap-space-1"
            htmlFor="shipping-limit"
          >
            <span className="text-text-caption" style={fieldLabelStyle}>
              Limit
            </span>
            <input
              id="shipping-limit"
              name="shippingLimit"
              type="number"
              min={1}
              value={shippingLimit}
              onChange={(event) => setShippingLimit(event.target.value)}
              className="p-space-2 text-text-body"
              style={inlineInputStyle}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-space-3 mb-space-2">
          <label
            className="flex flex-col gap-space-1"
            style={{flex: '1 1 220px'}}
            htmlFor="shipping-order-id"
          >
            <span className="text-text-caption" style={fieldLabelStyle}>
              Order ID (optional)
            </span>
            <input
              id="shipping-order-id"
              name="shippingOrderId"
              type="text"
              value={shippingOrderId}
              onChange={(event) => setShippingOrderId(event.target.value)}
              className="w-full p-space-2 text-text-body"
              style={inputStyle}
            />
          </label>
          <label
            className="flex flex-col gap-space-1"
            style={{flex: '1 1 220px'}}
            htmlFor="shipping-session-id"
          >
            <span className="text-text-caption" style={fieldLabelStyle}>
              Checkout session ID (optional)
            </span>
            <input
              id="shipping-session-id"
              name="shippingSessionId"
              type="text"
              value={shippingSessionId}
              onChange={(event) => setShippingSessionId(event.target.value)}
              className="w-full p-space-2 text-text-body"
              style={inputStyle}
            />
          </label>
        </div>
        {renderActionButton('orderShipping', 'Run Shipping Backfill', () => {
          invokeBackfill('orderShipping', 'backfillOrderShipping', {
            dryRun: shippingDryRun,
            body: {
              limit: parseLimit(shippingLimit),
              orderId: shippingOrderId.trim() || undefined,
              sessionId: shippingSessionId.trim() || undefined,
            },
          })
        })}
        {renderMessage('orderShipping')}
      </section>

      <section className="p-space-3 mb-space-3" style={cardStyle}>
        <h3 className="mt-0">Stripe Order Sync</h3>
        <p className="text-text-meta" style={descriptionStyle}>
          Replays Stripe data to fill in checkout sessions, payment intents, or charge metadata on
          orders.
        </p>
        <div className="flex flex-wrap gap-space-3 mb-space-2">
          <label
            className="flex flex-col gap-space-1"
            htmlFor="stripe-sync-mode"
          >
            <span className="text-text-caption" style={fieldLabelStyle}>
              Mode
            </span>
            <select
              id="stripe-sync-mode"
              name="stripeKind"
              value={stripeKind}
              onChange={(event) =>
                setStripeKind(
                  event.target.value === 'charge'
                    ? 'charge'
                    : event.target.value === 'checkout'
                      ? 'checkout'
                      : 'paymentIntent',
                )
              }
              className="p-space-2 text-text-body"
              style={inlineInputStyle}
            >
              <option value="checkout">Checkout session</option>
              <option value="paymentIntent">Payment intent</option>
              <option value="charge">Charge</option>
            </select>
          </label>
          <label className="flex flex-col gap-space-1" htmlFor="stripe-limit">
            <span className="text-text-caption" style={fieldLabelStyle}>
              Limit
            </span>
            <input
              id="stripe-limit"
              name="stripeLimit"
              type="number"
              min={1}
              value={stripeLimit}
              onChange={(event) => setStripeLimit(event.target.value)}
              className="p-space-2 text-text-body"
              style={inlineInputStyle}
            />
          </label>
          <label className="flex items-center gap-space-2" htmlFor="stripe-dry-run">
            <input
              id="stripe-dry-run"
              name="stripeDryRun"
              type="checkbox"
              checked={stripeDryRun}
              onChange={(event) => setStripeDryRun(event.target.checked)}
            />{' '}
            Dry run
          </label>
        </div>
        <label
          className="flex flex-col gap-space-1 mb-space-2"
          htmlFor="stripe-specific-id"
        >
          <span className="text-text-caption" style={fieldLabelStyle}>
            Specific Stripe ID (optional)
          </span>
          <input
            id="stripe-specific-id"
            name="stripeId"
            type="text"
            value={stripeId}
            onChange={(event) => setStripeId(event.target.value)}
            placeholder="cs_ / pi_ / ch_"
            className="w-full p-space-2 text-text-body"
            style={inputStyle}
          />
        </label>
        <div className="flex flex-wrap gap-space-2">
          {renderActionButton('orderStripe', 'Run Stripe Sync', () => {
            invokeBackfill('orderStripe', 'backfillOrderStripe', {
              dryRun: stripeDryRun,
              body: {
                kind: stripeKind,
                limit: parseLimit(stripeLimit),
                id: stripeId.trim() || undefined,
              },
            })
          })}
          {renderActionButton(
            'orderStripe',
            'Run Batches (auto)',
            () => {
              runStripeBatches()
            },
            'default',
          )}
        </div>
        {renderMessage('orderStripe')}
      </section>

      <section className="p-space-3 mb-space-3" style={cardStyle}>
        <h3 className="mt-0">Payment Failure Diagnostics</h3>
        <p className="text-text-meta" style={descriptionStyle}>
          Pulls failure codes from Stripe and patches orders/invoices with reconciliation details.
        </p>
        <div className="flex flex-wrap gap-space-3 mb-space-2">
          <label
            className="flex items-center gap-space-2"
            htmlFor="payment-failures-dry-run"
          >
            <input
              id="payment-failures-dry-run"
              name="paymentFailuresDryRun"
              type="checkbox"
              checked={paymentFailuresDryRun}
              onChange={(event) => setPaymentFailuresDryRun(event.target.checked)}
            />{' '}
            Dry run
          </label>
          <label
            className="flex flex-col gap-space-1"
            htmlFor="payment-failures-limit"
          >
            <span className="text-text-caption" style={fieldLabelStyle}>
              Limit
            </span>
            <input
              id="payment-failures-limit"
              name="paymentFailuresLimit"
              type="number"
              min={1}
              value={paymentFailuresLimit}
              onChange={(event) => setPaymentFailuresLimit(event.target.value)}
              className="p-space-2 text-text-body"
              style={inlineInputStyle}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-space-3 mb-space-2">
          <label
            className="flex flex-col gap-space-1"
            style={{flex: '1 1 220px'}}
            htmlFor="payment-failures-order-id"
          >
            <span className="text-text-caption" style={fieldLabelStyle}>
              Order ID (optional)
            </span>
            <input
              id="payment-failures-order-id"
              name="paymentFailuresOrderId"
              type="text"
              value={paymentFailuresOrderId}
              onChange={(event) => setPaymentFailuresOrderId(event.target.value)}
              className="w-full p-space-2 text-text-body"
              style={inputStyle}
            />
          </label>
          <label
            className="flex flex-col gap-space-1"
            style={{flex: '1 1 220px'}}
            htmlFor="payment-failures-order-number"
          >
            <span className="text-text-caption" style={fieldLabelStyle}>
              Order number (optional)
            </span>
            <input
              id="payment-failures-order-number"
              name="paymentFailuresOrderNumber"
              type="text"
              value={paymentFailuresOrderNumber}
              onChange={(event) => setPaymentFailuresOrderNumber(event.target.value)}
              placeholder="FAS-000123"
              className="w-full p-space-2 text-text-body"
              style={inputStyle}
            />
          </label>
          <label
            className="flex flex-col gap-space-1"
            style={{flex: '1 1 220px'}}
            htmlFor="payment-failures-intent"
          >
            <span className="text-text-caption" style={fieldLabelStyle}>
              Payment intent ID (optional)
            </span>
            <input
              id="payment-failures-intent"
              name="paymentFailuresPaymentIntent"
              type="text"
              value={paymentFailuresPaymentIntent}
              onChange={(event) => setPaymentFailuresPaymentIntent(event.target.value)}
              placeholder="pi_..."
              className="w-full p-space-2 text-text-body"
              style={inputStyle}
            />
          </label>
        </div>
        {renderActionButton('paymentFailures', 'Run Payment Failure Backfill', () => {
          invokeBackfill('paymentFailures', 'backfillPaymentFailures', {
            dryRun: paymentFailuresDryRun,
            body: {
              limit: parseLimit(paymentFailuresLimit),
              orderId: paymentFailuresOrderId.trim() || undefined,
              orderNumber: paymentFailuresOrderNumber.trim() || undefined,
              paymentIntentId: paymentFailuresPaymentIntent.trim() || undefined,
            },
          })
        })}
        {renderMessage('paymentFailures')}
      </section>

      <section className="p-space-3 mb-space-3" style={cardStyle}>
        <h3 className="mt-0">Refund Reconciliation</h3>
        <p className="text-text-meta" style={descriptionStyle}>
          Replays Stripe refund webhook events to ensure orders and invoices reflect refund status.
        </p>
        <div className="flex flex-wrap gap-space-3 mb-space-2">
          <label className="flex items-center gap-space-2" htmlFor="refunds-dry-run">
            <input
              id="refunds-dry-run"
              name="refundsDryRun"
              type="checkbox"
              checked={refundsDryRun}
              onChange={(event) => setRefundsDryRun(event.target.checked)}
            />{' '}
            Dry run
          </label>
          <label className="flex flex-col gap-space-1" htmlFor="refunds-limit">
            <span className="text-text-caption" style={fieldLabelStyle}>
              Limit
            </span>
            <input
              id="refunds-limit"
              name="refundsLimit"
              type="number"
              min={1}
              value={refundsLimit}
              onChange={(event) => setRefundsLimit(event.target.value)}
              className="p-space-2 text-text-body"
              style={inlineInputStyle}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-space-3 mb-space-2">
          <label
            className="flex flex-col gap-space-1"
            style={{flex: '1 1 220px'}}
            htmlFor="refunds-order-id"
          >
            <span className="text-text-caption" style={fieldLabelStyle}>
              Order ID (optional)
            </span>
            <input
              id="refunds-order-id"
              name="refundsOrderId"
              type="text"
              value={refundsOrderId}
              onChange={(event) => setRefundsOrderId(event.target.value)}
              className="w-full p-space-2 text-text-body"
              style={inputStyle}
            />
          </label>
          <label
            className="flex flex-col gap-space-1"
            style={{flex: '1 1 220px'}}
            htmlFor="refunds-payment-intent"
          >
            <span className="text-text-caption" style={fieldLabelStyle}>
              Payment intent ID (optional)
            </span>
            <input
              id="refunds-payment-intent"
              name="refundsPaymentIntent"
              type="text"
              value={refundsPaymentIntent}
              onChange={(event) => setRefundsPaymentIntent(event.target.value)}
              placeholder="pi_..."
              className="w-full p-space-2 text-text-body"
              style={inputStyle}
            />
          </label>
        </div>
        {renderActionButton('refunds', 'Run Refund Backfill', () => {
          invokeBackfill('refunds', 'backfillRefunds', {
            dryRun: refundsDryRun,
            body: {
              limit: parseLimit(refundsLimit),
              orderId: refundsOrderId.trim() || undefined,
              paymentIntentId: refundsPaymentIntent.trim() || undefined,
            },
          })
        })}
        {renderMessage('refunds')}
      </section>

      <section className="p-space-3 mb-space-3" style={cardStyle}>
        <h3 className="mt-0">Stripe Products Sync</h3>
        <p className="text-text-meta" style={descriptionStyle}>
          Invokes the catalog sync to ensure Sanity products are reflected in Stripe with current
          pricing.
        </p>
        <div className="flex flex-wrap gap-space-3 mb-space-2">
          <label
            className="flex flex-col gap-space-1"
            htmlFor="stripe-product-mode"
          >
            <span className="text-text-caption" style={fieldLabelStyle}>
              Mode
            </span>
            <select
              id="stripe-product-mode"
              name="productMode"
              value={productMode}
              onChange={(event) => setProductMode(event.target.value === 'all' ? 'all' : 'missing')}
              className="p-space-2 text-text-body"
              style={inlineInputStyle}
            >
              <option value="missing">Missing only</option>
              <option value="all">Sync all</option>
            </select>
          </label>
          <label
            className="flex flex-col gap-space-1"
            htmlFor="stripe-product-limit"
          >
            <span className="text-text-caption" style={fieldLabelStyle}>
              Limit
            </span>
            <input
              id="stripe-product-limit"
              name="productLimit"
              type="number"
              min={1}
              max={100}
              value={productLimit}
              onChange={(event) => setProductLimit(event.target.value)}
              className="p-space-2 text-text-body"
              style={inlineInputStyle}
            />
          </label>
        </div>
        <label
          className="flex flex-col gap-space-1 mb-space-2"
          htmlFor="stripe-product-ids"
        >
          <span className="text-text-caption" style={fieldLabelStyle}>
            Specific product IDs (optional, comma separated)
          </span>
          <input
            id="stripe-product-ids"
            name="productIds"
            type="text"
            value={productIds}
            onChange={(event) => setProductIds(event.target.value)}
            placeholder="productId1,productId2"
            className="w-full p-space-2 text-text-body"
            style={inputStyle}
          />
        </label>
        {renderActionButton('stripeProducts', 'Run Stripe Sync', () => {
          const ids = productIds
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean)
          invokeBackfill('stripeProducts', 'backfillStripeProducts', {
            body: {
              mode: productMode,
              limit: parseLimit(productLimit),
              ...(ids.length ? {productIds: ids} : {}),
            },
          })
        })}
        {renderMessage('stripeProducts')}
      </section>
    </div>
  )
})

AdminTools.displayName = 'AdminTools'

export default AdminTools
