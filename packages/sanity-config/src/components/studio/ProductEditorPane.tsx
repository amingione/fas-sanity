import React from 'react'
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Grid,
  Inline,
  Menu,
  MenuButton,
  MenuDivider,
  MenuItem,
  Stack,
  Text,
} from '@sanity/ui'
import {
  AddIcon,
  EllipsisVerticalIcon,
  ImageIcon,
  LaunchIcon,
  PublishIcon,
  TagIcon,
} from '@sanity/icons'
import {useFormValue} from 'sanity'

type ProductEditorPaneProps = {
  renderDefault: (props: unknown) => React.ReactNode
} & Record<string, unknown>

const formatCurrency = (value?: number | null) => {
  if (typeof value !== 'number') return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value)
}

const statusToneMap: Record<string, 'default' | 'primary' | 'positive' | 'caution'> = {
  active: 'primary',
  draft: 'default',
  paused: 'caution',
  archived: 'default',
}

const statusLabelMap: Record<string, string> = {
  active: 'Active',
  draft: 'Draft',
  paused: 'Paused',
  archived: 'Archived',
}

const ProductEditorPane: React.FC<ProductEditorPaneProps> = (props) => {
  const {renderDefault} = props

  const title = (useFormValue(['title']) as string | undefined) || 'Untitled product'
  const price = useFormValue(['price']) as number | undefined
  const salePrice = useFormValue(['salePrice']) as number | undefined
  const sku = useFormValue(['sku']) as string | undefined
  const statusValue = ((useFormValue(['status']) as string | undefined) || 'draft').toLowerCase()
  const synced = Boolean(useFormValue(['synced'])) || Boolean(useFormValue(['shopifySynced']))
  const categoryRefs = (useFormValue(['category']) as Array<{_ref: string}> | undefined) || []
  const inventoryAvailable = useFormValue(['inventory', 'available']) as number | undefined

  const statusTone = statusToneMap[statusValue] || 'default'
  const statusLabel = statusLabelMap[statusValue] || 'Draft'

  const inventorySummary =
    typeof inventoryAvailable === 'number'
      ? `${inventoryAvailable.toLocaleString()} in stock`
      : 'Inventory managed externally'

  return (
    <Box padding={[4, 5, 6]}>
      <Stack space={4}>
        <Card padding={[4, 4, 5]} radius={3} shadow={1} tone="transparent">
          <Stack space={4}>
            <Flex align={['flex-start', 'center']} justify="space-between" wrap="wrap" gap={4}>
              <Stack space={2}>
                <Text size={4} weight="semibold">
                  {title}
                </Text>
                <Inline space={2} wrap="wrap">
                  <Badge tone={statusTone} padding={2} radius={2} fontSize={1}>
                    {statusLabel}
                  </Badge>
                  <Badge tone={synced ? 'positive' : 'default'} padding={2} radius={2} fontSize={1}>
                    {synced ? 'Synced to Shopify' : 'Not synced'}
                  </Badge>
                  <Badge tone="default" padding={2} radius={2} fontSize={1}>
                    {categoryRefs.length} categories
                  </Badge>
                </Inline>
              </Stack>

              <Inline space={2} wrap="wrap">
                <Button icon={ImageIcon} mode="ghost" text="Add media" fontSize={1} />
                <Button icon={TagIcon} mode="ghost" text="Duplicate" fontSize={1} />
                <Button icon={AddIcon} mode="ghost" text="Create variant" fontSize={1} />
                <Button icon={PublishIcon} tone="primary" text="Publish changes" fontSize={1} />
                <MenuButton
                  id="product-editor-actions"
                  popover={{portal: true}}
                  placement="left"
                  button={<Button icon={EllipsisVerticalIcon} mode="ghost" aria-label="More actions" />}
                  menu={
                    <Menu>
                      <MenuItem text="View on storefront" icon={LaunchIcon} />
                      <MenuItem text="Preview" icon={LaunchIcon} />
                      <MenuDivider />
                      <MenuItem text="Archive product" tone="critical" />
                    </Menu>
                  }
                />
              </Inline>
            </Flex>

            <Grid columns={[1, 2, 4]} gap={[3, 4]}>
              <Card padding={3} radius={2} shadow={1} tone="transparent">
                <Stack space={1}>
                  <Text size={1} muted>
                    Price
                  </Text>
                  <Text size={2} weight="semibold">
                    {formatCurrency(price)}
                  </Text>
                  {salePrice && (
                    <Text size={1} muted>
                      Sale price: {formatCurrency(salePrice)}
                    </Text>
                  )}
                </Stack>
              </Card>
              <Card padding={3} radius={2} shadow={1} tone="transparent">
                <Stack space={1}>
                  <Text size={1} muted>
                    SKU
                  </Text>
                  <Text size={2}>{sku || '—'}</Text>
                </Stack>
              </Card>
              <Card padding={3} radius={2} shadow={1} tone="transparent">
                <Stack space={1}>
                  <Text size={1} muted>
                    Inventory
                  </Text>
                  <Text size={2}>{inventorySummary}</Text>
                </Stack>
              </Card>
              <Card padding={3} radius={2} shadow={1} tone="transparent">
                <Stack space={1}>
                  <Text size={1} muted>
                    Shopify status
                  </Text>
                  <Text size={2}>{synced ? 'Up to date' : 'Sync to publish'}</Text>
                </Stack>
              </Card>
            </Grid>
          </Stack>
        </Card>

        <Grid columns={[1, 1, 3]} gap={[4, 5]} style={{alignItems: 'stretch'}}>
          <Card
            radius={3}
            shadow={1}
            tone="transparent"
            style={{gridColumn: 'span 2'}}
          >
            <Box padding={[4, 4, 5]}>
              {renderDefault(props)}
            </Box>
          </Card>

          <Stack space={4} style={{gridColumn: 'span 1'}}>
            <Card padding={4} radius={3} shadow={1} tone="transparent">
              <Stack space={3}>
                <Text size={2} weight="semibold">
                  Publishing checklist
                </Text>
                <Text muted size={1}>
                  Review these steps before you publish to ensure the product is ready for the storefront.
                </Text>
                <Stack space={2}>
                  <Flex gap={3} align="center">
                    <Badge tone={title ? 'positive' : 'default'}>Title</Badge>
                    <Text size={1}>Product title is {title ? 'set' : 'missing'}.</Text>
                  </Flex>
                  <Flex gap={3} align="center">
                    <Badge tone={price ? 'positive' : 'default'}>Pricing</Badge>
                    <Text size={1}>
                      {price ? 'Base price configured.' : 'Add a price before publishing.'}
                    </Text>
                  </Flex>
                  <Flex gap={3} align="center">
                    <Badge tone={synced ? 'positive' : 'default'}>Shopify</Badge>
                    <Text size={1}>
                      {synced ? 'Product is synced with Shopify.' : 'Sync to Shopify to publish.'}
                    </Text>
                  </Flex>
                </Stack>
              </Stack>
            </Card>

            <Card padding={4} radius={3} shadow={1} tone="transparent">
              <Stack space={3}>
                <Text size={2} weight="semibold">
                  Quick links
                </Text>
                <Stack space={2}>
                  <Button
                    text="Open in Shopify"
                    icon={LaunchIcon}
                    mode="ghost"
                    justify="space-between"
                    fontSize={1}
                  />
                  <Button
                    text="View analytics"
                    icon={LaunchIcon}
                    mode="ghost"
                    justify="space-between"
                    fontSize={1}
                  />
                  <Button
                    text="Create discount"
                    icon={TagIcon}
                    mode="ghost"
                    justify="space-between"
                    fontSize={1}
                  />
                </Stack>
              </Stack>
            </Card>
          </Stack>
        </Grid>
      </Stack>
    </Box>
  )
}

ProductEditorPane.displayName = 'ProductEditorPane'

export default ProductEditorPane
