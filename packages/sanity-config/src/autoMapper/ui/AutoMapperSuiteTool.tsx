import {useMemo, useState} from 'react'
import {Card, Flex, Heading, Label, Select, Stack, Text} from '@sanity/ui'
import {DatabaseIcon} from '@sanity/icons'
import {AutoMapperTool} from './AutoMapperTool'
import {WorkspaceSwitcherTool} from './WorkspaceSwitcherTool'
import {AnalyticsDashboardTool} from './AnalyticsDashboardTool'
import {CollaborativeEditorTool} from './CollaborativeEditorTool'
import {TransformationLibraryTool} from './TransformationLibraryTool'
import {ConnectorsHubTool} from './ConnectorsHubTool'
import {HaStatusTool} from './HaStatusTool'
import {SecurityComplianceTool} from './SecurityComplianceTool'
import {AiInsightsTool} from './AiInsightsTool'
import {ApiDocsTool} from './ApiDocsTool'
import {WebhookTesterTool} from './WebhookTesterTool'
import {EnvScanTool} from './EnvScanTool'

const sections = [
  {key: 'mapping', label: 'Mapping', component: AutoMapperTool},
  {key: 'workspaces', label: 'Workspaces', component: WorkspaceSwitcherTool},
  {key: 'analytics', label: 'Analytics', component: AnalyticsDashboardTool},
  {key: 'collab', label: 'Collaborative Editor', component: CollaborativeEditorTool},
  {key: 'transformations', label: 'Transformations', component: TransformationLibraryTool},
  {key: 'connectors', label: 'Connectors', component: ConnectorsHubTool},
  {key: 'ha', label: 'HA Status', component: HaStatusTool},
  {key: 'security', label: 'Security', component: SecurityComplianceTool},
  {key: 'ai', label: 'AI Insights', component: AiInsightsTool},
  {key: 'api', label: 'API & SDK', component: ApiDocsTool},
  {key: 'webhook', label: 'Webhook Test Runner', component: WebhookTesterTool},
  {key: 'env', label: 'Environment Scan', component: EnvScanTool},
]

export function AutoMapperSuiteTool() {
  const [active, setActive] = useState<string>('mapping')

  const ActiveComponent = useMemo(() => {
    const found = sections.find((section) => section.key === active)
    return found?.component || AutoMapperTool
  }, [active])

  return (
    <Stack padding={4} space={4}>
      <Flex align="center" gap={3}>
        <DatabaseIcon />
        <Heading size={3}>Auto Mapper Suite</Heading>
      </Flex>
      <Card padding={3} radius={2} shadow={1}>
        <Stack space={2}>
          <Label size={1}>Area</Label>
          <Select value={active} onChange={(e) => setActive(e.currentTarget.value)}>
            {sections.map((section) => (
              <option key={section.key} value={section.key}>
                {section.label}
              </option>
            ))}
          </Select>
          <Text size={1} muted>
            Switch between modules without leaving the Auto Mapper suite.
          </Text>
        </Stack>
      </Card>
      <ActiveComponent />
    </Stack>
  )
}
