import type {StructureResolver} from 'sanity/structure'
import {
  BarChartIcon,
  BasketIcon,
  BillIcon,
  CalendarIcon,
  ChartUpwardIcon,
  CogIcon,
  DocumentIcon,
  HomeIcon,
  LinkIcon,
  PackageIcon,
  PlugIcon,
  TagIcon,
  TrolleyIcon,
  UserIcon,
  WrenchIcon,
} from '@sanity/icons'
import HomePane from '../components/studio/HomePane'
import ComingSoonPane from '../components/studio/ComingSoonPane'
import OrderShippingView from '../components/studio/OrderShippingView'
import OrderListPane from '../components/studio/OrderListPane'
import ProductEditorPane from '../components/studio/ProductEditorPane'
import ShippingCalendar from '../components/studio/ShippingCalendar'
import AdminTools from '../components/studio/AdminTools'

const API_VERSION = '2024-10-01'

const orderDocumentViews = (S: any) => (documentId: string) =>
  S.document()
    .schemaType('order')
    .documentId(documentId)
    .views([
      S.view.form().title('Form').id('form'),
      S.view
        .component(OrderShippingView as any)
        .title('Shipping')
        .id('shipping'),
    ])

const productDocumentViews = (S: any) => (documentId: string) =>
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

const productsByCategory = (S: any) =>
  S.listItem()
    .id('products-by-category')
    .title('Products by category')
    .child(
      S.documentTypeList('category')
        .apiVersion(API_VERSION)
        .title('Categories')
        .child((categoryId: string) =>
          S.documentList()
            .apiVersion(API_VERSION)
            .title('Products')
            .schemaType('product')
            .filter('_type == "product" && $categoryId in category[]._ref')
            .params({categoryId}),
        ),
    )

const createOrdersList = (S: any) =>
  S.listItem()
    .id('orders')
    .title('Orders')
    .icon(TrolleyIcon)
    .child(
      S.list()
        .title('Orders')
        .items([
          S.listItem()
            .id('orders-all')
            .title('All orders')
            .child(
              S.component()
                .id('orders-pane')
                .title('Orders')
                .component(OrderListPane as any),
            ),
          S.divider(),
          S.listItem()
            .id('orders-pending')
            .title('Pending fulfillment')
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .title('Pending fulfillment')
                .schemaType('order')
                .filter('_type == "order" && status == "paid" && !defined(fulfilledAt)')
                .defaultOrdering([{field: 'createdAt', direction: 'asc'}])
                .child(orderDocumentViews(S)),
            ),
          S.listItem()
            .id('orders-fulfilled')
            .title('Fulfilled')
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .title('Fulfilled orders')
                .schemaType('order')
                .filter('_type == "order" && defined(fulfilledAt)')
                .defaultOrdering([{field: 'fulfilledAt', direction: 'desc'}])
                .child(orderDocumentViews(S)),
            ),
          S.listItem()
            .id('orders-paid')
            .title('Paid')
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .title('Paid orders')
                .schemaType('order')
                .filter('_type == "order" && paymentStatus == "paid"')
                .defaultOrdering([{field: 'createdAt', direction: 'desc'}])
                .child(orderDocumentViews(S)),
            ),
          S.listItem()
            .id('orders-unpaid')
            .title('Unpaid / Failed')
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .title('Unpaid orders')
                .schemaType('order')
                .filter(
                  '_type == "order" && !(coalesce(status, "") in ["expired"]) && !(coalesce(paymentStatus, "") in ["paid", "expired"])',
                )
                .defaultOrdering([{field: 'createdAt', direction: 'desc'}])
                .child(orderDocumentViews(S)),
            ),
          S.listItem()
            .id('orders-expired-carts')
            .title('Expired checkouts')
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .title('Expired checkouts')
                .schemaType('order')
                .filter('_type == "order" && status == "expired"')
                .defaultOrdering([{field: 'createdAt', direction: 'desc'}])
                .child(orderDocumentViews(S)),
            ),
          S.listItem()
            .id('orders-recent')
            .title('Recent (Last 30 days)')
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .title('Recent orders')
                .schemaType('order')
                .filter(
                  '_type == "order" && dateTime(createdAt) > dateTime(now()) - 60*60*24*30',
                )
                .defaultOrdering([{field: 'createdAt', direction: 'desc'}])
                .child(orderDocumentViews(S)),
            ),
          S.divider(),
          S.listItem()
            .id('orders-invoices')
            .title('Invoices')
            .child(
              S.documentTypeList('invoice')
                .title('Invoices')
                .apiVersion(API_VERSION)
                .filter('_type == "invoice"')
                .defaultOrdering([{field: 'invoiceDate', direction: 'desc'}]),
            ),
        ]),
    )

