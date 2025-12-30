import type {DocumentActionComponent} from 'sanity'
import {PackageIcon, RocketIcon, EnvelopeIcon} from '@sanity/icons'
import {callNetlifyFunction} from '../../utils/netlifyHelpers'

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

export const CreateShippingLabelAction: DocumentActionComponent = (props) => {
  const {type, draft, published, onComplete} = props
  if (type !== 'order') return null
  const doc = draft || published
  const labelAlreadyPurchased = Boolean(doc?.labelPurchased)
  const defaultDimensions = {weight: 2, length: 10, width: 8, height: 4}
  const parseDimensionInput = (input: string) => {
    const numbers = input.match(/[\d.]+/g)?.map((value) => Number(value)) || []
    if (numbers.length !== 4 || numbers.some((value) => !Number.isFinite(value) || value <= 0)) {
      return null
    }
    const [weight, length, width, height] = numbers
    return {weight, length, width, height}
  }

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

      const packageDimensions: {
        weight?: number | null
        length?: number | null
        width?: number | null
        height?: number | null
      } = doc.packageDimensions || {}
      const normalizedFromDoc = {
        weight:
          typeof packageDimensions.weight === 'number' && packageDimensions.weight > 0
            ? packageDimensions.weight
            : null,
        length:
          typeof packageDimensions.length === 'number' && packageDimensions.length > 0
            ? packageDimensions.length
            : null,
        width:
          typeof packageDimensions.width === 'number' && packageDimensions.width > 0
            ? packageDimensions.width
            : null,
        height:
          typeof packageDimensions.height === 'number' && packageDimensions.height > 0
            ? packageDimensions.height
            : null,
      }
      const hasCompleteDimensions =
        normalizedFromDoc.weight &&
        normalizedFromDoc.length &&
        normalizedFromDoc.width &&
        normalizedFromDoc.height
      let normalizedDimensions = hasCompleteDimensions
        ? {
            weight: normalizedFromDoc.weight,
            length: normalizedFromDoc.length,
            width: normalizedFromDoc.width,
            height: normalizedFromDoc.height,
          }
        : null
      if (!normalizedDimensions) {
        const promptDefaults = {
          weight: normalizedFromDoc.weight ?? defaultDimensions.weight,
          length: normalizedFromDoc.length ?? defaultDimensions.length,
          width: normalizedFromDoc.width ?? defaultDimensions.width,
          height: normalizedFromDoc.height ?? defaultDimensions.height,
        }
        const promptValue = window.prompt(
          'Package dimensions are missing. Enter weight, length, width, height (lbs, inches).\n' +
            'Example: 2, 10, 8, 4\n\n' +
            'Leave as-is to use defaults.',
          `${promptDefaults.weight}, ${promptDefaults.length}, ${promptDefaults.width}, ${promptDefaults.height}`,
        )
        if (promptValue === null) {
          onComplete()
          return
        }
        const parsed = parseDimensionInput(promptValue)
        if (!parsed) {
          alert('Please enter four positive numbers for weight, length, width, and height.')
          onComplete()
          return
        }
        normalizedDimensions = parsed
      }

      const shippingAddress = doc.shippingAddress as {city?: string; state?: string} | undefined
      const confirmPurchase = window.confirm(
        `Purchase shipping label for order ${doc.orderNumber || doc._id}?\n\n` +
          `Customer: ${doc.customerName || 'Customer'}\n` +
          `Ship to: ${shippingAddress?.city || ''}, ${shippingAddress?.state || ''}\n` +
          `Carrier: ${doc.carrier || 'Selected at checkout'}\n` +
          `Service: ${doc.service || 'Selected at checkout'}\n\n` +
          'This will charge your EasyPost account.',
      )
      if (!confirmPurchase) {
        onComplete()
        return
      }

      if (!normalizedDimensions) {
        normalizedDimensions = defaultDimensions
      }

      const body = {
        orderId: (doc._id || '').replace(/^drafts\./, ''),
        packageDetails: {
          weight: normalizedDimensions.weight,
          dimensions: {
            length: normalizedDimensions.length,
            width: normalizedDimensions.width,
            height: normalizedDimensions.height,
          },
        },
        rateId: doc.easypostRateId,
      }

      try {
        const response = await fetch('/.netlify/functions/easypostCreateLabel', {
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
        if (labelUrl && window.confirm('Open shipping label for printing?')) {
          openUrl(labelUrl)
        }
        onComplete()
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
