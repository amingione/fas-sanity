import React, { useEffect, useState } from 'react'
import { useClient } from 'sanity'
import { Card, Heading, Text, Stack } from '@sanity/ui'

type Event = {
  _id: string
  shipDate: string
  customerName: string
  status?: string
  trackingUrl?: string
  labelUrl?: string
}

export default function ShippingCalendar() {
  const client = useClient({ apiVersion: '2024-04-10' })
  const [events, setEvents] = useState<Event[]>([])

  useEffect(() => {
    const fetchEvents = async () => {
      const result = await client.fetch(`
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

      const formatted = result.map((item: any) => ({
        _id: item._id,
        shipDate: item.shipDate,
        customerName: item.invoice?.quote?.customer?.fullName || 'Unknown',
        status: item.status || 'Pending',
        trackingUrl: item.trackingUrl,
        labelUrl: item.labelUrl
      }))

      setEvents(formatted)
    }

    fetchEvents()
  }, [client])

  return (
    <Card padding={4}>
      <Heading size={2}>📆 Shipping Calendar</Heading>
      <Stack space={4} marginTop={4}>
        {events.length === 0 ? (
          <Text>No shipments scheduled.</Text>
        ) : (
          Object.entries(
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
                    <span style={{
                      marginLeft: '0.5rem',
                      color: event.status === 'Delivered' ? 'green' :
                             event.status === 'Shipped' ? 'blue' :
                             event.status === 'Delayed' ? 'red' : 'gray'
                    }}>
                      {event.status}
                    </span>
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
          ))
        )}
      </Stack>
    </Card>
  )
}
