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
  const [invoiceLimit, setInvoiceLimit] = useState('50')

  const [paymentFailuresDryRun, setPaymentFailuresDryRun] = useState(true)
  const [paymentFailuresLimit, setPaymentFailuresLimit] = useState('25')
  const [paymentFailuresOrderId, setPaymentFailuresOrderId] = useState('')
  const [paymentFailuresOrderNumber, setPaymentFailuresOrderNumber] = useState('')
  const [paymentFailuresPaymentIntent, setPaymentFailuresPaymentIntent] = useState('')


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

  function formatSuccessMessage(key: string, data: BackfillResponse): string {
    switch (key) {
      case 'orders':
        return `OK${data.dryRun ? ' (dry run)' : ''}: processed=${data.total}, changed=${data.changed}, migratedCustomer=${data.migratedCustomer}, cartFixed=${data.cartFixed}, remainingLegacyCustomer=${data.remainingCustomer}`
      case 'invoices':
        return `OK${data.dryRun ? ' (dry run)' : ''}: processed=${data.total}, changed=${data.changed}, migratedCustomer=${data.migratedCustomer}, migratedOrder=${data.migratedOrder}, itemsFixed=${data.itemsFixed}`
      case 'customers':
        return `OK${data.dryRun ? ' (dry run)' : ''}: processed=${data.total}, changed=${data.changed}, userIdSet=${data.userIdSet}, optInDefaults=${data.optInDefaults}, updatedStamped=${data.updatedStamped}`
      case 'paymentFailures':
        return `OK${data.dryRun ? ' (dry run)' : ''}: matched=${data.total}, updated=${data.updated}, skipped=${data.skipped}`
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
