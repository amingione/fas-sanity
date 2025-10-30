// deskStructure.ts
import type {StructureBuilder, StructureResolver} from 'sanity/structure'
import { MdCategory, MdViewList, MdFilterList } from 'react-icons/md'
import ordersStructure from './desk/ordersStructure'
import CustomerDashboard from './components/studio/CustomerDashboard'
import BulkLabelGenerator from './components/studio/BulkLabelGenerator'
import BulkPackingSlipGenerator from './components/studio/BulkPackingSlipGenerator'
import FinancialDashboard from './components/studio/FinancialDashboard'
import FinancialReports from './components/studio/FinancialReports'
import BulkFulfillmentConsole from './components/studio/BulkFulfillmentConsole'
import OrdersDashboard from './components/studio/OrdersDashboard'
import ProductListDashboard from './components/studio/ProductListDashboard'
import WebhooksDashboard from './components/studio/WebhooksDashboard'
import VendorStatusBadge from './components/inputs/VendorStatusBadge'
import StripeWebhookDashboard from './components/studio/StripeWebhookDashboard'

export const deskStructure: StructureResolver = (S, context) => {
  const safeListItem = (typeName: string, title: string, icon: any) => {
    return context.schema.get(typeName)
      ? S.listItem()
          .id(`mgr-${typeName}`)
          .title(title)
          .icon(icon)
          .child(
            S.documentTypeList(typeName)
              .apiVersion('2024-10-01')
              .title(title)
          )
      : S.listItem()
          .id(`missing-${typeName}`)
          .title(`Missing: ${typeName} schema`)
          .child(
            S.component()
              .title('Schema Error')
              .component(() => `Schema "${typeName}" not found.`)
          )
  }

  const productListItems = [
    S.listItem()
      .id('product-overview')
      .title('Overview')
      .icon(MdViewList)
      .child(S.component().title('Product Overview').component(ProductListDashboard as any)),
    safeListItem('product', 'All Products', MdViewList),
    safeListItem('category', 'Categories', MdCategory),
    safeListItem('productFilterDoc', 'Filters', MdFilterList),
  ]

  return S.list()
    .title('F.A.S. Motorsports')
    .items([
      S.listItem().id('products-root')
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
        ? [ordersStructure(S as StructureBuilder)]
        : []),
      ...(context.schema.get('expiredCart')
        ? [S.documentTypeListItem('expiredCart').title('Expired Carts')]
        : []),
      ...(context.schema.get('shippingLabel')
        ? [S.documentTypeListItem('shippingLabel').title('Shipping Labels')]
        : []),

      S.divider(),

      S.listItem().id('bulk-label-generator').title('📦 Bulk Label Generator').child(
        S.component().title('Bulk Label Generator').component(BulkLabelGenerator as any)
      ),
      S.listItem().id('packing-slip-generator').title('📄 Packing Slip Generator').child(
        S.component().title('Bulk Packing Slips').component(BulkPackingSlipGenerator as any)
      ),
      S.listItem().id('orders-dashboard').title('📦 Orders Dashboard').child(
        S.component().title('Orders Dashboard').component(OrdersDashboard as any)
      ),
      S.listItem().id('financial-dashboard').title('📊 Financial Dashboard').child(
        S.component().title('Finance').component(FinancialDashboard as any)
      ),
      S.listItem().id('financial-reports').title('📥 Financial Reports').child(
        S.component().title('Reports').component(FinancialReports as any)
      ),
      S.listItem().id('fulfillment-console').title('🧾 Fulfillment Console').child(
        S.component().title('Console').component(BulkFulfillmentConsole as any)
      ),
      S.listItem().id('customer-dashboard').title('👤 Customer Dashboard').child(
        S.component().title('Customers').component(CustomerDashboard as any)
      ),
      S.listItem().id('webhooks-dashboard').title('🔔 Webhooks Dashboard').child(
        S.component().title('Stripe Webhooks').component(WebhooksDashboard as any)
      ),

      S.listItem().id('admin-tools')
        .title('🛠 Admin Tools')
        .child(
          S.list()
            .title('Admin Tools')
            .items([
              S.listItem().id('stripe-webhook-dashboard')
                .title('🔔 Stripe Webhooks')
                .child(
                  S.component()
                    .title('Stripe Webhooks')
                    .component(StripeWebhookDashboard as any),
                ),
              S.listItem().id('vendor-applications')
                .title('📝 Vendor Applications')
                .child(
                  S.documentTypeList('vendor').apiVersion('2024-10-01')
                    .title('Vendor Applications')
                    .filter(
                      '_type == "vendor" && coalesce(status, select(approved == true => "Approved", "Pending")) == $status'
                    )
                    .params({ status: 'Pending' })
                    .child((id: string) =>
                      S.document()
                        .documentId(id)
                        .schemaType('vendor')
                        .views([
                          S.view.form().id('form'),
                          S.view.component(VendorStatusBadge as any).title('Status Badge').id('status-badge'),
                        ])
                    )
                ),
              S.listItem().id('vendor-profiles')
                .title('🤝 Vendor Profiles')
                .child(
                  S.documentTypeList('vendor').apiVersion('2024-10-01')
                    .title('Vendor Profiles')
                    .filter(
                      '_type == "vendor" && coalesce(status, select(approved == true => "Approved", "Pending")) == $status'
                    )
                    .params({ status: 'Approved' })
                    .child((id: string) =>
                      S.document()
                        .documentId(id)
                        .schemaType('vendor')
                        .views([
                          S.view.form().id('form'),
                          S.view.component(VendorStatusBadge as any).title('Status Badge').id('status-badge'),
                        ])
                    )
                ),
            ])
        ),
    ])
}
