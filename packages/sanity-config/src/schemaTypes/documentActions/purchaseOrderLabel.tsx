import {useState} from 'react'
import {type DocumentActionComponent, useDocumentOperation} from 'sanity'
import {resolveNetlifyBase} from '../../utils/netlifyBase'

export const purchaseOrderLabelAction: DocumentActionComponent = (props) => {
  const {id, type, draft, published} = props
  const {patch} = useDocumentOperation(id, type)
  const [isLoading, setIsLoading] = useState(false)

  const doc = (draft || published) as
    | {
        paymentStatus?: string
        orderNumber?: string
        shippingAddress?: unknown
        cart?: unknown
        selectedService?: unknown
        fulfillment?: {labelUrl?: string}
      }
    | null

  if (type !== 'order' || doc?.paymentStatus !== 'paid') {
    return null
  }

  if (doc?.fulfillment?.labelUrl) {
    return null
  }

  return {
    label: 'Purchase Shipping Label',
    icon: () => '🏷️',
    disabled: isLoading,
    tone: 'primary',
    onHandle: async () => {
      if (!window.confirm('Purchase shipping label for this order?')) {
        return
      }

      setIsLoading(true)

      try {
        const base = resolveNetlifyBase()
        const endpoint = `${base.replace(/\/$/, '')}/.netlify/functions/easypostCreateLabel`
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            orderId: id,
            orderNumber: doc.orderNumber,
            shippingAddress: doc.shippingAddress,
            cart: doc.cart,
            selectedService: doc.selectedService,
          }),
        })

        const {
          shipmentId,
          trackingNumber,
          trackingUrl,
          labelUrl,
          carrier,
          service,
          estimatedDelivery,
        } = await response.json()

        patch.execute([
          {
            set: {
              'fulfillment.status': 'label_created',
              'fulfillment.trackingNumber': trackingNumber,
              'fulfillment.trackingUrl': trackingUrl,
              'fulfillment.labelUrl': labelUrl,
              'fulfillment.carrier': carrier,
              'fulfillment.service': service,
              'fulfillment.easypostShipmentId': shipmentId,
              'fulfillment.labelPurchasedAt': new Date().toISOString(),
              'fulfillment.estimatedDelivery': estimatedDelivery,
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
