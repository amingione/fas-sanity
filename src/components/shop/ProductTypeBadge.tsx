import type {ComponentProps} from 'react'
import {Badge, Inline, Text} from '@sanity/ui'

const TYPE_MAP: Record<
  string,
  {
    label: string
    icon: string
    tone: 'default' | 'primary' | 'positive' | 'caution' | 'critical'
  }
> = {
  physical: {label: 'Ships to you', icon: '📦', tone: 'primary'},
  service: {label: 'In-shop service', icon: '⚙️', tone: 'positive'},
  bundle: {label: 'Bundle', icon: '📦+', tone: 'default'},
}

export type ProductTypeBadgeProps = {
  productType?: string | null
} & Omit<ComponentProps<typeof Badge>, 'tone' | 'mode' | 'children'>

export function ProductTypeBadge({productType, ...badgeProps}: ProductTypeBadgeProps) {
  const key = (productType || 'physical').toLowerCase()
  const config = TYPE_MAP[key] || TYPE_MAP.physical

  return (
    <Badge
      tone={config.tone}
      mode="outline"
      role="status"
      data-product-type={key}
      {...badgeProps}
    >
      <Inline space={2}>
        <Text aria-hidden size={1}>
          {config.icon}
        </Text>
        <Text size={1} weight="medium">
          {config.label}
        </Text>
      </Inline>
    </Badge>
  )
}

export default ProductTypeBadge
