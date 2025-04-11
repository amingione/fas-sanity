import React, { useEffect, useState } from 'react'
import { useClient } from 'sanity'
import { Card, Heading, Text, Stack, Box } from '@sanity/ui'
import { InlineWidget } from "react-calendly"

type RawShippingLabel = {
  _id: string
  shipDate: string
  status?: string
  trackingUrl?: string
  labelUrl?: string
  invoice: {
    quote: {
      customer: {
        fullName: string
      }
    }
  }
}

type Event = {
  _id: string
  shipDate: string
  customerName: string
  status?: string
  trackingUrl?: string
  labelUrl?: string
}

const StatusBadge: React.FC<{ status?: string }> = ({ status }) => {
  const color = status === 'Delivered' ? 'green' :
                status === 'Shipped' ? 'blue' :
                status === 'Delayed' ? 'red' : 'gray';

  return (
    <span style={{ marginLeft: '0.5rem', color }}>
      {status}
    </span>
  );
};

export default function ShippingCalendar() {
  const client = useClient({ apiVersion: '2024-04-10' })
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState<boolean>(true)

  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      try {
        const result: RawShippingLabel[] = await client.fetch(`
          *[_type == "shippingLabel" && defined(shipDate)]{
            _id,
            shipDate,
            status,
            trackingUrl,
            labelUrl,
            invoice->{
              quote->{
                customer->{
                  fullName
                }
              }
            }
          }
        `)

        const formatted = result.map((item) => ({
          _id: item._id,
          shipDate: item.shipDate,
          customerName: item.invoice?.quote?.customer?.fullName || 'Unknown',
          status: item.status || 'Pending',
          trackingUrl: item.trackingUrl,
          labelUrl: item.labelUrl
        }))

        setEvents(formatted)
      } catch (error) {
        console.error("Error fetching events:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchEvents()
  }, [])

  return (
    <Card padding={4}>
      <Heading size={2}>📆 Shipping Calendar + Booking</Heading>
      <Box display="flex" paddingTop={4} style={{ flexDirection: 'row', gap: '2rem' }}>
        {/* Calendar Column */}
        <Box flex={2}>
          <Stack space={4}>
            {loading && <Text>Loading...</Text>}
            {!loading && events.length === 0 && <Text>No shipments scheduled.</Text>}
            {!loading && events.length > 0 && (
              <>
                {Object.entries(
                  events.reduce((acc, event) => {
                    const dateKey = new Date(event.shipDate).toDateString()
                    acc[dateKey] = acc[dateKey] || []
                    acc[dateKey].push(event)
                    return acc
                  }, {} as Record<string, Event[]>)
                ).map(([date, dayEvents]) => (
                  <Card
                    key={date}
                    padding={3}
                    shadow={1}
                    radius={2}
                    style={{
                      backgroundColor: new Date(date).toDateString() === new Date().toDateString() ? '#fef9e7' : undefined
                    }}
                  >
                    <Heading size={1}>{date}</Heading>
                    <Stack space={2} marginTop={2}>
                      {dayEvents.map((event) => (
                        <Text key={event._id}>
                          🚚 {event.customerName} — 
                          <StatusBadge status={event.status} />
                          {event.trackingUrl && (
                            <a href={event.trackingUrl} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 12 }}>
                              📦 Track
                            </a>
                          )}
                          {event.labelUrl && (
                            <a href={event.labelUrl} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8 }}>
                              🧾 Label
                            </a>
                          )}
                        </Text>
                      ))}
                    </Stack>
                  </Card>
                ))}
              </>
            )}
          </Stack>
        </Box>

        {/* Calendly Sidebar */}
        <Box flex={1} style={{ minWidth: '400px', height: '700px' }}>
          <InlineWidget url="https://calendly.com/fasmotorsports-support" styles={{ height: '100%' }} />
        </Box>
      </Box>
    </Card>
  )
}

export const shippingCalendarTool = {
  name: 'shipping-calendar',
  title: 'Shipping Calendar',
  component: ShippingCalendar,
}
