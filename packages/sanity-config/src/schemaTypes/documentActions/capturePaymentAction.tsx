import {useState} from 'react'
import {type DocumentActionComponent} from 'sanity'
import {resolveNetlifyBase} from '../../utils/netlifyBase'

export const capturePaymentAction: DocumentActionComponent = (props) => {
  const {id, type, draft, published} = props
  const [isLoading, setIsLoading] = useState(false)

  if (type !== 'order') return null
  const doc = (draft || published) as
    | {
        orderNumber?: string
        paymentStatus?: string
        paymentCaptureStrategy?: 'auto' | 'manual'
        paymentCaptured?: boolean
      }
    | null

  if (!doc) return null
  if (doc.paymentCaptureStrategy !== 'manual') return null
  if (doc.paymentStatus !== 'paid') return null
  if (doc.paymentCaptured) return null

  return {
    label: 'Capture Payment',
    icon: () => '💳',
    tone: 'positive',
    disabled: isLoading,
    onHandle: async () => {
      if (
        !window.confirm(
          `Capture payment for ${doc.orderNumber || 'this order'}?\n\nThis will charge the customer.`,
        )
      ) {
        return
      }

      setIsLoading(true)
      try {
        const base = resolveNetlifyBase()
        const endpoint = `${base.replace(/\/$/, '')}/.netlify/functions/captureOrderPayment`
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({orderId: id}),
        })

        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload?.error || payload?.message || 'Failed to capture payment')
        }

        const amountLabel =
          typeof payload.amountCaptured === 'number'
            ? `$${Number(payload.amountCaptured).toFixed(2)}`
            : 'the authorized amount'
        alert(`Payment captured successfully for ${amountLabel}.`)
        props.onComplete()
      } catch (err: any) {
        console.error('capturePaymentAction failed', err)
        alert(err?.message || 'Unable to capture payment. See console for details.')
      } finally {
        setIsLoading(false)
      }
    },
  }
}
