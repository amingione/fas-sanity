import React, {useEffect, useState} from 'react'
import {Badge, Box, Button, Card, Spinner, Stack, Text, TextInput} from '@sanity/ui'
import {SearchIcon} from '@sanity/icons'
import {useClient} from 'sanity'
import {format} from 'date-fns'

interface Shipment {
  _id: string
  easypostId: string
  trackingCode?: string
  status?: string
  reference?: string
  selectedRate?: {
    carrier?: string
    service?: string
    rate?: string
  }
  toAddress?: {
    name?: string
    city?: string
    state?: string
  }
  createdAt?: string
}

const ShipmentsPanel = React.forwardRef<HTMLDivElement>((_props, ref) => {
  const client = useClient({apiVersion: '2024-01-01'})
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  const fetchShipments = async () => {
    setLoading(true)
    try {
      const query = `*[_type == "shipment"] | order(createdAt desc) [0...50] {
        _id,
        easypostId,
        trackingCode,
        status,
        reference,
        selectedRate,
        toAddress,
        createdAt
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

  const filteredShipments = shipments.filter((shipment) => {
    const search = searchTerm.toLowerCase()
    return (
      shipment.trackingCode?.toLowerCase().includes(search) ||
      shipment.reference?.toLowerCase().includes(search) ||
      shipment.easypostId?.toLowerCase().includes(search) ||
      shipment.toAddress?.name?.toLowerCase().includes(search)
    )
  })

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'delivered':
        return 'positive'
      case 'in_transit':
      case 'out_for_delivery':
        return 'primary'
      case 'pre_transit':
        return 'caution'
      case 'failure':
      case 'cancelled':
      case 'error':
        return 'critical'
      default:
        return 'default'
    }
  }

  const formatStatus = (status?: string) => {
    if (!status) return 'Unknown'
    return status
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  return (
    <Card ref={ref} padding={4}>
      <Stack space={4}>
        <Stack space={3}>
          <Text size={3} weight="bold">
            Shipments
          </Text>
          <TextInput
            icon={SearchIcon}
            placeholder="Search by tracking code, reference, or recipient..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.currentTarget.value)}
          />
          <Button text="Refresh" onClick={fetchShipments} mode="ghost" />
        </Stack>

        {loading ? (
          <Box padding={4} style={{textAlign: 'center'}}>
            <Spinner />
          </Box>
        ) : (
          <Stack space={2}>
            {filteredShipments.length === 0 ? (
              <Card padding={4} tone="transparent">
                <Text muted>No shipments found</Text>
              </Card>
            ) : (
              filteredShipments.map((shipment) => (
                <Card
                  key={shipment._id}
                  padding={3}
                  radius={2}
                  shadow={1}
                  tone="default"
                  as="a"
                  href={`/desk/shipment;${shipment._id}`}
                  style={{textDecoration: 'none', cursor: 'pointer'}}
                >
                  <Stack space={3}>
                    <Stack space={2}>
                      <Box style={{display: 'flex', justifyContent: 'space-between'}}>
                        <Text size={2} weight="semibold">
                          {shipment.trackingCode || 'No tracking code'}
                        </Text>
                        <Badge tone={getStatusColor(shipment.status)}>
                          {formatStatus(shipment.status)}
                        </Badge>
                      </Box>
                      {shipment.reference && (
                        <Text size={1} muted>
                          Ref: {shipment.reference}
                        </Text>
                      )}
                    </Stack>

                    <Box style={{display: 'flex', justifyContent: 'space-between'}}>
                      <Stack space={1}>
                        {shipment.toAddress?.name && (
                          <Text size={1}>{shipment.toAddress.name}</Text>
                        )}
                        {(shipment.toAddress?.city || shipment.toAddress?.state) && (
                          <Text size={1} muted>
                            {[shipment.toAddress.city, shipment.toAddress.state]
                              .filter(Boolean)
                              .join(', ')}
                          </Text>
                        )}
                      </Stack>

                      <Stack space={1} style={{textAlign: 'right'}}>
                        {shipment.selectedRate?.carrier && (
                          <Text size={1}>
                            {shipment.selectedRate.carrier} {shipment.selectedRate.service}
                          </Text>
                        )}
                        {shipment.selectedRate?.rate && (
                          <Text size={1} weight="semibold">
                            ${shipment.selectedRate.rate}
                          </Text>
                        )}
                      </Stack>
                    </Box>

                    {shipment.createdAt && (
                      <Text size={1} muted>
                        Created: {format(new Date(shipment.createdAt), 'MMM d, yyyy h:mm a')}
                      </Text>
                    )}
                  </Stack>
                </Card>
              ))
            )}
          </Stack>
        )}
      </Stack>
    </Card>
  )
})

ShipmentsPanel.displayName = 'ShipmentsPanel'

export default ShipmentsPanel
