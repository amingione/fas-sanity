import React, {type ComponentType} from 'react'
import type {StructureResolver} from 'sanity/structure'
import {
  BarChartIcon,
  BasketIcon,
  BillIcon,
  CheckmarkCircleIcon,
  ClipboardIcon,
  ClockIcon,
  CodeIcon,
  CreditCardIcon,
  DatabaseIcon,
  DocumentIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  BellIcon,
  FolderIcon,
  HomeIcon,
  BulbOutlineIcon,
  LinkIcon,
  PackageIcon,
  PresentationIcon,
  RocketIcon,
  TagIcon,
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
import discountsStructure from '../structure/discountsStructure'
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
  VendorsDocumentTable,
} from '../components/studio/documentTables'
import {CogIcon} from '@sanity/icons'
import TodayScheduleDashboard from '../components/studio/TodayScheduleDashboard'
import AppointmentCalendarPane from '../components/studio/AppointmentCalendarPane'
import AppointmentBookingPane from '../components/studio/AppointmentBookingPane'
import WorkOrderManagementPane from '../components/studio/WorkOrderManagementPane'
import WholesaleOrdersPane from '../components/studio/WholesaleOrdersPane'
import ShipmentsPanel from '../components/shipments/ShipmentsPanel'
import PickupsPanel from '../components/pickups/PickupsPanel'
import SalesAnalyticsDashboard from '../components/studio/SalesAnalyticsDashboard'
import OperationsDashboard from '../components/studio/OperationsDashboard'
import WholesaleDashboard from '../components/studio/WholesaleDashboard'
import WholesalePricingCalculator from '../components/studio/WholesalePricingCalculator'
import ProfitMarginAnalysis from '../components/studio/ProfitMarginAnalysis'
import FinancialDashboard from '../components/studio/FinancialDashboard'
import ExpenseManager from '../components/studio/ExpenseManager'
import ProductProfitability from '../components/studio/ProductProfitability'
import AccountsReceivable from '../components/studio/AccountsReceivable'
import FinancialReports from '../components/studio/FinancialReports'
import {INVENTORY_DOCUMENT_TYPE} from '../../../../shared/docTypes'

const API_VERSION = '2024-10-01'
const EMAIL_SUBSCRIBER_FILTER = '_type == "customer" && emailMarketing.subscribed == true'

const startOfMonth = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
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

// Wrapper to ensure the campaign performance view always receives a valid component function
const EmailCampaignPerformanceView: ComponentType = (props: any) =>
  React.createElement(CampaignPerformance as any, props)

const CustomersAllTableView: ComponentType = () =>
  React.createElement(CustomersDocumentTable as any, {
    title: 'All Customers',
    pageSize: 10,
  })

const OrdersListTableView: ComponentType = () =>
  React.createElement(OrdersDocumentTable as any, {title: 'Orders', pageSize: 12})

const VendorsTableView: ComponentType = () =>
  React.createElement(VendorsDocumentTable as any, {
    title: 'Vendors',
  })

