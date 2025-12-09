import {useEffect, useState} from 'react'
import {Badge, Card, Flex, Heading, Stack, Text} from '@sanity/ui'
import {BulbOutlineIcon, RefreshIcon} from '@sanity/icons'

type Insight = {
  id: string
  title: string
  message: string
  severity: 'critical' | 'caution' | 'default'
}

type Payload = {
  generatedAt: string
  insights: Insight[]
  recommendations: string[]
}

const endpoint =
  process.env.SANITY_STUDIO_AI_INSIGHTS_ENDPOINT ||
  process.env.VITE_SANITY_STUDIO_AI_INSIGHTS_ENDPOINT ||
  '/.netlify/functions/ai-insights'

export function AiInsightsTool() {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string>()

  const fetchData = async () => {
    setError(undefined)
    try {
      const res = await fetch(endpoint)
      if (!res.ok) throw new Error(`Insights fetch failed: ${res.status}`)
      const payload = (await res.json()) as Payload
      setData(payload)
    } catch (err: any) {
      setError(err?.message || 'Failed to load insights')
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  return (
    <Stack padding={4} space={4}>
      <Flex align="center" gap={3}>
        <BulbOutlineIcon />
        <Heading size={3}>AI Insights</Heading>
        <RefreshIcon style={{cursor: 'pointer'}} onClick={fetchData} />
      </Flex>

      {error && (
        <Card padding={3} radius={2} tone="critical">
          <Text>{error}</Text>
        </Card>
      )}

      {data && (
        <Stack space={3}>
          <Text size={1} muted>
            Generated {new Date(data.generatedAt).toLocaleString()}
          </Text>
          {data.insights.map((insight) => (
            <Card key={insight.id} padding={3} radius={2} tone="transparent" shadow={1}>
              <Flex justify="space-between" align="center">
                <Text weight="bold">{insight.title}</Text>
                <Badge tone={insight.severity}>{insight.severity}</Badge>
              </Flex>
              <Text size={1} muted>
                {insight.message}
              </Text>
            </Card>
          ))}
          <Card padding={3} radius={2} shadow={1}>
            <Heading size={2} style={{marginBottom: 8}}>
              Recommendations
            </Heading>
            <Stack space={2}>
              {data.recommendations.map((rec, idx) => (
                <Text key={idx} size={1}>
                  • {rec}
                </Text>
              ))}
            </Stack>
          </Card>
        </Stack>
      )}
    </Stack>
  )
}
