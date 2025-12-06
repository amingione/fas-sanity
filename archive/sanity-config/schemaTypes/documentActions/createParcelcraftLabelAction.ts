import type {DocumentActionComponent} from 'sanity'
import {formatApiError} from '../../utils/formatApiError'
import {resolveNetlifyBase} from '../../utils/netlifyBase'

const getNetlifyBase = (): string => resolveNetlifyBase()

const hasShippingAddress = (doc: any) => {
  const addr = doc?.shippingAddress || {}
  return Boolean(addr.addressLine1 && addr.city && addr.state && addr.postalCode && addr.country)
}

export const createParcelcraftLabelAction: DocumentActionComponent = (props) => {
  const {id, published, onComplete} = props
  if (!published || published._type !== 'order') return null

  const order = published as any
  const isPaid = order?.status === 'paid'
  const hasTracking = Boolean(order?.fulfillment?.trackingNumber)

  if (!isPaid || !hasShippingAddress(order) || hasTracking) return null

  return {
    label: 'Create Shipping Label',
    tone: 'positive',
    onHandle: async () => {
      const orderNumber = (order?._id || id || '').replace(/^drafts\./, '')
      if (!orderNumber) {
        alert('Order must be published before creating a label.')
        onComplete()
        return
      }

      const weightInput =
        typeof window !== 'undefined' ? window.prompt('Package weight (oz)', '16') || '' : '16'
      const weightOz = Number(weightInput) || 16
      const dimsInput =
        typeof window !== 'undefined'
          ? window.prompt('Dimensions LxWxH (in)', '10x8x4') || ''
          : '10x8x4'
      const dimsMatch = dimsInput.match(
        /(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/,
      )
      const dimensions = dimsMatch
        ? {length: Number(dimsMatch[1]), width: Number(dimsMatch[2]), height: Number(dimsMatch[3])}
        : {length: 10, width: 8, height: 4}

      const base = getNetlifyBase().replace(/\/$/, '')
      try {
        const res = await fetch(`${base}/.netlify/functions/create-parcelcraft-label`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({orderId: orderNumber, weightOz, dimensions}),
        })
        const result = await res.json().catch(() => ({}))
        if (!res.ok || result?.error) {
          throw new Error(formatApiError(result?.error ?? `HTTP ${res.status}`))
        }

        const tracking = result?.trackingNumber || 'tracking pending'
        if (result?.trackingUrl && typeof window !== 'undefined') {
          try {
            window.open(result.trackingUrl, '_blank', 'noopener,noreferrer')
          } catch {}
        }
        alert(`Label created. Tracking: ${tracking}`)
      } catch (err: any) {
        console.error('Parcelcraft label creation failed', err)
        alert(`Label failed: ${err?.message || err}`)
      } finally {
        onComplete()
      }
    },
  }
}
