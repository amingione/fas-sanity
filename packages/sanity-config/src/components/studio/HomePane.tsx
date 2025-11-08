import React from 'react'
import {Box, Stack} from '@sanity/ui'
import {
  CustomersDocumentTable,
  NEW_ORDERS_FILTER,
  OrdersDocumentTable,
  ProductsDocumentTable,
} from './documentTables'

const HomePane = React.forwardRef<HTMLDivElement, Record<string, never>>((_props, ref) => {
  return (
    <Box padding={4} ref={ref}>
      <Stack space={4}>
        <OrdersDocumentTable title="New orders" filter={NEW_ORDERS_FILTER} emptyState="No new orders" />
        <ProductsDocumentTable />
        <CustomersDocumentTable />
      </Stack>
    </Box>
  )
})

HomePane.displayName = 'HomePane'

export default HomePane
