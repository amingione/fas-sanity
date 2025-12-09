import {useState} from 'react'
import {Badge, Card, Flex, Heading, Stack, Text, TextArea, TextInput, Button} from '@sanity/ui'
import {PlayIcon, CheckmarkCircleIcon, ErrorOutlineIcon} from '@sanity/icons'

type Assertion = {id: string; passed: boolean; message: string}
type Payload = {status: string; mappingId: string; assertions: Assertion[]; receivedAt: string}

const endpoint =
  process.env.SANITY_STUDIO_WEBHOOK_TEST_ENDPOINT ||
  process.env.VITE_SANITY_STUDIO_WEBHOOK_TEST_ENDPOINT ||
  '/.netlify/functions/webhook-test'

export function WebhookTesterTool() {
  const [mappingId, setMappingId] = useState('')
  const [payload, setPayload] = useState('{"sample": "payload"}')
  const [result, setResult] = useState<Payload | null>(null)
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)

  const sendTest = async () => {
    setLoading(true)
    setError(undefined)
    setResult(null)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({mappingId, payload: JSON.parse(payload)}),
      })
      if (!res.ok) throw new Error(`Webhook test failed: ${res.status}`)
      const json = (await res.json()) as Payload
      setResult(json)
    } catch (err: any) {
      setError(err?.message || 'Failed to run webhook test')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Stack padding={4} space={4}>
      <Flex align="center" gap={3}>
        <PlayIcon />
        <Heading size={3}>Webhook Test Runner</Heading>
      </Flex>

      <Card padding={3} radius={2} shadow={1}>
        <Stack space={3}>
          <TextInput
            value={mappingId}
            onChange={(e) => setMappingId(e.currentTarget.value)}
            placeholder="Mapping ID"
          />
          <TextArea
            rows={8}
            value={payload}
            onChange={(e) => setPayload(e.currentTarget.value)}
            spellCheck={false}
          />
          <Button
            text={loading ? 'Running...' : 'Send test'}
            tone="primary"
            icon={PlayIcon}
            disabled={!mappingId || !payload || loading}
            onClick={sendTest}
          />
        </Stack>
      </Card>

      {error && (
        <Card padding={3} radius={2} tone="critical">
          <Text>{error}</Text>
        </Card>
      )}

      {result && (
        <Card padding={3} radius={2} shadow={1}>
          <Stack space={3}>
            <Flex justify="space-between" align="center">
              <Text weight="bold">Result</Text>
              <Badge tone={result.status === 'passed' ? 'positive' : 'critical'}>
                {result.status}
              </Badge>
            </Flex>
            <Text size={1} muted>
              Received at {new Date(result.receivedAt).toLocaleString()}
            </Text>
            <Stack space={2}>
              {result.assertions.map((assertion) => (
                <Flex key={assertion.id} align="center" gap={2}>
                  {assertion.passed ? (
                    <CheckmarkCircleIcon color="green" />
                  ) : (
                    <ErrorOutlineIcon color="red" />
                  )}
                  <Text>{assertion.message}</Text>
                </Flex>
              ))}
            </Stack>
          </Stack>
        </Card>
      )}
    </Stack>
  )
}
