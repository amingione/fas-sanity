// desk/deskStructure.ts

import type {StructureResolver} from 'sanity/structure'
import React from 'react'
import {
  MdPointOfSale,
  MdGroups,
  MdStorefront,
  MdLocalShipping,
  MdAdminPanelSettings,
} from 'react-icons/md'

import DocumentIframePreview from '../components/studio/DocumentIframePreview'
import BulkLabelGenerator from '../components/studio/BulkLabelGenerator'
import BulkPackingSlipGenerator from '../components/studio/BulkPackingSlipGenerator'
import FinancialDashboard from '../components/studio/FinancialDashboard'
import FinancialReports from '../components/studio/FinancialReports'
import BulkFulfillmentConsole from '../components/studio/BulkFulfillmentConsole'
import EnvSelfCheck from '../components/studio/EnvSelfCheck'
import ProductBulkEditor from '../components/studio/ProductBulkEditor'
import ProductListDashboard from '../components/studio/ProductListDashboard'
import FilterBulkAssignPane from '../components/studio/FilterBulkAssignPane'
import FilterBulkRemovePane from '../components/studio/FilterBulkRemovePane'
import FilterDeleteTagPane from '../components/studio/FilterDeleteTagPane'
import VendorAdminDashboard from '../components/studio/VendorAdminDashboard'
import VendorStatusBadge from '../components/inputs/VendorStatusBadge'
import InvoiceVisualEditor from '../components/studio/InvoiceVisualEditor'
import OrderStatusPreview from '../components/inputs/FulfillmentBadge'
import OrderDetailView from '../components/studio/OrderDetailView'
import CustomersHub from '../components/studio/CustomersHub'
import BankAccountsTool from '../components/studio/BankAccountsTool'
import CheckComposer from '../components/studio/CheckComposer'
import ProfitLossDashboard from '../components/studio/ProfitLossDashboard'
import SalesHub from '../components/studio/SalesHub'

const previewPaths: Record<string, string> = {
  product: '/product',
  customer: '/customer',
  invoice: '/invoice',
  shippingLabel: '/label',
  quote: '/quote',
  order: '/order',
  category: '/category',
}

const getPreviewViews = (S: any, schema: string) => {
  const views: any[] = []

  if (schema === 'order') {
    views.push(
      S.view
        .component(OrderDetailView as any)
        .title('Summary')
        .id('summary')
    )
  }

  views.push(S.view.form().id('form'))

  views.push(
    S.view
      .component((props: any) =>
        DocumentIframePreview({...props, basePath: previewPaths[schema] || ''})
      )
      .title('Preview')
      .id('preview')
  )

  if (schema === 'invoice') {
    views.push(
      S.view
        .component(InvoiceVisualEditor as any)
        .title('Visual Editor')
        .id('visual-editor')
    )
  }

  if (schema === 'order') {
    views.push(
      S.view
        .component(OrderStatusPreview as any)
        .title('Fulfillment Status')
        .id('fulfillment-status')
    )
  }

  return views.filter(Boolean)
}

const hubListItem = (S: any, id: string, title: string, icon: any, component: React.ComponentType) =>
  S.listItem()
    .id(id)
    .title(title)
    .icon(icon)
    .child(
      S.component()
        .id(`${id}-pane`)
        .title(title)
        .component(component as any)
    )

const componentPane = (S: any, id: string, title: string, component: React.ComponentType) =>
  S.listItem()
    .id(id)
    .title(title)
    .child(
      S.component()
        .id(`${id}-component`)
        .title(title)
        .component(component as any)
    )

const documentListWithPreview = (
  S: any,
  schemaType: string,
  title: string,
  options?: {hidden?: boolean}
) =>
  S.listItem({
    hidden: options?.hidden,
  })
    .id(`${schemaType}-list`)
    .title(title)
    .schemaType(schemaType)
    .child(
      S.documentTypeList(schemaType)
        .title(title)
        .child((documentId: string) =>
          S.document()
            .documentId(documentId)
            .schemaType(schemaType)
            .views(getPreviewViews(S, schemaType))
        )
    )

