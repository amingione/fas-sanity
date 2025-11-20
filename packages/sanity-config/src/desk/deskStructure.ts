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
  DocumentIcon,
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
  CaseIcon,
  CalendarIcon,
  ActivityIcon,
  BoltIcon,
  PauseIcon,
} from '@sanity/icons'
import HomePane from '../components/studio/HomePane'
import AdminTools from '../components/studio/AdminTools'
import {downloadsStructure} from '../structure/downloadsStructure'
import MerchantFeedPreview from '../components/studio/MerchantFeedPreview'
import MerchantCenterDashboard from '../components/studio/MerchantCenterDashboard'
import AttributionDashboard from '../components/studio/AttributionDashboard'
import CampaignPerformance from '../components/studio/CampaignPerformance'
import ComingSoonPane from '../components/studio/ComingSoonPane'
import InventoryDashboard from '../components/studio/InventoryDashboard'
import {
  OrdersDocumentTable,
  ProductsDocumentTable,
  CustomersDocumentTable,
  AbandonedOrdersDocumentTable,
  PaymentLinksDocumentTable,
} from '../components/studio/documentTables'
import {CogIcon} from '@sanity/icons'
import TodayScheduleDashboard from '../components/studio/TodayScheduleDashboard'
import AppointmentCalendarPane from '../components/studio/AppointmentCalendarPane'
import AppointmentBookingPane from '../components/studio/AppointmentBookingPane'
import WorkOrderManagementPane from '../components/studio/WorkOrderManagementPane'
import WholesaleOrdersPane from '../components/studio/WholesaleOrdersPane'
import BulkFulfillmentConsole from '../components/studio/BulkFulfillmentConsole'
import BulkPackingSlipGenerator from '../components/studio/BulkPackingSlipGenerator'
import SalesAnalyticsDashboard from '../components/studio/SalesAnalyticsDashboard'
import OperationsDashboard from '../components/studio/OperationsDashboard'
import WholesaleDashboard from '../components/studio/WholesaleDashboard'
import VendorDashboard from '../components/studio/VendorDashboard'
import WholesalePricingCalculator from '../components/studio/WholesalePricingCalculator'
import ProfitMarginAnalysis from '../components/studio/ProfitMarginAnalysis'
import CustomerAnalyticsDashboard from '../components/studio/CustomerAnalyticsDashboard'
import FinancialDashboard from '../components/studio/FinancialDashboard'
import ExpenseManager from '../components/studio/ExpenseManager'
import ProductProfitability from '../components/studio/ProductProfitability'
import AccountsReceivable from '../components/studio/AccountsReceivable'
import FinancialReports from '../components/studio/FinancialReports'
import {INVENTORY_DOCUMENT_TYPE} from '../../../../shared/docTypes'

const API_VERSION = '2024-10-01'

