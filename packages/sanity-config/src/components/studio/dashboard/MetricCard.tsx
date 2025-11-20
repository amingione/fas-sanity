import React from 'react'
import {Badge, Card, Flex, Spinner, Stack, Text} from '@sanity/ui'
import {getTrendColor} from '../../../utils/dashboardUtils'

type MetricCardProps = {
  title: string
  value: string | number
  change?: number | string | null
  description?: string
  icon?: React.ReactNode
  color?: 'default' | 'primary' | 'positive' | 'caution' | 'critical'
  onClick?: () => void
  isLoading?: boolean
}

const formatChangeValue = (change?: number | string | null) => {
  if (typeof change === 'number') {
    const rounded = Number(change.toFixed(1))
    const prefix = rounded > 0 ? '+' : ''
    return `${prefix}${rounded}%`
  }
  if (typeof change === 'string') return change
  return null
}

export function MetricCard({
  title,
  value,
  change,
  description,
  icon,
  color = 'default',
  onClick,
  isLoading,
}: MetricCardProps) {
  const changeLabel = formatChangeValue(change)
  const tone = color
  const changeTone =
    typeof change === 'number' ? getTrendColor(change) : changeLabel ? 'primary' : 'default'

  return (
    <Card
      padding={4}
      radius={3}
      tone={tone}
      style={{cursor: onClick ? 'pointer' : 'default', minHeight: 120}}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <Stack space={3}>
        <Flex align="center" justify="space-between" gap={3}>
          <Text size={1} weight="medium" muted>
            {title}
          </Text>
          {icon}
        </Flex>
        <Flex align="center" justify="space-between">
          <Text size={4} weight="bold">
            {isLoading ? <Spinner muted /> : value}
          </Text>
          {changeLabel && (
            <Badge mode="outline" tone={changeTone}>
              {changeLabel}
            </Badge>
          )}
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

export default MetricCard
