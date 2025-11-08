import React, {useCallback, useEffect, useMemo, useState} from 'react'
import {
  Badge,
  Box,
  Button,
  Card,
  Dialog,
  Flex,
  Grid,
  Heading,
  Label,
  Select,
  Spinner,
  Stack,
  Text,
  TextInput,
} from '@sanity/ui'
import {useClient} from 'sanity'

const GRID_TEMPLATE = '200px 140px 200px minmax(220px, 1fr) 140px 160px'
const GRID_GAP = 12

const PRE_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-family-monospace)',
  fontSize: '12px',
  lineHeight: 1.5,
  margin: 0,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}

type WebhookDoc = {
  _id: string
  eventId?: string | null
  eventType?: string | null
  category?: string | null
  summary?: string | null
  status?: string | null
  livemode?: boolean | null
  amount?: number | null
  currency?: string | null
  resourceId?: string | null
  resourceType?: string | null
  requestId?: string | null
  apiVersion?: string | null
  metadata?: string | null
  data?: string | null
  payload?: string | null
  createdAt?: string | null
  receivedAt?: string | null
}

type WebhookRecord = {
  id: string
  eventId: string
  eventType: string
  category: string
  summary: string
  status: string | null
  livemode: boolean
  amount: number | null
  currency: string | null
  resourceId: string | null
  resourceType: string | null
  requestId: string | null
  apiVersion: string | null
  metadata: string | null
  data: string | null
  payload: string | null
  createdAt: string | null
  receivedAt: string | null
  createdAtLabel: string
  receivedAtLabel: string
  searchIndex: string
}

const WEBHOOK_QUERY = `*[_type == "stripeWebhookEvent"] | order(coalesce(receivedAt, _updatedAt, _createdAt) desc)[0...200]{
  _id,
  eventId,
  eventType,
  category,
  summary,
  status,
  livemode,
  amount,
  currency,
  resourceId,
  resourceType,
  requestId,
  apiVersion,
  metadata,
  data,
  payload,
  createdAt,
  receivedAt
}`

const categoryOptions = [
  {label: 'All categories', value: 'all'},
  {label: 'Source', value: 'source'},
  {label: 'Person', value: 'person'},
  {label: 'Issuing dispute', value: 'issuing_dispute'},
]

const modeOptions = [
  {label: 'All modes', value: 'all'},
  {label: 'Live only', value: 'live'},
  {label: 'Test only', value: 'test'},
]

const formatDateTime = (value?: string | null) => {
  if (!value) return '—'
  try {
    const date = new Date(value)
    return date.toLocaleString()
  } catch {
    return value
  }
}

const currencyFormatter = (amount: number, currency?: string | null) => {
  const normalizedCurrency = (currency || 'USD').toUpperCase()
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: normalizedCurrency,
      maximumFractionDigits: 2,
    }).format(amount / 100)
  } catch {
    return `${amount} ${normalizedCurrency}`.trim()
  }
}

const normalizeRecord = (doc: WebhookDoc): WebhookRecord => {
  const eventId = doc.eventId || doc._id
  const eventType = doc.eventType || 'stripe.event'
  const category = doc.category || 'unknown'
  const summary = doc.summary || eventType
  const livemode = Boolean(doc.livemode)
  const createdAt = doc.createdAt || null
  const receivedAt = doc.receivedAt || null
  const receivedAtLabel = formatDateTime(receivedAt)
  const createdAtLabel = formatDateTime(createdAt)
  const parts = [
    eventId,
    eventType,
    category,
    summary,
    doc.status,
    doc.resourceId,
    doc.resourceType,
    doc.metadata,
  ]
    .filter(Boolean)
    .map((part) => String(part).toLowerCase())
    .join(' ')

  return {
    id: doc._id,
    eventId,
    eventType,
    category,
    summary,
    status: doc.status || null,
    livemode,
    amount: typeof doc.amount === 'number' ? doc.amount : null,
    currency: doc.currency || null,
    resourceId: doc.resourceId || null,
    resourceType: doc.resourceType || null,
    requestId: doc.requestId || null,
    apiVersion: doc.apiVersion || null,
    metadata: doc.metadata || null,
    data: doc.data || null,
    payload: doc.payload || null,
    createdAt,
    receivedAt,
    createdAtLabel,
    receivedAtLabel,
    searchIndex: parts,
  }
}