const startOfMonth = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
const addMonths = (date: Date, offset: number) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1))
const formatPeriod = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`

const nowUtc = new Date()
const monthStart = startOfMonth(nowUtc)
const currentPeriod = formatPeriod(monthStart)
const twelveMonthsAgo = formatPeriod(addMonths(monthStart, -11))
const yearPrefix = `${monthStart.getUTCFullYear()}-*`
const monthStartIso = monthStart.toISOString()
const nowIso = new Date().toISOString()
const yearStartIso = new Date(Date.UTC(monthStart.getUTCFullYear(), 0, 1)).toISOString()
const WHOLESALE_INVOICE_FILTER = '_type == "invoice" && orderRef->orderType == "wholesale"'
const EXPENSE_CATEGORIES = [
  {title: 'Materials/Parts', value: 'materials'},
  {title: 'Labor', value: 'labor'},
  {title: 'Rent/Utilities', value: 'rent_utilities'},
  {title: 'Marketing/Advertising', value: 'marketing'},
  {title: 'Equipment', value: 'equipment'},
  {title: 'Insurance', value: 'insurance'},
  {title: 'Shipping/Freight', value: 'shipping'},
  {title: 'Software/Tools', value: 'software'},
  {title: 'Phone/Internet', value: 'communications'},
  {title: 'Vehicle/Fuel', value: 'vehicle'},
  {title: 'Office Supplies', value: 'office'},
  {title: 'Training/Education', value: 'training'},
  {title: 'Legal/Professional', value: 'legal'},
  {title: 'Bank Fees', value: 'bank_fees'},
  {title: 'Other', value: 'other'},
]

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

const CustomersVipTableView: ComponentType = () =>
  React.createElement(CustomersDocumentTable as any, {
    title: 'VIP customers',
    pageSize: 10,
    filter: 'segment == "vip"',
    emptyState: 'No VIP customers yet',
  })

const CustomersRepeatTableView: ComponentType = () =>
  React.createElement(CustomersDocumentTable as any, {
    title: 'Repeat customers',
    pageSize: 10,
    filter: 'segment == "repeat"',
    emptyState: 'No repeat customers yet',
  })

const CustomersNewTableView: ComponentType = () =>
  React.createElement(CustomersDocumentTable as any, {
    title: 'New customers',
    pageSize: 10,
    filter: 'segment == "new"',
    emptyState: 'No new customers yet',
  })

const CustomersAtRiskTableView: ComponentType = () =>
  React.createElement(CustomersDocumentTable as any, {
    title: 'At-risk customers',
    pageSize: 10,
    filter: 'segment == "at_risk"',
    emptyState: 'No at-risk customers',
  })

const CustomersInactiveTableView: ComponentType = () =>
  React.createElement(CustomersDocumentTable as any, {
    title: 'Inactive customers',
    pageSize: 10,
    filter: 'segment == "inactive"',
    emptyState: 'No inactive customers recorded',
  })

const OrdersListTableView: ComponentType = () =>
  React.createElement(OrdersDocumentTable as any, {title: 'Orders', pageSize: 12})

const OnlineOrdersTableView: ComponentType = () =>
  React.createElement(OrdersDocumentTable as any, {
    title: 'Online Orders',
    pageSize: 10,
    filter: '!defined(orderType) || orderType == "online"',
  })

const WholesaleOrdersTableView: ComponentType = () =>
  React.createElement(OrdersDocumentTable as any, {
    title: 'Wholesale Orders',
    pageSize: 10,
    filter: 'orderType == "wholesale"',
  })

const InStoreOrdersTableView: ComponentType = () =>
  React.createElement(OrdersDocumentTable as any, {
    title: 'In-Store Orders',
    pageSize: 10,
    filter: 'orderType == "in-store"',
  })

const WholesalePricingTableView: ComponentType = () =>
  React.createElement(ProductsDocumentTable as any, {
    title: 'Wholesale Pricing',
    pageSize: 10,
    baseFilter: 'coalesce(availableForWholesale, false) == true',
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
    title: 'Needs Fulfillment',
    icon: PackageIcon,
    filter:
      '_type == "order" && status == "paid" && !defined(manualTrackingNumber) && !defined(trackingNumber)',
  },
  {
    id: 'ready-to-ship',
    title: 'Ready to Ship',
    icon: TrolleyIcon,
    filter:
      '_type == "order" && status == "paid" && (defined(manualTrackingNumber) || defined(trackingNumber)) && status != "shipped"',
  },
  {
    id: 'shipped',
    title: 'Shipped',
    icon: RocketIcon,
    filter: '_type == "order" && status == "shipped"',
  },
  {
    id: 'fulfilled',
    title: 'Fulfilled',
    icon: CheckmarkCircleIcon,
    filter: '_type == "order" && status == "fulfilled"',
  },
  {
    id: 'recent-orders',
    title: 'Recent Orders (Last 30 Days)',
    icon: ClockIcon,
    filter:
      '_type == "order" && status == "paid" && dateTime(createdAt) > dateTime(now()) - 60*60*24*30',
  },
  {
    id: 'all-paid-orders',
    title: 'All Paid Orders',
    icon: CreditCardIcon,
    filter: '_type == "order" && status == "paid"',
  },
  {
    id: 'cancelled-refunded',
    title: 'Cancelled & Refunded',
    icon: WarningOutlineIcon,
    filter: '_type == "order" && (status == "cancelled" || status == "refunded")',
  },
  {
    id: 'expired-carts',
    title: 'Expired Carts',
    icon: TrashIcon,
    filter: '_type == "order" && status == "expired"',
  },
  {
    id: 'all-orders',
    title: 'All Orders',
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

const createExpiredCheckoutPane = (S: any) =>
  S.listItem()
    .id('expired-checkouts')
    .title('Expired checkout sessions')
    .icon(BasketIcon)
    .child(
      documentTablePane(
        S,
        'abandoned-carts',
        'Expired checkout sessions',
        AbandonedOrdersDocumentTable as ComponentType,
      ),
    )

const createPaymentLinksPane = (S: any) =>
  S.listItem()
    .id('payment-links')
    .title('Payment links')
    .icon(LinkIcon)
    .child(documentTablePane(S, 'payment-links', 'Payment links', PaymentLinksDocumentTable as any))

const createProductsSection = (S: any) =>
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
            .title('All Products')
            .child(documentTablePane(S, 'products-all', 'All products', ProductsAllTableView)),
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
          S.documentTypeListItem('vehicleModel').title('Vehicle Models'),
          S.documentTypeListItem('tune').title('Tunes'),
        ]),
    )

const createOrdersSection = (S: any) =>
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
            .title('All Orders')
            .icon(ClipboardIcon)
            .child(documentTablePane(S, 'orders-all', 'All Orders', OrdersListTableView)),
          S.listItem()
            .id('orders-online')
            .title('Online Orders')
            .icon(BasketIcon)
            .child(documentTablePane(S, 'orders-online', 'Online Orders', OnlineOrdersTableView)),
          S.listItem()
            .id('orders-in-store')
            .title('In-Store Orders')
            .icon(HomeIcon)
            .child(
              documentTablePane(S, 'orders-in-store', 'In-Store Orders', InStoreOrdersTableView),
            ),
          S.listItem()
            .id('orders-wholesale')
            .title('Wholesale Orders')
            .icon(CaseIcon)
            .child(
              documentTablePane(
                S,
                'orders-wholesale',
                'Wholesale Orders',
                WholesaleOrdersTableView,
              ),
            ),
          S.divider(),
          createOrderWorkflowList(S),
          createExpiredCheckoutPane(S),
          createPaymentLinksPane(S),
        ]),
    )

const createCustomersSection = (S: any) =>
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
            .title('All Customers')
            .icon(UserIcon)
            .child(documentTablePane(S, 'customers-all', 'All Customers', CustomersAllTableView)),
          S.listItem()
            .id('customers-vip')
            .title('💎 VIP Customers')
            .icon(() => '💎')
            .child(
              documentTablePane(S, 'customers-vip', 'VIP Customers', CustomersVipTableView),
            ),
          S.listItem()
            .id('customers-repeat')
            .title('🔁 Repeat Customers')
            .icon(() => '🔁')
            .child(
              documentTablePane(
                S,
                'customers-repeat',
                'Repeat Customers',
                CustomersRepeatTableView,
              ),
            ),
          S.listItem()
            .id('customers-new')
            .title('🆕 New Customers')
            .icon(() => '🆕')
            .child(
              documentTablePane(S, 'customers-new', 'New Customers', CustomersNewTableView),
            ),
          S.listItem()
            .id('customers-at-risk')
            .title('⚠️ At Risk')
            .icon(() => '⚠️')
            .child(
              documentTablePane(
                S,
                'customers-at-risk',
                'At Risk Customers',
                CustomersAtRiskTableView,
              ),
            ),
          S.listItem()
            .id('customers-inactive')
            .title('😴 Inactive')
            .icon(() => '😴')
            .child(
              documentTablePane(
                S,
                'customers-inactive',
                'Inactive Customers',
                CustomersInactiveTableView,
              ),
            ),
          S.listItem()
            .id('customers-subscribed')
            .title('Subscribed to Email')
            .icon(EnvelopeIcon)
            .child(
              documentTablePane(
                S,
                'customers-subscribed',
                'Subscribed to Email',
                CustomersSubscribedTableView,
              ),
            ),
          S.listItem()
            .id('customers-no-orders')
            .title('No Orders Yet')
            .icon(WarningOutlineIcon)
            .child(
              documentTablePane(
                S,
                'customers-no-orders',
                'Customers without orders',
                CustomersNoOrdersTableView,
              ),
            ),
          S.listItem()
            .id('customers-recent')
            .title('Recently Added')
            .icon(ClockIcon)
            .child(
              documentTablePane(
                S,
                'customers-recent',
                'Recently added customers',
                CustomersRecentlyAddedTableView,
              ),
            ),
          S.divider(),
          S.listItem()
            .id('customers-analytics')
            .title('📊 Customer Analytics')
            .icon(BarChartIcon)
            .child(
              S.component()
                .id('customers-analytics-pane')
                .title('Customer Analytics')
                .component(CustomerAnalyticsDashboard as ComponentType),
            ),
        ]),
    )

const createShippingSection = (S: any) =>
  S.listItem()
    .id('shipping')
    .title('Shipping')
    .icon(RocketIcon)
    .child(
      S.list()
        .title('Shipping')
        .items([
          S.listItem()
            .id('shipping-fulfillment')
            .title('Bulk Fulfillment Console')
            .icon(TrolleyIcon)
            .child(
              S.component()
                .id('bulk-fulfillment-pane')
                .title('Bulk Fulfillment Console')
                .component(BulkFulfillmentConsole as ComponentType),
            ),
          S.listItem()
            .id('shipping-packing-slips')
            .title('Bulk Packing Slips')
            .icon(PackageIcon)
            .child(
              S.component()
                .id('bulk-packing-slips-pane')
                .title('Bulk Packing Slip Generator')
                .component(BulkPackingSlipGenerator as ComponentType),
            ),
          S.divider(),
          S.documentTypeListItem('shippingLabel').title('Shipping Labels').icon(DocumentIcon),
          S.documentTypeListItem('freightQuote').title('Freight Quotes').icon(CaseIcon),
          S.documentTypeListItem('shippingOption').title('Shipping Options').icon(TagIcon),
        ]),
    )

const createAppointmentsSection = (S: any) =>
  S.listItem()
    .id('in-store-appointments')
    .title('Appointments')
    .icon(ClockIcon)
    .child(
      S.list()
        .title('Appointments')
        .items([
          S.listItem()
            .id('appointments-booking')
            .title('Book Appointment')
            .icon(DocumentIcon)
            .child(
              S.component()
                .id('appointments-booking-pane')
                .title('Quick Booking')
                .component(AppointmentBookingPane as ComponentType),
            ),
          S.listItem()
            .id('appointments-all')
            .title('All Appointments')
            .icon(ClockIcon)
            .child(
              S.documentTypeList('appointment')
                .apiVersion(API_VERSION)
                .title('All Appointments')
                .defaultOrdering([{field: 'scheduledDate', direction: 'asc'}]),
            ),
          S.listItem()
            .id('appointments-week')
            .title('This Week')
            .icon(CalendarIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('appointment')
                .title('This Week')
                .filter(
                  '_type == "appointment" && dateTime(scheduledDate) >= dateTime(now()) && dateTime(scheduledDate) <= dateTime(now()) + 60*60*24*7',
                )
                .defaultOrdering([{field: 'scheduledDate', direction: 'asc'}]),
            ),
          S.listItem()
            .id('appointments-confirmation')
            .title('Needs Confirmation')
            .icon(WarningOutlineIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('appointment')
                .title('Needs Confirmation')
                .filter('_type == "appointment" && status == "needs_confirmation"')
                .defaultOrdering([{field: 'scheduledDate', direction: 'asc'}]),
            ),
          S.listItem()
            .id('appointments-calendar')
            .title('Calendar View')
            .icon(CalendarIcon)
            .child(
              S.component()
                .id('appointments-calendar-pane')
                .title('Calendared Appointments')
                .component(AppointmentCalendarPane as ComponentType),
            ),
        ]),
    )

const createWorkOrderStatusItem = (
  S: any,
  id: string,
  title: string,
  filter: string,
  icon: ComponentType = WrenchIcon,
) =>
  S.listItem()
    .id(id)
    .title(title)
    .icon(icon)
    .child(
      S.documentList()
        .apiVersion(API_VERSION)
        .schemaType('workOrder')
        .title(title)
        .filter(filter)
        .defaultOrdering([{field: 'startedAt', direction: 'desc'}]),
    )

const createWorkOrdersSection = (S: any) =>
  S.listItem()
    .id('in-store-work-orders')
    .title('Work Orders')
    .icon(WrenchIcon)
    .child(
      S.list()
        .title('Work Orders')
        .items([
          S.listItem()
            .id('work-orders-all')
            .title('All Work Orders')
            .child(
              S.component()
                .id('work-orders-all-pane')
                .title('Work Order Manager')
                .component(WorkOrderManagementPane as ComponentType),
            ),
          createWorkOrderStatusItem(
            S,
            'work-orders-in-progress',
            'In Progress',
            '_type == "workOrder" && status == "in_progress"',
            ActivityIcon,
          ),
          createWorkOrderStatusItem(
            S,
            'work-orders-parts',
            'Waiting for Parts',
            '_type == "workOrder" && status == "waiting_parts"',
            PackageIcon,
          ),
          createWorkOrderStatusItem(
            S,
            'work-orders-approval',
            'Waiting for Approval',
            '_type == "workOrder" && status == "waiting_approval"',
            WarningOutlineIcon,
          ),
          createWorkOrderStatusItem(
            S,
            'work-orders-invoice',
            'Ready to Invoice',
            '_type == "workOrder" && status == "completed" && !defined(invoice)',
            BillIcon,
          ),
        ]),
    )

const createServicesSection = (S: any) =>
  S.listItem()
    .id('in-store-services')
    .title('Services')
    .icon(CogIcon)
    .child(
      S.list()
        .title('Services')
        .items([
          S.listItem()
            .id('services-all')
            .title('All Services')
            .icon(CogIcon)
            .child(
              S.documentTypeList('service')
                .apiVersion(API_VERSION)
                .title('All Services')
                .defaultOrdering([{field: 'title', direction: 'asc'}]),
            ),
          S.listItem()
            .id('services-install')
            .title('Installation Packages')
            .icon(WrenchIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('service')
                .title('Installation Packages')
                .filter('_type == "service" && serviceType == "installation"'),
            ),
          S.listItem()
            .id('services-tuning')
            .title('Tuning Services')
            .icon(BoltIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('service')
                .title('Tuning Services')
                .filter('_type == "service" && serviceType == "tuning"'),
            ),
          S.listItem()
            .id('services-repair')
            .title('Repairs')
            .icon(CheckmarkCircleIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('service')
                .title('Repairs')
                .filter('_type == "service" && serviceType == "repair"'),
            ),
          S.listItem()
            .id('services-maintenance')
            .title('Maintenance')
            .icon(ActivityIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('service')
                .title('Maintenance')
                .filter('_type == "service" && serviceType == "maintenance"'),
            ),
        ]),
    )

const createVehicleDirectory = (S: any) =>
  S.listItem()
    .id('customer-vehicles')
    .title('Customer Vehicles')
    .icon(UserIcon)
    .child(
      S.list()
        .title('Customer Vehicles')
        .items([
          S.listItem()
            .id('vehicles-all')
            .title('All Vehicles')
            .icon(PackageIcon)
            .child(
              S.documentTypeList('vehicle')
                .apiVersion(API_VERSION)
                .title('All Vehicles')
                .defaultOrdering([{field: 'make', direction: 'asc'}]),
            ),
          S.listItem()
            .id('vehicles-in-shop')
            .title('Currently in Shop')
            .icon(WarningOutlineIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('vehicle')
                .title('Currently in Shop')
                .filter(
                  '_type == "vehicle" && count(*[_type == "workOrder" && references(^._id) && status in ["in_progress","waiting_parts","waiting_approval"]]) > 0',
                )
                .defaultOrdering([{field: '_updatedAt', direction: 'desc'}]),
            ),
          S.listItem()
            .id('vehicles-service-history')
            .title('Service History')
            .icon(ClipboardIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('workOrder')
                .title('Vehicle Service History')
                .filter('_type == "workOrder" && defined(vehicle)')
                .defaultOrdering([{field: '_createdAt', direction: 'desc'}]),
            ),
        ]),
    )

const createInStoreOperationsSection = (S: any) =>
  S.listItem()
    .id('in-store-operations')
    .title('Operations')
    .icon(WrenchIcon)
    .child(
      S.list()
        .title('In-Store Operations')
        .items([
          S.listItem()
            .id('operations-dashboard')
            .title('Operations Dashboard')
            .icon(BarChartIcon)
            .child(
              S.component()
                .id('operations-dashboard-pane')
                .title('Operations Dashboard')
                .component(OperationsDashboard as ComponentType),
            ),
          S.listItem()
            .id('today-schedule')
            .title("Today's Schedule")
            .icon(ClockIcon)
            .child(
              S.component()
                .id('today-schedule-pane')
                .title("Today's Schedule")
                .component(TodayScheduleDashboard as ComponentType),
            ),
          createAppointmentsSection(S),
          createWorkOrdersSection(S),
          createServicesSection(S),
          createVehicleDirectory(S),
        ]),
    )

const createInStoreSalesSection = (S: any) =>
  S.listItem()
    .id('in-store-sales')
    .title('Sales')
    .icon(CreditCardIcon)
    .child(
      S.list()
        .title('Sales')
        .items([
          S.listItem()
            .id('in-store-invoices')
            .title('Invoices')
            .icon(ClipboardIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('invoice')
                .title('In-Store Invoices')
                .filter('_type == "invoice" && orderRef->orderType == "in-store"')
                .defaultOrdering([{field: '_createdAt', direction: 'desc'}]),
            ),
          S.listItem()
            .id('in-store-quotes')
            .title('Quotes')
            .icon(DocumentIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('quote')
                .title('In-Store Quotes')
                .filter('_type == "quote" && quoteType == "in-store"')
                .defaultOrdering([{field: '_createdAt', direction: 'desc'}]),
            ),
          S.listItem()
            .id('in-store-orders')
            .title('In-Store Orders')
            .icon(TrolleyIcon)
            .child(
              documentTablePane(
                S,
                'in-store-orders-pane',
                'In-Store Orders',
                InStoreOrdersTableView,
              ),
            ),
          S.listItem()
            .id('sales-reports')
            .title('Sales Reports')
            .icon(BarChartIcon)
            .child(
              S.component()
                .id('sales-reports-pane')
                .title('Sales Reports')
                .component(() =>
                  React.createElement(ComingSoonPane as any, {
                    title: 'Sales Reports',
                    description: 'Detailed reporting dashboard coming soon.',
                  }),
                ),
            ),
        ]),
    )

const createVendorsSubSection = (S: any) =>
  S.listItem()
    .id('wholesale-vendors')
    .title('Vendors')
    .icon(UserIcon)
    .child(
      S.list()
        .title('Vendors')
        .items([
          S.documentTypeListItem('vendor')
            .title('All Vendors')
            .icon(UserIcon)
            .child((documentId: string) =>
              S.document()
                .schemaType('vendor')
                .documentId(documentId)
                .views([
                  S.view.form().title('Details'),
                  S.view.component(VendorDashboard as ComponentType).title('Dashboard'),
                ]),
            ),
          S.listItem()
            .id('vendors-active')
            .title('Active')
            .icon(CheckmarkCircleIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('vendor')
                .title('Active Vendors')
                .filter('_type == "vendor" && status == "active"')
                .child((documentId: string) =>
                  S.document()
                    .schemaType('vendor')
                    .documentId(documentId)
                    .views([
                      S.view.form().title('Details'),
                      S.view.component(VendorDashboard as ComponentType).title('Dashboard'),
                    ]),
                ),
            ),
          S.listItem()
            .id('vendors-on-hold')
            .title('On Hold')
            .icon(PauseIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('vendor')
                .title('Vendors on Hold')
                .filter('_type == "vendor" && status == "on_hold"')
                .child((documentId: string) =>
                  S.document()
                    .schemaType('vendor')
                    .documentId(documentId)
                    .views([
                      S.view.form().title('Details'),
                      S.view.component(VendorDashboard as ComponentType).title('Dashboard'),
                    ]),
                ),
            ),
          S.listItem()
            .id('vendors-needs-attention')
            .title('Over Credit Limit')
            .icon(WarningOutlineIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('vendor')
                .title('Over Credit Limit')
                .filter(
                  '_type == "vendor" && defined(creditLimit) && creditLimit > 0 && currentBalance > creditLimit',
                )
                .defaultOrdering([{field: 'currentBalance', direction: 'desc'}])
                .child((documentId: string) =>
                  S.document()
                    .schemaType('vendor')
                    .documentId(documentId)
                    .views([
                      S.view.form().title('Details'),
                      S.view.component(VendorDashboard as ComponentType).title('Dashboard'),
                    ]),
                ),
            ),
          S.listItem()
            .id('vendors-pricing-tiers')
            .title('By Pricing Tier')
            .icon(TagIcon)
            .child(
              S.list()
                .title('Pricing Tiers')
                .items([
                  S.listItem()
                    .id('vendors-standard')
                    .title('Standard')
                    .icon(TagIcon)
                    .child(
                      S.documentList()
                        .apiVersion(API_VERSION)
                        .schemaType('vendor')
                        .title('Standard Tier')
                        .filter('_type == "vendor" && pricingTier == "standard"')
                        .child((documentId: string) =>
                          S.document()
                            .schemaType('vendor')
                            .documentId(documentId)
                            .views([
                              S.view.form().title('Details'),
                              S.view.component(VendorDashboard as ComponentType).title('Dashboard'),
                            ]),
                        ),
                    ),
                  S.listItem()
                    .id('vendors-preferred')
                    .title('Preferred')
                    .icon(TagIcon)
                    .child(
                      S.documentList()
                        .apiVersion(API_VERSION)
                        .schemaType('vendor')
                        .title('Preferred Tier')
                        .filter('_type == "vendor" && pricingTier == "preferred"')
                        .child((documentId: string) =>
                          S.document()
                            .schemaType('vendor')
                            .documentId(documentId)
                            .views([
                              S.view.form().title('Details'),
                              S.view.component(VendorDashboard as ComponentType).title('Dashboard'),
                            ]),
                        ),
                    ),
                  S.listItem()
                    .id('vendors-platinum')
                    .title('Platinum')
                    .icon(TagIcon)
                    .child(
                      S.documentList()
                        .apiVersion(API_VERSION)
                        .schemaType('vendor')
                        .title('Platinum Tier')
                        .filter('_type == "vendor" && pricingTier == "platinum"')
                        .child((documentId: string) =>
                          S.document()
                            .schemaType('vendor')
                            .documentId(documentId)
                            .views([
                              S.view.form().title('Details'),
                              S.view.component(VendorDashboard as ComponentType).title('Dashboard'),
                            ]),
                        ),
                    ),
                  S.listItem()
                    .id('vendors-custom-tier')
                    .title('Custom Pricing')
                    .icon(TagIcon)
                    .child(
                      S.documentList()
                        .apiVersion(API_VERSION)
                        .schemaType('vendor')
                        .title('Custom Pricing')
                        .filter('_type == "vendor" && pricingTier == "custom"')
                        .child((documentId: string) =>
                          S.document()
                            .schemaType('vendor')
                            .documentId(documentId)
                            .views([
                              S.view.form().title('Details'),
                              S.view.component(VendorDashboard as ComponentType).title('Dashboard'),
                            ]),
                        ),
                    ),
                ]),
            ),
        ]),
    )

const createWholesaleOrdersSubSection = (S: any) =>
  S.listItem()
    .id('wholesale-orders')
    .title('Wholesale Orders')
    .icon(ClipboardIcon)
    .child(
      S.list()
        .title('Wholesale Orders')
        .items([
          S.listItem()
            .id('wholesale-orders-all')
            .title('All Wholesale Orders')
            .icon(CaseIcon)
            .child(
              S.component()
                .id('wholesale-orders-all-pane')
                .title('Wholesale Orders Overview')
                .component(WholesaleOrdersPane as ComponentType),
            ),
          S.listItem()
            .id('wholesale-orders-pending')
            .title('Pending')
            .icon(ClockIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('order')
                .title('Pending Wholesale Orders')
                .filter('_type == "order" && orderType == "wholesale" && status == "pending"')
                .defaultOrdering([{field: '_createdAt', direction: 'desc'}]),
            ),
          S.listItem()
            .id('wholesale-orders-production')
            .title('In Production')
            .icon(ActivityIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('order')
                .title('In Production')
                .filter(
                  '_type == "order" && orderType == "wholesale" && wholesaleWorkflowStatus == "in_production"',
                )
                .defaultOrdering([{field: '_createdAt', direction: 'desc'}]),
            ),
          S.listItem()
            .id('wholesale-orders-ready')
            .title('Ready to Ship')
            .icon(PackageIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('order')
                .title('Ready to Ship')
                .filter(
                  '_type == "order" && orderType == "wholesale" && wholesaleWorkflowStatus == "ready_to_ship"',
                )
                .defaultOrdering([{field: '_createdAt', direction: 'desc'}]),
            ),
          S.listItem()
            .id('wholesale-orders-shipped')
            .title('Shipped')
            .icon(RocketIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('order')
                .title('Shipped Wholesale Orders')
                .filter('_type == "order" && orderType == "wholesale" && status == "shipped"')
                .defaultOrdering([{field: '_createdAt', direction: 'desc'}]),
            ),
        ]),
    )

const createPricingManagementSubSection = (S: any) =>
  S.listItem()
    .id('wholesale-pricing')
    .title('Pricing Management')
    .icon(CreditCardIcon)
    .child(
      S.list()
        .title('Pricing Management')
        .items([
          S.listItem()
            .id('wholesale-pricing-products')
            .title('Wholesale Pricing by Product')
            .icon(CreditCardIcon)
            .child(
              documentTablePane(
                S,
                'wholesale-pricing-products-pane',
                'Wholesale Pricing',
                WholesalePricingTableView,
              ),
            ),
          S.listItem()
            .id('wholesale-pricing-calculator')
            .title('Wholesale Pricing Calculator')
            .icon(CreditCardIcon)
            .child(
              S.component()
                .id('wholesale-pricing-calculator-pane')
                .title('Wholesale Pricing Calculator')
                .component(WholesalePricingCalculator as ComponentType),
            ),
          S.listItem()
            .id('wholesale-pricing-missing')
            .title('Products Missing Pricing')
            .icon(WarningOutlineIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('product')
                .title('Missing Wholesale Pricing')
                .filter(
                  '_type == "product" && productType != "service" && (!defined(wholesalePriceStandard) && !defined(wholesalePricePreferred) && !defined(wholesalePricePlatinum))',
                )
                .defaultOrdering([{field: 'title', direction: 'asc'}]),
            ),
          S.listItem()
            .id('wholesale-pricing-margins')
            .title('Profit Margin Analysis')
            .icon(BarChartIcon)
            .child(
              S.component()
                .id('wholesale-pricing-margins-pane')
                .title('Profit Margin Analysis')
                .component(ProfitMarginAnalysis as ComponentType),
            ),
        ]),
    )

const createInventorySubSection = (S: any) =>
  S.listItem()
    .id('wholesale-inventory')
    .title('Inventory')
    .icon(PackageIcon)
    .child(
      S.list()
        .title('Inventory')
        .items([
          S.listItem()
            .id('inventory-dashboard')
            .title('Inventory Dashboard')
            .icon(BarChartIcon)
            .child(
              S.component()
                .id('inventory-dashboard-pane')
                .title('Inventory Dashboard')
                .component(InventoryDashboard as ComponentType),
            ),
          S.listItem()
            .id('inventory-all')
            .title('All Inventory')
            .icon(PackageIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType(INVENTORY_DOCUMENT_TYPE)
                .title('All Inventory')
                .filter(`_type == "${INVENTORY_DOCUMENT_TYPE}"`)
                .defaultOrdering([{field: '_updatedAt', direction: 'desc'}]),
            ),
          S.listItem()
            .id('inventory-out-of-stock')
            .title('🚨 Out of Stock')
            .icon(WarningOutlineIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType(INVENTORY_DOCUMENT_TYPE)
                .title('Out of Stock')
                .filter(`_type == "${INVENTORY_DOCUMENT_TYPE}" && quantityAvailable <= 0`)
                .defaultOrdering([{field: 'quantityAvailable', direction: 'asc'}]),
            ),
          S.listItem()
            .id('inventory-low-stock')
            .title('⚠️ Low Stock')
            .icon(WarningOutlineIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType(INVENTORY_DOCUMENT_TYPE)
                .title('Low Stock')
                .filter(
                  `_type == "${INVENTORY_DOCUMENT_TYPE}" && quantityAvailable <= coalesce(reorderPoint, 0)`,
                )
                .defaultOrdering([{field: 'quantityAvailable', direction: 'asc'}]),
            ),
          S.listItem()
            .id('inventory-in-stock')
            .title('✅ In Stock')
            .icon(CheckmarkCircleIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType(INVENTORY_DOCUMENT_TYPE)
                .title('In Stock')
                .filter(
                  `_type == "${INVENTORY_DOCUMENT_TYPE}" && quantityAvailable > coalesce(reorderPoint, 0)`,
                )
                .defaultOrdering([{field: 'quantityAvailable', direction: 'desc'}]),
            ),
          S.listItem()
            .id('inventory-overstocked')
            .title('📈 Overstocked')
            .icon(ActivityIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType(INVENTORY_DOCUMENT_TYPE)
                .title('Overstocked')
                .filter(
                  `_type == "${INVENTORY_DOCUMENT_TYPE}" && quantityOnHand > coalesce(reorderPoint, 0) * 3`,
                )
                .defaultOrdering([{field: 'quantityOnHand', direction: 'desc'}]),
            ),
          S.listItem()
            .id('manufacturing-orders')
            .title('🏭 Manufacturing Orders')
            .icon(WrenchIcon)
            .child(
              S.list()
                .title('Manufacturing Orders')
                .items([
                  S.listItem()
                    .id('manufacturing-orders-all')
                    .title('All Orders')
                    .icon(PackageIcon)
                    .child(
                      S.documentList()
                        .apiVersion(API_VERSION)
                        .schemaType('manufacturingOrder')
                        .title('All Manufacturing Orders')
                        .filter('_type == "manufacturingOrder"')
                        .defaultOrdering([{field: '_createdAt', direction: 'desc'}]),
                    ),
                  S.listItem()
                    .id('manufacturing-orders-urgent')
                    .title('🔴 Urgent')
                    .child(
                      S.documentList()
                        .apiVersion(API_VERSION)
                        .schemaType('manufacturingOrder')
                        .title('Urgent Orders')
                        .filter(
                          '_type == "manufacturingOrder" && priority == "urgent" && status != "completed"',
                        )
                        .defaultOrdering([{field: '_createdAt', direction: 'asc'}]),
                    ),
                  S.listItem()
                    .id('manufacturing-orders-in-progress')
                    .title('In Production')
                    .icon(ActivityIcon)
                    .child(
                      S.documentList()
                        .apiVersion(API_VERSION)
                        .schemaType('manufacturingOrder')
                        .title('In Production')
                        .filter('_type == "manufacturingOrder" && status == "in_production"')
                        .defaultOrdering([{field: '_updatedAt', direction: 'desc'}]),
                    ),
                  S.listItem()
                    .id('manufacturing-orders-queued')
                    .title('Queued')
                    .icon(PauseIcon)
                    .child(
                      S.documentList()
                        .apiVersion(API_VERSION)
                        .schemaType('manufacturingOrder')
                        .title('Queued Orders')
                        .filter('_type == "manufacturingOrder" && status == "queued"')
                        .defaultOrdering([{field: '_createdAt', direction: 'asc'}]),
                    ),
                  S.listItem()
                    .id('manufacturing-orders-completed')
                    .title('Completed')
                    .icon(CheckmarkCircleIcon)
                    .child(
                      S.documentList()
                        .apiVersion(API_VERSION)
                        .schemaType('manufacturingOrder')
                        .title('Completed Orders')
                        .filter('_type == "manufacturingOrder" && status == "completed"')
                        .defaultOrdering([{field: 'actualCompletion', direction: 'desc'}]),
                    ),
                ]),
            ),
          S.listItem()
            .id('inventory-transactions')
            .title('📋 Inventory Transactions')
            .icon(ClipboardIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('inventoryTransaction')
                .title('Inventory Transactions')
                .filter('_type == "inventoryTransaction"')
                .defaultOrdering([{field: '_createdAt', direction: 'desc'}]),
            ),
        ]),
    )

const createWholesaleManufacturingSection = (S: any) =>
  S.listItem()
    .id('wholesale-manufacturing')
    .title('Wholesale & Manufacturing')
    .icon(PackageIcon)
    .child(
      S.list()
        .title('Wholesale & Manufacturing')
        .items([
          S.listItem()
            .id('wholesale-dashboard')
            .title('Wholesale Dashboard')
            .icon(BarChartIcon)
            .child(
              S.component()
                .id('wholesale-dashboard-pane')
                .title('Wholesale Dashboard')
                .component(WholesaleDashboard as ComponentType),
            ),
          createVendorApplicationsSubSection(S),
          createVendorsSubSection(S),
          createVendorQuotesSubSection(S),
          createWholesaleOrdersSubSection(S),
          createPricingManagementSubSection(S),
          createInventorySubSection(S),
        ]),
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

const CustomerAnalyticsPane: ComponentType = () =>
  React.createElement(ComingSoonPane as any, {
    title: 'Customer Analytics',
    description: 'Behavior, segments, and retention insights are coming soon.',
  })

const ProductPerformancePane: ComponentType = () =>
  React.createElement(ComingSoonPane as any, {
    title: 'Product Performance',
    description: 'Detailed SKU velocity dashboards arrive in a future release.',
  })

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
    .icon(BarChartIcon)
    .child(
      S.list()
        .title('Marketing')
        .items([
          S.listItem()
            .id('merchant-feed-validator')
            .title('Product Feed Validator')
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
          S.divider(),
          S.listItem()
            .id('email-marketing')
            .title('Email Marketing')
            .icon(EnvelopeIcon)
            .child(
              S.list()
                .title('Email Marketing')
                .items([
                  S.documentTypeListItem('emailCampaign')
                    .title('Campaigns')
                    .icon(EnvelopeIcon)
                    .child((documentId: string) =>
                      S.document()
                        .schemaType('emailCampaign')
                        .documentId(documentId)
                        .views([
                          S.view.form().title('Editor'),
                          S.view.component(CampaignPerformance as ComponentType).title('Performance'),
                        ]),
                    ),
                  S.documentTypeListItem('emailTemplate')
                    .title('Email Templates')
                    .icon(EnvelopeIcon),
                  S.documentTypeListItem('emailAutomation')
                    .title('Automations')
                    .icon(BoltIcon),
                  S.documentTypeListItem('emailLog')
                    .title('Email Logs')
                    .icon(ClockIcon),
                  S.listItem()
                    .title('Subscribers')
                    .icon(UserIcon)
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
            .id('attribution')
            .title('Attribution')
            .icon(LinkIcon)
            .child(
              S.list()
                .title('Attribution')
                .items([
                  S.listItem()
                    .id('attribution-dashboard')
                    .title('Attribution Dashboard')
                    .icon(LinkIcon)
                    .child(
                      S.component()
                        .id('attribution-dashboard-pane')
                        .title('Attribution Dashboard')
                        .component(AttributionDashboard as any),
                    ),
                  S.documentTypeListItem('attribution')
                    .title('All Attributions')
                    .icon(DocumentIcon),
                  S.listItem()
                    .id('attribution-by-source')
                    .title('By Source')
                    .icon(TagIcon)
                    .child(
                      S.documentList()
                        .apiVersion(API_VERSION)
                        .schemaType('attribution')
                        .title('Attributions by Source')
                        .filter('_type == "attribution" && defined(utmSource)')
                        .defaultOrdering([
                          {field: 'utmSource', direction: 'asc'},
                          {field: 'createdAt', direction: 'desc'},
                        ]),
                    ),
                  S.listItem()
                    .id('attribution-by-campaign')
                    .title('By Campaign')
                    .icon(BulbOutlineIcon)
                    .child(
                      S.documentList()
                        .apiVersion(API_VERSION)
                        .schemaType('attribution')
                        .title('Attributions by Campaign')
                        .filter('_type == "attribution" && defined(utmCampaign)')
                        .defaultOrdering([
                          {field: 'utmCampaign', direction: 'asc'},
                          {field: 'createdAt', direction: 'desc'},
                        ]),
                    ),
                ]),
            ),
          S.divider(),
          S.listItem()
            .id('marketing-campaigns')
            .title('Campaigns')
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
            .title('Analytics')
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

const createAnalyticsSection = (S: any) =>
  S.listItem()
    .id('analytics')
    .title('Analytics')
    .icon(BarChartIcon)
    .child(
      S.list()
        .title('Analytics')
        .items([
          S.listItem()
            .id('analytics-sales')
            .title('Sales Analytics')
            .icon(BarChartIcon)
            .child(
              S.component()
                .id('sales-analytics-pane')
                .title('Sales Analytics')
                .component(SalesAnalyticsDashboard as ComponentType),
            ),
          S.listItem()
            .id('analytics-customers')
            .title('Customer Analytics')
            .icon(UserIcon)
            .child(
              S.component()
                .id('customer-analytics-pane')
                .title('Customer Analytics')
                .component(CustomerAnalyticsPane as ComponentType),
            ),
          S.listItem()
            .id('analytics-products')
            .title('Product Performance')
            .icon(PackageIcon)
            .child(
              S.component()
                .id('product-performance-pane')
                .title('Product Performance')
                .component(ProductPerformancePane as ComponentType),
            ),
        ]),
    )

const createFinanceSection = (S: any) =>
  S.listItem()
    .id('finance')
    .title('💵 Finance')
    .icon(BillIcon)
    .child(
      S.list()
        .title('Finance')
        .items([
          S.listItem()
            .id('finance-dashboard')
            .title('📊 Financial Dashboard')
            .icon(BarChartIcon)
            .child(
              S.component()
                .id('finance-dashboard-pane')
                .title('Financial Dashboard')
                .component(FinancialDashboard as ComponentType),
            ),
          buildProfitLossStructure(S),
          buildExpensesStructure(S),
          buildCashFlowStructure(S),
          S.listItem()
            .id('product-profitability')
            .title('📈 Product Profitability')
            .icon(BasketIcon)
            .child(
              S.component()
                .id('product-profitability-pane')
                .title('Product Profitability')
                .component(ProductProfitability as ComponentType),
            ),
          buildAccountsReceivableStructure(S),
          S.documentTypeListItem('bill').title('💳 Bills').icon(BillIcon),
          S.documentTypeListItem('check').title('Checks').icon(ClipboardIcon),
          buildReportsStructure(S),
        ]),
    )

const buildProfitLossStructure = (S: any) =>
  S.listItem()
    .id('profit-loss')
    .title('📊 Profit & Loss')
    .icon(BarChartIcon)
    .child(
      S.list()
        .title('Profit & Loss')
        .items([
          S.listItem()
            .id('pl-current')
            .title('Current Month')
            .child(
              S.documentList()
                .title('Current Month')
                .filter('_type == "profitLoss" && period == $period')
                .params({period: currentPeriod})
                .apiVersion('2024-01-01'),
            ),
          S.listItem()
            .id('pl-12-months')
            .title('Last 12 Months')
            .child(
              S.documentList()
                .title('Last 12 Months')
                .filter('_type == "profitLoss" && period >= $period')
                .params({period: twelveMonthsAgo})
                .apiVersion('2024-01-01'),
            ),
          S.listItem()
            .id('pl-ytd')
            .title('Year to Date')
            .child(
              S.documentList()
                .title('Year to Date')
                .filter('_type == "profitLoss" && period match $year')
                .params({year: yearPrefix})
                .apiVersion('2024-01-01'),
            ),
        ]),
    )

const buildExpensesStructure = (S: any) =>
  S.listItem()
    .id('expenses')
    .title('💸 Expenses')
    .icon(CreditCardIcon)
    .child(
      S.list()
        .title('Expenses')
        .items([
          S.listItem()
            .id('expense-manager')
            .title('Expense Manager')
            .icon(CreditCardIcon)
            .child(
              S.component()
                .id('expense-manager-pane')
                .title('Expense Manager')
                .component(ExpenseManager as ComponentType),
            ),
          S.documentTypeListItem('expense').title('All Expenses').icon(CreditCardIcon),
          S.listItem()
            .id('expenses-pending')
            .title('Pending Payment')
            .child(
              S.documentList()
                .title('Pending Expenses')
                .filter('_type == "expense" && status != "paid"')
                .apiVersion('2024-01-01'),
            ),
          S.listItem()
            .id('expenses-paid-month')
            .title('Paid This Month')
            .child(
              S.documentList()
                .title('Paid This Month')
                .filter(
                  '_type == "expense" && status == "paid" && dateTime(coalesce(paidDate, date)) >= dateTime($month)',
                )
                .params({month: monthStartIso})
                .apiVersion('2024-01-01'),
            ),
          buildExpenseCategoryStructure(S),
          S.listItem()
            .id('expenses-recurring')
            .title('Recurring Expenses')
            .child(
              S.documentList()
                .title('Recurring Expenses')
                .filter('_type == "expense" && recurring == true')
                .apiVersion('2024-01-01'),
            ),
        ]),
    )

const buildExpenseCategoryStructure = (S: any) =>
  S.listItem()
    .id('expenses-by-category')
    .title('By Category')
    .child(
      S.list()
        .title('Expenses by Category')
        .items(
          EXPENSE_CATEGORIES.map((category) =>
            S.listItem()
              .id(`expense-category-${category.value}`)
              .title(category.title)
              .child(
                S.documentList()
                  .title(category.title)
                  .filter('_type == "expense" && category == $category')
                  .params({category: category.value})
                  .apiVersion('2024-01-01'),
              ),
          ),
        ),
    )

const buildCashFlowStructure = (S: any) =>
  S.listItem()
    .id('cash-flow')
    .title('💵 Cash Flow')
    .icon(CreditCardIcon)
    .child(
      S.list()
        .title('Cash Flow')
        .items([
          S.listItem()
            .id('cash-flow-current')
            .title('Current Month')
            .child(
              S.documentList()
                .title('Cash Flow · Current Month')
                .filter('_type == "cashFlow" && period == $period')
                .params({period: currentPeriod})
                .apiVersion('2024-01-01'),
            ),
          S.listItem()
            .id('cash-flow-12')
            .title('Last 12 Months')
            .child(
              S.documentList()
                .title('Cash Flow · Last 12 Months')
                .filter('_type == "cashFlow" && period >= $period')
                .params({period: twelveMonthsAgo})
                .apiVersion('2024-01-01'),
            ),
        ]),
    )

const buildAccountsReceivableStructure = (S: any) =>
  S.listItem()
    .id('accounts-receivable')
    .title('🏦 Accounts Receivable')
    .icon(ClipboardIcon)
    .child(
      S.list()
        .title('Accounts Receivable')
        .items([
          S.listItem()
            .id('accounts-receivable-dashboard')
            .title('Overview')
            .child(
              S.component()
                .id('accounts-receivable-pane')
                .title('Accounts Receivable')
                .component(AccountsReceivable as ComponentType),
            ),
          S.listItem()
            .id('accounts-receivable-current')
            .title('Current')
            .child(
              S.documentList()
                .title('Current Receivables')
                .filter(
                  `${WHOLESALE_INVOICE_FILTER} && status != "paid" && ( !defined(dueDate) || dateTime(coalesce(dueDate, invoiceDate)) >= dateTime($now))`,
                )
                .params({now: nowIso})
                .apiVersion('2024-01-01'),
            ),
          S.listItem()
            .id('accounts-receivable-overdue')
            .title('Overdue')
            .child(
              S.documentList()
                .title('Overdue Receivables')
                .filter(
                  `${WHOLESALE_INVOICE_FILTER} && status != "paid" && defined(dueDate) && dateTime(coalesce(dueDate, invoiceDate)) < dateTime($now)`,
                )
                .params({now: nowIso})
                .apiVersion('2024-01-01'),
            ),
          S.listItem()
            .id('accounts-receivable-paid')
            .title('Paid')
            .child(
              S.documentList()
                .title('Paid Wholesale Invoices')
                .filter(`${WHOLESALE_INVOICE_FILTER} && status == "paid"`)
                .apiVersion('2024-01-01'),
            ),
        ]),
    )

const buildReportsStructure = (S: any) =>
  S.listItem()
    .id('finance-reports')
    .title('📊 Reports')
    .icon(BarChartIcon)
    .child(
      S.list()
        .title('Finance Reports')
        .items([
          S.listItem()
            .id('report-tax-summary')
            .title('Tax Summary')
            .child(
              S.documentList()
                .title('Tax-Deductible Expenses')
                .filter('_type == "expense" && taxDeductible == true')
                .apiVersion('2024-01-01')
                .defaultOrdering([{field: 'date', direction: 'desc'}]),
            ),
          S.listItem()
            .id('report-expense')
            .title('Expense Report (YTD)')
            .child(
              S.documentList()
                .title('Expense Report')
                .filter('_type == "expense" && dateTime(date) >= dateTime($yearStart)')
                .params({yearStart: yearStartIso})
                .apiVersion('2024-01-01')
                .defaultOrdering([{field: 'date', direction: 'desc'}]),
            ),
          S.listItem()
            .id('report-revenue')
            .title('Revenue Report')
            .child(
              S.component()
                .id('revenue-report-pane')
                .title('Revenue Report')
                .component(FinancialReports as ComponentType),
            ),
        ]),
    )

export const deskStructure: StructureResolver = (S) =>
  S.list()
    .title('F.A.S. Motorsports')
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
      createProductsSection(S),
      createOrdersSection(S),
      createCustomersSection(S),
      createShippingSection(S),
      S.documentTypeListItem('invoice').title('Invoices').icon(ClipboardIcon),
      S.documentTypeListItem('quote').title('Quotes').icon(DocumentIcon),

      S.divider().title('F.A.S. In-Store'),
      createInStoreOperationsSection(S),
      createInStoreSalesSection(S),
      createWholesaleManufacturingSection(S),

      S.divider().title('F.A.S. Resources'),
      createMarketingSection(S),
      createAnalyticsSection(S),
      downloadsStructure(S),
      createFinanceSection(S),

      S.divider().title('SETTINGS'),
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
    ])
export default deskStructure
const createVendorApplicationsSubSection = (S: any) =>
  S.listItem()
    .id('vendor-applications')
    .title('Vendor Applications')
    .icon(ClipboardIcon)
    .child(
      S.list()
        .title('Vendor Applications')
        .items([
          S.listItem()
            .id('vendor-applications-pending')
            .title('Pending Review')
            .icon(ClockIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('vendorApplication')
                .title('Pending Review')
                .filter('_type == "vendorApplication" && coalesce(status, "pending") == "pending"')
                .defaultOrdering([{field: 'submittedAt', direction: 'desc'}]),
            ),
          S.listItem()
            .id('vendor-applications-approved')
            .title('Approved')
            .icon(CheckmarkCircleIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('vendorApplication')
                .title('Approved Applications')
                .filter('_type == "vendorApplication" && status == "approved"')
                .defaultOrdering([{field: 'submittedAt', direction: 'desc'}]),
            ),
          S.listItem()
            .id('vendor-applications-rejected')
            .title('Rejected')
            .icon(WarningOutlineIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('vendorApplication')
                .title('Rejected Applications')
                .filter('_type == "vendorApplication" && status == "rejected"')
                .defaultOrdering([{field: 'submittedAt', direction: 'desc'}]),
            ),
          S.listItem()
            .id('vendor-applications-all')
            .title('All Applications')
            .icon(DocumentIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('vendorApplication')
                .title('All Vendor Applications')
                .filter('_type == "vendorApplication"')
                .defaultOrdering([{field: 'submittedAt', direction: 'desc'}]),
            ),
        ]),
    )
const createVendorQuotesSubSection = (S: any) =>
  S.listItem()
    .id('vendor-quotes')
    .title('Vendor Quotes')
    .icon(EnvelopeIcon)
    .child(
      S.list()
        .title('Vendor Quotes')
        .items([
          S.documentTypeListItem('vendorQuote').title('All Quotes').icon(DocumentIcon),
          S.listItem()
            .id('vendor-quotes-draft')
            .title('Draft')
            .icon(ClockIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('vendorQuote')
                .title('Draft Quotes')
                .filter('_type == "vendorQuote" && status == "draft"')
                .defaultOrdering([{field: '_updatedAt', direction: 'desc'}]),
            ),
          S.listItem()
            .id('vendor-quotes-sent')
            .title('Sent')
            .icon(EnvelopeIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('vendorQuote')
                .title('Sent Quotes')
                .filter('_type == "vendorQuote" && status == "sent"')
                .defaultOrdering([{field: '_updatedAt', direction: 'desc'}]),
            ),
          S.listItem()
            .id('vendor-quotes-approved')
            .title('Approved')
            .icon(CheckmarkCircleIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('vendorQuote')
                .title('Approved Quotes')
                .filter('_type == "vendorQuote" && status == "approved"')
                .defaultOrdering([{field: '_updatedAt', direction: 'desc'}]),
            ),
          S.listItem()
            .id('vendor-quotes-ready')
            .title('Ready to Convert')
            .icon(TagIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('vendorQuote')
                .title('Ready to Convert')
                .filter(
                  '_type == "vendorQuote" && status == "approved" && !defined(convertedToOrder)',
                )
                .defaultOrdering([{field: '_updatedAt', direction: 'desc'}]),
            ),
          S.listItem()
            .id('vendor-quotes-expired')
            .title('Expired')
            .icon(WarningOutlineIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('vendorQuote')
                .title('Expired Quotes')
                .filter(
                  '_type == "vendorQuote" && (status == "expired" || (defined(validUntil) && dateTime(validUntil) < dateTime(now())))',
                )
                .defaultOrdering([{field: '_updatedAt', direction: 'desc'}]),
            ),
        ]),
    )
