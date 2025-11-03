import React, {type ComponentType} from 'react'
import type {StructureResolver} from 'sanity/structure'
import {
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
import ProductEditorPane from '../components/studio/ProductEditorPane'
import ShippingCalendar from '../components/studio/ShippingCalendar'
import AdminTools from '../components/studio/AdminTools'
import DownloadsPreviewList from '../components/studio/downloads/DownloadsPreviewList'
import {EXPIRED_SESSION_PANEL_TITLE} from '../utils/orderFilters'
import {
  AbandonedOrdersDocumentTable,
  OrdersDocumentTable,
  PaymentLinksDocumentTable,
  ProductsDocumentTable,
  CustomersDocumentTable,
} from '../components/studio/documentTables'

const API_VERSION = '2024-10-01'

const documentTablePane = (S: any, id: string, title: string, component: ComponentType) =>
  S.document()
    .schemaType('dashboardView')
    .documentId(`dashboard-${id}`)
    .title(title)
    .views([
      S.view
        .component(component as any)
        .title(title)
        .id(`${id}-table`),
    ])

const ProductsAllTableView: ComponentType = () =>
  React.createElement(ProductsDocumentTable as any, {title: 'All products', pageSize: 12})

const CustomersAllTableView: ComponentType = () =>
  React.createElement(CustomersDocumentTable as any, {title: 'All customers', pageSize: 10})

const CustomersSubscribedTableView: ComponentType = () =>
  React.createElement(CustomersDocumentTable as any, {
    title: 'Subscribed to email',
    filter: '(emailOptIn == true || marketingOptIn == true)',
    emptyState: 'No subscribed customers',
    pageSize: 10,
  })

const CustomersNoOrdersTableView: ComponentType = () =>
  React.createElement(CustomersDocumentTable as any, {
    title: 'No orders yet',
    filter: 'coalesce(orderCount, 0) == 0',
    emptyState: 'All customers have orders',
    pageSize: 10,
  })

const CustomersRecentlyAddedTableView: ComponentType = () =>
  React.createElement(CustomersDocumentTable as any, {
    title: 'Recently added',
    orderings: [
      {field: '_createdAt', direction: 'desc'},
      {field: '_updatedAt', direction: 'desc'},
    ],
    pageSize: 10,
  })

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
    .title('Orders list')
    .icon(TrolleyIcon)
    .child(documentTablePane(S, 'orders', 'Orders list', OrdersDocumentTable))

const createAbandonedCartsPane = (S: any) =>
  S.listItem()
    .id('online-store-abandoned-carts')
    .title(EXPIRED_SESSION_PANEL_TITLE)
    .icon(BasketIcon)
    .child(
      documentTablePane(
        S,
        'abandoned-carts',
        EXPIRED_SESSION_PANEL_TITLE,
        AbandonedOrdersDocumentTable,
      ),
    )

const createPaymentLinksPane = (S: any) =>
  S.listItem()
    .id('online-store-payment-links')
    .title('Payment links')
    .icon(LinkIcon)
    .child(documentTablePane(S, 'payment-links', 'Payment links', PaymentLinksDocumentTable))

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

const createProductsList = (S: any) =>
  S.listItem()
    .id('products')
    .title('Products')
    .icon(PackageIcon)
    .child(
      S.list()
        .title('Products')
        .items([
          S.listItem()
            .id('products-all')
            .title('All products')
            .child(documentTablePane(S, 'products-all', 'All products', ProductsAllTableView)),
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
          S.listItem()
            .id('customers-all')
            .title('All customers')
            .child(documentTablePane(S, 'customers-all', 'All customers', CustomersAllTableView)),
          S.divider(),
          S.listItem()
            .id('customers-subscribed')
            .title('Subscribed to email')
            .child(
              documentTablePane(
                S,
                'customers-subscribed',
                'Subscribed to email',
                CustomersSubscribedTableView,
              ),
            ),
          S.listItem()
            .id('customers-inactive')
            .title('No orders yet')
            .child(
              documentTablePane(
                S,
                'customers-no-orders',
                'No orders yet',
                CustomersNoOrdersTableView,
              ),
            ),
          S.listItem()
            .id('customers-recent')
            .title('Recently added')
            .child(
              documentTablePane(
                S,
                'customers-recent',
                'Recently added',
                CustomersRecentlyAddedTableView,
              ),
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

const createSalesOperationsSection = (S: any) =>
  S.listItem()
    .id('sales-operations')
    .title('Sales & Operations')
    .icon(TrolleyIcon)
    .child(
      S.list()
        .title('Sales & Operations')
        .items([
          createOrdersList(S),
          S.divider(),
          createAbandonedCartsPane(S),
          S.divider(),
          createPaymentLinksPane(S),
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

const createSalesChannelsList = (S: any) =>
  S.listItem()
    .id('sales-channels')
    .title('Sales channels')
    .icon(TagIcon)
    .child(
      S.documentTypeList('marketingChannel')
        .apiVersion(API_VERSION)
        .title('Sales channels')
        .defaultOrdering([{field: '_createdAt', direction: 'desc'}]),
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
          createFinanceList(S),
          S.divider(),
          createSettingsList(S),
          S.divider(),
          S.listItem()
            .id('administration-site-settings')
            .title('Site settings')
            .icon(CogIcon)
            .child(S.document().schemaType('settings').documentId('settings')),
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
      createProductsList(S),
      S.divider(),
      createCustomersList(S),
      S.divider(),
      createSalesChannelsList(S),
      S.divider(),
      createSalesOperationsSection(S),
      S.divider(),
      createMarketingSection(S),
      S.divider(),
      createAdministrationSection(S),
      S.divider(),
      S.listItem()
        .id('downloads')
        .title('Downloads')
        .icon(DocumentIcon)
        .child(
          S.component()
            .id('downloads-preview')
            .title('Downloads')
            .component(DownloadsPreviewList as any),
        ),
    ])

export default deskStructure
