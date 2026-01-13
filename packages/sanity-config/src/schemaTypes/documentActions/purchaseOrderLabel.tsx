import {useState} from 'react'
import {Button, Inline, Stack, Text} from '@sanity/ui'
import {type DocumentActionComponent, useDocumentOperation} from 'sanity'
import {resolveNetlifyBase} from '../../utils/netlifyBase'

export const purchaseOrderLabelAction: DocumentActionComponent = (props) => {
  const {id, type, draft, published} = props
  const {patch} = useDocumentOperation(id, type)
  const [isLoading, setIsLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMessage, setDialogMessage] = useState('')

  const doc = (draft || published) as
    | {
        paymentStatus?: string
        paymentCaptured?: boolean
        orderNumber?: string
        shippingAddress?: unknown
        cart?: unknown
        fulfillment?: {labelUrl?: string}
      }
    | null

  if (type !== 'order' || doc?.paymentStatus !== 'paid') {
    return null
  }

  if (doc?.paymentCaptured === false) {
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
    onHandle: () => {
      setDialogOpen(true)
    },
    dialog: dialogOpen
      ? {
          type: 'dialog',
          header: 'Purchase Shipping Label',
          onClose: () => {
            setDialogOpen(false)
            setDialogMessage('')
            props.onComplete()
          },
          content: (
            <Stack space={3}>
              <Text size={1}>
                {dialogMessage || 'Purchase shipping label for this order?'}
              </Text>
            </Stack>
          ),
          footer: (
            <Inline space={3}>
              <Button
                text="Cancel"
                mode="ghost"
                onClick={() => {
                  setDialogOpen(false)
                  setDialogMessage('')
                  props.onComplete()
                }}
              />
              {!dialogMessage && (
                <Button
                  text="Purchase"
                  tone="primary"
                  loading={isLoading}
                  disabled={isLoading}
                  onClick={async () => {
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
                          source: 'sanity-manual',
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
                            trackingNumber,
                            trackingUrl,
                            shippingLabelUrl: labelUrl,
                            carrier,
                            service,
                            easyPostShipmentId: shipmentId,
                            labelCreatedAt: new Date().toISOString(),
                            estimatedDeliveryDate: estimatedDelivery,
                          },
                        },
                      ])

                      setDialogMessage(`Label purchased! Tracking: ${trackingNumber || 'Pending'}`)
                    } catch (error) {
                      console.error('Failed to purchase label:', error)
                      setDialogMessage('Failed to purchase label. Check console for details.')
                    } finally {
                      setIsLoading(false)
                    }
                  }}
                />
              )}
            </Inline>
          ),
        }
      : undefined,
  }
}
