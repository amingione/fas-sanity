import type {DocumentActionComponent} from 'sanity'
import {formatApiError} from '../../utils/formatApiError'
import {resolveNetlifyBase} from '../../utils/netlifyBase'

const getFnBase = (): string => resolveNetlifyBase()

export const createShippingLabel: DocumentActionComponent = (props) => {
  const {id, published, onComplete} = props

  if (!published || published._type !== 'invoice') return null
  return {
    label: 'Create Shipping Label',
    onHandle: async () => {
      try {
        const base = getFnBase().replace(/\/$/, '')
        const weightStr =
          typeof window !== 'undefined' ? (window.prompt('Weight (lb):', '1') || '').trim() : '1'
        const dimsStr =
          typeof window !== 'undefined'
            ? (window.prompt('Dimensions LxWxH (in):', '10x8x4') || '').trim()
            : '10x8x4'
        const m = dimsStr.match(/(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/)
        if (!m) throw new Error('Invalid dimensions')
        const L = Number(m[1]),
          W = Number(m[2]),
          H = Number(m[3])
        const wt = Number(weightStr)
        if (!Number.isFinite(wt) || wt <= 0) throw new Error('Invalid weight')

        const res = await fetch(`${base}/.netlify/functions/easypostCreateLabel`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            invoiceId: id,
            package_details: {
              weight: {value: wt, unit: 'pound'},
              dimensions: {unit: 'inch', length: L, width: W, height: H},
            },
          }),
        })
        const result = await res.json().catch(() => ({}))
        if (!res.ok || result?.error) {
          throw new Error(formatApiError(result?.error ?? result ?? `HTTP ${res.status}`))
        }
        if (result?.labelUrl) {
          try {
            window.open(result.labelUrl, '_blank')
          } catch {}
          alert(`EasyPost label created. Tracking: ${result?.trackingNumber || 'n/a'}`)
        } else {
          alert('Label created, but URL missing. Check order shipping log.')
        }
      } catch (error) {
        console.error('Request failed', String((error as any)?.message || error))
      }

      onComplete()
    },
  }
}
