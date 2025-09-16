import React, { useEffect, useMemo, useState } from 'react'
import { useClient } from 'sanity'
import { Card, Heading, Text, Stack, Box } from '@sanity/ui'

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
  const calcomEmbedUrl = useMemo(
    () =>
      (import.meta.env.SANITY_STUDIO_CALCOM_EMBED_URL as string | undefined) ||
      (import.meta.env.VITE_CALCOM_EMBED_URL as string | undefined),
    []
  )

  useEffect(() => {
    const query = `
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
    `

    let sub: { unsubscribe: () => void } | null = null
    let mounted = true

    const toEvent = (item: RawShippingLabel): Event => ({
      _id: item._id,
      shipDate: item.shipDate,
      customerName: item.invoice?.quote?.customer?.fullName || 'Unknown',
      status: item.status || 'Pending',
      trackingUrl: item.trackingUrl,
      labelUrl: item.labelUrl,
    })

    async function run() {
      setLoading(true)
      try {
        const initial: RawShippingLabel[] = await client.fetch(query)
        if (!mounted) return
        setEvents(initial.map(toEvent))
      } catch (err) {
        console.error('Error fetching events:', err)
      } finally {
        if (mounted) setLoading(false)
      }

      // Subscribe to real-time changes for this query
      sub = client
        .listen(query, {}, { visibility: 'query' })
        .subscribe((msg: any) => {
          const { transition, result } = msg || {}
          if (!result?._id) return

          setEvents((prev) => {
            const copy = [...prev]
            const idx = copy.findIndex((e) => e._id === result._id)
            const nextEvent = toEvent(result as RawShippingLabel)

            if (transition === 'appear') {
              // New matching doc
              if (idx === -1) copy.push(nextEvent)
            } else if (transition === 'update') {
              // Existing doc changed
              if (idx !== -1) copy[idx] = nextEvent
              else copy.push(nextEvent)
            } else if (transition === 'disappear') {
              // Doc no longer matches (deleted or shipDate unset)
              if (idx !== -1) copy.splice(idx, 1)
            }

            return copy
          })
        })
    }

    run()

    return () => {
      mounted = false
      if (sub) sub.unsubscribe()
    }
  }, [client])

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
          {calcomEmbedUrl ? (
            <iframe
              src={calcomEmbedUrl}
              title="Cal.com Booking"
              style={{ border: 'none', width: '100%', height: '100%', borderRadius: 8 }}
              allow="camera; microphone; fullscreen; clipboard-read; clipboard-write"
            />
          ) : (
            <Card padding={4} tone="caution" radius={2} shadow={1}>
              <Stack space={3}>
                <Heading as="h3" size={1}>
                  Cal.com embed not configured
                </Heading>
                <Text>
                  Provide `SANITY_STUDIO_CALCOM_EMBED_URL` (or `VITE_CALCOM_EMBED_URL`) in your environment to show the
                  booking widget.
                </Text>
              </Stack>
            </Card>
          )}
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