const createShippingList = (S: any) =>
  S.listItem()
    .id('shipping')
    .title('Shipping')
    .icon(PackageIcon)
    .child(
      S.list()
        .title('Shipping')
        .items([
          S.documentTypeListItem('shippingLabel').title('Shipping labels'),
          S.documentTypeListItem('shippingOption').title('Shipping options'),
        ]),
    )

const createQuotesList = (S: any) =>
  S.listItem()
    .id('quotes')
    .title('Quotes')
    .icon(DocumentIcon)
    .child(
      S.list()
        .title('Quotes')
        .items([
          S.documentTypeListItem('quote')
            .title('All quotes')
            .child(
              S.documentTypeList('quote')
                .title('All quotes')
                .apiVersion(API_VERSION)
                .filter('_type == "quote"')
                .defaultOrdering([{field: '_createdAt', direction: 'desc'}]),
            ),
          S.documentTypeListItem('freightQuote')
            .title('Freight quotes')
            .child(
              S.documentTypeList('freightQuote')
                .title('Freight quotes')
                .apiVersion(API_VERSION)
                .filter('_type == "freightQuote"')
                .defaultOrdering([{field: '_createdAt', direction: 'desc'}]),
            ),
          S.documentTypeListItem('wheelQuote')
            .title('Wheel quotes')
            .child(
              S.documentTypeList('wheelQuote')
                .title('Wheel quotes')
                .apiVersion(API_VERSION)
                .filter('_type == "wheelQuote"')
                .defaultOrdering([{field: '_createdAt', direction: 'desc'}]),
            ),
        ]),
    )

const createProductsList = (S: any) =>
  S.listItem()
    .id('products')
    .title('Products')
    .icon(PackageIcon)
    .child(
      S.list()
        .title('Products')
        .items([
          S.documentTypeListItem('product')
            .title('All products')
            .child(
              S.documentTypeList('product')
                .title('All products')
                .apiVersion(API_VERSION)
                .filter('_type == "product"')
                .defaultOrdering([{field: '_updatedAt', direction: 'desc'}])
                .child(productDocumentViews(S)),
            ),
          S.divider(),
          S.listItem()
            .id('products-active')
            .title('Active')
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .title('Active products')
                .schemaType('product')
                .filter('_type == "product" && (status == "active" || !defined(status))')
                .defaultOrdering([{field: 'title', direction: 'asc'}])
                .child(productDocumentViews(S)),
            ),
          S.listItem()
            .id('products-draft')
            .title('Draft')
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .title('Draft products')
                .schemaType('product')
                .filter('_type == "product" && status == "draft"')
                .defaultOrdering([{field: '_updatedAt', direction: 'desc'}])
                .child(productDocumentViews(S)),
            ),
          S.listItem()
            .id('products-paused')
            .title('Paused')
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .title('Paused products')
                .schemaType('product')
                .filter('_type == "product" && status == "paused"')
                .defaultOrdering([{field: '_updatedAt', direction: 'desc'}])
                .child(productDocumentViews(S)),
            ),
          S.listItem()
            .id('products-archived')
            .title('Archived')
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .title('Archived products')
                .schemaType('product')
                .filter('_type == "product" && status == "archived"')
                .defaultOrdering([{field: '_updatedAt', direction: 'desc'}])
                .child(productDocumentViews(S)),
            ),
          S.listItem()
            .id('products-out-of-stock')
            .title('Out of stock')
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .title('Out of stock products')
                .schemaType('product')
                .filter('_type == "product" && coalesce(inventory.quantity, 0) <= 0')
                .defaultOrdering([{field: 'title', direction: 'asc'}])
                .child(productDocumentViews(S)),
            ),
          S.divider(),
          S.documentTypeListItem('category').title('Categories'),
          productsByCategory(S),
          S.documentTypeListItem('collection').title('Collections'),
          S.documentTypeListItem('productBundle').title('Bundles'),
          S.documentTypeListItem('vehicleModel').title('Vehicle models'),
          S.documentTypeListItem('tune').title('Tunes'),
        ]),
    )

