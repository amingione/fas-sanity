import {forwardRef, useEffect, useMemo, useState} from 'react'
import {useClient} from 'sanity'
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Grid,
  Heading,
  Spinner,
  Stack,
  Text,
} from '@sanity/ui'

type CampaignPerformanceProps = {
  documentId?: string
}

type EmailLog = {
  _id: string
  to?: string
  status?: string
  sentAt?: string
  openedAt?: string
  clickedAt?: string
  clickEvents?: Array<{url?: string; timestamp?: string}>
}

type CampaignPerformanceResult = {
  _id: string
  title?: string
  subject?: string
  status?: string
  scheduledSendDate?: string
  sentDate?: string
  recipientCount?: number
  sentCount?: number
  deliveredCount?: number
  openedCount?: number
  clickedCount?: number
  unsubscribedCount?: number
  openRate?: number
  clickRate?: number
  unsubscribeRate?: number
  attributionRevenue?: number
  attributedOrders?: number
  logs: EmailLog[]
}

const CAMPAIGN_PERFORMANCE_QUERY = `*[_type == "emailCampaign" && _id == $id][0]{
  _id,
  title,
  subject,
  status,
  scheduledSendDate,
  sentDate,
  recipientCount,
  sentCount,
  deliveredCount,
  openedCount,
  clickedCount,
  unsubscribedCount,
  openRate,
  clickRate,
  unsubscribeRate,
  "logs": *[_type == "emailLog" && campaign._ref == ^._id] | order(coalesce(sentAt,_createdAt) desc)[0...50]{
    _id,
    to,
    status,
    sentAt,
    openedAt,
    clickedAt,
    clickEvents
  },
  "attributionRevenue": coalesce(
    math::sum(*[_type == "attribution" && utmCampaign == coalesce(^.trackingSlug.current, ^.title)].orderValue),
    0
  ),
  "attributedOrders": count(*[_type == "attribution" && utmCampaign == coalesce(^.trackingSlug.current, ^.title)])
}`

const formatPercent = (value?: number | null) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0%'
  return `${(value * 100).toFixed(1)}%`
}

const formatCurrency = (value?: number | null) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '$0.00'
  return new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(value)
}

const StatCard = ({
  label,
  value,
  tone,
}: {
  label: string
  value: string | number
  tone?: 'default' | 'positive' | 'caution'
}) => (
  <Card padding={4} radius={2} border tone={tone === 'positive' ? 'positive' : tone === 'caution' ? 'caution' : undefined}>
    <Stack space={2}>
      <Text size={1} muted>
        {label}
      </Text>
      <Text size={3} weight="semibold">
        {value}
      </Text>
    </Stack>
  </Card>
)