export const deskStructure: StructureResolver = (S) =>
  S.list()
    .title('F.A.S. Studio')
    .items([
      S.listItem()
        .id('sales-hub')
        .title('Sales & Get Paid')
        .icon(MdPointOfSale)
        .child(
          S.list()
            .title('Sales & Get Paid')
            .items([
              documentListWithPreview(S, 'order', 'Orders'),
              documentListWithPreview(S, 'invoice', 'Invoices'),
              componentPane(S, 'sales-dashboard', 'Sales Dashboard (Legacy)', SalesHub),
            ])
        ),
      hubListItem(S, 'customers-hub', 'Customer Hub', MdGroups, CustomersHub),
      S.listItem()
        .id('catalog')
        .title('Products & Content')
        .icon(MdStorefront)
        .child(
          S.list()
            .title('Products & Content')
            .items([
              componentPane(S, 'product-overview', 'Product Overview', ProductListDashboard),
              documentListWithPreview(S, 'product', 'Products'),
              documentListWithPreview(S, 'category', 'Categories'),
              documentListWithPreview(S, 'vehicleModel', 'Vehicles'),
              documentListWithPreview(S, 'filterTag', 'Filters'),
              S.listItem()
                .id('catalog-tools')
                .title('Catalog Tools')
                .child(
                  S.list()
                    .title('Catalog Tools')
                    .items([
                      componentPane(S, 'product-bulk-editor', 'Product Bulk Editor', ProductBulkEditor),
                      componentPane(S, 'filter-bulk-assign', 'Filter Bulk Assign', FilterBulkAssignPane),
                      componentPane(S, 'filter-bulk-remove', 'Filter Bulk Remove', FilterBulkRemovePane),
                      componentPane(S, 'filter-delete-tag', 'Filter Delete Tag', FilterDeleteTagPane),
                    ])
                ),
            ])
        ),
      S.listItem()
        .id('operations')
        .title('Operations')
        .icon(MdLocalShipping)
        .child(
          S.list()
            .title('Operations')
            .items([
              documentListWithPreview(S, 'shippingLabel', 'Shipping Labels'),
              componentPane(S, 'bulk-label-generator', 'Bulk Label Generator', BulkLabelGenerator),
              componentPane(S, 'packing-slip-generator', 'Packing Slip Generator', BulkPackingSlipGenerator),
              componentPane(S, 'fulfillment-console', 'Fulfillment Console', BulkFulfillmentConsole),
            ])
        ),
      S.listItem()
        .id('admin')
        .title('Admin & Finance')
        .icon(MdAdminPanelSettings)
        .child(
          S.list()
            .title('Admin & Finance')
            .items([
              componentPane(S, 'financial-dashboard', 'Financial Dashboard', FinancialDashboard),
              componentPane(S, 'financial-reports', 'Financial Reports', FinancialReports),
              componentPane(S, 'profit-loss-dashboard', 'Profit & Loss', ProfitLossDashboard),
              componentPane(S, 'bank-accounts', 'Bank Accounts', BankAccountsTool),
              documentListWithPreview(S, 'bankAccount', 'Bank Accounts'),
              componentPane(S, 'check-composer', 'Write Check', CheckComposer),
              documentListWithPreview(S, 'check', 'Checks'),
              componentPane(S, 'env-self-check', 'Environment Status', EnvSelfCheck),
              componentPane(S, 'vendor-admin-dashboard', 'Vendor Admin Dashboard', VendorAdminDashboard),
              S.listItem()
                .id('arenaSyncConfig')
                .title('Are.na Sync Configuration')
                .child(
                  S.document()
                    .schemaType('arenaSyncConfig')
                    .documentId('arenaSyncConfig')
                    .title('Are.na Sync Configuration')
                ),
              S.listItem()
                .id('vendors')
                .title('Vendors')
                .child(
                  S.documentTypeList('vendor')
                    .apiVersion('2024-10-01')
                    .title('Vendors')
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

      // Hidden foundational lists to keep intents (edit/create) working with custom views.
      documentListWithPreview(S, 'invoice', 'Invoices', {hidden: true}),
      documentListWithPreview(S, 'order', 'Orders', {hidden: true}),
      documentListWithPreview(S, 'quote', 'Quote Requests', {hidden: true}),
    ])
