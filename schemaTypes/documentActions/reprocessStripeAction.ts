import type { DocumentActionComponent } from 'sanity'

function getFnBase(): string {
  const envBase = (typeof process !== 'undefined' ? (process as any)?.env?.SANITY_STUDIO_NETLIFY_BASE : undefined) as string | undefined
  if (envBase) return envBase
  if (typeof window !== 'undefined') {
    try {
      const ls = window.localStorage?.getItem('NLFY_BASE')
      if (ls) return ls
      const origin = window.location?.origin
      if (origin && /^https?:\/\//i.test(origin)) return origin
    } catch {}
  }
  return 'https://fassanity.fasmotorsports.com'
}

export const reprocessStripeSessionAction: DocumentActionComponent = (props) => {
  const { published, onComplete } = props
  if (!published) return null

  return {
    label: 'Reprocess Stripe Session',
    onHandle: async () => {
      try {
        const id = typeof window !== 'undefined' ? (window.prompt('Enter Stripe id (cs_… or pi_…):') || '').trim() : ''
        if (!id) return onComplete()
        const base = getFnBase().replace(/\/$/, '')
        const res = await fetch(`${base}/.netlify/functions/reprocessStripeSession`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, autoFulfill: true }),
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

