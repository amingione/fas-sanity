import {useEffect, useState} from 'react'
import {Badge, Card, Flex, Heading, Stack, Text} from '@sanity/ui'
import {SearchIcon, RefreshIcon} from '@sanity/icons'
import {stripeKnowledge} from '../platforms/stripeKnowledge'

type Snapshot = {
  packages: Array<{name: string; version: string; source: string}>
  functions: string[]
  recognizedPlatforms: string[]
}

const endpoint =
  process.env.SANITY_STUDIO_REPO_SCAN_ENDPOINT ||
  '/.netlify/functions/repo-scan'

export function EnvScanTool() {
  const [data, setData] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string>()

  const fetchData = async () => {
    setError(undefined)
    try {
      const res = await fetch(endpoint)
      if (!res.ok) throw new Error(`Repo scan failed: ${res.status}`)
      const payload = (await res.json()) as Snapshot
      setData(payload)
    } catch (err: any) {
      setError(err?.message || 'Failed to scan repo')
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  return (
    <Stack padding={4} space={4}>
      <Flex align="center" gap={3}>
        <SearchIcon />
        <Heading size={3}>Environment Scan</Heading>
        <RefreshIcon style={{cursor: 'pointer'}} onClick={fetchData} />
      </Flex>

      {error && (
        <Card padding={3} radius={2} tone="critical">
          <Text>{error}</Text>
        </Card>
      )}

      {data && (
        <Stack space={3}>
          {data.recognizedPlatforms.includes('Stripe') && (
            <Card padding={3} radius={2} shadow={1}>
              <Heading size={2} style={{marginBottom: 8}}>
                Stripe Knowledge (built-in)
              </Heading>
              <Text size={1} muted style={{marginBottom: 4}}>
                Known event types and the /v1/events endpoint params.
              </Text>
              <Badge tone="primary" style={{marginBottom: 8}}>
                Events
              </Badge>
              <Flex gap={2} wrap="wrap" marginBottom={3}>
                {stripeKnowledge.events.map((evt) => (
                  <Badge key={evt} tone="default">
                    {evt}
                  </Badge>
                ))}
              </Flex>
              <Badge tone="primary" style={{marginBottom: 8}}>
                Endpoint: /v1/events
              </Badge>
              <Text size={1} muted>
                Params: {stripeKnowledge.endpoints[0].params?.join(', ')}
              </Text>
            </Card>
          )}

          <Card padding={3} radius={2} shadow={1}>
            <Heading size={2} style={{marginBottom: 8}}>
              Recognized Platforms
            </Heading>
            <Flex gap={2} wrap="wrap">
              {data.recognizedPlatforms.map((name) => (
                <Badge key={name} tone="primary">
                  {name}
                </Badge>
              ))}
              {data.recognizedPlatforms.length === 0 && (
                <Text size={1} muted>
                  None detected
                </Text>
              )}
            </Flex>
          </Card>

          <Card padding={3} radius={2} shadow={1}>
            <Heading size={2} style={{marginBottom: 8}}>
              Packages (sample)
            </Heading>
            <Stack space={1}>
              {data.packages.slice(0, 20).map((pkg) => (
                <Flex key={`${pkg.name}-${pkg.source}`} justify="space-between" align="center">
                  <Text>{pkg.name}</Text>
                  <Badge tone="default">{pkg.version}</Badge>
                </Flex>
              ))}
              {data.packages.length > 20 && (
                <Text size={1} muted>
                  {data.packages.length - 20} more...
                </Text>
              )}
            </Stack>
          </Card>

          <Card padding={3} radius={2} shadow={1}>
            <Heading size={2} style={{marginBottom: 8}}>
              Netlify Functions
            </Heading>
            <Stack space={1}>
              {data.functions.map((fn) => (
                <Text key={fn} size={1}>
                  {fn}
                </Text>
              ))}
              {data.functions.length === 0 && (
                <Text size={1} muted>
                  No functions found
                </Text>
              )}
            </Stack>
          </Card>
        </Stack>
      )}
    </Stack>
  )
}
