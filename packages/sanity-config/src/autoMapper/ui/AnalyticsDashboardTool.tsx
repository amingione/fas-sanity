import {useEffect, useState} from 'react'
import {Badge, Card, Flex, Grid, Heading, Stack, Text} from '@sanity/ui'
import {ChartUpwardIcon, SyncIcon} from '@sanity/icons'

type MetricPoint = {timestamp: string; value: number}
type Breakdown = {label: string; value: number}

type AnalyticsPayload = {
  generatedAt: string
  summary: {
    totalWebhooksHour: number
    totalWebhooksDay: number
    successRate: number
    avgProcessingMs: number
    errorRate: number
    topIntegration: string
  }
  hourly: MetricPoint[]
  daily: MetricPoint[]
  failures: Breakdown[]
}

const endpoint =
  process.env.SANITY_STUDIO_ANALYTICS_ENDPOINT ||
  '/.netlify/functions/analytics-dashboard'

const StatCard = ({label, value, tone = 'default'}: {label: string; value: string; tone?: any}) => (
  <Card padding={3} radius={2} shadow={1} tone="transparent">
    <Stack space={2}>
      <Text size={1} muted>
        {label}
      </Text>
      <Heading size={2}>
        <Badge tone={tone} padding={2}>
          {value}
        </Badge>
      </Heading>
    </Stack>
  </Card>
)

export function AnalyticsDashboardTool() {
  const [data, setData] = useState<AnalyticsPayload | null>(null)
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(undefined)
      try {
        const res = await fetch(endpoint)
        if (!res.ok) throw new Error(`Analytics fetch failed: ${res.status}`)
        const payload = (await res.json()) as AnalyticsPayload
        setData(payload)
      } catch (err: any) {
        setError(err?.message || 'Failed to load analytics')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  return (
    <Stack padding={4} space={4}>
      <Flex align="center" gap={3}>
        <ChartUpwardIcon />
        <Heading size={3}>Analytics</Heading>
      </Flex>

      {loading && (
        <Card padding={3} radius={2}>
          <Flex gap={2} align="center">
            <SyncIcon />
            <Text>Loading metrics...</Text>
          </Flex>
        </Card>
      )}

      {error && (
        <Card padding={3} radius={2} tone="critical">
          <Text>{error}</Text>
        </Card>
      )}

      {data && (
        <Stack space={3}>
          <Grid columns={[1, 2, 3]} gap={3}>
            <StatCard label="Webhooks (hour)" value={String(data.summary.totalWebhooksHour)} />
            <StatCard label="Webhooks (today)" value={String(data.summary.totalWebhooksDay)} />
            <StatCard label="Success rate" value={`${data.summary.successRate}%`} tone="positive" />
            <StatCard label="Error rate" value={`${data.summary.errorRate}%`} tone="caution" />
            <StatCard label="Avg processing" value={`${data.summary.avgProcessingMs} ms`} />
            <StatCard label="Top integration" value={data.summary.topIntegration} />
          </Grid>

          <Card padding={3} radius={2} shadow={1} tone="transparent">
            <Heading size={2} style={{marginBottom: 8}}>
              Failures (sample)
            </Heading>
            <Stack space={2}>
              {data.failures.map((f) => (
                <Flex key={f.label} justify="space-between">
                  <Text>{f.label}</Text>
                  <Badge tone="critical">{f.value}</Badge>
                </Flex>
              ))}
            </Stack>
          </Card>
        </Stack>
      )}
    </Stack>
  )
}
