import React, {type ComponentType} from 'react'
import type {StructureResolver} from 'sanity/structure'
import {
  BarChartIcon,
  BasketIcon,
  BillIcon,
  CheckmarkCircleIcon,
  ClipboardIcon,
  ClockIcon,
  CreditCardIcon,
  EnvelopeIcon,
  HomeIcon,
  BulbOutlineIcon,
  LinkIcon,
  PackageIcon,
  PresentationIcon,
  RocketIcon,
  TagIcon,
  TrashIcon,
  TrolleyIcon,
  UserIcon,
  WarningOutlineIcon,
  WrenchIcon,
} from '@sanity/icons'
import HomePane from '../components/studio/HomePane'
import AdminTools from '../components/studio/AdminTools'
import {downloadsStructure} from '../structure/downloadsStructure'
import MerchantFeedPreview from '../components/studio/MerchantFeedPreview'
import MerchantCenterDashboard from '../components/studio/MerchantCenterDashboard'
import AttributionDashboard from '../components/studio/AttributionDashboard'
import ComingSoonPane from '../components/studio/ComingSoonPane'
import {EXPIRED_SESSION_PANEL_TITLE} from '../utils/orderFilters'
import {
  AbandonedOrdersDocumentTable,
  OrdersDocumentTable,
  PaymentLinksDocumentTable,
  ProductsDocumentTable,
  CustomersDocumentTable,
} from '../components/studio/documentTables'
import {CogIcon} from '@sanity/icons'
import StripeAnalyticsDashboard from './components/StripeAnalyticsDashboard'

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

const ProductsPausedTableView: ComponentType = () =>
  React.createElement(ProductsDocumentTable as any, {
    title: 'Paused',
    pageSize: 12,
    baseFilter: 'status == "paused"',
    initialStatusFilter: 'paused',
  })

const ProductsArchivedTableView: ComponentType = () =>
  React.createElement(ProductsDocumentTable as any, {
    title: 'Archived',
    pageSize: 12,
    baseFilter: 'status == "archived"',
    initialStatusFilter: 'archived',
  })

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

type OrderWorkflowConfig = {
  id: string
  title: string
  filter: string
  icon: ComponentType
}

const ORDER_WORKFLOW_ITEMS: OrderWorkflowConfig[] = [
  {
    id: 'needs-fulfillment',
    title: '🔴 Needs Fulfillment',
    icon: PackageIcon,
    filter:
      '_type == "order" && status == "paid" && !defined(manualTrackingNumber) && !defined(trackingNumber)',
  },
  {
    id: 'ready-to-ship',
    title: '📦 Ready to Ship',
    icon: TrolleyIcon,
    filter:
      '_type == "order" && status == "paid" && (defined(manualTrackingNumber) || defined(trackingNumber)) && status != "shipped"',
  },
  {
    id: 'shipped',
    title: '🚚 Shipped',
    icon: RocketIcon,
    filter: '_type == "order" && status == "shipped"',
  },
  {
    id: 'fulfilled',
    title: '✅ Fulfilled',
    icon: CheckmarkCircleIcon,
    filter: '_type == "order" && status == "fulfilled"',
  },
  {
    id: 'recent-orders',
    title: '⏰ Recent Orders (Last 30 Days)',
    icon: ClockIcon,
    filter:
      '_type == "order" && status == "paid" && dateTime(createdAt) > dateTime(now()) - 60*60*24*30',
  },
  {
    id: 'all-paid-orders',
    title: '💰 All Paid Orders',
    icon: CreditCardIcon,
    filter: '_type == "order" && status == "paid"',
  },
  {
    id: 'cancelled-refunded',
    title: '⚠️ Cancelled & Refunded',
    icon: WarningOutlineIcon,
    filter: '_type == "order" && (status == "cancelled" || status == "refunded")',
  },
  {
    id: 'expired-carts',
    title: '🗑️ Expired Carts',
    icon: TrashIcon,
    filter: '_type == "order" && status == "expired"',
  },
  {
    id: 'all-orders',
    title: '📋 All Orders',
    icon: ClipboardIcon,
    filter: '_type == "order"',
  },
]

const createOrderWorkflowList = (S: any) => {
  const baseOrderList = S.documentTypeList('order').apiVersion(API_VERSION)
  return S.listItem()
    .id('order-workflows')
    .title('Order workflow views')
    .icon(TrolleyIcon)
    .child(
      S.list()
        .title('Order workflow views')
        .items(
          ORDER_WORKFLOW_ITEMS.map((item) =>
            S.listItem()
              .id(item.id)
              .title(item.title)
              .icon(item.icon)
              .child(
                S.documentList()
                  .apiVersion(API_VERSION)
                  .title(item.title)
                  .filter(item.filter)
                  .defaultOrdering([{field: 'createdAt', direction: 'desc'}])
                  .initialValueTemplates(baseOrderList.getInitialValueTemplates())
                  .menuItems(baseOrderList.getMenuItems())
                  .canHandleIntent(baseOrderList.getCanHandleIntent()),
              ),
          ),
        ),
    )
}

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
            .id('products-paused')
            .title('Paused')
            .child(documentTablePane(S, 'products-paused', 'Paused', ProductsPausedTableView)),
          S.listItem()
            .id('products-archived')
            .title('Archived')
            .child(
              documentTablePane(S, 'products-archived', 'Archived', ProductsArchivedTableView),
            ),
          S.divider(),
          S.documentTypeListItem('category').title('Categories'),
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
          S.divider(),
          S.documentTypeListItem('invoice').title('Invoices'),
          S.documentTypeListItem('quote').title('Quotes'),
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
          S.documentTypeListItem('bankAccount').title('Bank accounts'),
          S.divider(),
          S.listItem()
            .id('finance-analytics')
            .title('Analytics (Stripe Overview)')
            .child(
              S.component()
                .id('finance-analytics-pane')
                .title('Stripe Analytics')
                .component(StripeAnalyticsDashboard as ComponentType),
            ),
        ]),
    )

