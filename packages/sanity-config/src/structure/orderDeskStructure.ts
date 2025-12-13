export const orderDeskStructure = (S: any) =>
  S.listItem()
    .title('Orders')
    .icon(() => '📦')
    .child(
      S.list()
        .title('Order Management')
        .items([
          // 🔴 NEEDS FULFILLMENT - Priority #1
          S.listItem()
            .title('🔴 Needs Fulfillment')
            .icon(() => '📦')
            .child(
              S.documentList()
                .title('Paid Orders Without Tracking')
                .filter(
                  '_type == "order" && status == "paid" && !defined(manualTrackingNumber) && !defined(trackingNumber)',
                )
                .defaultOrdering([{field: 'createdAt', direction: 'desc'}])
                .menuItems(S.documentTypeList('order').getMenuItems()),
            ),

          // 📦 READY TO SHIP
          S.listItem()
            .title('📦 Ready to Ship')
            .icon(() => '🚚')
            .child(
              S.documentList()
                .title('Orders With Tracking')
                .filter(
                  '_type == "order" && status == "paid" && (defined(manualTrackingNumber) || defined(trackingNumber))',
                )
                .defaultOrdering([{field: 'createdAt', direction: 'desc'}])
                .menuItems(S.documentTypeList('order').getMenuItems()),
            ),

          // 🚚 SHIPPED
          S.listItem()
            .title('🚚 Fulfilled')
            .icon(() => '🚀')
            .child(
              S.documentList()
                .title('Orders In Transit')
                .filter('_type == "order" && status == "fulfilled"')
                .defaultOrdering([{field: 'createdAt', direction: 'desc'}])
                .menuItems(S.documentTypeList('order').getMenuItems()),
            ),

          // ✅ FULFILLED
          S.listItem()
            .title('✅ Delivered')
            .icon(() => '✓')
            .child(
              S.documentList()
                .title('Completed Orders')
                .filter('_type == "order" && status == "delivered"')
                .defaultOrdering([{field: 'createdAt', direction: 'desc'}])
                .menuItems(S.documentTypeList('order').getMenuItems()),
            ),

          S.divider(),

          // ⏰ RECENT ORDERS
          S.listItem()
            .title('⏰ Recent Orders (30 Days)')
            .icon(() => '🕐')
            .child(
              S.documentList()
                .title('Last 30 Days')
                .filter(
                  '_type == "order" && status == "paid" && dateTime(createdAt) > dateTime(now()) - 60*60*24*30',
                )
                .defaultOrdering([{field: 'createdAt', direction: 'desc'}])
                .menuItems(S.documentTypeList('order').getMenuItems()),
            ),

          // 💰 ALL PAID
          S.listItem()
            .title('💰 All Paid Orders')
            .icon(() => '💵')
            .child(
              S.documentList()
                .title('All Paid Orders')
                .filter('_type == "order" && status == "paid"')
                .defaultOrdering([{field: 'createdAt', direction: 'desc'}])
                .menuItems(S.documentTypeList('order').getMenuItems()),
            ),

          S.divider(),

          // ⚠️ CANCELLED & REFUNDED
          S.listItem()
            .title('⚠️ Cancelled & Refunded')
            .icon(() => '⊗')
            .child(
              S.documentList()
                .title('Cancelled or Refunded Orders')
                .filter('_type == "order" && (status == "canceled" || status == "cancelled" || status == "refunded")')
                .defaultOrdering([{field: 'createdAt', direction: 'desc'}])
                .menuItems(S.documentTypeList('order').getMenuItems()),
            ),

          // 🗑️ EXPIRED CARTS
          S.listItem()
            .title('🗑️ Expired Carts')
            .icon(() => '🗑')
            .child(
              S.documentList()
                .title('Abandoned Checkouts')
                .filter('_type == "order" && status == "expired"')
                .defaultOrdering([{field: 'createdAt', direction: 'desc'}])
                .menuItems(S.documentTypeList('order').getMenuItems()),
            ),

          S.divider(),

          // 📋 ALL ORDERS
          S.listItem()
            .title('📋 All Orders')
            .icon(() => '📋')
            .child(
              S.documentList()
                .title('All Orders')
                .filter('_type == "order"')
                .defaultOrdering([{field: 'createdAt', direction: 'desc'}])
                .menuItems(S.documentTypeList('order').getMenuItems()),
            ),
        ]),
    )
