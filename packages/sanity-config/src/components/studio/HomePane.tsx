import React from 'react'
import {Box, Stack} from '@sanity/ui'
import {
  CustomersDocumentTable,
  NEW_ORDERS_FILTER,
  OrdersDocumentTable,
  ProductsDocumentTable,
} from './documentTables'
import CalendarTasksWidget from './CalendarTasksWidget'
import RecentDownloadsWidget from './downloads/RecentDownloadsWidget'

const HomePane = React.forwardRef<HTMLDivElement, Record<string, never>>((_props, ref) => {
  return (
    <Box padding={4} ref={ref}>
      <Stack space={4}>
        <CalendarTasksWidget />
        <RecentDownloadsWidget />
        <OrdersDocumentTable
          title="New orders"
          filter={NEW_ORDERS_FILTER}
          emptyState="No new orders"
        />
        <ProductsDocumentTable />
        <CustomersDocumentTable />
      </Stack>
    </Box>
  )
})

HomePane.displayName = 'HomePane'

export default HomePane
