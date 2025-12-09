import {useEffect, useState} from 'react'
import {Badge, Card, Flex, Heading, Stack, Text} from '@sanity/ui'
import {LockIcon, RefreshIcon} from '@sanity/icons'

type Payload = {
  generatedAt: string
  compliance: Record<string, string>
  security: Record<string, boolean | string>
  alerts: {id: string; message: string; severity: string}[]
}

const endpoint =
  process.env.SANITY_STUDIO_SECURITY_ENDPOINT ||
  process.env.VITE_SANITY_STUDIO_SECURITY_ENDPOINT ||
  '/.netlify/functions/security-status'

export function SecurityComplianceTool() {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string>()

  const fetchData = async () => {
    setError(undefined)
    try {
      const res = await fetch(endpoint)
      if (!res.ok) throw new Error(`Security fetch failed: ${res.status}`)
      const payload = (await res.json()) as Payload
      setData(payload)
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch security status')
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  return (
    <Stack padding={4} space={4}>
      <Flex align="center" gap={3}>
        <LockIcon />
        <Heading size={3}>Security & Compliance</Heading>
        <RefreshIcon style={{cursor: 'pointer'}} onClick={fetchData} />
      </Flex>

      {error && (
        <Card padding={3} radius={2} tone="critical">
          <Text>{error}</Text>
        </Card>
      )}

      {data && (
        <Stack space={3}>
          <Card padding={3} radius={2} shadow={1}>
            <Text size={1} muted>
              Generated {new Date(data.generatedAt).toLocaleString()}
            </Text>
            <Flex gap={2} wrap="wrap" marginTop={2}>
              {Object.entries(data.compliance).map(([name, status]) => (
                <Badge key={name} tone={status === 'aligned' ? 'positive' : status === 'in-progress' ? 'primary' : 'critical'}>
                  {name.toUpperCase()}: {status}
                </Badge>
              ))}
            </Flex>
          </Card>

          <Card padding={3} radius={2} shadow={1}>
            <Heading size={2} style={{marginBottom: 8}}>
              Security Controls
            </Heading>
            <Stack space={2}>
              {Object.entries(data.security).map(([name, value]) => (
                <Flex key={name} justify="space-between" align="center">
                  <Text>{name}</Text>
                  <Badge tone={value === true ? 'positive' : 'default'}>
                    {String(value)}
                  </Badge>
                </Flex>
              ))}
            </Stack>
          </Card>

          <Card padding={3} radius={2} shadow={1}>
            <Heading size={2} style={{marginBottom: 8}}>
              Alerts
            </Heading>
            <Stack space={2}>
              {data.alerts.map((alert) => (
                <Card
                  key={alert.id}
                  padding={2}
                  radius={2}
                  tone={alert.severity === 'high' ? 'critical' : 'caution'}
                >
                  <Text>{alert.message}</Text>
                </Card>
              ))}
            </Stack>
          </Card>
        </Stack>
      )}
    </Stack>
  )
}
