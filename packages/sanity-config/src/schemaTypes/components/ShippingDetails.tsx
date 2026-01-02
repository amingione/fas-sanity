// schemas/components/ShippingDetails.tsx
import React, {useState} from 'react'
import {Card, Box, Stack, Text, Button, Dialog, Badge, useToast} from '@sanity/ui'
import {useFormValue} from 'sanity'
import {differenceInCalendarDays, format} from 'date-fns'
import {callNetlifyFunction} from '../../utils/netlifyHelpers'

export function ShippingDetails() {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [isRefunding, setIsRefunding] = useState(false)
  const [refundMetaOverride, setRefundMetaOverride] = useState<{amount?: number; at?: string} | null>(
    null,
  )
  const onOpen = () => setOpen(true)
  const onClose = () => setOpen(false)

  // Get shipping data from form - check both new and old structures
  const orderIdValue = useFormValue(['_id']) as string | undefined
  const shippingAddress = useFormValue(['shippingAddress']) as any
  const fulfillmentDetails = useFormValue(['fulfillmentDetails']) as any
  const oldFulfillment = useFormValue(['fulfillment']) as any
  const shippingLabelUrlValue = useFormValue(['shippingLabelUrl']) as string | undefined
  const shippingLabelRefundedValue = useFormValue(['shippingLabelRefunded']) as boolean | undefined
  const shippingLabelRefundedAtValue = useFormValue(['shippingLabelRefundedAt']) as string | undefined
  const shippingLabelRefundAmountValue = useFormValue([
    'shippingLabelRefundAmount',
  ]) as number | undefined
  const easyPostShipmentId = useFormValue(['easyPostShipmentId']) as string | undefined

  const labelCreatedAt = useFormValue(['labelCreatedAt']) as string
  const labelCancelled = useFormValue(['labelCancelled']) as boolean
  const labelCancelledAt = useFormValue(['labelCancelledAt']) as string

  // Check for label refund in fulfillment object
  const labelRefunded =
    typeof shippingLabelRefundedValue === 'boolean'
      ? shippingLabelRefundedValue
      : Boolean(oldFulfillment?.labelRefunded || fulfillmentDetails?.labelRefunded)
  const labelRefundedAt =
    shippingLabelRefundedAtValue ||
    oldFulfillment?.labelRefundedAt ||
    fulfillmentDetails?.labelRefundedAt ||
    null
  const labelRefundAmount =
    typeof shippingLabelRefundAmountValue === 'number' ? shippingLabelRefundAmountValue : undefined

  // Try new structure first, fallback to old
  const carrier = (useFormValue(['carrier']) as string) || oldFulfillment?.carrier
  const service = (useFormValue(['service']) as string) || oldFulfillment?.service
  const trackingNumber =
    (useFormValue(['trackingNumber']) as string) || oldFulfillment?.trackingNumber
  const trackingUrl = (useFormValue(['trackingUrl']) as string) || oldFulfillment?.trackingUrl

  // Get fulfillment status for label badge
  const fulfillmentStatus = fulfillmentDetails?.status || oldFulfillment?.status || 'unfulfilled'

  // Get package dimensions from either location (prefer modern fields)
  const modernWeight = useFormValue(['weight']) as {value?: number; unit?: string} | undefined
  const modernDimensions = useFormValue(['dimensions']) as
    | {length?: number; width?: number; height?: number}
    | undefined
  const packageDimensionsValue = useFormValue(['packageDimensions']) as any
  const legacyDims =
    fulfillmentDetails?.packageDimensions || oldFulfillment?.packageDimensions || packageDimensionsValue
  const hasModernWeight = typeof modernWeight?.value === 'number' && modernWeight.value > 0
  const hasModernDims = Boolean(
    modernDimensions?.length || modernDimensions?.width || modernDimensions?.height,
  )
  const hasLegacy =
    Boolean(legacyDims?.weight) ||
    Boolean(legacyDims?.weightDisplay) ||
    Boolean(legacyDims?.dimensionsDisplay) ||
    (legacyDims?.length && legacyDims?.width && legacyDims?.height)

  const packageDims = hasModernWeight || hasModernDims
    ? {
        weight: modernWeight?.value,
        weightUnit: modernWeight?.unit || 'pound',
        length: modernDimensions?.length,
        width: modernDimensions?.width,
        height: modernDimensions?.height,
        dimensionUnit: 'in',
      }
    : hasLegacy
      ? legacyDims
      : null

  // Format label created date
  const formattedLabelDate = labelCreatedAt
    ? format(new Date(labelCreatedAt), 'MMMM d, yyyy')
    : null

  const shippingLabelUrl = typeof shippingLabelUrlValue === 'string' ? shippingLabelUrlValue.trim() : ''
  const orderId = (orderIdValue || '').replace(/^drafts\./, '')
  const sanitizedShipmentId = (easyPostShipmentId || '').trim()
  const labelAgeDays =
    labelCreatedAt && !Number.isNaN(Date.parse(labelCreatedAt))
      ? differenceInCalendarDays(new Date(), new Date(labelCreatedAt))
      : null
  const withinRefundWindow = labelAgeDays === null || labelAgeDays <= 30
  const normalizedFulfillmentStatus = (fulfillmentStatus || '').toLowerCase()
  const labelLikelyScanned =
    normalizedFulfillmentStatus === 'shipped' || normalizedFulfillmentStatus === 'delivered'
  const effectiveRefunded = Boolean(refundMetaOverride || labelRefunded)
  const effectiveRefundAt = refundMetaOverride?.at || labelRefundedAt
  const effectiveRefundAmount =
    typeof refundMetaOverride?.amount === 'number' ? refundMetaOverride.amount : labelRefundAmount
  const refundAmountDisplay =
    typeof effectiveRefundAmount === 'number' ? effectiveRefundAmount.toFixed(2) : null
  const refundEligibilityMessage = (() => {
    if (!orderId) return 'Publish this order before requesting a refund.'
    if (!withinRefundWindow) return 'EasyPost only refunds unused labels within 30 days.'
    if (labelLikelyScanned) return 'Carrier has already scanned this label.'
    if (labelCancelled) return 'Label is already cancelled.'
    return null
  })()
  const refundButtonDisabled =
    isRefunding || effectiveRefunded || Boolean(refundEligibilityMessage)
  const refundButtonText = effectiveRefunded
    ? 'Label refunded'
    : isRefunding
      ? 'Requesting refund…'
      : 'Cancel / Refund Label'
  const formattedRefundDate =
    effectiveRefundAt && !Number.isNaN(Date.parse(effectiveRefundAt))
      ? format(new Date(effectiveRefundAt), 'MMMM d, yyyy h:mm a')
      : null

  const handleRefundLabel = async () => {
    if (!shippingLabelUrl || !orderId || effectiveRefunded || isRefunding) return
    setIsRefunding(true)
    try {
      const response = await callNetlifyFunction('refund-shipping-label', {
        orderId,
        shipmentId: sanitizedShipmentId || undefined,
      })
      let result: any = null
      try {
        result = await response.json()
      } catch {
        // ignore parse failures
      }
      const nextAmount =
        typeof result?.refundAmount === 'number' ? result.refundAmount : effectiveRefundAmount
      const nextTimestamp =
        typeof result?.refundAt === 'string' ? result.refundAt : new Date().toISOString()
      setRefundMetaOverride({amount: nextAmount, at: nextTimestamp})
      toast.push({
        status: 'success',
        title: 'Shipping label refund submitted',
        description:
          typeof nextAmount === 'number' ? `Refund amount: $${nextAmount.toFixed(2)}` : undefined,
        closable: true,
      })
    } catch (err: any) {
      console.error('Shipping label refund failed', err)
      toast.push({
        status: 'error',
        title: 'Unable to refund label',
        description: err?.message || 'Unknown error',
        closable: true,
      })
    } finally {
      setIsRefunding(false)
    }
  }

  // Get label status based on cancellation, refund, fulfillment status, and tracking number
  const getLabelStatusTone = () => {
    if (labelCancelled || effectiveRefunded) return 'critical'
    if (trackingNumber || fulfillmentStatus === 'label_created' || fulfillmentStatus === 'shipped')
      return 'positive'
    if (fulfillmentStatus === 'processing') return 'primary'
    return 'caution'
  }

  const getLabelStatusText = () => {
    if (labelCancelled) return 'Label Cancelled'
    if (effectiveRefunded) return 'Label Refunded'
    if (trackingNumber || fulfillmentStatus === 'label_created') return 'Label Created'
    if (fulfillmentStatus === 'shipped') return 'Shipped'
    if (fulfillmentStatus === 'processing') return 'Processing'
    return 'Label Not Created'
  }

  // Check if carrier looks like valid carrier data (not a customer name)
  const validCarriers = ['USPS', 'UPS', 'FedEx', 'DHL']
  const isValidCarrier = carrier && validCarriers.some((c) => carrier.toUpperCase().includes(c))

  return (
    <Card padding={4}>
      <Box
        padding={[3, 3, 4, 5]}
        style={{
          outline: '1px solid red',
        }}
      >
        <Stack space={[3, 3, 4, 5]}>
          <Text align="center" size={[2, 2, 3, 4]} weight="bold">
            Shipping Details
          </Text>

          <Text align="center" muted size={[1, 1, 2]}>
            Shipping Address
          </Text>

          <Text align="center" muted size={[1, 1, 2]}>
            {formattedLabelDate || 'Not created'} |{' '}
            <Badge tone={getLabelStatusTone()} fontSize={[1, 1, 2]}>
              {getLabelStatusText()}
            </Badge>
          </Text>

          {effectiveRefunded && (
            <Card
              padding={[3, 3, 4]}
              radius={2}
              tone="positive"
              style={{border: '1px solid rgba(51, 140, 105, 0.35)'}}
            >
              <Stack space={2}>
                <Text align="center" size={[1, 1, 2]} weight="semibold">
                  Label refund submitted
                </Text>
                {refundAmountDisplay && (
                  <Text align="center" size={[1, 1, 2]}>
                    Refund amount: ${refundAmountDisplay}
                  </Text>
                )}
                {formattedRefundDate && (
                  <Text align="center" size={[1, 1, 2]} muted>
                    Refunded {formattedRefundDate}
                  </Text>
                )}
              </Stack>
            </Card>
          )}

          {/* Only show carrier/service if we have valid carrier data */}
          {isValidCarrier && service ? (
            <Text align="center" muted size={[1, 1, 2]}>
              {carrier} | {service}
            </Text>
          ) : (
            <Text align="center" muted size={[1, 1, 2]}>
              Carrier information not available
            </Text>
          )}

          {/* Shipping Address */}
          {shippingAddress && (
            <Stack space={2}>
              <Text align="left" muted size={[1, 1, 2]}>
                {shippingAddress.name}
              </Text>
              <Text align="left" muted size={[1, 1, 2]}>
                {shippingAddress.addressLine1}
              </Text>
              {shippingAddress.addressLine2 && (
                <Text align="left" muted size={[1, 1, 2]}>
                  {shippingAddress.addressLine2}
                </Text>
              )}
              <Text align="left" muted size={[1, 1, 2]}>
                {shippingAddress.city}, {shippingAddress.state} {shippingAddress.postalCode}
              </Text>
              <Text align="left" muted size={[1, 1, 2]}>
                {shippingAddress.country}
              </Text>
            </Stack>
          )}

          {/* Tracking Number - only show if exists and not cancelled */}
          {trackingNumber && !labelCancelled && !effectiveRefunded && (
            <Card
              padding={[3, 3, 4]}
              radius={2}
              shadow={1}
              tone="positive"
              style={{
                background:
                  'linear-gradient(135deg, rgba(38,78,59,0.85) 0%, rgba(15,35,45,0.85) 100%)',
                border: '1px solid rgba(51, 140, 105, 0.35)',
              }}
            >
              <Text align="center" size={[2, 2, 3]}>
                Tracking Number:{' '}
                {trackingUrl ? (
                  <a
                    href={trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{color: 'inherit', textDecoration: 'underline'}}
                  >
                    {trackingNumber}
                  </a>
                ) : (
                  trackingNumber
                )}
              </Text>
            </Card>
          )}

          {/* Show cancelled/refunded tracking number with warning */}
          {trackingNumber && (labelCancelled || effectiveRefunded) && (
            <Card
              padding={[3, 3, 4]}
              radius={2}
              shadow={1}
              tone="critical"
              style={{
                background:
                  'linear-gradient(135deg, rgba(120,40,40,0.85) 0%, rgba(60,20,20,0.85) 100%)',
                border: '1px solid rgba(220, 38, 38, 0.35)',
              }}
            >
              <Stack space={2}>
                <Text align="center" size={[2, 2, 3]} weight="semibold">
                  {effectiveRefunded ? 'Label Refunded' : 'Label Cancelled'}
                </Text>
                <Text align="center" size={[1, 1, 2]} muted>
                  Tracking: {trackingNumber}
                </Text>
                {(labelCancelledAt || effectiveRefundAt) && (
                  <Text align="center" size={[1, 1, 2]} muted>
                    {format(
                      new Date(labelCancelledAt || effectiveRefundAt!),
                      'MMMM d, yyyy h:mm a',
                    )}
                  </Text>
                )}
              </Stack>
            </Card>
          )}
        </Stack>

        {shippingLabelUrl && (
          <Card padding={4} style={{textAlign: 'center'}} marginTop={4}>
            <Stack space={2}>
              <Button
                onClick={handleRefundLabel}
                text={refundButtonText}
                tone="critical"
                disabled={refundButtonDisabled}
              />
              {!effectiveRefunded && refundEligibilityMessage && (
                <Text align="center" muted size={[1, 1, 2]}>
                  {refundEligibilityMessage}
                </Text>
              )}
            </Stack>
          </Card>
        )}

        <Card padding={4} style={{textAlign: 'center'}} marginTop={4}>
          <Button onClick={onOpen} text="Package Details" mode="ghost" />
        </Card>

        {open && (
          <Dialog header="Package Details" id="package-details" onClose={onClose} zOffset={1000}>
            <Box padding={4}>
              <Stack space={3}>
                <Text size={2} weight="semibold">
                  Package Weight
                </Text>
                <Text size={1} muted>
                  {packageDims?.weight
                    ? `${packageDims.weight} ${packageDims.weightUnit || 'lbs'}`
                    : packageDims?.weightDisplay || 'Not specified'}
                </Text>

                <Text size={2} weight="semibold">
                  Package Dimensions
                </Text>
                <Text size={1} muted>
                  {packageDims?.dimensionsDisplay ||
                    (packageDims?.length && packageDims?.width && packageDims?.height
                      ? `${packageDims.length} × ${packageDims.width} × ${packageDims.height} ${packageDims.dimensionUnit || 'in'}`
                      : 'Not specified')}
                </Text>
              </Stack>
            </Box>
          </Dialog>
        )}
      </Box>
    </Card>
  )
}
