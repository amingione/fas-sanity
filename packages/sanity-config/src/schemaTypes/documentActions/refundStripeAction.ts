// NOTE: orderId is deprecated; prefer orderNumber for identifiers.
import type {DocumentActionComponent} from 'sanity'
import {getNetlifyFnBase} from './netlifyFnBase'

const normalizeId = (id: string) => id.replace(/^drafts\./, '').trim()

const allowedStatuses = new Set([
  'paid',
  'fulfilled',
  'shipped',
  'closed',
  'refunded',
  'partially_refunded',
])

const parseAmountInput = (value: string): number | undefined => {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const num = Number(trimmed)
  if (!Number.isFinite(num) || num <= 0) return undefined
  return Number(num.toFixed(2))
}

const formatMoney = (value?: number, currency?: string): string | undefined => {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined
  const code = (currency || 'USD').toUpperCase()
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${value.toFixed(2)} ${code}`
  }
}

const confirmAndCollect = (options: {
  reference: string
  remaining?: number
  currency?: string
  suggestedAmount?: number
}) => {
  if (typeof window === 'undefined') {
    return {amount: undefined, reason: ''}
  }

  const {reference, remaining, currency, suggestedAmount} = options
  const remainingLabel =
    typeof remaining === 'number'
      ? `Remaining balance: ${formatMoney(remaining, currency) || remaining}`
      : ''
  const promptText = `Enter refund amount for ${reference} (leave blank for ${
    remainingLabel || 'full available amount'
  }).\nUse decimals for partial refunds.`.trim()
  const defaultValue =
    typeof suggestedAmount === 'number'
      ? suggestedAmount.toFixed(2)
      : typeof remaining === 'number'
        ? remaining.toFixed(2)
        : ''
  const amountInput = window.prompt(promptText, defaultValue) || ''
  const amount = parseAmountInput(amountInput)
  const reason = window.prompt('Optional: add a note for this refund', '') || ''
  return {amount, reason: reason.trim()}
}

const handleResponse = async (response: Response) => {
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data?.error) {
    const message = data?.error || data?.detail || response.statusText || String(response.status)
    if (typeof window !== 'undefined') window.alert(`Refund failed: ${message}`)
  } else if (typeof window !== 'undefined') {
    const amount = typeof data.amount === 'number' ? formatMoney(data.amount, data.currency) : null
    const label = amount
      ? `${amount} • status=${data.stripeStatus || 'n/a'}`
      : `status=${data.stripeStatus || 'n/a'}`
    window.alert(`Refund created: ${data.refundId || 'n/a'} (${label})`)
  }
}

export const refundStripeOrderAction: DocumentActionComponent = (props) => {
  const {published, onComplete, id} = props
  if (!published) return null

  const doc = published as Record<string, any>
  const paymentIntentId: string | undefined = doc.paymentIntentId
  const chargeId: string | undefined = doc.chargeId
  const paymentStatus = typeof doc.paymentStatus === 'string' ? doc.paymentStatus.toLowerCase() : ''

  if (!paymentIntentId && !chargeId) return null
  if (paymentStatus && !allowedStatuses.has(paymentStatus)) return null

  const totalAmount = typeof doc.totalAmount === 'number' ? doc.totalAmount : undefined
  const amountRefunded = typeof doc.amountRefunded === 'number' ? doc.amountRefunded : 0
  const remaining =
    typeof totalAmount === 'number' ? Math.max(totalAmount - (amountRefunded || 0), 0) : undefined
  const currency = typeof doc.currency === 'string' ? doc.currency : 'USD'
  const reference =
    (typeof doc.orderNumber === 'string' && doc.orderNumber) ||
    (typeof doc.slug?.current === 'string' && doc.slug.current) ||
    id

  return {
    label: 'Issue Refund',
    tone: 'caution',
    onHandle: async () => {
      try {
        const {amount, reason} = confirmAndCollect({
          reference,
          remaining,
          currency,
          suggestedAmount: remaining && remaining > 0 ? remaining : undefined,
        })

        const base = getNetlifyFnBase().replace(/\/$/, '')
        const payload: Record<string, unknown> = {
          orderId: normalizeId(id),
        }
        if (typeof amount === 'number') payload.amount = amount
        if (reason) payload.reason = reason

        const res = await fetch(`${base}/.netlify/functions/createRefund`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(payload),
        })
        await handleResponse(res)
      } catch (err: any) {
        if (typeof window !== 'undefined') window.alert(`Refund error: ${err?.message || err}`)
      } finally {
        onComplete()
      }
    },
  }
}

export const refundStripeInvoiceAction: DocumentActionComponent = (props) => {
  const {published, onComplete, id} = props
  if (!published) return null

  const doc = published as Record<string, any>
  const paymentIntentId: string | undefined = doc.paymentIntentId
  const chargeId: string | undefined = doc.chargeId
  const status = typeof doc.status === 'string' ? doc.status.toLowerCase() : ''

  if (!paymentIntentId && !chargeId && !doc?.orderRef?.paymentIntentId) return null
  if (status && !allowedStatuses.has(status)) return null

  const total =
    (typeof doc.total === 'number' && doc.total) ||
    (typeof doc.amountSubtotal === 'number' && doc.amountSubtotal + (Number(doc.amountTax) || 0)) ||
    undefined
  const currency = typeof doc.currency === 'string' ? doc.currency : 'USD'
  const reference =
    (typeof doc.invoiceNumber === 'string' && doc.invoiceNumber) ||
    (typeof doc.title === 'string' && doc.title) ||
    id

  return {
    label: 'Issue Refund',
    tone: 'caution',
    onHandle: async () => {
      try {
        const {amount, reason} = confirmAndCollect({
          reference,
          remaining: total,
          currency,
          suggestedAmount: total,
        })

        const base = getNetlifyFnBase().replace(/\/$/, '')
        const payload: Record<string, unknown> = {
          invoiceId: normalizeId(id),
        }
        if (typeof amount === 'number') payload.amount = amount
        if (reason) payload.reason = reason

        const res = await fetch(`${base}/.netlify/functions/createRefund`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(payload),
        })
        await handleResponse(res)
      } catch (err: any) {
        if (typeof window !== 'undefined') window.alert(`Refund error: ${err?.message || err}`)
      } finally {
        onComplete()
      }
    },
  }
}
