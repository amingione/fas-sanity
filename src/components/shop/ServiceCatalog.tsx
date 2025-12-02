import type {ReactNode} from 'react'
import {Box, Button, Card, Grid, Heading, Stack, Text} from '@sanity/ui'
import type {CatalogProduct} from '../../lib/productQueries'
import ProductTypeBadge from './ProductTypeBadge'

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

const portableTextToPlain = (value: any): string => {
  if (!Array.isArray(value)) return ''
  return value
    .map((block) => {
      if (!block || typeof block !== 'object') return ''
      if (block._type !== 'block' || !Array.isArray(block.children)) return ''
      return block.children
        .map((child: any) => (typeof child?.text === 'string' ? child.text : ''))
        .join('')
    })
    .filter(Boolean)
    .join(' ')
    .trim()
}

export type ServiceCatalogProps = {
  services: CatalogProduct[]
  heading?: ReactNode
  emptyState?: ReactNode
  className?: string
  onSelectService?: (service: CatalogProduct) => void
}

export function ServiceCatalog({
  services,
  heading = 'Installation & Shop Services',
  emptyState = 'No services are available right now.',
  className,
  onSelectService,
}: ServiceCatalogProps) {
  if (!services || services.length === 0) {
    return (
      <Box className={className}>
        {typeof emptyState === 'string' ? <Text>{emptyState}</Text> : emptyState}
      </Box>
    )
  }

  return (
    <Stack space={5} className={className}>
      {heading ? (
        typeof heading === 'string' ? (
          <Heading as="h2" size={3} weight="semibold">
            {heading}
          </Heading>
        ) : (
          heading
        )
      ) : null}

      <Grid columns={[1, 2]} gap={4}>
        {services.map((service) => {
          const description = portableTextToPlain(service.shortDescription) || service.promotionTagline
          const price =
            typeof service.price === 'number'
              ? currencyFormatter.format(service.price)
              : undefined

          return (
            <Card
              key={service._id}
              padding={4}
              radius={3}
              shadow={1}
              tone="default"
              data-product-type={service.productType || 'service'}
            >
              <Stack space={4}>
                <ProductTypeBadge productType="service" />

                <Stack space={3}>
                  <Heading as="h3" size={2} weight="medium">
                    {service.title}
                  </Heading>
                  {price ? (
                    <Text size={2} weight="semibold">
                      {price}
                    </Text>
                  ) : null}
                  {description ? (
                    <Text size={1} muted>
                      {description}
                    </Text>
                  ) : null}
                </Stack>

                {(service.serviceDuration || service.serviceLocation) && (
                  <Stack space={2}>
                    {service.serviceDuration ? (
                      <Stack space={1}>
                        <Text size={1} weight="medium">
                          Duration
                        </Text>
                        <Text size={1}>{service.serviceDuration}</Text>
                      </Stack>
                    ) : null}
                    {service.serviceLocation ? (
                      <Stack space={1}>
                        <Text size={1} weight="medium">
                          Location
                        </Text>
                        <Text size={1}>{service.serviceLocation}</Text>
                      </Stack>
                    ) : null}
                  </Stack>
                )}

                <Box>
                  <Button
                    text="Request This Service"
                    tone="primary"
                    mode="default"
                    onClick={() => onSelectService?.(service)}
                  />
                </Box>
              </Stack>
            </Card>
          )
        })}
      </Grid>
    </Stack>
  )
}

export default ServiceCatalog
