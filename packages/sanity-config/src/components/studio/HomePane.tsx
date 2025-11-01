import React from 'react'
import {Box, Stack} from '@sanity/ui'
import {
  CustomersDocumentTable,
  OrdersDocumentTable,
  ProductsDocumentTable,
} from './documentTables'

const HomePane = React.forwardRef<HTMLDivElement, Record<string, never>>((_props, ref) => {
  return (
    <Box padding={4} ref={ref}>
      <Stack space={4}>
        <OrdersDocumentTable />
        <ProductsDocumentTable />
        <CustomersDocumentTable />
      </Stack>
    </Box>
  )
})

HomePane.displayName = 'HomePane'

export default HomePane
