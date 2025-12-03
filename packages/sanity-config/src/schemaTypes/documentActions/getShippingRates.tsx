import {useState} from 'react'
import {type DocumentActionComponent, useDocumentOperation} from 'sanity'

export const getShippingRatesAction: DocumentActionComponent = (props) => {
  const {id, type, draft, published} = props
  const {patch} = useDocumentOperation(id, type)
  const [isLoading, setIsLoading] = useState(false)

  const doc = (draft || published) as
    | {
        shipTo?: unknown
        lineItems?: unknown
        shipping?: {
          availableRates?: unknown[]
          packageWeight?: number
          packageDimensions?: unknown
        }
      }
    | null

  if (type !== 'invoice' || !doc?.shipTo) {
    return null
  }

  const availableRates = doc?.shipping?.availableRates
  if (availableRates && availableRates.length > 0) {
    return null
  }

  return {
    label: 'Get Shipping Rates',
    icon: () => '📦',
    disabled: isLoading,
    onHandle: async () => {
      setIsLoading(true)

      try {
        const response = await fetch('/api/easypost/get-rates', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            invoiceId: id,
            shipTo: doc.shipTo,
            weight: doc.shipping?.packageWeight,
            dimensions: doc.shipping?.packageDimensions,
            lineItems: doc.lineItems,
          }),
        })

        const {rates, shipmentId} = await response.json()

        patch.execute([
          {
            set: {
              'shipping.availableRates': rates,
              'shipping.easypostShipmentId': shipmentId,
            },
          },
        ])

        props.onComplete?.()
      } catch (error) {
        console.error('Failed to fetch rates:', error)
        alert('Failed to fetch shipping rates. Check console for details.')
      } finally {
        setIsLoading(false)
      }
    },
  }
}
