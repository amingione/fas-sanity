import {Badge, Card, Flex, Stack, Text} from '@sanity/ui'
import {ChevronDownIcon, ChevronUpIcon} from '@sanity/icons'
import type {ComponentType, ReactNode} from 'react'

type OrderSectionProps = {
  title: string
  icon?: ComponentType | ReactNode
  fieldCount?: number
  isCollapsed?: boolean
  onToggle?: () => void
  children: ReactNode
}

const renderIcon = (icon?: ComponentType | ReactNode) => {
  if (!icon) return null
  if (typeof icon === 'function') {
    const IconComponent = icon as ComponentType
    return (
      <span style={{display: 'inline-flex', fontSize: 16}}>
        <IconComponent />
      </span>
    )
  }
  return icon
}

function OrderSection({title, icon, fieldCount, isCollapsed, onToggle, children}: OrderSectionProps) {
  const Chevron = isCollapsed ? ChevronDownIcon : ChevronUpIcon

  return (
    <Card radius={3} tone="transparent" border shadow={1}>
      <Card
        as="button"
        type="button"
        paddingX={4}
        paddingY={3}
        tone="transparent"
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
        }}
        onClick={onToggle}
      >
        <Flex align="center" justify="space-between">
          <Flex align="center" gap={3}>
            {icon && <Flex align="center">{renderIcon(icon)}</Flex>}
            <Text size={2} weight="semibold">
              {title}
            </Text>
            {typeof fieldCount === 'number' && (
              <Badge tone={isCollapsed ? 'default' : 'positive'} mode="outline">
                {fieldCount}
              </Badge>
            )}
          </Flex>
          <Chevron />
        </Flex>
      </Card>
      {!isCollapsed && (
        <Card
          paddingX={4}
          paddingY={4}
          tone="transparent"
          style={{borderTop: '1px solid var(--card-border-color)'}}
        >
          <Stack space={4}>{children}</Stack>
        </Card>
      )}
    </Card>
  )
}

export default OrderSection
