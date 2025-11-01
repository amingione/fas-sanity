import React from 'react'
import {Box, Flex, Text} from '@sanity/ui'
import {PaginatedDocumentTable, formatBoolean, formatCurrency, formatDate} from './PaginatedDocumentTable'

type ProductRowData = {
  title?: string | null
  sku?: string | null
  status?: string | null
  price?: number | null
  salePrice?: number | null
  onSale?: boolean | null
  featured?: boolean | null
  stripeActive?: boolean | null
  updatedAt?: string | null
  primaryImage?: string | null
}

const PRODUCT_PROJECTION = `{
  title,
  sku,
  status,
  price,
  salePrice,
  onSale,
  featured,
  stripeActive,
  "updatedAt": coalesce(_updatedAt, _createdAt),
  "primaryImage": coalesce(images[0].asset->url, ${JSON.stringify(
    'https://dummyimage.com/128x128/ededed/8c8c8c&text=No+Image',
  )})
}`

const PriceCell = ({row}: {row: ProductRowData}) => {
  if (row.onSale && typeof row.salePrice === 'number') {
    return (
      <Flex direction="column">
        <Text size={1} weight="medium">
          {formatCurrency(row.salePrice, 'USD')}
        </Text>
        <Text size={0} muted style={{textDecoration: 'line-through'}}>
          {formatCurrency(row.price ?? null, 'USD')}
        </Text>
      </Flex>
    )
  }

  return (
    <Text size={1} weight="medium">
      {formatCurrency(row.price ?? null, 'USD')}
    </Text>
  )
}

export default function ProductsDocumentTable() {
  return (
    <PaginatedDocumentTable<ProductRowData>
      title="Products"
      documentType="product"
      projection={PRODUCT_PROJECTION}
      orderings={[{field: '_updatedAt', direction: 'desc'}]}
      pageSize={8}
      columns={[
        {
          key: 'title',
          header: 'Product',
          render: (data) => (
            <Flex align="center" gap={3}>
              {data.primaryImage ? (
                <Box
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 6,
                    overflow: 'hidden',
                    backgroundColor: 'var(--card-muted-fg-color)',
                    flexShrink: 0,
                  }}
                >
                  <img
                    src={data.primaryImage}
                    alt={data.title ?? 'Product image'}
                    style={{width: '100%', height: '100%', objectFit: 'cover'}}
                  />
                </Box>
              ) : null}
              <Box>
                <Text size={1} weight="medium">
                  {data.title || 'Untitled product'}
                </Text>
                {data.featured ? (
                  <Text size={0} muted>
                    Featured
                  </Text>
                ) : null}
              </Box>
            </Flex>
          ),
        },
        {
          key: 'sku',
          header: 'SKU',
          render: (data) => <Text size={1}>{data.sku || '—'}</Text>,
        },
        {
          key: 'status',
          header: 'Status',
          render: (data) => (
            <Text size={1} style={{textTransform: 'capitalize'}}>
              {data.status || '—'}
            </Text>
          ),
        },
        {
          key: 'price',
          header: 'Price',
          align: 'right',
          render: (data) => <PriceCell row={data} />,
        },
        {
          key: 'stripe',
          header: 'Stripe',
          render: (data) => <Text size={1}>{formatBoolean(Boolean(data.stripeActive))}</Text>,
        },
        {
          key: 'updatedAt',
          header: 'Last Updated',
          render: (data) => <Text size={1}>{formatDate(data.updatedAt)}</Text>,
        },
      ]}
    />
  )
}
