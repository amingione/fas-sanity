// desk/deskStructure.ts

type StructureResolver = import('sanity/structure').StructureResolver

import DocumentIframePreview from '../components/studio/DocumentIframePreview'
import CustomerDashboard from '../components/studio/CustomerDashboard'
import BulkLabelGenerator from '../components/studio/BulkLabelGenerator'
import BulkPackingSlipGenerator from '../components/studio/BulkPackingSlipGenerator'
import FinancialDashboard from '../components/studio/FinancialDashboard'
import FinancialReports from '../components/studio/FinancialReports'
import BulkFulfillmentConsole from '../components/studio/BulkFulfillmentConsole'
import OrderStatusPreview from '../components/inputs/FulfillmentBadge' // shows <FulfillmentBadge />
import EnvSelfCheck from '../components/studio/EnvSelfCheck'

const previewPaths: Record<string, string> = {
  product: '/product',
  customer: '/customer',
  invoice: '/invoice',
  shippingLabel: '/label',
  quote: '/quote',
  order: '/order'
}

const getPreviewViews = (S: any, schema: string) => [
  S.view.form(),
  S.view
    .component((props: any) =>
      DocumentIframePreview({ ...props, basePath: previewPaths[schema] || '' })
    )
    .title('🔎 Preview'),
  schema === 'order' &&
    S.view
      .component(OrderStatusPreview)
      .title('📌 Fulfillment Status')
].filter(Boolean)

export const deskStructure: StructureResolver = (S) =>
  S.list()
    .title('F.A.S. Motorsports')
    .items([
      S.listItem()
        .title('All Products')
        .schemaType('product')
        .child(
          S.documentTypeList('product')
            .title('All Products')
            .child((id: string) =>
              S.document()
                .documentId(id)
                .schemaType('product')
                .views(getPreviewViews(S, 'product'))
            )
        ),

      S.listItem()
        .title('Filters')
        .schemaType('productFilterDoc')
        .child(
          S.documentTypeList('productFilterDoc')
            .title('Filters')
            .child((id: string) =>
              S.document()
                .documentId(id)
                .schemaType('productFilterDoc')
                .views(getPreviewViews(S, 'productFilterDoc'))
            )
        ),

      S.divider(),

      S.listItem()
        .title('Quote Requests')
        .schemaType('quote')
        .child(
          S.documentTypeList('quote')
            .title('Quote Requests')
            .child((id: string) =>
              S.document()
                .documentId(id)
                .schemaType('quote')
                .views(getPreviewViews(S, 'quote'))
            )
        ),

      S.listItem()
        .title('Shipping Labels')
        .schemaType('shippingLabel')
        .child(
          S.documentTypeList('shippingLabel')
            .title('Shipping Labels')
            .child((id: string) =>
              S.document()
                .documentId(id)
                .schemaType('shippingLabel')
                .views(getPreviewViews(S, 'shippingLabel'))
            )
        ),

      S.listItem()
        .title('Orders')
        .schemaType('order')
        .child(
          S.documentTypeList('order')
            .title('Orders')
            .child((id: string) =>
              S.document()
                .documentId(id)
                .schemaType('order')
                .views(getPreviewViews(S, 'order'))
            )
        ),

      S.listItem()
        .title('Invoices')
        .schemaType('invoice')
        .child(
          S.documentTypeList('invoice')
            .title('Invoices')
            .child((id: string) =>
              S.document()
                .documentId(id)
                .schemaType('invoice')
                .views(getPreviewViews(S, 'invoice'))
            )
        ),

      S.listItem()
        .title('Customers')
        .schemaType('customer')
        .child(
          S.documentTypeList('customer')
            .title('Customers')
            .child((id: string) =>
              S.document()
                .documentId(id)
                .schemaType('customer')
                .views(getPreviewViews(S, 'customer'))
            )
        ),

      S.divider(),

      S.listItem()
        .title('📦 Bulk Label Generator')
        .child(S.component().title('Bulk Label Generator').component(BulkLabelGenerator)),

      S.listItem()
        .title('📄 Packing Slip Generator')
        .child(S.component().title('Bulk Packing Slips').component(BulkPackingSlipGenerator)),

      S.listItem()
        .title('📊 Financial Dashboard')
        .child(S.component().title('Finance').component(FinancialDashboard)),

      S.listItem()
        .title('📥 Financial Reports')
        .child(S.component().title('Reports').component(FinancialReports)),

      S.listItem()
        .title('🧾 Fulfillment Console')
        .child(S.component().title('Console').component(BulkFulfillmentConsole)),

      S.listItem()
        .title('👤 Customer Dashboard')
        .child(S.component().title('Customers').component(CustomerDashboard))

      ,
      S.listItem()
        .title('🔒 Env Self‑Check')
        .child(S.component().title('Environment Status').component(EnvSelfCheck))
    ])
