import React from 'react'
import {Card, Stack, Text} from '@sanity/ui'

type StatsItem = {
  label: string
  value: string | number
  tone?: 'default' | 'primary' | 'positive' | 'caution' | 'critical'
  onClick?: () => void
}

type StatsListProps = {
  items: StatsItem[]
  columns?: number
}

export function StatsList({items, columns = 2}: StatsListProps) {
  return (
    <Card padding={4} radius={3} shadow={1}>
      <div
        style={{
          display: 'grid',
          gap: '16px',
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        }}
      >
        {items.map((item) => (
          <Stack
            key={item.label}
            space={1}
            onClick={item.onClick}
            style={{
              cursor: item.onClick ? 'pointer' : 'default',
              padding: '4px 8px',
              borderRadius: '8px',
              backgroundColor: item.onClick ? 'var(--card-bg-secondary)' : undefined,
            }}
          >
            <Text size={1} muted>
              {item.label}
            </Text>
            <Text size={3} weight="bold" tone={item.tone}>
              {item.value}
            </Text>
          </Stack>
        ))}
      </div>
    </Card>
  )
}

export default StatsList
