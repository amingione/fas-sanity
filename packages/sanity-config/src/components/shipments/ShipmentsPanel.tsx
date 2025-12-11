import React, {useEffect, useMemo, useState} from 'react'
import {Box, Button, Card, Flex, Grid, Heading, Spinner, Stack, Text, TextInput} from '@sanity/ui'
import {LaunchIcon, SearchIcon} from '@sanity/icons'
import {useClient} from 'sanity'
import PDFThumbnail from '../media/PDFThumbnail'
import {ShipmentStatusIcon} from '../media/ShipmentStatusIcon'
import {ShipmentsHeader} from '../ShipmentsHeader'

type Shipment = {
  _id: string
  easypostId: string
  trackingCode?: string
  status?: string
  reference?: string
  selectedRate?: {
    carrier?: string
    service?: string
    rate?: string
    currency?: string
  }
  toAddress?: {
    name?: string
    city?: string
    state?: string
  }
  createdAt?: string
  orderNumber?: string
  customerName?: string
  labelUrl?: string | null
  postageLabel?: {
    labelPdfUrl?: string | null
    labelUrl?: string | null
  } | null
  tracker?: {
    public_url?: string | null
  } | null
}

const CARD_THUMBNAIL_STYLE: React.CSSProperties = {
  width: 120,
  height: 150,
  borderRadius: 6,
  overflow: 'hidden',
  backgroundColor: '#111',
}

const formatRateDisplay = (rate?: string, currency?: string) => {
  if (!rate) return '—'
  const parsed = Number.parseFloat(rate)
  if (Number.isNaN(parsed)) return rate
  const normalizedCurrency = currency?.trim().toUpperCase()
  if (normalizedCurrency && normalizedCurrency !== 'USD') {
    return `${normalizedCurrency} ${parsed.toFixed(2)}`
  }
  return `$${parsed.toFixed(2)}`
}

const ShipmentsPanel = React.forwardRef<HTMLDivElement>((_props, ref) => {
  const client = useClient({apiVersion: '2024-01-01'})
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  const fetchShipments = async () => {
    setLoading(true)
    try {
      const query = `*[_type == "shipment"] | order(createdAt desc) [0...50]{
        _id,
        easypostId,
        trackingCode,
        status,
        reference,
        selectedRate,
        toAddress,
        createdAt,
        labelUrl,
        postageLabel,
        "orderNumber": order->orderNumber,
        "customerName": order->customerName,
        tracker
      }`
      const data = await client.fetch<Shipment[]>(query)
      setShipments(data)
    } catch (error) {
      console.error('Error fetching shipments:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchShipments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredShipments = useMemo(() => {
    const search = searchTerm.trim().toLowerCase()
    if (!search) return shipments
    return shipments.filter((shipment) => {
      const matches = [
        shipment.trackingCode,
        shipment.reference,
        shipment.easypostId,
        shipment.orderNumber,
        shipment.customerName,
        shipment.toAddress?.name,
        shipment.toAddress?.city,
        shipment.toAddress?.state,
      ]
      return matches.some((value) => value?.toLowerCase().includes(search))
    })
  }, [shipments, searchTerm])

  const resolveLabelUrl = (shipment: Shipment) =>
    shipment.postageLabel?.labelPdfUrl ||
    shipment.postageLabel?.labelUrl ||
    shipment.labelUrl ||
    undefined

  const openTracking = (url?: string | null, id?: string) => {
    if (typeof window === 'undefined') return
    if (url) {
      window.open(url, '_blank', 'noopener')
      return
    }
    if (id) {
      window.location.hash = `#/desk/shipment;${id}`
    }
  }

  const openLabelPdf = (url?: string | null) => {
    if (!url || typeof window === 'undefined') return
    window.open(url, '_blank', 'noopener')
  }

  return (
    <Card ref={ref} padding={4}>
      <Stack space={4}>
        <ShipmentsHeader />
        <Stack space={3}>
          <Heading size={3}>Shipments</Heading>
          <Text size={1} muted>
            Quick preview of recent labels with inline PDF thumbnails and status indicators.
          </Text>
          <Flex gap={3}>
            <TextInput
              style={{flex: 1}}
              icon={SearchIcon}
              placeholder="Search by tracking code, order number, or recipient..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.currentTarget.value)}
            />
            <Button text="Refresh" mode="ghost" onClick={fetchShipments} />
          </Flex>
        </Stack>

        {loading ? (
          <Box padding={4} style={{textAlign: 'center'}}>
            <Spinner />
          </Box>
        ) : filteredShipments.length === 0 ? (
          <Card padding={4} tone="transparent">
            <Text muted>No shipments found</Text>
          </Card>
        ) : (
          <Grid columns={[1]} gap={3}>
            {filteredShipments.map((shipment) => {
              const labelUrl = resolveLabelUrl(shipment)
              const customerName =
                shipment.customerName || shipment.toAddress?.name || 'Unknown customer'
              const orderNumber = shipment.orderNumber || 'No order number'
              const trackingNumber = shipment.trackingCode || '—'
              const service = shipment.selectedRate?.service || '—'
              const rate = formatRateDisplay(
                shipment.selectedRate?.rate,
                shipment.selectedRate?.currency,
              )

              return (
                <Card key={shipment._id} padding={3} radius={3} shadow={1}>
                  <Flex gap={3} align="center" style={{minHeight: 150}}>
                    {/* PDF Thumbnail */}
                    <Box
                      as={labelUrl ? 'button' : 'div'}
                      type={labelUrl ? 'button' : undefined}
                      style={{
                        border: labelUrl ? '1px solid rgba(255,255,255,0.1)' : undefined,
                        cursor: labelUrl ? 'pointer' : 'default',
                        padding: 0,
                        ...CARD_THUMBNAIL_STYLE,
                      }}
                      title={labelUrl ? 'Open label PDF' : 'Label not available'}
                      onClick={() => openLabelPdf(labelUrl)}
                    >
                      <PDFThumbnail pdfUrl={labelUrl} />
                    </Box>

                    {/* Main Content - Centered Vertically */}
                    <Flex direction="column" justify="center" style={{flex: 1, height: '100%'}}>
                      <Flex align="center" justify="space-between">
                        <Stack space={2}>
                          {/* Customer Name */}
                          <Text size={2} weight="semibold">
                            {customerName}
                          </Text>

                          {/* Order Number */}
                          <Text size={1} muted>
                            {orderNumber}
                          </Text>

                          {/* Inline: Tracking Number • Service • Cost */}
                          <Text size={1}>
                            {trackingNumber} • {service} • {rate}
                          </Text>
                        </Stack>

                        <Flex direction="column" align="flex-end" gap={2}>
                          <Button
                            icon={LaunchIcon}
                            text="Open"
                            tone="primary"
                            mode="ghost"
                            onClick={() => openTracking(shipment.tracker?.public_url, shipment._id)}
                          />

                          {/* Status Icon */}
                          <Box style={{width: 60, height: 60}}>
                            <ShipmentStatusIcon status={shipment.status} />
                          </Box>
                        </Flex>
                      </Flex>
                    </Flex>
                  </Flex>
                </Card>
              )
            })}
          </Grid>
        )}
      </Stack>
    </Card>
  )
})

ShipmentsPanel.displayName = 'ShipmentsPanel'

export default ShipmentsPanel
