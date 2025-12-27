import {LaunchIcon} from '@sanity/icons'
import {Badge, Box, Button, Card, Flex, Stack, Text} from '@sanity/ui'
import {IntentLink} from 'sanity/router'
import {useMemo} from 'react'
import type {OrderCartItem} from '../types/order'
import {deriveVariantAndAddOns, sanitizeCartItemName} from '../utils/cartItemDetails'

type OrderItemsListProps = {
  items?: OrderCartItem[] | null
  currency?: string
  amountTax?: number | null
}

const getQuantity = (item: OrderCartItem): number =>
  typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1

const getUnitPrice = (item: OrderCartItem): number | undefined => {
  if (typeof item.price === 'number') return item.price
  const fallbackTotal = typeof item.lineTotal === 'number' ? item.lineTotal : item.total
  if (typeof fallbackTotal === 'number') {
    const quantity = getQuantity(item)
    if (quantity > 0) return fallbackTotal / quantity
  }
  return undefined
}

const getLineTotal = (item: OrderCartItem): number | undefined => {
  if (typeof item.lineTotal === 'number') return item.lineTotal
  if (typeof item.total === 'number') return item.total
  const unitPrice = getUnitPrice(item)
  if (typeof unitPrice === 'number') return unitPrice * getQuantity(item)
  return undefined
}

type NormalizedItem = {
  item: OrderCartItem
  lineTotal?: number
  unitPrice?: number
  key: string
}

function OrderItemsList({items, currency = 'USD', amountTax}: OrderItemsListProps) {
  const formatter = useMemo(
    () =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
      }),
    [currency],
  )

  const normalizedItems = useMemo<NormalizedItem[]>(() => {
    if (!items) return []
    return items.map((item, index) => ({
      item,
      lineTotal: getLineTotal(item),
      unitPrice: getUnitPrice(item),
      key: item._key || `${item.sku || 'item'}-${index}`,
    }))
  }, [items])

  const totalLineValue = useMemo(() => {
    return normalizedItems.reduce((sum, entry) => sum + (entry.lineTotal || 0), 0)
  }, [normalizedItems])

  if (!items || items.length === 0) {
    return (
      <Card padding={3} radius={2} tone="transparent" border>
        <Text size={2} muted>
          No cart items were synced from Stripe for this order.
        </Text>
      </Card>
    )
  }

  const taxAmount = typeof amountTax === 'number' && amountTax > 0 ? amountTax : 0

  return (
    <Stack space={3}>
      {normalizedItems.map(({item, key, lineTotal, unitPrice}) => {
        const {selectedVariant, addOns} = deriveVariantAndAddOns({
          selectedVariant: (item as any)?.selectedVariant,
          optionDetails: (item as any)?.optionDetails,
          upgrades: (item as any)?.upgrades,
        })
        const optionsText = selectedVariant || undefined
        const addOnsText = addOns.length ? addOns.join(', ') : undefined
        const displayName =
          sanitizeCartItemName(item.name) ||
          sanitizeCartItemName(item.productName) ||
          item.name ||
          item.productName ||
          'Product'
        const allocatedTax =
          taxAmount > 0 && totalLineValue > 0 && lineTotal
            ? (lineTotal / totalLineValue) * taxAmount
            : 0
        const adjustedTotal =
          typeof lineTotal === 'number'
            ? Number((lineTotal - (allocatedTax > 0 ? allocatedTax : 0)).toFixed(2))
            : undefined
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
                    {typeof adjustedTotal === 'number'
                      ? formatter.format(adjustedTotal)
                      : typeof lineTotal === 'number'
                        ? formatter.format(lineTotal)
                        : '—'}
                  </Text>
                  {allocatedTax > 0 && (
                    <Text size={1} muted>
                      (excludes {formatter.format(allocatedTax)} tax)
                    </Text>
                  )}
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
