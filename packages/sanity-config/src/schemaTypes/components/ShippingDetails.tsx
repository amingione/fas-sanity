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
  const trackingNumber = useFormValue(['trackingNumber']) as string
  const trackingUrl = useFormValue(['trackingUrl']) as string

  // Format label created date
  const formattedLabelDate = labelCreatedAt
    ? format(new Date(labelCreatedAt), 'MMMM d, yyyy')
    : null

  // Get label status
  const getLabelStatusTone = () => {
    if (labelPurchased) return 'positive'
    return 'caution'
  }

  const getLabelStatusText = () => {
    if (labelPurchased) return 'Label Created'
    return 'Label Not Created'
  }

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
            {formattedLabelDate || 'Not created'} |{' '}
            <Badge tone={getLabelStatusTone()} fontSize={[1, 1, 2]}>
              {getLabelStatusText()}
            </Badge>
          </Text>

          <Text align="center" muted size={[1, 1, 2]}>
            {carrier || 'No carrier'} | {service || 'No service'}
          </Text>

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
                  {fulfillmentDetails?.packageWeight
                    ? `${fulfillmentDetails.packageWeight} lbs`
                    : 'Not specified'}
                </Text>

                <Text size={2} weight="semibold">
                  Package Dimensions
                </Text>
                <Text size={1} muted>
                  {fulfillmentDetails?.packageDimensions || 'Not specified'}
                </Text>
              </Stack>
            </Box>
          </Dialog>
        )}
      </Box>
    </Card>
  )
}
