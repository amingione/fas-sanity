import type {DocumentActionComponent} from 'sanity'
import {PackageIcon, EnvelopeIcon} from '@sanity/icons'
import {callNetlifyFunction} from '../../utils/netlifyHelpers'

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
        const orderId = doc._id.replace(/^drafts\./, '')
        const response = await callNetlifyFunction('generatePackingSlips', {orderId})
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const filenameSafe = (doc.orderNumber || orderId).toString().replace(/[^a-z0-9_-]/gi, '') || 'order'
        const a = document.createElement('a')
        a.href = url
        a.download = `packing-slip-${filenameSafe}.pdf`
        a.click()
        window.URL.revokeObjectURL(url)
        onComplete()
      } catch (err) {
        console.error('GeneratePackingSlipAction failed', err)
        alert((err as Error)?.message || 'Failed to generate packing slip')
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