const CampaignPerformance = forwardRef<HTMLDivElement, CampaignPerformanceProps>((props, ref) => {
  const campaignId = (props.documentId || '').replace(/^drafts\./, '')
  const client = useClient({apiVersion: '2024-10-01'})
  const [data, setData] = useState<CampaignPerformanceResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!campaignId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    client
      .fetch<CampaignPerformanceResult>(CAMPAIGN_PERFORMANCE_QUERY, {id: campaignId})
      .then((result) => {
        if (!cancelled) setData(result || null)
      })
      .catch((err) => {
        console.error('CampaignPerformance: failed to load', err)
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load campaign data')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [campaignId, client, refreshKey])

  const linkStats = useMemo(() => {
    const stats = new Map<
      string,
      {
        count: number
        lastClicked?: string
      }
    >()
    data?.logs?.forEach((log) => {
      log.clickEvents?.forEach((event) => {
        if (!event?.url) return
        const existing = stats.get(event.url) || {count: 0, lastClicked: undefined}
        existing.count += 1
        if (event.timestamp && (!existing.lastClicked || event.timestamp > existing.lastClicked)) {
          existing.lastClicked = event.timestamp
        }
        stats.set(event.url, existing)
      })
      if (log.clickedAt && (!log.clickEvents || log.clickEvents.length === 0)) {
        const syntheticUrl = 'CTA / Primary Link'
        const existing = stats.get(syntheticUrl) || {count: 0, lastClicked: undefined}
        existing.count += 1
        if (!existing.lastClicked || log.clickedAt > existing.lastClicked) {
          existing.lastClicked = log.clickedAt
        }
        stats.set(syntheticUrl, existing)
      }
    })
    return Array.from(stats.entries()).sort((a, b) => b[1].count - a[1].count)
  }, [data?.logs])

  if (!campaignId) {
    return (
      <Card ref={ref} padding={4}>
        <Text>Select a campaign to view performance details.</Text>
      </Card>
    )
  }

  if (loading && !data) {
    return (
      <Card ref={ref} padding={4}>
        <Flex gap={3} align="center">
          <Spinner />
          <Text>Loading campaign performance…</Text>
        </Flex>
      </Card>
    )
  }

  if (error) {
    return (
      <Card ref={ref} padding={4} tone="critical" radius={2} border>
        <Stack space={3}>
          <Text weight="semibold">Unable to load performance data</Text>
          <Text size={1}>{error}</Text>
          <Button text="Retry" onClick={() => setRefreshKey((prev) => prev + 1)} />
        </Stack>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card ref={ref} padding={4}>
        <Text>No performance data available yet.</Text>
      </Card>
    )
  }

  return (
    <Box ref={ref} padding={4} style={{minHeight: '100%', overflowY: 'auto'}}>
      <Stack space={4}>
        <Flex align="center" justify="space-between" wrap="wrap" gap={3}>
          <div>
            <Heading as="h2" size={3}>
              {data.title || 'Email Campaign'}
            </Heading>
            <Text size={1} muted>
              {data.subject || 'No subject'} •{' '}
              {data.sentDate
                ? `Sent ${new Date(data.sentDate).toLocaleString()}`
                : data.scheduledSendDate
                  ? `Scheduled ${new Date(data.scheduledSendDate).toLocaleString()}`
                  : 'Not scheduled'}
            </Text>
          </div>
          <Badge
            mode="outline"
            tone={
              data.status === 'sent'
                ? 'positive'
                : data.status === 'scheduled'
                  ? 'primary'
                  : data.status === 'paused'
                    ? 'caution'
                    : 'default'
            }
          >
            {data.status || 'draft'}
          </Badge>
        </Flex>

        <Grid columns={[1, 2, 2, 4]} gap={4}>
          <StatCard label="Recipients" value={data.recipientCount || 0} />
          <StatCard label="Sent" value={data.sentCount || 0} />
          <StatCard label="Delivered" value={data.deliveredCount || 0} />
          <StatCard label="Opened" value={data.openedCount || 0} />
        </Grid>

        <Grid columns={[1, 3]} gap={4}>
          <StatCard label="Open Rate" value={formatPercent(data.openRate)} tone="positive" />
          <StatCard label="Click Rate" value={formatPercent(data.clickRate)} tone="positive" />
          <StatCard
            label="Unsubscribe Rate"
            value={formatPercent(data.unsubscribeRate)}
            tone={data.unsubscribeRate && data.unsubscribeRate > 0.05 ? 'caution' : 'default'}
          />
        </Grid>

        <Grid columns={[1, 2]} gap={4}>
          <Card padding={4} radius={2} border>
            <Stack space={3}>
              <Text weight="semibold">Revenue Attributed</Text>
              <Text size={3} weight="bold">
                {formatCurrency(data.attributionRevenue)}
              </Text>
              <Text size={1} muted>
                {data.attributedOrders || 0} orders attributed to this campaign
              </Text>
            </Stack>
          </Card>

          <Card padding={4} radius={2} border>
            <Stack space={3}>
              <Text weight="semibold">Unsubscribes</Text>
              <Flex align="baseline" gap={2}>
                <Text size={3} weight="bold">
                  {data.unsubscribedCount || 0}
                </Text>
                <Text size={1} muted>
                  contacts unsubscribed
                </Text>
              </Flex>
              <Text size={1} muted>Keep unsubscribe rate under 0.2% for optimal deliverability.</Text>
            </Stack>
          </Card>
        </Grid>

        <Card padding={4} radius={2} border>
          <Stack space={3}>
            <Flex align="center" justify="space-between">
              <Text weight="semibold">Top Clicked Links</Text>
              <Button
                text="Refresh"
                mode="ghost"
                onClick={() => setRefreshKey((prev) => prev + 1)}
                disabled={loading}
              />
            </Flex>
            {linkStats.length === 0 && (
              <Text size={1} muted>
                No click tracking yet.
              </Text>
            )}
            <Stack as="ul" space={2} style={{listStyle: 'none', margin: 0, padding: 0}}>
              {linkStats.slice(0, 5).map(([url, stat]) => (
                <Flex
                  key={url}
                  as="li"
                  align="center"
                  justify="space-between"
                  style={{borderBottom: '1px solid var(--card-border-color)', paddingBottom: 8}}
                >
                  <Box style={{maxWidth: '70%'}}>
                    <Text size={1} muted>
                      {url}
                    </Text>
                  </Box>
                  <Text size={1}>{stat.count} clicks</Text>
                </Flex>
              ))}
            </Stack>
          </Stack>
        </Card>

        <Card padding={4} radius={2} border>
          <Stack space={3}>
            <Text weight="semibold">Recent Activity</Text>
            {data.logs?.length === 0 && (
              <Text size={1} muted>
                No email activity logged yet.
              </Text>
            )}
            <Stack space={2}>
              {data.logs?.slice(0, 5).map((log) => (
                <Flex
                  key={log._id}
                  justify="space-between"
                  align="center"
                  style={{borderBottom: '1px solid var(--card-border-color)', paddingBottom: 8}}
                >
                  <Stack space={1}>
                    <Text size={1} weight="medium">
                      {log.to || 'Unknown recipient'}
                    </Text>
                    <Text size={1} muted>
                      {log.status || 'queued'} •{' '}
                      {log.sentAt ? new Date(log.sentAt).toLocaleString() : 'Not sent'}
                    </Text>
                  </Stack>
                  <Stack space={1} style={{textAlign: 'right'}}>
                    <Text size={0} muted>
                      Opened:{' '}
                      {log.openedAt ? new Date(log.openedAt).toLocaleDateString() : '—'}
                    </Text>
                    <Text size={0} muted>
                      Clicked:{' '}
                      {log.clickedAt ? new Date(log.clickedAt).toLocaleDateString() : '—'}
                    </Text>
                  </Stack>
                </Flex>
              ))}
            </Stack>
          </Stack>
        </Card>
      </Stack>
    </Box>
  )
})

CampaignPerformance.displayName = 'CampaignPerformance'

export default CampaignPerformance
