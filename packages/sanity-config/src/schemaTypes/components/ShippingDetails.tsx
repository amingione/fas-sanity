// schemas/components/ShippingDetails.tsx
import React, {useState} from 'react'
import {Card, Box, Stack, Text, Button, Dialog, Badge} from '@sanity/ui'
import {useFormValue} from 'sanity'
import {format} from 'date-fns'

export function ShippingDetails() {
  const [open, setOpen] = useState(false)
  const onOpen = () => setOpen(true)
  const onClose = () => setOpen(false)

  // Get shipping data from form - check both new and old structures
  const shippingAddress = useFormValue(['shippingAddress']) as any
  const fulfillmentDetails = useFormValue(['fulfillmentDetails']) as any
  const oldFulfillment = useFormValue(['fulfillment']) as any

  const labelCreatedAt = useFormValue(['labelCreatedAt']) as string
  const labelPurchased = useFormValue(['labelPurchased']) as boolean

  // Try new structure first, fallback to old
  const carrier = (useFormValue(['carrier']) as string) || oldFulfillment?.carrier
  const service = (useFormValue(['service']) as string) || oldFulfillment?.service
  const trackingNumber =
    (useFormValue(['trackingNumber']) as string) || oldFulfillment?.trackingNumber
  const trackingUrl = (useFormValue(['trackingUrl']) as string) || oldFulfillment?.trackingUrl

  // Get fulfillment status for label badge
  const fulfillmentStatus = fulfillmentDetails?.status || oldFulfillment?.status || 'unfulfilled'

  // Get package dimensions from either location
  const packageDims =
    fulfillmentDetails?.packageDimensions ||
    oldFulfillment?.packageDimensions ||
    useFormValue(['packageDimensions'])

  // Format label created date
  const formattedLabelDate = labelCreatedAt
    ? format(new Date(labelCreatedAt), 'MMMM d, yyyy')
    : null

  // Get label status based on fulfillment status and tracking number
  const getLabelStatusTone = () => {
    if (trackingNumber || fulfillmentStatus === 'label_created' || fulfillmentStatus === 'shipped')
      return 'positive'
    if (fulfillmentStatus === 'processing') return 'primary'
    return 'caution'
  }

  const getLabelStatusText = () => {
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

          {/* Tracking Number - only show if exists */}
          {trackingNumber && (
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
        </Stack>

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
