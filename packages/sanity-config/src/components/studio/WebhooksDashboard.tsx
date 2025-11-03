import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react'
import {useClient} from 'sanity'
import {useRouter} from 'sanity/router'
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Grid,
  Heading,
  Select,
  Spinner,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@sanity/ui'
import {RefreshIcon, LaunchIcon} from '@sanity/icons'
import {formatOrderNumber, orderNumberSearchTokens} from '../../utils/orderNumber'

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const EVENT_QUERY = `*[_type == "stripeWebhook"] | order(coalesce(occurredAt, _createdAt) desc)[0...200]{
  _id,
  stripeEventId,
  eventType,
  status,
  summary,
  occurredAt,
  processedAt,
  resourceType,
  resourceId,
  invoiceNumber,
  invoiceStatus,
  paymentIntentId,
  chargeId,
  customerId,
  requestId,
  livemode,
  orderNumber,
  orderId,
  invoiceId,
  orderRef->{_id, orderNumber},
  invoiceRef->{_id, invoiceNumber},
  metadata,
  rawPayload,
}`

type WebhookStatus = 'processed' | 'ignored' | 'error'

type RawWebhook = {
  _id: string
  stripeEventId?: string
  eventType?: string
  status?: WebhookStatus | string
  summary?: string
  occurredAt?: string
  processedAt?: string
  resourceType?: string
  resourceId?: string
  invoiceNumber?: string
  invoiceStatus?: string
  paymentIntentId?: string
  chargeId?: string
  customerId?: string
  requestId?: string
  livemode?: boolean
  orderNumber?: string
  orderId?: string
  invoiceId?: string
  orderRef?: {_id: string; orderNumber?: string | null}
  invoiceRef?: {_id: string; invoiceNumber?: string | null}
  metadata?: string
  rawPayload?: string
}

type WebhookRecord = {
  id: string
  stripeEventId: string
  eventType: string
  eventTypeLabel: string
  summary: string
  status: WebhookStatus
  occurredAt: string | null
  processedAt: string | null
  occurredAtLabel: string
  processedAtLabel: string
  invoiceNumber: string | null
  invoiceStatus: string | null
  paymentIntentId: string | null
  chargeId: string | null
  customerId: string | null
  requestId: string | null
  resourceType: string | null
  resourceId: string | null
  livemode: boolean
  metadata: string | null
  rawPayload: string | null
  orderNumber: string | null
  orderId: string | null
  invoiceId: string | null
}

const STATUS_LABELS: Record<WebhookStatus, string> = {
  processed: 'Processed',
  ignored: 'Ignored',
  error: 'Error',
}

const STATUS_TONE: Record<WebhookStatus, 'positive' | 'caution' | 'critical'> = {
  processed: 'positive',
  ignored: 'caution',
  error: 'critical',
}

function friendlySummary(summary?: string | null, eventType?: string | null): string {
  if (summary && summary.trim()) return summary.trim()
  if (!eventType) return 'Webhook event'
  const formatted = eventType
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!formatted) return 'Webhook event'
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

function friendlyDateTime(value?: string | null): string {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return DATE_TIME_FORMAT.format(parsed)
}

function normalizeWebhook(raw: RawWebhook): WebhookRecord {
  const status: WebhookStatus =
    raw.status === 'ignored' || raw.status === 'error' ? (raw.status as WebhookStatus) : 'processed'
  const eventType = raw.eventType?.trim() || 'unknown.event'
  const occurredAt = raw.occurredAt || null
  const processedAt = raw.processedAt || null
  const orderRefId = raw.orderRef?._id || raw.orderId || null
  const invoiceRefId = raw.invoiceRef?._id || raw.invoiceId || null
  const normalizedOrderNumber =
    formatOrderNumber(raw.orderNumber) ||
    formatOrderNumber(raw.orderRef?.orderNumber) ||
    raw.orderNumber ||
    raw.orderRef?.orderNumber ||
    null

  return {
    id: raw._id,
    stripeEventId: raw.stripeEventId || raw._id,
    eventType,
    eventTypeLabel: eventType.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim(),
    summary: friendlySummary(raw.summary, eventType),
    status,
    occurredAt,
    processedAt,
    occurredAtLabel: friendlyDateTime(occurredAt),
    processedAtLabel: friendlyDateTime(processedAt),
    invoiceNumber: raw.invoiceNumber || raw.invoiceRef?.invoiceNumber || null,
    invoiceStatus: raw.invoiceStatus || null,
    paymentIntentId: raw.paymentIntentId || null,
    chargeId: raw.chargeId || null,
    customerId: raw.customerId || null,
    requestId: raw.requestId || null,
    resourceType: raw.resourceType || null,
    resourceId: raw.resourceId || null,
    livemode: Boolean(raw.livemode),
    metadata: raw.metadata || null,
    rawPayload: raw.rawPayload || null,
    orderNumber: normalizedOrderNumber,
    orderId: orderRefId,
    invoiceId: invoiceRefId,
  }
}

