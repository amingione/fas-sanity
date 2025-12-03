import {useState} from 'react'
import {type DocumentActionComponent, useDocumentOperation} from 'sanity'

export const purchaseShippingLabelAction: DocumentActionComponent = (props) => {
  const {id, type, draft, published} = props
  const {patch} = useDocumentOperation(id, type)
  const [isLoading, setIsLoading] = useState(false)

  const doc = (draft || published) as
    | {
        status?: string
        shipping?: {
          easypostRateId?: string
          easypostShipmentId?: string
          labelUrl?: string
          fulfillmentStatus?: string
          shippingMethod?: string
        }
      }
    | null

  if (type !== 'invoice' || doc?.status !== 'paid') {
    return null
  }

  const shipping = doc?.shipping

  if (!shipping?.easypostRateId) {
    return null
  }

  if (shipping?.labelUrl) {
    return null
  }

  return {
    label: 'Purchase Shipping Label',
    icon: () => '🏷️',
    disabled: isLoading,
    tone: 'primary',
    onHandle: async () => {
      if (!confirm('Purchase shipping label for this invoice?')) {
        return
      }

      setIsLoading(true)

      try {
        const response = await fetch('/api/easypost/purchase-label', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            invoiceId: id,
            shipmentId: shipping.easypostShipmentId,
            rateId: shipping.easypostRateId,
          }),
        })

        const {trackingNumber, trackingUrl, labelUrl, carrier, service} = await response.json()

        patch.execute([
          {
            set: {
              'shipping.trackingNumber': trackingNumber,
              'shipping.trackingUrl': trackingUrl,
              'shipping.labelUrl': labelUrl,
              'shipping.labelPurchasedAt': new Date().toISOString(),
              'shipping.fulfillmentStatus': 'label_created',
              'shipping.shippingMethod': `${carrier} ${service}`.trim(),
            },
          },
        ])

        alert(`Label purchased! Tracking: ${trackingNumber}`)
        props.onComplete()
      } catch (error) {
        console.error('Failed to purchase label:', error)
        alert('Failed to purchase label. Check console for details.')
      } finally {
        setIsLoading(false)
      }
    },
  }
}
