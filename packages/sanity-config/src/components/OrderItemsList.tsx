import {LaunchIcon} from '@sanity/icons'
import {Badge, Box, Button, Card, Flex, Stack, Text} from '@sanity/ui'
import {IntentLink} from 'sanity/router'
import {useMemo} from 'react'
import type {OrderCartItem} from '../types/order'
import {deriveVariantAndAddOns, sanitizeCartItemName} from '../utils/cartItemDetails'

type OrderItemsListProps = {
  items?: OrderCartItem[] | null
  currency?: string
}

const getLineTotal = (item: OrderCartItem): number | undefined => {
  if (typeof item.lineTotal === 'number') return item.lineTotal
  if (typeof item.total === 'number') return item.total
  const quantity = typeof item.quantity === 'number' ? item.quantity : 1
  if (typeof item.price === 'number') return item.price * quantity
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
        const {selectedVariant, addOns} = deriveVariantAndAddOns({
          selectedVariant: (item as any)?.selectedVariant,
          optionDetails: (item as any)?.optionDetails,
          upgrades: (item as any)?.upgrades,
        })
        const optionsText = selectedVariant || undefined
        const addOnsText = addOns.length ? addOns.join(', ') : undefined
        const unitPrice = typeof item.price === 'number' ? item.price : undefined
        const key = item._key || `${item.sku || 'item'}-${index}`
        const displayName =
          sanitizeCartItemName(item.name) ||
          sanitizeCartItemName(item.productName) ||
          item.name ||
          item.productName ||
          'Product'
        return (
          <Card key={key} padding={3} radius={2} border>
            <Flex gap={4} wrap="wrap">
              <Box flex={2} style={{minWidth: 200}}>
                <Stack space={2}>
                  <Text size={3} weight="semibold">
                    {displayName}
                  </Text>
                  {item.sku && (
                    <Text size={1} muted>
                      SKU: {item.sku}
                    </Text>
                  )}
                  {optionsText && (
                    <Text size={1} muted>
                      Options: {optionsText}
                    </Text>
                  )}
                  {addOnsText && (
                    <Text size={1} muted>
                      Upgrades: {addOnsText}
                    </Text>
                  )}
                  {item.productRef?._ref && (
                    <IntentLink
                      intent="edit"
                      params={{id: item.productRef._ref, type: 'product'}}
                      style={{display: 'inline-flex', marginTop: 4}}
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
                </Stack>
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
                    {typeof unitPrice === 'number' ? formatter.format(unitPrice) : '—'}
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
