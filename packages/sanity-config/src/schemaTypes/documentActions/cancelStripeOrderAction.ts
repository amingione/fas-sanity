// NOTE: orderId is deprecated; prefer orderNumber for identifiers.
import type {DocumentActionComponent} from 'sanity'
import {getNetlifyFnBase} from './netlifyFnBase'

const normalizeId = (id: string) => id.replace(/^drafts\./, '')

export const cancelStripeOrderAction: DocumentActionComponent = (props) => {
  const {published, onComplete, id} = props
  if (!published) return null

  const doc = published as Record<string, any>
  const paymentIntentId: string | undefined = doc.paymentIntentId
  const chargeId: string | undefined = doc.chargeId
  const status: string | undefined = doc.status

  if (!paymentIntentId && !chargeId) return null
  if (status === 'cancelled') return null

  return {
    label: 'Cancel in Stripe',
    tone: 'critical',
    onHandle: async () => {
      try {
        const confirmed =
          typeof window === 'undefined'
            ? false
            : window.confirm('Cancel and refund this order in Stripe?')
        if (!confirmed) return onComplete()

        const reason =
          typeof window === 'undefined'
            ? ''
            : window.prompt('Optional: add a note about this cancellation', '') || ''

        const base = getNetlifyFnBase().replace(/\/$/, '')
        const res = await fetch(`${base}/.netlify/functions/cancelOrder`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            orderId: normalizeId(id),
            reason: reason.trim() || undefined,
          }),
        })

        const data = await res.json().catch(() => ({}))
        if (!res.ok || data?.error) {
          const message = data?.error || data?.detail || res.statusText || String(res.status)
          if (typeof window !== 'undefined') {
            window.alert(`Cancel failed: ${message}`)
          }
        } else if (typeof window !== 'undefined') {
          const action = data?.stripeAction || 'updated'
          window.alert(`Order ${action} successfully in Stripe.`)
        }
      } catch (err: any) {
        if (typeof window !== 'undefined') window.alert(`Cancel error: ${err?.message || err}`)
      } finally {
        onComplete()
      }
    },
  }
}
