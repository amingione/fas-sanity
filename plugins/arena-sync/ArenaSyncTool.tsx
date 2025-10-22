import {useCallback, useEffect, useMemo, useState} from 'react'
import {LinkIcon} from '@sanity/icons'
import {useClient} from 'sanity'
import {
  Badge,
  Box,
  Button,
  Card,
  Code,
  Flex,
  Heading,
  Spinner,
  Stack,
  Text,
  useToast,
} from '@sanity/ui'

const apiVersion = '2024-05-15'
const configDocumentId = 'arenaSyncConfig'

type ArenaSyncConfig = {
  _id: typeof configDocumentId
  channelSlugs?: string[]
  lastSyncDate?: string
  lastSyncStatus?: string
  lastSyncRunId?: string
  lastSuccessfullySyncedSlugs?: string[]
  syncEndpoint?: string
}

type TriggerResponse = {
  success?: boolean
  overallSuccess?: boolean
  message?: string
  syncRunId?: string
  updatedOrCreated?: number
}

const resolveFallbackEndpoint = () => {
  const metaEnv =
    (typeof import.meta !== 'undefined' &&
      ((import.meta as ImportMeta).env as Record<string, string | undefined>)) ||
    undefined
  return (
    // `SANITY_STUDIO_` prefix is respected by the Sanity bundler
    metaEnv?.SANITY_STUDIO_SYNC_ENDPOINT ||
    // fall back to classic process.env replacement if present
    (typeof process !== 'undefined' ? process.env?.SANITY_STUDIO_SYNC_ENDPOINT : undefined)
  )
}