const productDefaultOrdering = [{field: '_updatedAt', direction: 'desc' as const}]
const canHandleProductIntent = (intentName: string, params?: {type?: string}) =>
  intentName === 'edit' && params?.type === 'product'

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
            .title('Product Table')
            .child(documentTablePane(S, 'products-all', 'All products', ProductsDocumentTable)),
          S.listItem()
            .id('products-documents')
            .title('All Products')
            .schemaType('product')
            .child(
              S.documentTypeList('product')
                .apiVersion(API_VERSION)
                .title('All Products')
                .defaultOrdering(productDefaultOrdering),
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
    .child(documentTablePane(S, 'orders-all', 'Orders', OrdersListTableView))

const createCustomersSection = (S: any) =>
  S.listItem()
    .id('customers')
    .title('Customers')
    .icon(UserIcon)
    .child(documentTablePane(S, 'customers-all', 'All Customers', CustomersAllTableView))

const createShippingSection = (S: any) =>
  S.listItem()
    .id('shipping')
    .title('Shipping')
    .icon(RocketIcon)
    .child(
      S.component()
        .id('shipments-panel')
        .title('Shipments')
        .component(ShipmentsPanel as ComponentType),
    )

const createAdminSection = (S: any) =>
  S.listItem()
    .id('admin')
    .title('Admin')
    .icon(WrenchIcon)
    .child(
      S.list()
        .title('Admin')
        .items([
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
          S.listItem()
            .id('doc-links-archive')
            .title('Doc Links Archive')
            .child(
              S.list()
                .title('Doc Links Archive')
                .items([
                  S.listItem()
                    .id('shipping-settings')
                    .title('Shipping Settings')
                    .child(
                      S.list()
                        .title('Shipping Settings')
                        .items([
                          S.listItem()
                            .id('sender-addresses')
                            .title('Sender Addresses')
                            .icon(DocumentIcon)
                            .schemaType('senderAddress')
                            .child(S.documentTypeList('senderAddress').title('Sender Addresses')),
                        ]),
                    ),
                  S.listItem()
                    .id('pickups')
                    .title('Pickups')
                    .child(
                      S.component()
                        .id('pickups-panel')
                        .title('Pickups')
                        .component(PickupsPanel as ComponentType),
                    ),
                  S.documentTypeListItem('freightQuote')
                    .id('freight-quotes')
                    .title('Freight Quotes')
                    .icon(CaseIcon),
                ]),
            ),
          S.divider(),
          createMarketingSection(S),
          createAnalyticsSection(S),
          createFunctionLogsSection(S),
          createFinanceSection(S),
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
    .title('Services & Scheduling')
    .icon(WrenchIcon)
    .child(
      S.list()
        .title('Services & Scheduling')
        .items([
          S.listItem()
            .id('operations-dashboard')
            .title('Scheduling Dashboard')
            .icon(BarChartIcon)
            .child(
              S.component()
                .id('operations-dashboard-pane')
                .title('Scheduling Dashboard')
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

const createVendorsSubSection = (S: any) =>
  S.listItem()
    .id('wholesale-vendors')
    .title('Vendors')
    .icon(UserIcon)
    .child(documentTablePane(S, 'vendors', 'Vendors', VendorsTableView))

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
            .id('wholesale-orders-overview')
            .title('Overview')
            .icon(CaseIcon)
            .child(
              S.component()
                .id('wholesale-orders-overview-pane')
                .title('Wholesale Orders Overview')
                .component(WholesaleOrdersPane as ComponentType),
            ),
          S.listItem()
            .id('wholesale-orders-requested')
            .title('Requested')
            .icon(ClockIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('order')
                .title('Requested Wholesale Orders')
                .filter(
                  '_type == "order" && orderType == "wholesale" && wholesaleDetails.workflowStatus == "requested"',
                )
                .defaultOrdering([{field: '_createdAt', direction: 'desc'}])
                .child((orderId: string) => S.document().schemaType('order').documentId(orderId)),
            ),
          S.listItem()
            .id('wholesale-orders-pending-approval')
            .title('Pending Approval')
            .icon(ClockIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('order')
                .title('Pending Approval')
                .filter(
                  '_type == "order" && orderType == "wholesale" && wholesaleDetails.workflowStatus == "pending_approval"',
                )
                .defaultOrdering([{field: '_createdAt', direction: 'desc'}])
                .child((orderId: string) => S.document().schemaType('order').documentId(orderId)),
            ),
          S.listItem()
            .id('wholesale-orders-approved')
            .title('Approved')
            .icon(CheckmarkCircleIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('order')
                .title('Approved Wholesale Orders')
                .filter(
                  '_type == "order" && orderType == "wholesale" && wholesaleDetails.workflowStatus == "approved"',
                )
                .defaultOrdering([{field: '_createdAt', direction: 'desc'}])
                .child((orderId: string) => S.document().schemaType('order').documentId(orderId)),
            ),
          S.listItem()
            .id('wholesale-orders-production')
            .title('In Production')
            .icon(PackageIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('order')
                .title('In Production')
                .filter(
                  '_type == "order" && orderType == "wholesale" && wholesaleDetails.workflowStatus == "in_production"',
                )
                .defaultOrdering([{field: '_createdAt', direction: 'desc'}])
                .child((orderId: string) => S.document().schemaType('order').documentId(orderId)),
            ),
          S.listItem()
            .id('wholesale-orders-ready-to-ship')
            .title('Ready to Ship')
            .icon(PackageIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('order')
                .title('Ready to Ship')
                .filter(
                  '_type == "order" && orderType == "wholesale" && wholesaleDetails.workflowStatus == "ready_to_ship"',
                )
                .defaultOrdering([{field: '_createdAt', direction: 'desc'}])
                .child((orderId: string) => S.document().schemaType('order').documentId(orderId)),
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
                .filter(
                  '_type == "order" && orderType == "wholesale" && wholesaleDetails.workflowStatus == "shipped"',
                )
                .defaultOrdering([{field: '_createdAt', direction: 'desc'}])
                .child((orderId: string) => S.document().schemaType('order').documentId(orderId)),
            ),
          S.listItem()
            .id('wholesale-orders-delivered')
            .title('Delivered')
            .icon(CheckmarkCircleIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('order')
                .title('Delivered Wholesale Orders')
                .filter(
                  '_type == "order" && orderType == "wholesale" && wholesaleDetails.workflowStatus == "delivered"',
                )
                .defaultOrdering([{field: '_createdAt', direction: 'desc'}])
                .child((orderId: string) => S.document().schemaType('order').documentId(orderId)),
            ),
          S.listItem()
            .id('wholesale-orders-rejected')
            .title('Rejected')
            .icon(WarningOutlineIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('order')
                .title('Rejected Wholesale Orders')
                .filter(
                  '_type == "order" && orderType == "wholesale" && wholesaleDetails.workflowStatus == "rejected"',
                )
                .defaultOrdering([{field: '_createdAt', direction: 'desc'}])
                .child((orderId: string) => S.document().schemaType('order').documentId(orderId)),
            ),
          S.listItem()
            .id('wholesale-orders-all')
            .title('All Wholesale Orders')
            .icon(ClipboardIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('order')
                .title('All Wholesale Orders')
                .filter('_type == "order" && orderType == "wholesale"')
                .defaultOrdering([{field: '_createdAt', direction: 'desc'}])
                .child((orderId: string) => S.document().schemaType('order').documentId(orderId)),
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
              S.documentList()
                .id('wholesale-pricing-products-list')
                .schemaType('product')
                .apiVersion(API_VERSION)
                .title('Wholesale Pricing')
                .filter('_type == "product" && coalesce(availableForWholesale, false) == true')
                .defaultOrdering(productDefaultOrdering)
                .canHandleIntent(canHandleProductIntent),
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
                .id('wholesale-pricing-missing-list')
                .apiVersion(API_VERSION)
                .schemaType('product')
                .title('Missing Wholesale Pricing')
                .filter(
                  '_type == "product" && productType != "service" && (!defined(wholesalePriceStandard) && !defined(wholesalePricePreferred) && !defined(wholesalePricePlatinum))',
                )
                .defaultOrdering([{field: 'title', direction: 'asc'}])
                .canHandleIntent(canHandleProductIntent),
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
    .title('Vendors')
    .icon(PackageIcon)
    .child(
      S.list()
        .title('Vendors')
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

const createVendorPortalSection = (S: any) =>
  S.listItem()
    .id('vendor-portal')
    .title('Wholesale Management')
    .icon(UserIcon)
    .child(
      S.list()
        .title('Wholesale Management')
        .items([
          createVendorsSubSection(S),
          createVendorApplicationsSubSection(S),
          createVendorQuotesSubSection(S),
          createWholesaleOrdersSubSection(S),
          S.listItem()
            .id('vendor-portal-documents')
            .title('Vendor Documents')
            .icon(DocumentIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('vendorDocument')
                .title('Vendor Documents')
                .filter('_type == "vendorDocument"')
                .defaultOrdering([{field: 'uploadedAt', direction: 'desc'}]),
            ),
          S.listItem()
            .id('vendor-portal-returns')
            .title('Returns (RMA)')
            .icon(WarningOutlineIcon)
            .child(
              S.documentList()
                .apiVersion(API_VERSION)
                .schemaType('vendorReturn')
                .title('Returns')
                .filter('_type == "vendorReturn"')
                .defaultOrdering([{field: 'createdAt', direction: 'desc'}]),
            ),
          S.documentTypeListItem('vendorPost').title('Vendor Posts'),
          S.documentTypeListItem('vendorEmailLog').title('Vendor Email Log'),
        ]),
    )

const SalesReportsPane: ComponentType = React.forwardRef<HTMLDivElement>((_props, ref) =>
  React.createElement(ComingSoonPane as any, {
    ref,
    options: {
      title: 'Sales Reports',
      description: 'Detailed reporting dashboard coming soon.',
    },
  }),
)
SalesReportsPane.displayName = 'SalesReportsPane'

const MarketingAnalyticsPane: ComponentType = React.forwardRef<HTMLDivElement>((_props, ref) =>
  React.createElement(ComingSoonPane as any, {
    ref,
    options: {
      title: 'Marketing Analytics',
      description: 'Integrated campaign ROI reporting is coming soon.',
      secondaryAction: {
        label: 'View sales dashboard',
        href: '#',
      },
    },
  }),
)
MarketingAnalyticsPane.displayName = 'MarketingAnalyticsPane'

const CustomerAnalyticsPane: ComponentType = React.forwardRef<HTMLDivElement>((_props, ref) =>
  React.createElement(ComingSoonPane as any, {
    ref,
    options: {
      title: 'Customer Analytics',
      description: 'Behavior, segments, and retention insights are coming soon.',
    },
  }),
)
CustomerAnalyticsPane.displayName = 'CustomerAnalyticsPane'

const ProductPerformancePane: ComponentType = React.forwardRef<HTMLDivElement>((_props, ref) =>
  React.createElement(ComingSoonPane as any, {
    ref,
    options: {
      title: 'Product Performance',
      description: 'Detailed SKU velocity dashboards arrive in a future release.',
    },
  }),
)
ProductPerformancePane.displayName = 'ProductPerformancePane'

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
                  S.listItem()
                    .id('email-campaigns')
                    .title('Campaigns')
                    .icon(EnvelopeIcon)
                    .child(
                      S.documentTypeList('emailCampaign')
                        .apiVersion(API_VERSION)
                        .title('Email Campaigns')
                        .filter('_type == "emailCampaign"')
                        .defaultOrdering([{field: '_createdAt', direction: 'desc'}])
                        .child((documentId: string) =>
                          S.document()
                            .schemaType('emailCampaign')
                            .documentId(documentId)
                            .views([
                              S.view.form().title('Editor'),
                              S.view.component(EmailCampaignPerformanceView).title('Performance'),
                            ]),
                        ),
                    ),
                  S.documentTypeListItem('emailTemplate')
                    .title('Email Templates')
                    .icon(EnvelopeIcon),
                  S.documentTypeListItem('emailAutomation').title('Automations').icon(BoltIcon),
                  S.documentTypeListItem('emailLog').title('Email Logs').icon(ClockIcon),
                  S.listItem()
                    .title('Subscribers')
                    .icon(UserIcon)
                    .schemaType('customer')
                    .child(
                      S.documentList()
                        .apiVersion(API_VERSION)
                        .title('Email Subscribers')
                        .schemaType('customer')
                        .filter(EMAIL_SUBSCRIBER_FILTER)
                        .defaultOrdering([
                          {field: 'emailMarketing.subscribedAt', direction: 'desc'},
                        ]),
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

const createFunctionLogsSection = (S: any) =>
  S.listItem()
    .id('function-logs')
    .title('Function Logs')
    .icon(ActivityIcon)
    .child(
      S.list()
        .title('Function Logs')
        .items([
          S.listItem()
            .id('function-logs-all')
            .title('All Function Logs')
            .icon(ActivityIcon)
            .child(
              S.documentList()
                .id('function-logs-all-docs')
                .title('All Function Logs')
                .schemaType('functionLog')
                .apiVersion(API_VERSION)
                .filter('_type == "functionLog"')
                .defaultOrdering([{field: 'executionTime', direction: 'desc'}]),
            ),
          S.listItem()
            .id('function-logs-errors')
            .title('Errors (last 24h)')
            .icon(WarningOutlineIcon)
            .child(
              S.documentList()
                .id('function-logs-errors-docs')
                .title('Errors (last 24 hours)')
                .schemaType('functionLog')
                .apiVersion(API_VERSION)
                .filter(
                  '_type == "functionLog" && status == "error" && executionTime > dateTime(now()) - 86400000',
                )
                .defaultOrdering([{field: 'executionTime', direction: 'desc'}]),
            ),
          S.listItem()
            .id('function-logs-warnings')
            .title('Warnings (last 7 days)')
            .icon(BulbOutlineIcon)
            .child(
              S.documentList()
                .id('function-logs-warnings-docs')
                .title('Warnings (last 7 days)')
                .schemaType('functionLog')
                .apiVersion(API_VERSION)
                .filter(
                  '_type == "functionLog" && status == "warning" && executionTime > dateTime(now()) - 604800000',
                )
                .defaultOrdering([{field: 'executionTime', direction: 'desc'}]),
            ),
          S.listItem()
            .id('function-logs-by-function')
            .title('By Function')
            .icon(ClipboardIcon)
            .child(
              S.list()
                .title('Function')
                .items(
                  [
                    'stripeWebhook',
                    'easypostWebhook',
                    'sendAbandonedCartEmails',
                    'manual-fulfill-order',
                    'cleanupFunctionLogs',
                  ].map((functionName) =>
                    S.listItem()
                      .id(`function-logs-${functionName}`)
                      .title(functionName)
                      .child(
                        S.documentList()
                          .id(`function-logs-docs-${functionName}`)
                          .title(`${functionName} logs`)
                          .schemaType('functionLog')
                          .apiVersion(API_VERSION)
                          .filter('_type == "functionLog" && functionName == $functionName')
                          .params({functionName})
                          .defaultOrdering([{field: 'executionTime', direction: 'desc'}]),
                      ),
                  ),
                ),
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
                .schemaType('profitLoss')
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
                .schemaType('profitLoss')
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
                .schemaType('profitLoss')
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
                .schemaType('expense')
                .title('Pending Expenses')
                .filter('_type == "expense" && status != "paid"')
                .apiVersion('2024-01-01'),
            ),
          S.listItem()
            .id('expenses-paid-month')
            .title('Paid This Month')
            .child(
              S.documentList()
                .schemaType('expense')
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
                .schemaType('expense')
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
                  .schemaType('expense')
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
                .schemaType('cashFlow')
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
                .schemaType('cashFlow')
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
                .schemaType('invoice')
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
                .schemaType('invoice')
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
                .schemaType('invoice')
                .title('Paid Wholesale Invoices')
                .filter(`${WHOLESALE_INVOICE_FILTER} && status == "paid"`)
                .apiVersion('2024-01-01'),
            ),
        ]),
    )

const createBlogSection = (S: any) =>
  S.listItem()
    .id('blog')
    .title('Blog')
    .icon(DocumentIcon)
    .child(
      S.list()
        .title('Blog')
        .items([
          S.documentTypeListItem('post').title('Posts').icon(DocumentIcon),
          S.documentTypeListItem('blogCategory').title('Categories').icon(TagIcon),
          S.documentTypeListItem('user').title('Authors').icon(UserIcon),
        ]),
    )

const employeeHubSection = (S: any) =>
  S.listItem()
    .id('employee')
    .title('Employees')
    .icon(UserIcon)
    .child(
      S.list()
        .title('Employees')
        .items([
          S.documentTypeListItem('empProfile').title('Employee Profiles').icon(DatabaseIcon),
          S.documentTypeListItem('empResources').title('Resources').icon(DocumentTextIcon),
          S.listItem()
            .title('Pages')
            .icon(CodeIcon)
            .child(
              S.list()
                .title('Portal Pages')
                .items([
                  S.listItem()
                    .title('All Pages & Folders')
                    .icon(CodeIcon)
                    .child(
                      S.documentTypeList('empPortal')
                        .title('All Pages & Folders')
                        .defaultOrdering([{field: 'sortOrder', direction: 'asc'}]),
                    ),
                  S.divider(),
                  S.listItem()
                    .title('📁 Folders')
                    .icon(FolderIcon)
                    .child(
                      S.documentTypeList('empPortal')
                        .apiVersion(API_VERSION)
                        .title('Folders')
                        .filter('_type == "empPortal" && documentType == "folder"')
                        .defaultOrdering([{field: 'sortOrder', direction: 'asc'}]),
                    ),
                  S.listItem()
                    .title('📄 Root Pages')
                    .icon(CodeIcon)
                    .child(
                      S.documentTypeList('empPortal')
                        .apiVersion(API_VERSION)
                        .title('Root Pages')
                        .filter(
                          '_type == "empPortal" && !defined(parentFolder) && documentType != "folder"',
                        )
                        .defaultOrdering([{field: 'sortOrder', direction: 'asc'}]),
                    ),
                  S.divider(),
                  S.listItem()
                    .title('By Type')
                    .child(
                      S.list()
                        .title('Pages by Type')
                        .items([
                          S.listItem()
                            .title('Announcements')
                            .child(
                              S.documentTypeList('empPortal')
                                .apiVersion(API_VERSION)
                                .title('Announcements')
                                .filter('_type == "empPortal" && documentType == "announcement"')
                                .defaultOrdering([{field: 'publishedAt', direction: 'desc'}]),
                            ),
                          S.listItem()
                            .title('Policies')
                            .child(
                              S.documentTypeList('empPortal')
                                .apiVersion(API_VERSION)
                                .title('Policies')
                                .filter('_type == "empPortal" && documentType == "policy"')
                                .defaultOrdering([{field: 'sortOrder', direction: 'asc'}]),
                            ),
                          S.listItem()
                            .title('Forms')
                            .child(
                              S.documentTypeList('empPortal')
                                .apiVersion(API_VERSION)
                                .title('Forms')
                                .filter('_type == "empPortal" && documentType == "form"')
                                .defaultOrdering([{field: 'sortOrder', direction: 'asc'}]),
                            ),
                          S.listItem()
                            .title('Blog Posts')
                            .child(
                              S.documentTypeList('empPortal')
                                .apiVersion(API_VERSION)
                                .title('Blog Posts')
                                .filter('_type == "empPortal" && documentType == "blog"')
                                .defaultOrdering([{field: 'publishedAt', direction: 'desc'}]),
                            ),
                          S.listItem()
                            .title('Updates')
                            .child(
                              S.documentTypeList('empPortal')
                                .apiVersion(API_VERSION)
                                .title('Updates')
                                .filter('_type == "empPortal" && documentType == "update"')
                                .defaultOrdering([{field: 'publishedAt', direction: 'desc'}]),
                            ),
                        ]),
                    ),
                ]),
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
                .schemaType('expense')
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
                .schemaType('expense')
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

const buildVendorApplicationsList = (S: any) => {
  const baseList = S.documentTypeList('vendorApplication').apiVersion(API_VERSION)
  return S.documentList()
    .apiVersion(API_VERSION)
    .schemaType('vendorApplication')
    .title('Vendor Applications')
    .filter('_type == "vendorApplication"')
    .defaultOrdering([{field: 'submittedAt', direction: 'desc'}])
    .initialValueTemplates(baseList.getInitialValueTemplates())
    .menuItems(baseList.getMenuItems())
    .canHandleIntent(baseList.getCanHandleIntent())
}

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
      discountsStructure(S),
      createShippingSection(S),
      S.documentTypeListItem('invoice').title('Invoices').icon(ClipboardIcon),
      S.documentTypeListItem('quote').title('Quotes').icon(DocumentIcon),

      S.divider().title('Vendor Portal'),
      createVendorPortalSection(S),

      S.divider().title('F.A.S. Service Dept.'),
      createInStoreOperationsSection(S),

      S.divider().title('F.A.S. Resources'),
      employeeHubSection(S),
      createBlogSection(S),
      downloadsStructure(S),

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
        .id('log-drains')
        .title('Log Drains')
        .icon(DatabaseIcon)
        .child(
          S.documentList()
            .title('Log Drains')
            .schemaType('logDrain')
            .filter('_type == "logDrain"'),
        ),
      createAdminSection(S),
    ])
export default deskStructure
const createVendorApplicationsSubSection = (S: any) =>
  S.listItem()
    .id('vendor-applications')
    .title('Vendor Applications')
    .icon(ClipboardIcon)
    .child(buildVendorApplicationsList(S))
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
