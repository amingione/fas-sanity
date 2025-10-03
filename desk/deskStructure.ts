// desk/deskStructure.ts

type StructureResolver = import('sanity/structure').StructureResolver
type UserComponent = import('sanity/structure').UserComponent

import React from 'react'

import DocumentIframePreview from '../components/studio/DocumentIframePreview'
import CustomerDashboard from '../components/studio/CustomerDashboard'
import BulkLabelGenerator from '../components/studio/BulkLabelGenerator'
import BulkPackingSlipGenerator from '../components/studio/BulkPackingSlipGenerator'
import FinancialDashboard from '../components/studio/FinancialDashboard'
import FinancialReports from '../components/studio/FinancialReports'
import BulkFulfillmentConsole from '../components/studio/BulkFulfillmentConsole'
import OrderStatusPreview from '../components/inputs/FulfillmentBadge' // shows <FulfillmentBadge />
import EnvSelfCheck from '../components/studio/EnvSelfCheck'
import BookingCalendar from '../components/studio/BookingCalendar'
import ProductBulkEditor from '../components/studio/ProductBulkEditor'
import FilterBulkAssign from '../components/studio/FilterBulkAssign'
import FilterBulkRemove from '../components/studio/FilterBulkRemove'
import FilterDeleteTag from '../components/studio/FilterDeleteTag'
import VendorAdminDashboard from '../components/studio/VendorAdminDashboard'
import VendorStatusBadge from '../components/inputs/VendorStatusBadge'

const previewPaths: Record<string, string> = {
  product: '/product',
  customer: '/customer',
  invoice: '/invoice',
  shippingLabel: '/label',
  quote: '/quote',
  order: '/order'
}

const EnvSelfCheckPane: UserComponent = function EnvSelfCheckPane(
  _props: React.ComponentProps<UserComponent>
) {
  return React.createElement(EnvSelfCheck)
}

const CustomerDashboardPane: UserComponent = function CustomerDashboardPane(
  props: React.ComponentProps<UserComponent>
) {
  return React.createElement(CustomerDashboard, props as any)
}

const getPreviewViews = (S: any, schema: string) => [
  S.view.form().id('form'),
  S.view
    .component((props: any) =>
      DocumentIframePreview({ ...props, basePath: previewPaths[schema] || '' })
    )
    .title('Preview')
    .id('preview'),
  schema === 'order' &&
    S.view
      .component(OrderStatusPreview)
      .title('Fulfillment Status')
      .id('fulfillment-status')
].filter(Boolean)

export const deskStructure: StructureResolver = (S, context) =>
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
                .views([S.view.form().id('form')])
            )
        ),

      // Categories (document type)
      S.listItem()
        .title('Categories')
        .schemaType('category')
        .child(
          S.documentTypeList('category')
            .title('Categories')
            .child((id: string) =>
              S.document()
                .documentId(id)
                .schemaType('category')
            )
        ),

      // Vehicles (document type)
      S.listItem()
        .title('Vehicles')
        .schemaType('vehicleModel')
        .child(
          S.documentTypeList('vehicleModel')
            .title('Vehicles')
            .child((id: string) =>
              S.document()
                .documentId(id)
                .schemaType('vehicleModel')
            )
        ),

      // Removed curated Filters panel to keep things simple. Use Product Filters (auto) instead.

  // Filters (document type, like Categories)
  S.listItem()
    .title('Filters')
    .schemaType('filterTag')
    .child(
      S.documentTypeList('filterTag')
        .title('Filters')
        .child((id: string) =>
          S.list()
            .title('Filter')
            .items([
              S.listItem()
                .title('Edit Filter')
                .child(
                  S.document().documentId(id).schemaType('filterTag')
                ),
              S.listItem()
                .title('Products with this filter')
                .child(
                  S.documentList()
                    .title('Products')
                    .schemaType('product')
                    .filter('references($id)')
                    .params({ id })
                ),
            ])
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
        .title('Bulk Label Generator')
        .child(S.component().title('Bulk Label Generator').component(BulkLabelGenerator)),

      S.listItem()
        .title('Packing Slip Generator')
        .child(S.component().title('Bulk Packing Slips').component(BulkPackingSlipGenerator)),

      S.listItem()
        .title('Financial Dashboard')
        .child(S.component().title('Finance').component(FinancialDashboard)),

      S.listItem()
        .title('Financial Reports')
        .child(S.component().title('Reports').component(FinancialReports)),

      S.listItem()
        .title('Fulfillment Console')
        .child(S.component().title('Console').component(BulkFulfillmentConsole)),

      S.listItem()
        .title('Customer Dashboard')
        .child(S.component().title('Customers').component(CustomerDashboardPane))

      ,
      S.listItem()
        .title('Product Bulk Editor')
        .child(S.component().title('Bulk Editor').component(ProductBulkEditor))

      ,
      S.listItem()
        .title('Booking Calendar')
        .child(S.component().title('Bookings').component(BookingCalendar))

      ,
      S.listItem()
        .title('Env Self‑Check')
        .child(S.component().title('Environment Status').component(EnvSelfCheckPane))

      ,
      S.listItem()
        .title('🛠 Admin Tools')
        .child(
          S.list()
            .title('Admin Tools')
            .items([
              S.listItem()
                .title('Vendor Applications')
                .child(
                  S.documentTypeList('vendor')
                    .title('Vendor Applications')
                    .apiVersion('2024-10-01')
                    .filter(
                      '_type == "vendor" && coalesce(status, select(approved == true => "Approved", "Pending")) == $status'
                    )
                    .params({status: 'Pending'})
                    .child((id: string) =>
                      S.document()
                        .documentId(id)
                        .schemaType('vendor')
                        .views([
                          S.view.form().id('form'),
                          S.view
                            .component(VendorStatusBadge)
                            .title('Status Badge')
                            .id('status-badge'),
                        ])
                    )
                ),
              S.listItem()
                .title('Vendor Profiles')
                .child(
                  S.documentTypeList('vendor')
                    .title('Vendor Profiles')
                    .apiVersion('2024-10-01')
                    .filter(
                      '_type == "vendor" && coalesce(status, select(approved == true => "Approved", "Pending")) == $status'
                    )
                    .params({status: 'Approved'})
                    .child((id: string) =>
                      S.document()
                        .documentId(id)
                        .schemaType('vendor')
                        .views([
                          S.view.form().id('form'),
                          S.view
                            .component(VendorStatusBadge)
                            .title('Status Badge')
                            .id('status-badge'),
                        ])
                    )
                ),
              S.listItem()
                .title('Vendor Admin')
                .child(
                  S.component()
                    .title('Vendor Admin Dashboard')
                    .component(VendorAdminDashboard)
                ),
            ])
        )
    ])