export function ArenaSyncTool() {
  const client = useClient({apiVersion})
  const toast = useToast()
  const [config, setConfig] = useState<ArenaSyncConfig | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isTriggering, setIsTriggering] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string>('')

  const fetchConfig = useCallback(async () => {
    setIsLoading(true)
    try {
      const fetched = await client.getDocument<ArenaSyncConfig>(configDocumentId)
      setConfig(fetched ?? null)
      setStatusMessage(
        fetched
          ? 'Configuration loaded.'
          : 'Are.na Sync configuration document not found. Create one with ID "arenaSyncConfig".',
      )
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error while fetching config')
      setStatusMessage(`Error fetching config: ${error.message}`)
      toast.push({
        status: 'error',
        title: 'Failed to load configuration',
        description: error.message,
      })
    } finally {
      setIsLoading(false)
    }
  }, [client, toast])

  useEffect(() => {
    fetchConfig()

    const subscription = client
      .listen<ArenaSyncConfig>(`*[_id == $id]`, {id: configDocumentId}, {visibility: 'query'})
      .subscribe(event => {
        if ('result' in event) {
          setConfig(event.result ?? null)
          if (event.type === 'mutation') {
            toast.push({status: 'info', title: 'Sync configuration updated'})
          }
        }
      })

    return () => subscription.unsubscribe()
  }, [client, fetchConfig, toast])

  const syncEndpoint = useMemo(() => config?.syncEndpoint || resolveFallbackEndpoint(), [config])

  const handleTriggerSync = useCallback(async () => {
    setIsTriggering(true)
    setStatusMessage('Attempting to trigger manual sync...')
    toast.push({
      status: 'info',
      title: 'Triggering sync…',
      description: 'Invoking the configured backend endpoint.',
    })

    try {
      if (!syncEndpoint) throw new Error('No sync endpoint configured')

      const response = await fetch(syncEndpoint, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({channelSlugs: config?.channelSlugs}),
      })

      if (!response.ok) {
        let message = `Request failed with ${response.status} ${response.statusText}`

        try {
          const contentType = response.headers.get('content-type') ?? ''
          if (contentType.includes('application/json')) {
            const errorBody = (await response.json()) as {error?: string; message?: string}
            message = errorBody.message || errorBody.error || message
          } else {
            const text = await response.text()
            if (text) message = `${message} – ${text}`
          }
        } catch {
          // ignore parse error
        }

        throw new Error(message)
      }

      const payload = (await response.json()) as TriggerResponse
      const ok = payload.success ?? payload.overallSuccess ?? false
      if (!ok) {
        throw new Error(payload.message || 'Sync endpoint returned an unsuccessful response')
      }

      const summary = [
        payload.message ?? 'Sync completed.',
        payload.syncRunId ? `Run: ${payload.syncRunId}` : null,
        typeof payload.updatedOrCreated === 'number'
          ? `Updated/created: ${payload.updatedOrCreated}`
          : null,
      ]
        .filter(Boolean)
        .join(' • ')

      setStatusMessage(summary)
      toast.push({status: 'success', title: 'Sync triggered', description: summary})
      fetchConfig()
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error while triggering sync')
      setStatusMessage(error.message)
      toast.push({status: 'error', title: 'Sync failed', description: error.message})
    } finally {
      setIsTriggering(false)
    }
  }, [config?.channelSlugs, fetchConfig, syncEndpoint, toast])

  return (
    <Card padding={5} radius={3} shadow={1}>
      <Stack space={5}>
        <Heading as="h1" size={4}>
          Are.na Channel Sync Dashboard
        </Heading>

        {isLoading && (
          <Flex align="center" justify="center">
            <Spinner size={3} />
          </Flex>
        )}

        {!isLoading && !config && (
          <Card padding={4} radius={2} shadow={1} tone="critical">
            <Flex gap={2} align="center">
              <Badge tone="critical" fontSize={2}>
                !
              </Badge>
              <Text>
                Configuration document not found. Create an entry with ID{' '}
                <Code>{configDocumentId}</Code> of type <Code>arenaSyncConfig</Code>.
              </Text>
            </Flex>
          </Card>
        )}

        {config && (
          <Stack space={5}>
            <Box>
              <Heading as="h2" size={3}>
                Channels Being Synced
              </Heading>
              {config.channelSlugs?.length ? (
                <Flex gap={2} wrap="wrap" marginTop={2}>
                  {config.channelSlugs.map(slug => (
                    <Badge key={slug} tone="primary" padding={2}>
                      {slug}
                    </Badge>
                  ))}
                </Flex>
              ) : (
                <Box marginTop={2}>
                  <Text muted>No channels configured for sync.</Text>
                </Box>
              )}
            </Box>

            <Box>
              <Heading as="h2" size={3}>
                Last Sync Status
              </Heading>
              <Box marginTop={1}>
                <Text muted size={1}>
                  {config.lastSyncDate
                    ? `As of: ${new Date(config.lastSyncDate).toLocaleString()}`
                    : 'No sync recorded.'}
                </Text>
              </Box>
              <Box
                marginTop={2}
                padding={3}
                style={{
                  border: '1px solid var(--card-border-color)',
                  borderRadius: 'var(--card-border-radius, 1rem)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                <Text size={1}>{config.lastSyncStatus || 'No status recorded.'}</Text>
              </Box>
            </Box>

            <Flex gap={3} direction={['column', 'row']}>
              <Button
                text="Edit Sync Configuration"
                tone="primary"
                icon={LinkIcon}
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.location.assign('structure/arenaSyncConfig')
                  }
                }}
              />
              <Button text="Refresh Status" tone="default" onClick={fetchConfig} disabled={isLoading} />
            </Flex>
          </Stack>
        )}

        <Box style={{borderTop: '1px solid var(--card-border-color)'}} paddingTop={4} marginTop={4}>
          <Heading as="h2" size={3}>
            Manual Sync
          </Heading>
          <Box marginTop={2}>
            <Text size={2} muted>
              The sync runs automatically every 10 minutes. You can also trigger it manually.
            </Text>
          </Box>
          <Box marginTop={3}>
            <Button
              text="Trigger Full Sync Now"
              tone="positive"
              onClick={handleTriggerSync}
              disabled={isTriggering || isLoading}
              loading={isTriggering}
            />
          </Box>
        </Box>

        {statusMessage && !isLoading && (
          <Box>
            <Text muted size={1}>{statusMessage}</Text>
          </Box>
        )}
      </Stack>
    </Card>
  )
}