const createSalesOperationsSection = (S: any) =>
  S.listItem()
    .id('Orders')
    .title('Orders')
    .icon(TrolleyIcon)
    .child(
      S.list()
        .title('Orders')
        .items([
          createOrderWorkflowList(S),
          S.divider(),
          createOrdersList(S),
          S.divider(),
          createAbandonedCartsPane(S),
          S.divider(),
          createPaymentLinksPane(S),
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

const MarketingAnalyticsPane: ComponentType = () =>
  React.createElement(ComingSoonPane as any, {
    title: 'Marketing Analytics',
    description: 'Integrated campaign ROI reporting is coming soon.',
    actions: [
      {
        label: 'View sales dashboard',
        href: '#',
      },
    ],
  })

const createMarketingSection = (S: any) =>
  S.listItem()
    .id('marketing')
    .title('Marketing')
    .icon(BarChartIcon)
    .child(
      S.list()
        .title('Marketing')
        .items([
          S.listItem()
            .id('merchant-feed-validator')
            .title('🛍️ Product Feed Validator')
            .icon(BasketIcon)
            .child(
              S.component()
                .id('merchant-feed-preview')
                .title('Product Feed Validator')
                .component(MerchantFeedPreview as any),
            ),
          S.listItem()
            .id('merchant-center-dashboard')
            .title('Merchant Center Dashboard')
            .icon(PresentationIcon)
            .child(
              S.component()
                .id('merchant-center-dashboard-pane')
                .title('Merchant Center Dashboard')
                .component(MerchantCenterDashboard as any),
            ),
          S.listItem()
            .id('attribution-dashboard')
            .title('Attribution')
            .icon(LinkIcon)
            .child(
              S.component()
                .id('attribution-dashboard-pane')
                .title('Attribution Dashboard')
                .component(AttributionDashboard as any),
            ),
          S.divider(),
          S.listItem()
            .id('email-marketing')
            .title('📧 Email Campaigns')
            .icon(EnvelopeIcon)
            .child(
              S.list()
                .title('Email Marketing')
                .items([
                  S.listItem()
                    .title('Email Campaigns')
                    .icon(EnvelopeIcon)
                    .child(S.documentTypeList('emailCampaign').title('Email Campaigns')),
                  S.divider(),
                  S.listItem()
                    .title('Email Subscribers')
                    .schemaType('marketingOptIn')
                    .child(
                      S.documentList()
                        .apiVersion(API_VERSION)
                        .title('Email Subscribers')
                        .filter('_type == "marketingOptIn"'),
                    ),
                ]),
            ),
          S.divider(),
          S.listItem()
            .id('marketing-campaigns')
            .title('🎯 Campaigns')
            .icon(BulbOutlineIcon)
            .child(
              S.documentTypeList('shoppingCampaign')
                .apiVersion(API_VERSION)
                .title('Campaigns')
                .defaultOrdering([{field: '_updatedAt', direction: 'desc'}]),
            ),
          S.divider(),
          S.listItem()
            .id('marketing-analytics')
            .title('📈 Analytics')
            .icon(BarChartIcon)
            .child(
              S.component()
                .id('marketing-analytics-pane')
                .title('Marketing Analytics')
                .component(MarketingAnalyticsPane as any),
            ),
          S.divider(),
          createSalesChannelsList(S),
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
      createSalesOperationsSection(S),
      S.divider(),
      createProductsList(S),
      S.divider(),
      createCustomersList(S),
      S.divider(),
      createMarketingSection(S),
      S.divider(),
      createFinanceList(S),
      S.divider(),
      S.listItem()
        .id('admin-tools')
        .title('Admin Tools')
        .icon(WrenchIcon)
        .child(
          S.component()
            .id('admin-tools-pane')
            .title('Admin Tools')
            .component(AdminTools as any),
        ),
      S.divider(),
      S.listItem()
        .id('print-settings')
        .title('Print Settings')
        .icon(CogIcon)
        .child(
          S.document()
            .schemaType('printSettings')
            .documentId('printSettings')
            .title('Print & PDF Settings'),
        ),
      S.divider(),
      downloadsStructure(S),
    ])
export default deskStructure
