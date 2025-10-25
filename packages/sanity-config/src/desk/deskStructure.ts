import type {StructureResolver} from 'sanity/structure'
import HomePane from '../components/studio/HomePane'
import ComingSoonPane from '../components/studio/ComingSoonPane'
import OrderShippingView from '../components/studio/OrderShippingView'
import ProductEditorPane from '../components/studio/ProductEditorPane'
import ShippingCalendar from '../components/studio/ShippingCalendar'
import AdminTools from '../components/studio/AdminTools'

const orderDocumentViews = (S: any) => (documentId: string) =>
  S.document()
    .schemaType('order')
    .documentId(documentId)
    .views([
      S.view.form().title('Form').id('form'),
      S.view.component(OrderShippingView as any).title('Shipping').id('shipping'),
    ])

const productsByCategory = (S: any) =>
  S.listItem()
    .id('products-by-category')
    .title('Products by category')
    .child(
      S.documentTypeList('category')
        .apiVersion('2024-10-01')
        .title('Categories')
        .child((categoryId: string) =>
          S.documentList()
            .apiVersion('2024-10-01')
            .title('Products')
            .schemaType('product')
            .filter('_type == "product" && $categoryId in category[]._ref')
            .params({categoryId})
        )
    )

export const deskStructure: StructureResolver = (S) =>
  S.list()
    .title('F.A.S. Motorsports')
    .items([
      S.listItem()
        .id('home')
        .title('Home')
        .child(
          S.component()
            .id('home-pane')
            .title('Home')
            .component(HomePane as any)
        ),
      S.divider(),
      S.listItem()
        .id('customers')
        .title('Customers')
        .child(
          S.list()
            .title('Customers')
            .items([
              S.documentTypeListItem('customer')
                .title('All customers')
                .child(
                  S.documentTypeList('customer')
                    .apiVersion('2024-10-01')
                    .title('All customers')
                    .filter('_type == "customer"')
                    .defaultOrdering([
                      {field: 'lifetimeSpend', direction: 'desc'},
                      {field: 'orderCount', direction: 'desc'},
                    ])
                ),
              S.divider(),
              S.listItem()
                .id('customers-subscribed')
                .title('Subscribed to email')
                .child(
                  S.documentList()
                    .apiVersion('2024-10-01')
                    .title('Subscribed customers')
                    .schemaType('customer')
                    .filter('emailOptIn == true || marketingOptIn == true')
                    .defaultOrdering([{field: '_updatedAt', direction: 'desc'}])
                ),
              S.listItem()
                .id('customers-high-value')
                .title('High value ($100+)')
                .child(
                  S.documentList()
                    .apiVersion('2024-10-01')
                    .title('High value customers')
                    .schemaType('customer')
                    .filter('(lifetimeSpend ?? 0) >= 100')
                    .defaultOrdering([{field: 'lifetimeSpend', direction: 'desc'}])
                ),
              S.listItem()
                .id('customers-vip')
                .title('VIP ($1,000+)')
                .child(
                  S.documentList()
                    .apiVersion('2024-10-01')
                    .title('VIP customers')
                    .schemaType('customer')
                    .filter('(lifetimeSpend ?? 0) >= 1000')
                    .defaultOrdering([{field: 'lifetimeSpend', direction: 'desc'}])
                ),
              S.listItem()
                .id('customers-inactive')
                .title('No orders yet')
                .child(
                  S.documentList()
                    .apiVersion('2024-10-01')
                    .title('Customers with no orders')
                    .schemaType('customer')
                    .filter('(orderCount ?? 0) == 0')
                    .defaultOrdering([{field: '_createdAt', direction: 'desc'}])
                ),
              S.listItem()
                .id('customers-recent')
                .title('Recently added')
                .child(
                  S.documentList()
                    .apiVersion('2024-10-01')
                    .title('Recently added customers')
                    .schemaType('customer')
                    .filter('_type == "customer"')
                    .defaultOrdering([{field: '_createdAt', direction: 'desc'}])
                ),
            ])
        ),
      S.listItem()
        .id('orders')
        .title('Orders')
        .child(
          S.list()
            .title('Orders')
            .items([
              S.documentTypeListItem('order')
                .title('All orders')
                .child(
                  S.documentTypeList('order')
                    .title('All orders')
                    .apiVersion('2024-10-01')
                    .filter('_type == "order"')
                    .defaultOrdering([{field: 'createdAt', direction: 'desc'}])
                    .child(orderDocumentViews(S))
                ),
              S.divider(),
              S.listItem()
                .id('orders-pending')
                .title('Pending fulfillment')
                .child(
                  S.documentList()
                    .apiVersion('2024-10-01')
                    .title('Pending fulfillment')
                    .schemaType('order')
                    .filter('_type == "order" && status == "paid" && !defined(fulfilledAt)')
                    .defaultOrdering([{field: 'createdAt', direction: 'asc'}])
                    .child(orderDocumentViews(S))
                ),
              S.listItem()
                .id('orders-fulfilled')
                .title('Fulfilled')
                .child(
                  S.documentList()
                    .apiVersion('2024-10-01')
                    .title('Fulfilled orders')
                    .schemaType('order')
                    .filter('_type == "order" && defined(fulfilledAt)')
                    .defaultOrdering([{field: 'fulfilledAt', direction: 'desc'}])
                    .child(orderDocumentViews(S))
                ),
              S.listItem()
                .id('orders-paid')
                .title('Paid')
                .child(
                  S.documentList()
                    .apiVersion('2024-10-01')
                    .title('Paid orders')
                    .schemaType('order')
                    .filter('_type == "order" && paymentStatus == "paid"')
                    .defaultOrdering([{field: 'createdAt', direction: 'desc'}])
                    .child(orderDocumentViews(S))
                ),
              S.listItem()
                .id('orders-unpaid')
                .title('Unpaid / Failed')
                .child(
                  S.documentList()
                    .apiVersion('2024-10-01')
                    .title('Unpaid orders')
                    .schemaType('order')
                    .filter('_type == "order" && (paymentStatus != "paid" || !defined(paymentStatus))')
                    .defaultOrdering([{field: 'createdAt', direction: 'desc'}])
                    .child(orderDocumentViews(S))
                ),
              S.listItem()
                .id('orders-expired-carts')
                .title('Expired carts')
                .child(
                  S.documentTypeList('expiredCart')
                    .title('Expired carts')
                    .apiVersion('2024-10-01')
                    .filter('_type == "expiredCart"')
                    .defaultOrdering([
                      {field: 'expiredAt', direction: 'desc'},
                      {field: 'createdAt', direction: 'desc'},
                    ])
                ),
              S.listItem()
                .id('orders-recent')
                .title('Recent (Last 30 days)')
                .child(
                  S.documentList()
                    .apiVersion('2024-10-01')
                    .title('Recent orders')
                    .schemaType('order')
                    .filter('_type == "order" && dateTime(createdAt) > dateTime(now()) - 60*60*24*30')
                    .defaultOrdering([{field: 'createdAt', direction: 'desc'}])
                    .child(orderDocumentViews(S))
                ),
              S.divider(),
              S.listItem()
                .id('orders-invoices')
                .title('Invoices')
                .child(
                  S.documentTypeList('invoice')
                    .title('Invoices')
                    .apiVersion('2024-10-01')
                    .filter('_type == "invoice"')
                    .defaultOrdering([{field: 'invoiceDate', direction: 'desc'}])
                ),
            ])
        ),
      S.listItem()
        .id('shipping')
        .title('Shipping')
        .child(
          S.list()
            .title('Shipping')
            .items([
              S.documentTypeListItem('shippingLabel').title('Shipping labels'),
              S.documentTypeListItem('shippingOption').title('Shipping options'),
            ])
        ),
      S.listItem()
        .id('products')
        .title('Products')
        .child(
          S.list()
            .title('Products')
            .items([
              S.documentTypeListItem('product')
                .title('All products')
                .child(
                  S.documentTypeList('product')
                    .title('All products')
                    .apiVersion('2024-10-01')
                    .filter('_type == "product"')
                    .defaultOrdering([{field: '_updatedAt', direction: 'desc'}])
                    .child((documentId: string) =>
                      S.document()
                        .schemaType('product')
                        .documentId(documentId)
                        .views([
                          S.view.form().title('Details').id('form'),
                          S.view
                            .component(ProductEditorPane as any)
                            .title('Editor')
                            .id('editor'),
                        ])
                    )
                ),
              S.divider(),
              S.listItem()
                .id('products-active')
                .title('Active')
                .child(
                  S.documentList()
                    .apiVersion('2024-10-01')
                    .title('Active products')
                    .schemaType('product')
                    .filter('_type == "product" && (status == "active" || !defined(status))')
                    .defaultOrdering([{field: 'title', direction: 'asc'}])
                    .child((documentId: string) =>
                      S.document()
                        .schemaType('product')
                        .documentId(documentId)
                        .views([
                          S.view.form().title('Details').id('form'),
                          S.view
                            .component(ProductEditorPane as any)
                            .title('Editor')
                            .id('editor'),
                        ])
                    )
                ),
              S.listItem()
                .id('products-draft')
                .title('Draft')
                .child(
                  S.documentList()
                    .apiVersion('2024-10-01')
                    .title('Draft products')
                    .schemaType('product')
                    .filter('_type == "product" && status == "draft"')
                    .defaultOrdering([{field: '_updatedAt', direction: 'desc'}])
                    .child((documentId: string) =>
                      S.document()
                        .schemaType('product')
                        .documentId(documentId)
                        .views([
                          S.view.form().title('Details').id('form'),
                          S.view
                            .component(ProductEditorPane as any)
                            .title('Editor')
                            .id('editor'),
                        ])
                    )
                ),
              S.listItem()
                .id('products-paused')
                .title('Paused')
                .child(
                  S.documentList()
                    .apiVersion('2024-10-01')
                    .title('Paused products')
                    .schemaType('product')
                    .filter('_type == "product" && status == "paused"')
                    .defaultOrdering([{field: '_updatedAt', direction: 'desc'}])
                    .child((documentId: string) =>
                      S.document()
                        .schemaType('product')
                        .documentId(documentId)
                        .views([
                          S.view.form().title('Details').id('form'),
                          S.view
                            .component(ProductEditorPane as any)
                            .title('Editor')
                            .id('editor'),
                        ])
                    )
                ),
              S.listItem()
                .id('products-archived')
                .title('Archived')
                .child(
                  S.documentList()
                    .apiVersion('2024-10-01')
                    .title('Archived products')
                    .schemaType('product')
                    .filter('_type == "product" && status == "archived"')
                    .defaultOrdering([{field: '_updatedAt', direction: 'desc'}])
                    .child((documentId: string) =>
                      S.document()
                        .schemaType('product')
                        .documentId(documentId)
                        .views([
                          S.view.form().title('Details').id('form'),
                          S.view
                            .component(ProductEditorPane as any)
                            .title('Editor')
                            .id('editor'),
                        ])
                    )
                ),
              S.listItem()
                .id('products-out-of-stock')
                .title('Out of stock')
                .child(
                  S.documentList()
                    .apiVersion('2024-10-01')
                    .title('Out of stock products')
                    .schemaType('product')
                    .filter('_type == "product" && (inventory.quantity ?? 0) <= 0')
                    .defaultOrdering([{field: 'title', direction: 'asc'}])
                    .child((documentId: string) =>
                      S.document()
                        .schemaType('product')
                        .documentId(documentId)
                        .views([
                          S.view.form().title('Details').id('form'),
                          S.view
                            .component(ProductEditorPane as any)
                            .title('Editor')
                            .id('editor'),
                        ])
                    )
                ),
              S.divider(),
              S.documentTypeListItem('category').title('Categories'),
              productsByCategory(S),
              S.documentTypeListItem('productBundle').title('Bundles'),
            ])
        ),
      S.listItem()
        .id('quotes')
        .title('Quotes')
        .child(
          S.list()
            .title('Quotes')
            .items([
              S.documentTypeListItem('quote')
                .title('All quotes')
                .child(
                  S.documentTypeList('quote')
                    .title('All quotes')
                    .apiVersion('2024-10-01')
                    .filter('_type == "quote"')
                    .defaultOrdering([{field: '_createdAt', direction: 'desc'}])
                ),
              S.documentTypeListItem('freightQuote')
                .title('Freight quotes')
                .child(
                  S.documentTypeList('freightQuote')
                    .title('Freight quotes')
                    .apiVersion('2024-10-01')
                    .filter('_type == "freightQuote"')
                    .defaultOrdering([{field: '_createdAt', direction: 'desc'}])
                ),
              S.documentTypeListItem('wheelQuote')
                .title('Wheel quotes')
                .child(
                  S.documentTypeList('wheelQuote')
                    .title('Wheel quotes')
                    .apiVersion('2024-10-01')
                    .filter('_type == "wheelQuote"')
                    .defaultOrdering([{field: '_createdAt', direction: 'desc'}])
                ),
            ])
        ),
      S.divider(),
      S.listItem()
        .id('finance')
        .title('Finance')
        .child(
          S.list()
            .title('Finance')
            .items([
              S.documentTypeListItem('invoice')
                .title('Invoices')
                .child(
                  S.documentTypeList('invoice')
                    .title('Invoices')
                    .apiVersion('2024-10-01')
                    .filter('_type == "invoice"')
                    .defaultOrdering([{field: 'invoiceDate', direction: 'desc'}])
                ),
              S.documentTypeListItem('bill')
                .title('Bills')
                .child(
                  S.documentTypeList('bill')
                    .title('Bills')
                    .apiVersion('2024-10-01')
                    .filter('_type == "bill"')
                    .defaultOrdering([{field: 'issueDate', direction: 'desc'}])
                ),
              S.documentTypeListItem('check')
                .title('Checks')
                .child(
                  S.documentTypeList('check')
                    .title('Checks')
                    .apiVersion('2024-10-01')
                    .filter('_type == "check"')
                    .defaultOrdering([{field: 'checkDate', direction: 'desc'}])
                ),
              S.documentTypeListItem('expense')
                .title('Expenses')
                .child(
                  S.documentTypeList('expense')
                    .title('Expenses')
                    .apiVersion('2024-10-01')
                    .filter('_type == "expense"')
                    .defaultOrdering([{field: 'date', direction: 'desc'}])
                ),
              S.divider(),
              S.documentTypeListItem('bankAccount').title('Bank accounts'),
              S.documentTypeListItem('vendor').title('Vendors'),
            ])
        ),
      S.divider(),
      S.listItem()
        .id('shipping-calendar')
        .title('Shipping Calendar')
        .child(
          S.component()
            .id('shipping-calendar-pane')
            .title('Shipping Calendar')
            .component(ShippingCalendar as any)
        ),
      S.listItem()
        .id('admin-tools')
        .title('Admin Tools')
        .child(
          S.component()
            .id('admin-tools-pane')
            .title('Admin Tools')
            .component(AdminTools as any)
        ),
      S.divider(),
      S.listItem()
        .id('settings')
        .title('Settings')
        .child(
          S.list()
            .title('Settings')
            .items([
              S.documentTypeListItem('filterTag').title('Filter tags'),
              S.documentTypeListItem('colorTheme').title('Color themes'),
              S.documentTypeListItem('collection').title('Collections'),
              S.documentTypeListItem('page').title('Pages'),
              S.documentTypeListItem('vehicleModel').title('Vehicle models'),
              S.documentTypeListItem('tune').title('Tunes'),
              S.documentTypeListItem('booking').title('Bookings'),
            ])
        ),
      S.listItem()
        .id('online-store')
        .title('Online store')
        .child(
          S.component()
            .id('online-store-pane')
            .title('Online store')
            .component(ComingSoonPane as any)
            .options({
              title: 'Online store tooling',
              description:
                'Integration with the FAS CMS is on the roadmap. Soon you will be able to edit storefront content from here.',
            })
        ),
    ])
