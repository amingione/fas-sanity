// NOTE: orderId is deprecated; prefer orderNumber for identifiers.
import type {DocumentActionComponent} from 'sanity'
import {formatApiError} from '../../utils/formatApiError'
import {readStudioEnv} from '../../utils/studioEnv'

function getNetlifyBase(): string {
  const envBase = (
    typeof process !== 'undefined' ? (process as any)?.env?.SANITY_STUDIO_NETLIFY_BASE : undefined
  ) as string | undefined
  if (envBase) return envBase.replace(/\/$/, '')
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage?.getItem('NLFY_BASE')
      if (stored) return stored.replace(/\/$/, '')
      const origin = window.location?.origin
      if (origin && /^https?:\/\//i.test(origin)) {
        if (/\.sanity\.studio$/i.test(new URL(origin).hostname)) {
          return 'https://fassanity.fasmotorsports.com'
        }
        return origin.replace(/\/$/, '')
      }
    } catch {
      // ignore storage errors
    }
  }
  return 'https://fassanity.fasmotorsports.com'
}

export const createEasyPostLabelAction: DocumentActionComponent = (props) => {
  const provider = (
    readStudioEnv('SHIPPING_PROVIDER') ||
    readStudioEnv('SANITY_STUDIO_SHIPPING_PROVIDER') ||
    ''
  ).toLowerCase()
  if (provider !== 'easypost') return null

  const {id, published, onComplete} = props
  if (!published || published._type !== 'order') return null

  return {
    label: 'Create EasyPost Label',
    tone: 'positive',
    onHandle: async () => {
      const orderId = (published._id || id || '').replace(/^drafts\./, '')
      if (!orderId) {
        alert('Order must be published before creating a label.')
        onComplete()
        return
      }

      const base = getNetlifyBase()
      try {
        const response = await fetch(`${base}/.netlify/functions/easypostCreateLabel`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({orderId}),
        })

        const rawBody = await response.text()
        let result: any = null
        try {
          result = rawBody ? JSON.parse(rawBody) : null
        } catch {
          throw new Error(
            `Unexpected response from ${base}. Verify SANITY_STUDIO_NETLIFY_BASE is configured.`,
          )
        }

        if (!response.ok || (result && result.error)) {
          throw new Error(formatApiError(result?.error ?? result ?? `HTTP ${response.status}`))
        }

        const labelUrl = result?.labelUrl || result?.trackingUrl
        if (labelUrl && typeof window !== 'undefined') {
          try {
            window.open(labelUrl, '_blank', 'noopener,noreferrer')
          } catch {
            window.location.href = labelUrl
          }
        }

        if (!labelUrl) {
          alert('Label created. Shipping info will appear once EasyPost updates tracking.')
        }
      } catch (error: any) {
        console.error('EasyPost label creation failed', error)
        alert(`EasyPost label failed: ${error?.message || error || 'Unknown error'}`)
      } finally {
        onComplete()
      }
    },
  }
}
