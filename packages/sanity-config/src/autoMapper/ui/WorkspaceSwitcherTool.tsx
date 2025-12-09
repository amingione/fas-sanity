import {useEffect, useMemo, useState} from 'react'
import {Badge, Box, Button, Card, Flex, Grid, Heading, Label, Select, Stack, Text} from '@sanity/ui'
import {useClient} from 'sanity'
import {UsersIcon, AddIcon, RefreshIcon} from '@sanity/icons'

type WorkspaceDoc = {
  _id: string
  name: string
  plan?: string
  status?: string
  members?: Array<{email?: string; role?: string}>
}

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  professional: 'Professional',
  enterprise: 'Enterprise',
}

const STATUS_TONE: Record<string, 'positive' | 'caution' | 'critical' | 'default'> = {
  active: 'positive',
  suspended: 'critical',
  archived: 'caution',
}

export function WorkspaceSwitcherTool() {
  const client = useClient({apiVersion: '2024-10-01'})
  const [workspaces, setWorkspaces] = useState<WorkspaceDoc[]>([])
  const [activeId, setActiveId] = useState<string>()
  const [filter, setFilter] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()

  const filtered = useMemo(() => {
    if (!filter) return workspaces
    const needle = filter.toLowerCase()
    return workspaces.filter(
      (ws) =>
        ws.name.toLowerCase().includes(needle) ||
        ws.plan?.toLowerCase().includes(needle) ||
        ws.status?.toLowerCase().includes(needle),
    )
  }, [workspaces, filter])

  useEffect(() => {
    const fetchWorkspaces = async () => {
      setLoading(true)
      setError(undefined)
      try {
        const result = await client.fetch<WorkspaceDoc[]>(
          `*[_type=="workspace"] | order(_createdAt desc){_id,name,plan,status,members[]{email,role}}`,
        )
        setWorkspaces(result)
        if (!activeId && result.length > 0) {
          setActiveId(result[0]._id)
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to load workspaces')
      } finally {
        setLoading(false)
      }
    }

    fetchWorkspaces()
  }, [client, activeId])

  const activeWorkspace = filtered.find((ws) => ws._id === activeId) || filtered[0]

  return (
    <Stack padding={4} space={4}>
      <Flex align="center" gap={3}>
        <UsersIcon />
        <Heading size={3}>Workspaces</Heading>
      </Flex>

      <Card padding={3} radius={2} shadow={1}>
        <Grid columns={[1, 2]} gap={3}>
          <Stack space={2}>
            <Label size={1}>Active workspace</Label>
            <Select value={activeWorkspace?._id || ''} onChange={(e) => setActiveId(e.currentTarget.value)}>
              {filtered.map((ws) => (
                <option key={ws._id} value={ws._id}>
                  {ws.name}
                </option>
              ))}
            </Select>
          </Stack>
          <Stack space={2}>
            <Label size={1}>Filter</Label>
            <Select value={filter} onChange={(e) => setFilter(e.currentTarget.value)}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="archived">Archived</option>
              <option value="starter">Starter</option>
              <option value="professional">Professional</option>
              <option value="enterprise">Enterprise</option>
            </Select>
          </Stack>
        </Grid>
        <Flex gap={2} marginTop={3}>
          <Button
            text="Refresh"
            icon={RefreshIcon}
            mode="ghost"
            onClick={() => {
              // trigger refetch by resetting activeId
              setActiveId((prev) => (prev ? `${prev}` : undefined))
            }}
          />
          <Button text="Create workspace" icon={AddIcon} tone="primary" mode="ghost" disabled />
        </Flex>
      </Card>

      {error && (
        <Card padding={3} radius={2} tone="critical">
          <Text>{error}</Text>
        </Card>
      )}

      {activeWorkspace ? (
        <Card padding={4} radius={2} shadow={1}>
          <Stack space={3}>
            <Flex justify="space-between" align="center">
              <Text weight="bold">{activeWorkspace.name}</Text>
              <Flex gap={2} align="center">
                {activeWorkspace.plan && (
                  <Badge tone="primary">{PLAN_LABELS[activeWorkspace.plan] || activeWorkspace.plan}</Badge>
                )}
                {activeWorkspace.status && (
                  <Badge tone={STATUS_TONE[activeWorkspace.status] || 'default'}>
                    {activeWorkspace.status}
                  </Badge>
                )}
              </Flex>
            </Flex>
            <Box>
              <Text size={1} muted>
                Members ({activeWorkspace.members?.length || 0})
              </Text>
              <Stack space={2} marginTop={2}>
                {(activeWorkspace.members || []).map((member, idx) => (
                  <Card key={`${member.email}-${idx}`} padding={2} radius={2} tone="transparent">
                    <Flex justify="space-between" align="center">
                      <Text size={1}>{member.email || 'Unknown member'}</Text>
                      <Badge tone="default">{member.role || 'viewer'}</Badge>
                    </Flex>
                  </Card>
                ))}
                {(activeWorkspace.members || []).length === 0 && (
                  <Text size={1} muted>
                    No members listed yet.
                  </Text>
                )}
              </Stack>
            </Box>
          </Stack>
        </Card>
      ) : (
        <Card padding={3} radius={2} tone="transparent">
          <Text>No workspaces found.</Text>
        </Card>
      )}

      {loading && (
        <Card padding={3} radius={2} tone="transparent">
          <Text>Loading workspaces...</Text>
        </Card>
      )}
    </Stack>
  )
}