const createCustomersList = (S: any) =>
  S.listItem()
    .id('customers')
    .title('Customers')
    .icon(UserIcon)
    .child(
      S.list()
        .title('Customers')
        .items([
          S.documentTypeListItem('customer')
            .title('All customers')
            .child(
              S.documentTypeList('customer')
                .apiVersion(API_VERSION)
                .title('All customers')
                .filter('_type == "customer"')
                .defaultOrdering([
                  {field: 'lifetimeSpend', direction: 'desc'},
                  {field: 'orderCount', direction: 'desc'},
                ]),
            ),
          S.divider(),
          S.listItem()
            .id('customers-subscribed')
            .title('Subscribed to email')
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .title('Subscribed customers')
                .schemaType('customer')
                .filter('_type == "customer" && (emailOptIn == true || marketingOptIn == true)')
                .defaultOrdering([{field: '_updatedAt', direction: 'desc'}]),
            ),
          S.listItem()
            .id('customers-inactive')
            .title('No orders yet')
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .title('Customers with no orders')
                .schemaType('customer')
                .filter('_type == "customer" && coalesce(orderCount, 0) == 0')
                .defaultOrdering([{field: '_createdAt', direction: 'desc'}]),
            ),
          S.listItem()
            .id('customers-recent')
            .title('Recently added')
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .title('Recently added customers')
                .schemaType('customer')
                .filter('_type == "customer"')
                .defaultOrdering([{field: '_createdAt', direction: 'desc'}]),
            ),
        ]),
    )

const createFinanceList = (S: any) =>
  S.listItem()
    .id('finance')
    .title('Finance')
    .icon(BillIcon)
    .child(
      S.list()
        .title('Finance')
        .items([
          S.documentTypeListItem('invoice')
            .title('Invoices')
            .child(
              S.documentTypeList('invoice')
                .title('Invoices')
                .apiVersion(API_VERSION)
                .filter('_type == "invoice"')
                .defaultOrdering([{field: 'invoiceDate', direction: 'desc'}]),
            ),
          S.documentTypeListItem('bill')
            .title('Bills')
            .child(
              S.documentTypeList('bill')
                .title('Bills')
                .apiVersion(API_VERSION)
                .filter('_type == "bill"')
                .defaultOrdering([{field: 'issueDate', direction: 'desc'}]),
            ),
          S.documentTypeListItem('check')
            .title('Checks')
            .child(
              S.documentTypeList('check')
                .title('Checks')
                .apiVersion(API_VERSION)
                .filter('_type == "check"')
                .defaultOrdering([{field: 'checkDate', direction: 'desc'}]),
            ),
          S.documentTypeListItem('expense')
            .title('Expenses')
            .child(
              S.documentTypeList('expense')
                .title('Expenses')
                .apiVersion(API_VERSION)
                .filter('_type == "expense"')
                .defaultOrdering([{field: 'date', direction: 'desc'}]),
            ),
          S.divider(),
          S.documentTypeListItem('bankAccount').title('Bank accounts'),
          S.documentTypeListItem('vendor').title('Vendors'),
        ]),
    )

const createSettingsList = (S: any) =>
  S.listItem()
    .id('settings')
    .title('Studio settings')
    .icon(CogIcon)
    .child(
      S.list()
        .title('Studio settings')
        .items([
          S.documentTypeListItem('filterTag').title('Filter tags'),
          S.documentTypeListItem('colorTheme').title('Color themes'),
          S.documentTypeListItem('page').title('Pages'),
        ]),
    )

const createOnlineStoreSection = (S: any) =>
  S.listItem()
    .id('sales-online-store')
    .title('Online Store')
    .icon(BasketIcon)
    .child(
      S.list()
        .title('Online Store')
        .items([
          createOrdersList(S),
          S.divider(),
          S.listItem()
            .id('online-store-expired-carts')
            .title('Abandoned carts')
            .icon(BasketIcon)
            .child(
              S.documentTypeList('expiredCart')
                .apiVersion(API_VERSION)
                .title('Abandoned carts')
                .defaultOrdering([{field: '_createdAt', direction: 'desc'}]),
            ),
          S.listItem()
            .id('online-store-payment-links')
            .title('Payment links')
            .icon(LinkIcon)
            .child(
              S.documentTypeList('paymentLink')
                .apiVersion(API_VERSION)
                .title('Payment links')
                .defaultOrdering([{field: '_createdAt', direction: 'desc'}]),
            ),
        ]),
    )

