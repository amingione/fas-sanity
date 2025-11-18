import {LaunchIcon} from '@sanity/icons'
import {Badge, Box, Button, Card, Flex, Stack, Text} from '@sanity/ui'
import {IntentLink} from 'sanity/router'
import {useMemo} from 'react'
import type {OrderCartItem} from '../types/order'

type OrderItemsListProps = {
  items?: OrderCartItem[] | null
  currency?: string
}

const buildOptionsSummary = (item: OrderCartItem): string | undefined => {
  if (item.optionSummary) return item.optionSummary
  const parts = [...(item.optionDetails || []), ...(item.upgrades || [])].filter(Boolean)
  if (!parts.length) return undefined
  return parts.join(', ')
}

const getLineTotal = (item: OrderCartItem): number | undefined => {
  if (typeof item.total === 'number') return item.total
  if (typeof item.price === 'number') {
    const quantity = typeof item.quantity === 'number' ? item.quantity : 1
    return item.price * quantity
  }
  return undefined
}

function OrderItemsList({items, currency = 'USD'}: OrderItemsListProps) {
  const formatter = useMemo(
    () =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
      }),
    [currency],
  )

  if (!items || items.length === 0) {
    return (
      <Card padding={3} radius={2} tone="transparent" border>
        <Text size={2} muted>
          No cart items were synced from Stripe for this order.
        </Text>
      </Card>
    )
  }

  return (
    <Stack space={3}>
      {items.map((item, index) => {
        const lineTotal = getLineTotal(item)
        const summary = buildOptionsSummary(item)
        const key = item._key || `${item.sku || 'item'}-${index}`
        return (
          <Card key={key} padding={3} radius={2} border>
            <Flex gap={4} wrap="wrap">
              <Box flex={2} style={{minWidth: 200}}>
                <Text size={3} weight="semibold">
                  {item.name || item.productName || 'Product'}
                </Text>
                {item.sku && (
                  <Text size={1} muted>
                    SKU: {item.sku}
                  </Text>
                )}
                {summary && (
                  <Text size={1} muted>
                    Options: {summary}
                  </Text>
                )}
                {item.productRef?._ref && (
                  <IntentLink
                    intent="edit"
                    params={{id: item.productRef._ref, type: 'product'}}
                    style={{display: 'inline-flex', marginTop: 8}}
                  >
                    <Button
                      icon={LaunchIcon}
                      mode="bleed"
                      padding={2}
                      text="View product"
                      tone="primary"
                    />
                  </IntentLink>
                )}
              </Box>
              <Flex flex={1} gap={3} align="center" justify="flex-end" wrap="wrap">
                <Stack space={2} style={{minWidth: 100}}>
                  <Text size={1} muted>
                    Quantity
                  </Text>
                  <Badge tone="primary" mode="outline">
                    {item.quantity ?? 1}
                  </Badge>
                </Stack>
                <Stack space={2} style={{minWidth: 120}}>
                  <Text size={1} muted>
                    Price
                  </Text>
                  <Text size={2} weight="medium">
                    {typeof item.price === 'number' ? formatter.format(item.price) : '—'}
                  </Text>
                </Stack>
                <Stack space={2} style={{minWidth: 120}}>
                  <Text size={1} muted>
                    Total
                  </Text>
                  <Text size={2} weight="semibold">
                    {typeof lineTotal === 'number' ? formatter.format(lineTotal) : '—'}
                  </Text>
                </Stack>
              </Flex>
            </Flex>
          </Card>
        )
      })}
    </Stack>
  )
}

export default OrderItemsList
