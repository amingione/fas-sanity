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
        const response = await fetch('/.netlify/functions/getEasyPostRates', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            ship_to: doc.shipTo,
            package_details: {
              weight: {
                value: Number(doc.shipping?.packageWeight) || 1,
                unit: 'pound',
              },
              dimensions: doc.shipping?.packageDimensions
                ? {
                    unit: 'inch',
                    length: Number((doc.shipping?.packageDimensions as any)?.length) || undefined,
                    width: Number((doc.shipping?.packageDimensions as any)?.width) || undefined,
                    height: Number((doc.shipping?.packageDimensions as any)?.height) || undefined,
                  }
                : undefined,
            },
          }),
        })

        const data = await response.json()
        const rates = Array.isArray(data?.rates) ? data.rates : []
        const normalizedRates = rates.map((rate: any) => ({
          rateId: rate.rateId,
          carrier: rate.carrier,
          service: rate.service,
          rate: rate.amount,
          currency: rate.currency,
          deliveryDays: rate.deliveryDays,
          carrierId: rate.carrierId,
          serviceCode: rate.serviceCode,
        }))

        patch.execute([
          {
            set: {
              'shipping.availableRates': normalizedRates,
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