function matchesSearch(record: WebhookRecord, query: string): boolean {
  const value = query.trim().toLowerCase()
  if (!value) return true
  const orderTokens = orderNumberSearchTokens(record.orderNumber)
  const haystack = [
    record.summary,
    record.eventType,
    record.eventTypeLabel,
    record.invoiceNumber,
    record.invoiceStatus,
    record.paymentIntentId,
    record.chargeId,
    record.customerId,
    record.resourceId,
    record.resourceType,
    record.requestId,
    record.orderNumber,
    record.stripeEventId,
  ]
  if (haystack.some((item) => item && item.toLowerCase().includes(value))) return true
  if (orderTokens.some((token) => token.toLowerCase().includes(value))) return true
  if (record.metadata && record.metadata.toLowerCase().includes(value)) return true
  if (record.rawPayload && record.rawPayload.toLowerCase().includes(value)) return true
  return false
}
const WebhooksDashboard = React.forwardRef<HTMLDivElement, Record<string, never>>((_props, ref) => {
  const client = useClient({apiVersion: '2024-10-01'})
  const router = useRouter()

  const [events, setEvents] = useState<WebhookRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | WebhookStatus>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const fetchEvents = useCallback(
    async (options: {silent?: boolean} = {}) => {
      if (!options.silent) setLoading(true)
      setError(null)
      try {
        const result = await client.fetch<RawWebhook[]>(EVENT_QUERY)
        setEvents(result.map(normalizeWebhook))
      } catch (err: any) {
        console.error('Webhooks dashboard fetch failed', err)
        setError(err?.message || 'Unable to load webhook events')
      } finally {
        if (!options.silent) setLoading(false)
      }
    },
    [client],
  )

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await fetchEvents({silent: true})
    } finally {
      setRefreshing(false)
    }
  }, [fetchEvents])

  const handleStatusChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(event.currentTarget.value as 'all' | WebhookStatus)
  }, [])

  const handleTypeChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    setTypeFilter(event.currentTarget.value)
  }, [])

  const handleSearchChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setSearch(event.currentTarget.value)
  }, [])

  const handleSearchKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setSearch('')
      event.currentTarget.blur()
    }
  }, [])

  const eventTypes = useMemo(() => {
    const unique = new Set<string>()
    events.forEach((item) => {
      if (item.eventType) unique.add(item.eventType)
    })
    return Array.from(unique).sort((a, b) => a.localeCompare(b))
  }, [events])

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (statusFilter !== 'all' && event.status !== statusFilter) return false
      if (typeFilter !== 'all' && event.eventType !== typeFilter) return false
      if (search && !matchesSearch(event, search)) return false
      return true
    })
  }, [events, statusFilter, typeFilter, search])

  const stats = useMemo(() => {
    return events.reduce(
      (acc, event) => {
        acc[event.status] += 1
        return acc
      },
      {processed: 0, ignored: 0, error: 0} as Record<WebhookStatus, number>,
    )
  }, [events])

  const totalEvents = events.length
  const errorCount = stats.error

  const handleOpenOrder = useCallback(
    (id: string | null) => {
      if (!id) return
      router.navigateIntent('edit', {id, type: 'order'})
    },
    [router],
  )

  const handleOpenInvoice = useCallback(
    (id: string | null) => {
      if (!id) return
      router.navigateIntent('edit', {id, type: 'invoice'})
    },
    [router],
  )

  return (
    <Box
      ref={ref}
      padding={[3, 4, 5]}
      style={{
        background: 'var(--studio-surface-overlay)',
        minHeight: '100%',
        borderRadius: '28px',
        border: '1px solid var(--studio-border)',
        boxShadow: 'var(--studio-shadow)',
        backdropFilter: 'blur(18px)',
      }}
    >
      <Stack space={4}>
        <Card padding={[3, 4]} radius={4} shadow={1} tone="transparent">
          <Flex align="center" justify="space-between" gap={4} wrap="wrap">
            <Stack space={2} style={{minWidth: 240}}>
              <Heading size={3}>Stripe webhooks</Heading>
              <Text muted size={1}>
                Monitor recent Stripe webhook deliveries and jump straight to related orders and invoices.
              </Text>
              <Text muted size={1}>
                Showing {filteredEvents.length} of {totalEvents} events
                {errorCount ? ` • ${errorCount} error${errorCount === 1 ? '' : 's'}` : ''}
              </Text>
            </Stack>
            <Button
              icon={RefreshIcon}
              text={refreshing ? 'Refreshing…' : 'Refresh'}
              tone="primary"
              mode="default"
              onClick={handleRefresh}
              disabled={loading || refreshing}
            />
          </Flex>
        </Card>

        <Card padding={[3, 4]} radius={4} shadow={1} tone="transparent">
          <Grid columns={[1, 1, 3]} gap={3}>
            <Stack space={2}>
              <Text size={1} weight="medium">
                Status
              </Text>
              <Select value={statusFilter} onChange={handleStatusChange}>
                <option value="all">All statuses</option>
                <option value="processed">Processed</option>
                <option value="ignored">Ignored</option>
                <option value="error">Errors</option>
              </Select>
            </Stack>
            <Stack space={2}>
              <Text size={1} weight="medium">
                Event type
              </Text>
              <Select value={typeFilter} onChange={handleTypeChange}>
                <option value="all">All event types</option>
                {eventTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </Stack>
            <Stack space={2}>
              <Text size={1} weight="medium">
                Search
              </Text>
              <TextInput
                value={search}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search events, invoices, customers…"
              />
            </Stack>
          </Grid>
        </Card>

        {loading ? (
          <Card padding={[6, 7]} radius={4} shadow={1} tone="transparent">
            <Flex align="center" justify="center">
              <Spinner muted />
            </Flex>
          </Card>
        ) : error ? (
          <Card padding={[4, 5]} radius={4} shadow={1} tone="critical">
            <Text size={1}>{error}</Text>
          </Card>
        ) : filteredEvents.length === 0 ? (
          <Card padding={[4, 5]} radius={4} shadow={1} tone="transparent">
            <Stack space={3} style={{alignItems: 'center', textAlign: 'center'}}>
              <Heading size={2}>No webhook events</Heading>
              <Text muted size={1}>
                Adjust the filters or try refreshing to load the latest events.
              </Text>
            </Stack>
          </Card>
        ) : (
          <Stack space={3}>
            {filteredEvents.map((event) => (
              <Card key={event.id} padding={[3, 4]} radius={4} shadow={1} tone="transparent">
                <Stack space={3}>
                  <Flex align="center" justify="space-between" gap={4} wrap="wrap">
                    <Flex align="center" gap={3}>
                      <Badge tone={STATUS_TONE[event.status]}>{STATUS_LABELS[event.status]}</Badge>
                      <Stack space={1}>
                        <Text size={2} weight="semibold">
                          {event.summary}
                        </Text>
                        <Text size={1} muted>
                          {event.eventType}
                          {event.livemode ? ' • Live mode' : ' • Test mode'}
                        </Text>
                      </Stack>
                    </Flex>
                    <Flex align="center" gap={2}>
                      {event.orderId ? (
                        <Tooltip content={<Text size={1}>Open related order</Text>}>
                          <Button
                            icon={LaunchIcon}
                            mode="ghost"
                            text={event.orderNumber ? `Order ${event.orderNumber}` : 'Order'}
                            onClick={() => handleOpenOrder(event.orderId)}
                          />
                        </Tooltip>
                      ) : null}
                      {event.invoiceId ? (
                        <Tooltip content={<Text size={1}>Open related invoice</Text>}>
                          <Button
                            icon={LaunchIcon}
                            mode="ghost"
                            text={event.invoiceNumber ? `Invoice ${event.invoiceNumber}` : 'Invoice'}
                            onClick={() => handleOpenInvoice(event.invoiceId)}
                          />
                        </Tooltip>
                      ) : null}
                    </Flex>
                  </Flex>

                  <Grid columns={[1, 1, 2, 3]} gap={3}>
                    <Stack space={1}>
                      <Text size={1} muted>
                        Stripe Event ID
                      </Text>
                      <Text size={1}>{event.stripeEventId}</Text>
                    </Stack>
                    <Stack space={1}>
                      <Text size={1} muted>
                        Occurred
                      </Text>
                      <Text size={1}>{event.occurredAtLabel}</Text>
                    </Stack>
                    <Stack space={1}>
                      <Text size={1} muted>
                        Processed
                      </Text>
                      <Text size={1}>{event.processedAtLabel}</Text>
                    </Stack>
                    {event.resourceType || event.resourceId ? (
                      <Stack space={1}>
                        <Text size={1} muted>
                          Resource
                        </Text>
                        <Text size={1}>
                          {event.resourceType || '—'}
                          {event.resourceId ? ` • ${event.resourceId}` : ''}
                        </Text>
                      </Stack>
                    ) : null}
                    {event.paymentIntentId ? (
                      <Stack space={1}>
                        <Text size={1} muted>
                          Payment Intent
                        </Text>
                        <Text size={1}>{event.paymentIntentId}</Text>
                      </Stack>
                    ) : null}
                    {event.chargeId ? (
                      <Stack space={1}>
                        <Text size={1} muted>
                          Charge
                        </Text>
                        <Text size={1}>{event.chargeId}</Text>
                      </Stack>
                    ) : null}
                    {event.customerId ? (
                      <Stack space={1}>
                        <Text size={1} muted>
                          Customer
                        </Text>
                        <Text size={1}>{event.customerId}</Text>
                      </Stack>
                    ) : null}
                    {event.invoiceStatus ? (
                      <Stack space={1}>
                        <Text size={1} muted>
                          Invoice Status
                        </Text>
                        <Text size={1}>{event.invoiceStatus}</Text>
                      </Stack>
                    ) : null}
                    {event.requestId ? (
                      <Stack space={1}>
                        <Text size={1} muted>
                          Request ID
                        </Text>
                        <Text size={1}>{event.requestId}</Text>
                      </Stack>
                    ) : null}
                  </Grid>

                  {event.metadata ? (
                    <Card padding={3} radius={3} tone="transparent" border>
                      <Text size={1} weight="medium">
                        Metadata
                      </Text>
                      <Text
                        as="pre"
                        size={1}
                        style={{
                          whiteSpace: 'pre-wrap',
                          fontFamily: 'var(--font-family-monospace)',
                          marginTop: 4,
                          maxHeight: 200,
                          overflowY: 'auto',
                        }}
                      >
                        {event.metadata}
                      </Text>
                    </Card>
                  ) : null}

                  {event.rawPayload ? (
                    <Card padding={3} radius={3} tone="transparent" border>
                      <Text size={1} weight="medium">
                        Raw payload
                      </Text>
                      <Text
                        as="pre"
                        size={1}
                        style={{
                          whiteSpace: 'pre-wrap',
                          fontFamily: 'var(--font-family-monospace)',
                          marginTop: 4,
                          maxHeight: 240,
                          overflowY: 'auto',
                        }}
                      >
                        {event.rawPayload}
                      </Text>
                    </Card>
                  ) : null}
                </Stack>
              </Card>
            ))}
          </Stack>
        )}
      </Stack>
    </Box>
  )
})

WebhooksDashboard.displayName = 'WebhooksDashboard'

export default WebhooksDashboard
