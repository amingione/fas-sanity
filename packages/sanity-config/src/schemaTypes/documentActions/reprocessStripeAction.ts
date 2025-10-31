import type { DocumentActionComponent } from 'sanity'
import { getNetlifyFnBase } from './netlifyFnBase'

export const reprocessStripeSessionAction: DocumentActionComponent = (props) => {
  const { published, onComplete } = props
  if (!published) return null

  const doc = published as {
    stripeSessionId?: string | null
    paymentIntentId?: string | null
    orderNumber?: string | null
    _id?: string
  }

  const defaultId = [doc?.stripeSessionId, doc?.paymentIntentId]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .find((value) => Boolean(value))

  return {
    label: 'Reprocess Stripe Session',
    onHandle: async () => {
      try {
        let id = defaultId || ''

        if (typeof window !== 'undefined') {
          const orderRef = doc?.orderNumber?.trim() || doc?.stripeSessionId?.trim() || doc?._id || 'order'
          if (id) {
            const confirmed = window.confirm(
              `Reprocess ${orderRef} using ${id}?\nClick "Cancel" to provide a different Stripe id.`,
            )
            if (!confirmed) {
              id = (window.prompt('Enter Stripe id (cs_… or pi_…):', id) || '').trim()
            }
          } else {
            id = (window.prompt('Enter Stripe id (cs_… or pi_…):') || '').trim()
          }
        }

        if (!id) return onComplete()

        const base = getNetlifyFnBase().replace(/\/$/, '')
        const payload: Record<string, unknown> = { id, autoFulfill: true }
        if (typeof doc?._id === 'string' && doc._id.trim()) {
          payload.targetOrderId = doc._id.trim()
        }

        const res = await fetch(`${base}/.netlify/functions/reprocessStripeSession`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || data?.error) {
          alert(`Reprocess failed: ${data?.error || res.status}`)
        } else {
          alert(`Reprocessed ${data.type} • order: ${data.orderId || 'n/a'} • status: ${data.paymentStatus}`)
        }
      } catch (e: any) {
        alert(`Reprocess error: ${e?.message || e}`)
      } finally {
        onComplete()
      }
    },
  }
}