const createInStoreSection = (S: any) =>
  S.listItem()
    .id('in-store-service')
    .title('In-Store & Service')
    .icon(PackageIcon)
    .child(
      S.list()
        .title('In-Store & Service')
        .items([
          createQuotesList(S),
          S.listItem()
            .id('in-store-appointments')
            .title('Appointments')
            .icon(CalendarIcon)
            .child(
              S.documentTypeList('booking')
                .apiVersion(API_VERSION)
                .title('Appointments'),
            ),
        ]),
    )

const createSalesOperationsSection = (S: any) =>
  S.listItem()
    .id('sales-operations')
    .title('Sales & Operations')
    .icon(TrolleyIcon)
    .child(
      S.list()
        .title('Sales & Operations')
        .items([
          createOnlineStoreSection(S),
          S.divider(),
          createInStoreSection(S),
          S.divider(),
          createShippingList(S),
          S.divider(),
          S.listItem()
            .id('shipping-calendar')
            .title('Shipping calendar')
            .icon(CalendarIcon)
            .child(
              S.component()
                .id('shipping-calendar-pane')
                .title('Shipping calendar')
                .component(ShippingCalendar as any),
            ),
        ]),
    )

const createBusinessDashboardSection = (S: any) =>
  S.listItem()
    .id('business-dashboard')
    .title('Business Dashboard')
    .icon(BarChartIcon)
    .child(
      S.list()
        .title('Business Dashboard')
        .items([
          createProductsList(S),
          S.divider(),
          createCustomersList(S),
          S.divider(),
          createFinanceList(S),
          S.divider(),
          S.listItem()
            .id('business-sales-channels')
            .title('Sales channels')
            .icon(TagIcon)
            .child(
              S.documentTypeList('marketingChannel')
                .apiVersion(API_VERSION)
                .title('Sales channels')
                .defaultOrdering([{field: '_createdAt', direction: 'desc'}]),
            ),
        ]),
    )

const createMarketingSection = (S: any) =>
  S.listItem()
    .id('marketing')
    .title('Marketing')
    .icon(ChartUpwardIcon)
    .child(
      S.list()
        .title('Marketing')
        .items([
          S.documentTypeListItem('campaign').title('Campaigns'),
          S.documentTypeListItem('attribution').title('Attribution'),
        ]),
    )

const createAdministrationSection = (S: any) =>
  S.listItem()
    .id('administration')
    .title('Administration')
    .icon(WrenchIcon)
    .child(
      S.list()
        .title('Administration')
        .items([
          S.listItem()
            .id('admin-tools')
            .title('Admin tools')
            .icon(WrenchIcon)
            .child(
              S.component()
                .id('admin-tools-pane')
                .title('Admin tools')
                .component(AdminTools as any),
            ),
          S.divider(),
          createSettingsList(S),
          S.divider(),
          S.listItem()
            .id('administration-site-settings')
            .title('Site settings')
            .icon(CogIcon)
            .child(
              S.document().schemaType('settings').documentId('settings'),
            ),
          S.listItem()
            .id('administration-integrations')
            .title('Integrations')
            .icon(PlugIcon)
            .child(
              S.list()
                .title('Integrations')
                .items([
                  S.documentTypeListItem('stripeWebhook').title('Stripe webhooks'),
                  S.documentTypeListItem('stripeWebhookEvent').title('Stripe webhook events'),
                ]),
            ),
        ]),
    )

const createOnlineStorePlaceholder = (S: any) =>
  S.listItem()
    .id('online-store')
    .title('Online store tooling')
    .icon(BasketIcon)
    .child(
      S.component()
        .id('online-store-pane')
        .title('Online store')
        .component(ComingSoonPane as any)
        .options({
          title: 'Online store tooling',
          description:
            'Integration with the FAS CMS is on the roadmap. Soon you will be able to edit storefront content from here.',
        }),
    )

export const deskStructure: StructureResolver = (S) =>
  S.list()
    .title('FAS Dashboard')
    .items([
      S.listItem()
        .id('home')
        .title('Home')
        .icon(HomeIcon)
        .child(
          S.component()
            .id('home-pane')
            .title('Home')
            .component(HomePane as any),
        ),
      S.divider(),
      createSalesOperationsSection(S),
      S.divider(),
      createBusinessDashboardSection(S),
      S.divider(),
      createMarketingSection(S),
      S.divider(),
      createAdministrationSection(S),
      S.divider(),
      createOnlineStorePlaceholder(S),
    ])

export default deskStructure
