import {useEffect, useState} from 'react'
import {Badge, Card, Flex, Heading, Stack, Text} from '@sanity/ui'
import {LockIcon, RefreshIcon} from '@sanity/icons'

type NodeStatus = {name: string; status: string; latencyMs: number}
type Payload = {
  generatedAt: string
  uptimeSLA: string
  avgLatencyMs: number
  nodes: NodeStatus[]
  checks: Record<string, string>
}

const endpoint =
  process.env.SANITY_STUDIO_HA_ENDPOINT ||
  process.env.VITE_SANITY_STUDIO_HA_ENDPOINT ||
  '/.netlify/functions/ha-health'

export function HaStatusTool() {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string>()

  const fetchData = async () => {
    setError(undefined)
    try {
      const res = await fetch(endpoint)
      if (!res.ok) throw new Error(`HA fetch failed: ${res.status}`)
      const payload = (await res.json()) as Payload
      setData(payload)
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch HA status')
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  return (
    <Stack padding={4} space={4}>
      <Flex align="center" gap={3}>
        <LockIcon />
        <Heading size={3}>High Availability Status</Heading>
        <Badge tone="default">{data?.uptimeSLA || '-'}</Badge>
        <RefreshIcon onClick={fetchData} style={{cursor: 'pointer'}} />
      </Flex>

      {error && (
        <Card padding={3} radius={2} tone="critical">
          <Text>{error}</Text>
        </Card>
      )}

      {data && (
        <Card padding={3} radius={2} shadow={1}>
          <Stack space={3}>
            <Flex justify="space-between">
              <Text size={1} muted>
                Generated at {new Date(data.generatedAt).toLocaleTimeString()}
              </Text>
              <Badge tone="positive">Avg latency {data.avgLatencyMs} ms</Badge>
            </Flex>
            <Stack space={2}>
              {data.nodes.map((node) => (
                <Flex key={node.name} justify="space-between" align="center">
                  <Text>{node.name}</Text>
                  <Badge tone={node.status === 'healthy' ? 'positive' : 'critical'}>
                    {node.status} · {node.latencyMs} ms
                  </Badge>
                </Flex>
              ))}
            </Stack>
          </Stack>
        </Card>
      )}
    </Stack>
  )
}
