import {useEffect, useState} from 'react'
import {Badge, Card, Flex, Heading, Stack, Text} from '@sanity/ui'
import {BookIcon, RefreshIcon} from '@sanity/icons'

type Endpoint = {method: string; path: string; description: string}

type Payload = {
  version: string
  baseUrl: string
  endpoints: Endpoint[]
  sdk: Record<string, string>
  cli: {install: string; examples: string[]}
}

const endpoint =
  process.env.SANITY_STUDIO_API_DOCS_ENDPOINT ||
  '/.netlify/functions/api-docs'

export function ApiDocsTool() {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string>()

  const fetchData = async () => {
    setError(undefined)
    try {
      const res = await fetch(endpoint)
      if (!res.ok) throw new Error(`API docs fetch failed: ${res.status}`)
      const payload = (await res.json()) as Payload
      setData(payload)
    } catch (err: any) {
      setError(err?.message || 'Failed to load API docs')
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  return (
    <Stack padding={4} space={4}>
      <Flex align="center" gap={3}>
        <BookIcon />
        <Heading size={3}>API & SDK</Heading>
        <RefreshIcon style={{cursor: 'pointer'}} onClick={fetchData} />
      </Flex>

      {error && (
        <Card padding={3} radius={2} tone="critical">
          <Text>{error}</Text>
        </Card>
      )}

      {data && (
        <Stack space={3}>
          <Flex gap={2} align="center">
            <Badge tone="primary">Version {data.version}</Badge>
            <Badge tone="default">{data.baseUrl}</Badge>
          </Flex>

          <Card padding={3} radius={2} shadow={1}>
            <Heading size={2} style={{marginBottom: 8}}>
              Endpoints
            </Heading>
            <Stack space={2}>
              {data.endpoints.map((ep) => (
                <Card key={`${ep.method}-${ep.path}`} padding={2} radius={2} tone="transparent">
                  <Flex justify="space-between" align="center">
                    <Badge tone={ep.method === 'GET' ? 'default' : 'primary'}>{ep.method}</Badge>
                    <Text>{ep.path}</Text>
                  </Flex>
                  <Text size={1} muted>
                    {ep.description}
                  </Text>
                </Card>
              ))}
            </Stack>
          </Card>

          <Card padding={3} radius={2} shadow={1}>
            <Heading size={2} style={{marginBottom: 8}}>
              SDK
            </Heading>
            <Stack space={1}>
              {Object.entries(data.sdk).map(([lang, install]) => (
                <Text key={lang} size={1}>
                  {lang}: {install}
                </Text>
              ))}
            </Stack>
          </Card>

          <Card padding={3} radius={2} shadow={1}>
            <Heading size={2} style={{marginBottom: 8}}>
              CLI
            </Heading>
            <Text size={1}>Install: {data.cli.install}</Text>
            <Stack space={1} marginTop={2}>
              {data.cli.examples.map((example, idx) => (
                <Text key={idx} size={1}>
                  • {example}
                </Text>
              ))}
            </Stack>
          </Card>
        </Stack>
      )}
    </Stack>
  )
}
