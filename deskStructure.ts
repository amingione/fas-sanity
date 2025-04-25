// deskStructure.ts
// Removed StructureResolver as it is not exported from 'sanity/desk'
import DocumentIframePreview from './components/studio/DocumentIframePreview'
import { MdCategory, MdViewList, MdFilterList } from 'react-icons/md'
import CustomerDashboard from './components/studio/CustomerDashboard'
import BulkLabelGenerator from './components/studio/BulkLabelGenerator'
import BulkPackingSlipGenerator from './components/studio/BulkPackingSlipGenerator'
import FinancialDashboard from './components/studio/FinancialDashboard'
import FinancialReports from './components/studio/FinancialReports'
import BulkFulfillmentConsole from './components/studio/BulkFulfillmentConsole'
import OrderStatusPreview from './components/inputs/FulfillmentBadge'

const previewPaths: Record<string, string> = {
  product: '/product',
  customer: '/customer',
  invoice: '/invoice',
  shippingLabel: '/label',
  quote: '/quote',
  order: '/order',
}

const getPreviewViews = (S: any, schema: string) => [
  S.view.form(),
  S.view
    .component((props: any) => DocumentIframePreview({ ...props, basePath: previewPaths[schema] || '' }))
    .title('🔎 Preview'),
  schema === 'order' &&
    S.view.component(OrderStatusPreview).title('📌 Fulfillment Status'),
].filter(Boolean)

export const deskStructure = (S: any) =>
  S.list()
    .title('F.A.S. Motorsports')
    .items([
      S.listItem()
      .title('Products')
      .icon(MdViewList)
      .child(
        S.list()
          .title('Products')
          .items([
            S.documentTypeListItem('product').title('All Products'),
            S.listItem()
              .title('Categories')
              .icon(MdCategory)
              .child(S.documentTypeList('category').title('Categories')),
            S.listItem()
              .title('Filters')
              .icon(MdFilterList)
              .child(S.documentTypeList('productFilter').title('Filter'))
          ])
      ),
      

      S.divider(),

      S.documentTypeListItem('customer').title('Customers'),
      S.documentTypeListItem('invoice').title('Invoices'),
      S.documentTypeListItem('quote').title('Quote Requests'),
      S.documentTypeListItem('order').title('Orders'),
      S.documentTypeListItem('shippingLabel').title('Shipping Labels'),

      S.divider(),

      S.listItem().title('📦 Bulk Label Generator').child(S.component().title('Bulk Label Generator').component(BulkLabelGenerator)),
      S.listItem().title('📄 Packing Slip Generator').child(S.component().title('Bulk Packing Slips').component(BulkPackingSlipGenerator)),
      S.listItem().title('📊 Financial Dashboard').child(S.component().title('Finance').component(FinancialDashboard)),
      S.listItem().title('📥 Financial Reports').child(S.component().title('Reports').component(FinancialReports)),
      S.listItem().title('🧾 Fulfillment Console').child(S.component().title('Console').component(BulkFulfillmentConsole)),
      S.listItem().title('👤 Customer Dashboard').child(S.component().title('Customers').component(CustomerDashboard)),
    ])



  