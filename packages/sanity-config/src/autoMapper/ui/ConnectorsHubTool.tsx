import {useEffect, useState} from 'react'
import {Badge, Card, Flex, Grid, Heading, Stack, Text, Button, TextInput} from '@sanity/ui'
import {PlugIcon, DownloadIcon} from '@sanity/icons'

type Connector = {
  name: string
  system: string
  version: string
  description: string
  capabilities: string[]
  syncModes: string[]
}

type Payload = {connectors: Connector[]; installed?: string[]}

const endpoint =
  process.env.SANITY_STUDIO_CONNECTORS_ENDPOINT ||
  '/.netlify/functions/enterprise-connectors'

const installEndpoint =
  process.env.SANITY_STUDIO_CONNECTOR_INSTALL_ENDPOINT ||
  '/.netlify/functions/connector-install'

export function ConnectorsHubTool() {
  const [connectors, setConnectors] = useState<Connector[]>([])
  const [installed, setInstalled] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string>()
  const [workspaceId, setWorkspaceId] = useState<string>('')
  const [workspaceInput, setWorkspaceInput] = useState<string>('')

  useEffect(() => {
    const fetchConnectors = async () => {
      setError(undefined)
      try {
        const url = new URL(endpoint, window.location.origin)
        if (workspaceId) url.searchParams.set('workspaceId', workspaceId)
        const res = await fetch(url.toString())
        if (!res.ok) throw new Error(`Connector fetch failed: ${res.status}`)
        const payload = (await res.json()) as Payload
        setConnectors(payload.connectors || [])
        setInstalled(new Set(payload.installed || []))
      } catch (err: any) {
        setError(err?.message || 'Failed to load connectors')
      }
    }
    fetchConnectors()
  }, [workspaceId])

  const toggleInstall = async (name: string) => {
    try {
      const action = installed.has(name) ? 'uninstall' : 'install'
      const res = await fetch(installEndpoint, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({workspaceId: workspaceId || undefined, connectorName: name, action}),
      })
      if (!res.ok) throw new Error(`Install toggle failed: ${res.status}`)
      const payload = await res.json()
      setInstalled(new Set(payload.installed || []))
    } catch (err: any) {
      setError(err?.message || 'Failed to update connector')
    }
  }

  return (
    <Stack padding={4} space={4}>
      <Flex align="center" gap={3}>
        <PlugIcon />
        <Heading size={3}>Enterprise Connectors</Heading>
      </Flex>

      {error && (
        <Card padding={3} radius={2} tone="critical">
          <Text>{error}</Text>
        </Card>
      )}

      <Card padding={3} radius={2} shadow={1}>
        <Stack space={2}>
          <Text size={1} muted>
            Workspace context (for installs)
          </Text>
          <Flex gap={2}>
            <TextInput
              value={workspaceInput}
              onChange={(e) => setWorkspaceInput(e.currentTarget.value)}
              placeholder="Workspace document ID (optional)"
            />
            <Button text="Load" onClick={() => setWorkspaceId(workspaceInput.trim())} />
          </Flex>
        </Stack>
      </Card>

      <Grid columns={[1, 2]} gap={3}>
        {connectors.map((connector) => {
          const isInstalled = installed.has(connector.name)
          return (
            <Card key={connector.name} padding={4} radius={2} shadow={1} tone="transparent">
              <Stack space={3}>
                <Flex justify="space-between" align="center">
                  <Text weight="bold">{connector.system}</Text>
                  <Badge tone="default">{connector.version}</Badge>
                </Flex>
                <Text size={1} muted>
                  {connector.description}
                </Text>
                <Flex gap={2} wrap="wrap">
                  {connector.capabilities.map((cap) => (
                    <Badge key={cap} tone="primary">
                      {cap}
                    </Badge>
                  ))}
                </Flex>
                <Text size={1} muted>
                  Sync: {connector.syncModes.join(', ')}
                </Text>
                <Button
                  text={isInstalled ? 'Uninstall' : 'Install'}
                  tone={isInstalled ? 'caution' : 'primary'}
                  icon={DownloadIcon}
                  onClick={() => toggleInstall(connector.name)}
                />
              </Stack>
            </Card>
          )
        })}
      </Grid>
    </Stack>
  )
}
