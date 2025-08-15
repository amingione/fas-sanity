// deskStructure.ts
import type {StructureResolver} from 'sanity/structure'
import { MdCategory, MdViewList, MdFilterList } from 'react-icons/md'
import DocumentIframePreview from './components/studio/DocumentIframePreview'
import CustomerDashboard from './components/studio/CustomerDashboard'
import BulkLabelGenerator from './components/studio/BulkLabelGenerator'
import BulkPackingSlipGenerator from './components/studio/BulkPackingSlipGenerator'
import FinancialDashboard from './components/studio/FinancialDashboard'
import FinancialReports from './components/studio/FinancialReports'
import BulkFulfillmentConsole from './components/studio/BulkFulfillmentConsole'
import OrderStatusPreview from './components/inputs/FulfillmentBadge'
import VendorStatusBadge from './components/inputs/VendorStatusBadge'

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

export const deskStructure: StructureResolver = (S, context) => {
  const safeListItem = (typeName: string, title: string, icon: any) => {
    return context.schema.get(typeName)
      ? S.listItem().title(title).icon(icon).child(S.documentTypeList(typeName).title(title))
      : S.listItem()
          .title(`⚠️ Missing: ${typeName} schema`)
          .child(
            S.component()
              .title('Schema Error')
              .component(() => `Schema "${typeName}" not found.`)
          )
  }

  const productListItems = [
    safeListItem('product', 'All Products', MdViewList),
    safeListItem('category', 'Categories', MdCategory),
    safeListItem('productFilter', 'Filters', MdFilterList),
  ]

  return S.list()
    .title('F.A.S. Motorsports')
    .items([
      S.listItem()
        .title('Products')
        .icon(MdViewList)
        .child(S.list().title('Products').items(productListItems)),

      S.divider(),

      ...(context.schema.get('customer')
        ? [S.documentTypeListItem('customer').title('Customers')]
        : []),
      ...(context.schema.get('invoice')
        ? [S.documentTypeListItem('invoice').title('Invoices')]
        : []),
      ...(context.schema.get('quote')
        ? [S.documentTypeListItem('quote').title('Quote Requests')]
        : []),
      ...(context.schema.get('order')
        ? [S.documentTypeListItem('order').title('Orders')]
        : []),
      ...(context.schema.get('shippingLabel')
        ? [S.documentTypeListItem('shippingLabel').title('Shipping Labels')]
        : []),

      S.divider(),

      S.listItem().title('📦 Bulk Label Generator').child(
        S.component().title('Bulk Label Generator').component(BulkLabelGenerator)
      ),
      S.listItem().title('📄 Packing Slip Generator').child(
        S.component().title('Bulk Packing Slips').component(BulkPackingSlipGenerator)
      ),
      S.listItem().title('📊 Financial Dashboard').child(
        S.component().title('Finance').component(FinancialDashboard)
      ),
      S.listItem().title('📥 Financial Reports').child(
        S.component().title('Reports').component(FinancialReports)
      ),
      S.listItem().title('🧾 Fulfillment Console').child(
        S.component().title('Console').component(BulkFulfillmentConsole)
      ),
      S.listItem().title('👤 Customer Dashboard').child(
        S.component().title('Customers').component(CustomerDashboard)
      ),

      S.listItem()
        .title('🛠 Admin Tools')
        .child(
          S.list()
            .title('Admin Tools')
            .items([
              S.listItem()
                .title('📝 Vendor Applications')
                .child(
                  S.documentTypeList('vendor')
                    .title('Vendor Applications')
                    .filter('_type == "vendor" && status == $status')
                    .params({ status: 'Pending' })
                    .child((id: string) =>
                      S.document()
                        .documentId(id)
                        .schemaType('vendor')
                        .views([
                          S.view.form(),
                          S.view.component(VendorStatusBadge).title('🟢 Status Badge'),
                        ])
                    )
                ),
            ])
        ),
    ])
}