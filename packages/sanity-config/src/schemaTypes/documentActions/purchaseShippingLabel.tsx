import {useState} from 'react'
import {Button, Inline, Stack, Text} from '@sanity/ui'
import {type DocumentActionComponent, useDocumentOperation} from 'sanity'
import {resolveNetlifyBase} from '../../utils/netlifyBase'

export const purchaseShippingLabelAction: DocumentActionComponent = (props) => {
  const {id, type, draft, published} = props
  const {patch} = useDocumentOperation(id, type)
  const [isLoading, setIsLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMessage, setDialogMessage] = useState('')

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
                {dialogMessage || 'Purchase shipping label for this invoice?'}
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
                          invoiceId: id,
                          shipmentId: shipping.easypostShipmentId,
                          rateId: shipping.easypostRateId,
                          source: 'sanity-manual',
                        }),
                      })

                      const text = await response.text()
                      let data: any = {}
                      try {
                        data = text ? JSON.parse(text) : {}
                      } catch {
                        data = {raw: text}
                      }
                      if (!response.ok) {
                        const message =
                          (data && (data.error || data.message)) ||
                          `${response.status} ${response.statusText || 'Request failed'}`
                        throw new Error(message)
                      }

                      const {trackingNumber, trackingUrl, labelUrl, carrier, service} = data

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
