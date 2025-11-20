import React from 'react'
import {Badge, Card, Flex, Spinner, Stack, Text} from '@sanity/ui'
import {WarningOutlineIcon} from '@sanity/icons'
import {getSeverityColor} from '../../../utils/dashboardUtils'

type AlertCardProps = {
  title: string
  count: number | string
  severity?: 'info' | 'warning' | 'error'
  description?: string
  icon?: React.ReactNode
  onClick?: () => void
  isLoading?: boolean
}

export function AlertCard({
  title,
  count,
  severity = 'info',
  description,
  icon,
  onClick,
  isLoading,
}: AlertCardProps) {
  const tone = getSeverityColor(severity)

  return (
    <Card
      padding={4}
      radius={3}
      tone={tone}
      shadow={1}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={{cursor: onClick ? 'pointer' : 'default'}}
    >
      <Stack space={3}>
        <Flex align="center" justify="space-between" gap={3}>
          <Flex gap={3} align="center">
            {icon || <WarningOutlineIcon />}
            <Text size={1} weight="medium">
              {title}
            </Text>
          </Flex>
          <Badge tone={tone} mode="outline">
            {isLoading ? <Spinner muted /> : count}
          </Badge>
        </Flex>
        {description && (
          <Text size={1} muted>
            {description}
          </Text>
        )}
      </Stack>
    </Card>
  )
}

export default AlertCard