const humanizeCategory = (value: string) => {
  return value
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

const StripeWebhookDashboard = React.forwardRef<HTMLDivElement, Record<string, never>>(
  (_props, ref) => {
    const client = useClient({apiVersion: '2024-10-01'})
    const [events, setEvents] = useState<WebhookRecord[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [categoryFilter, setCategoryFilter] = useState('all')
    const [modeFilter, setModeFilter] = useState('all')
    const [search, setSearch] = useState('')
    const [selected, setSelected] = useState<WebhookRecord | null>(null)

    const fetchEvents = useCallback(async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await client.fetch<WebhookDoc[]>(WEBHOOK_QUERY)
        setEvents((result || []).map(normalizeRecord))
      } catch (err: any) {
        console.error('StripeWebhookDashboard: failed to load events', err)
        setError(err?.message || 'Failed to load webhook events')
      } finally {
        setLoading(false)
      }
    }, [client])

    useEffect(() => {
      fetchEvents()
    }, [fetchEvents])

    const filtered = useMemo(() => {
      const term = search.trim().toLowerCase()
      return events.filter((event) => {
        if (categoryFilter !== 'all' && event.category !== categoryFilter) return false
        if (modeFilter === 'live' && !event.livemode) return false
        if (modeFilter === 'test' && event.livemode) return false
        if (!term) return true
        return event.searchIndex.includes(term)
      })
    }, [categoryFilter, events, modeFilter, search])

    return (
      <Box padding={4} style={{height: '100%', boxSizing: 'border-box'}} ref={ref}>
        <Stack space={4} style={{height: '100%'}}>
          <Flex align="center" justify="space-between">
            <Heading size={2}>Stripe Webhook Activity</Heading>
            <Button mode="ghost" text="Refresh" onClick={fetchEvents} disabled={loading} />
          </Flex>

          <Card padding={3} radius={3} shadow={1} tone="transparent">
            <Grid columns={[1, 2, 3]} gap={4}>
              <Stack space={2}>
                <Label size={1}>Category</Label>
                <Select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.currentTarget.value)}
                >
                  {categoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Stack>
              <Stack space={2}>
                <Label size={1}>Mode</Label>
                <Select
                  value={modeFilter}
                  onChange={(event) => setModeFilter(event.currentTarget.value)}
                >
                  {modeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Stack>
              <Stack space={2}>
                <Label size={1}>Search</Label>
                <TextInput
                  value={search}
                  onChange={(event) => setSearch(event.currentTarget.value)}
                  placeholder="Search by id, type, status or metadata"
                />
              </Stack>
            </Grid>
          </Card>

          {loading ? (
            <Flex align="center" justify="center" style={{flex: 1}}>
              <Spinner />
            </Flex>
          ) : error ? (
            <Card padding={4} radius={3} tone="critical">
              <Text>{error}</Text>
            </Card>
          ) : filtered.length === 0 ? (
            <Card padding={4} radius={3} tone="transparent">
              <Text size={1}>No webhook events match the current filters.</Text>
            </Card>
          ) : (
            <Card radius={3} shadow={1} style={{overflow: 'auto', flex: 1}}>
              <Box style={{minWidth: '880px'}}>
                <Grid
                  columns={GRID_TEMPLATE}
                  gap={GRID_GAP}
                  padding={3}
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                    backgroundColor: 'var(--card-background-color)',
                    borderBottom: '1px solid var(--card-border-color)',
                  }}
                >
                  <Label size={1}>Received</Label>
                  <Label size={1}>Category</Label>
                  <Label size={1}>Event type</Label>
                  <Label size={1}>Summary</Label>
                  <Label size={1}>Status</Label>
                  <Label size={1}>Resource</Label>
                </Grid>
                <Stack space={1}>
                  {filtered.map((event) => (
                    <Grid
                      key={event.id}
                      columns={GRID_TEMPLATE}
                      gap={GRID_GAP}
                      paddingX={3}
                      paddingY={2}
                      style={{
                        cursor: 'pointer',
                        alignItems: 'center',
                      }}
                      onClick={() => setSelected(event)}
                    >
                      <Text size={1}>{event.receivedAtLabel}</Text>
                      <Flex gap={2} align="center">
                        <Badge mode="outline" tone="primary">
                          {humanizeCategory(event.category)}
                        </Badge>
                        <Badge mode="outline" tone={event.livemode ? 'positive' : 'caution'}>
                          {event.livemode ? 'Live' : 'Test'}
                        </Badge>
                      </Flex>
                      <Text size={1}>{event.eventType}</Text>
                      <Text size={1}>{event.summary}</Text>
                      <Text size={1}>{event.status || '—'}</Text>
                      <Stack space={1}>
                        <Text size={1}>{event.resourceId || '—'}</Text>
                        <Text size={1} muted>
                          {event.resourceType ? humanizeCategory(event.resourceType) : ''}
                        </Text>
                      </Stack>
                    </Grid>
                  ))}
                </Stack>
              </Box>
            </Card>
          )}
        </Stack>

        {selected && (
          <Dialog
            id="stripe-webhook-event-details"
            header={selected.summary || selected.eventType}
            width={1}
            onClose={() => setSelected(null)}
            footer={
              <Flex justify="flex-end" padding={3}>
                <Button text="Close" mode="ghost" onClick={() => setSelected(null)} />
              </Flex>
            }
          >
            <Box padding={4}>
              <Stack space={4}>
                <Grid columns={[1, 2]} gap={4}>
                  <Stack space={2}>
                    <Label size={1}>Event ID</Label>
                    <Text size={1}>{selected.eventId}</Text>
                  </Stack>
                  <Stack space={2}>
                    <Label size={1}>Event type</Label>
                    <Text size={1}>{selected.eventType}</Text>
                  </Stack>
                  <Stack space={2}>
                    <Label size={1}>Category</Label>
                    <Text size={1}>{humanizeCategory(selected.category)}</Text>
                  </Stack>
                  <Stack space={2}>
                    <Label size={1}>Mode</Label>
                    <Text size={1}>{selected.livemode ? 'Live' : 'Test'}</Text>
                  </Stack>
                  <Stack space={2}>
                    <Label size={1}>Received</Label>
                    <Text size={1}>{selected.receivedAtLabel}</Text>
                  </Stack>
                  <Stack space={2}>
                    <Label size={1}>Created</Label>
                    <Text size={1}>{selected.createdAtLabel}</Text>
                  </Stack>
                  <Stack space={2}>
                    <Label size={1}>Status</Label>
                    <Text size={1}>{selected.status || '—'}</Text>
                  </Stack>
                  <Stack space={2}>
                    <Label size={1}>Request ID</Label>
                    <Text size={1}>{selected.requestId || '—'}</Text>
                  </Stack>
                  <Stack space={2}>
                    <Label size={1}>API version</Label>
                    <Text size={1}>{selected.apiVersion || '—'}</Text>
                  </Stack>
                  <Stack space={2}>
                    <Label size={1}>Resource</Label>
                    <Text size={1}>{selected.resourceId || '—'}</Text>
                    <Text size={1} muted>
                      {selected.resourceType ? humanizeCategory(selected.resourceType) : ''}
                    </Text>
                  </Stack>
                  <Stack space={2}>
                    <Label size={1}>Amount</Label>
                    <Text size={1}>
                      {selected.amount !== null
                        ? currencyFormatter(selected.amount, selected.currency)
                        : '—'}
                    </Text>
                  </Stack>
                </Grid>

                {selected.metadata && (
                  <Stack space={2}>
                    <Label size={1}>Metadata</Label>
                    <Card padding={3} radius={2} tone="transparent">
                      <pre style={PRE_STYLE}>{selected.metadata}</pre>
                    </Card>
                  </Stack>
                )}

                {selected.data && (
                  <Stack space={2}>
                    <Label size={1}>Data snapshot</Label>
                    <Card padding={3} radius={2} tone="transparent">
                      <pre style={PRE_STYLE}>{selected.data}</pre>
                    </Card>
                  </Stack>
                )}

                {selected.payload && (
                  <Stack space={2}>
                    <Label size={1}>Raw payload</Label>
                    <Card padding={3} radius={2} tone="transparent">
                      <pre style={PRE_STYLE}>{selected.payload}</pre>
                    </Card>
                  </Stack>
                )}
              </Stack>
            </Box>
          </Dialog>
        )}
      </Box>
    )
  },
)

StripeWebhookDashboard.displayName = 'StripeWebhookDashboard'

export default StripeWebhookDashboard
