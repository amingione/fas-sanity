import type {DocumentActionComponent} from 'sanity'
import {useCurrentUser} from 'sanity'
import {PackageIcon, RocketIcon, EnvelopeIcon} from '@sanity/icons'

const openUrl = (url?: string | null) => {
  if (!url) return
  try {
    window.open(url, '_blank', 'noopener')
  } catch {
    window.location.href = url
  }
}

export const GeneratePackingSlipAction: DocumentActionComponent = (props) => {
  const {type, draft, published, onComplete} = props
  if (type !== 'order') return null

  return {
    label: 'Generate packing slip',
    icon: PackageIcon,
    onHandle: async () => {
      const doc = draft || published
      if (!doc?._id) {
        alert('Save the order before generating a packing slip.')
        onComplete()
        return
      }
      try {
        const response = await fetch('/api/generate-packing-slip', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({orderId: doc._id, orderNumber: doc.orderNumber}),
        })
        if (!response.ok) {
          const {message} = await response.json().catch(() => ({message: 'Unable to generate'}))
          throw new Error(message || 'Unable to generate packing slip')
        }
        const {pdfUrl} = (await response.json()) as {pdfUrl?: string}
        onComplete()
        openUrl(pdfUrl)
      } catch (err) {
        console.error('GeneratePackingSlipAction failed', err)
        alert((err as Error)?.message || 'Failed to generate packing slip')
        onComplete()
      }
    },
  }
}

export const CreateShippingLabelAction: DocumentActionComponent = (props) => {
  const {type, draft, published, onComplete} = props
  if (type !== 'order') return null
  const currentUser = useCurrentUser()
  const doc = draft || published
  const labelAlreadyPurchased = Boolean(doc?.labelPurchased)

  return {
    label: 'Create shipping label',
    icon: RocketIcon,
    tone: 'primary',
    disabled: labelAlreadyPurchased,
    title: labelAlreadyPurchased ? 'Label already purchased for this order.' : undefined,
    onHandle: async () => {
      if (!doc?._id) {
        alert('Save the order before creating a label.')
        onComplete()
        return
      }
      if (doc.labelPurchased) {
        alert(`Label already purchased${doc.trackingNumber ? ` (Tracking ${doc.trackingNumber})` : ''}.`)
        onComplete()
        return
      }
      if (!doc.shippingAddress) {
        alert('Add a shipping address before purchasing a label.')
        onComplete()
        return
      }

      const packageDimensions = doc.packageDimensions || {}
      const hasWeight = typeof packageDimensions.weight === 'number' && packageDimensions.weight > 0
      if (!hasWeight) {
        const confirmDefault = confirm(
          'Package dimensions are missing. Default values will be used:\n\n' +
            'Weight: 2 lbs\nDimensions: 10 x 8 x 4 inches\n\nContinue?',
        )
        if (!confirmDefault) {
          onComplete()
          return
        }
      }

      const confirmPurchase = confirm(
        `Purchase shipping label for order ${doc.orderNumber || doc._id}?\n\n` +
          `Customer: ${doc.customerName || 'Customer'}\n` +
          `Ship to: ${doc.shippingAddress.city || ''}, ${doc.shippingAddress.state || ''}\n` +
          `Carrier: ${doc.carrier || 'Selected at checkout'}\n` +
          `Service: ${doc.service || 'Selected at checkout'}\n\n` +
          'This will charge your EasyPost account.',
      )
      if (!confirmPurchase) {
        onComplete()
        return
      }

      const normalizedDimensions = {
        weight: typeof packageDimensions.weight === 'number' ? packageDimensions.weight : 2,
        length: typeof packageDimensions.length === 'number' ? packageDimensions.length : 10,
        width: typeof packageDimensions.width === 'number' ? packageDimensions.width : 8,
        height: typeof packageDimensions.height === 'number' ? packageDimensions.height : 4,
      }

      const body = {
        orderId: (doc._id || '').replace(/^drafts\./, ''),
        orderNumber: doc.orderNumber,
        shippingAddress: doc.shippingAddress,
        packageDimensions: normalizedDimensions,
        easypostRateId: doc.easypostRateId,
        carrier: doc.carrier,
        service: doc.service,
        purchasedBy: currentUser?.email || currentUser?.name || 'Unknown',
      }

      try {
        const response = await fetch('/api/create-shipping-label', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(body),
        })
        if (!response.ok) {
          const result = await response.json().catch(() => ({}))
          throw new Error(result?.error || result?.message || 'Unable to create label')
        }
        const {trackingNumber, labelUrl, carrier, service, cost} = (await response.json()) as {
          trackingNumber?: string
          labelUrl?: string
          carrier?: string
          service?: string
          cost?: number
        }
        const costLabel = typeof cost === 'number' ? cost.toFixed(2) : null
        alert(
          `✅ Shipping label created!\n\n` +
            `Tracking: ${trackingNumber || 'Pending'}\n` +
            `Carrier: ${carrier || 'n/a'}\n` +
            `Service: ${service || 'n/a'}\n` +
            (costLabel ? `Cost: $${costLabel}\n` : ''),
        )
        onComplete()
        if (labelUrl) openUrl(labelUrl)
      } catch (err) {
        console.error('CreateShippingLabelAction failed', err)
        alert((err as Error)?.message || 'Failed to create shipping label')
        onComplete()
      }
    },
  }
}

export const SendShippingConfirmationAction: DocumentActionComponent = (props) => {
  const {type, draft, published, onComplete} = props
  if (type !== 'order') return null

  return {
    label: 'Send shipping confirmation',
    icon: EnvelopeIcon,
    onHandle: async () => {
      const doc = draft || published
      if (!doc?.trackingNumber) {
        alert('Add a tracking number before emailing the customer.')
        onComplete()
        return
      }
      try {
        const response = await fetch('/api/send-shipping-confirmation', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            orderId: doc._id,
            orderNumber: doc.orderNumber,
            customerEmail: doc.customerEmail,
            trackingNumber: doc.trackingNumber,
            trackingUrl: doc.trackingUrl,
          }),
        })
        if (!response.ok) {
          const {message} = await response.json().catch(() => ({message: 'Unable to send email'}))
          throw new Error(message)
        }
        alert('Shipping confirmation sent.')
      } catch (err) {
        console.error('SendShippingConfirmationAction failed', err)
        alert((err as Error)?.message || 'Failed to send shipping confirmation')
      } finally {
        onComplete()
      }
    },
  }
}
