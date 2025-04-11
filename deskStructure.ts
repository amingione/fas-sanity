import { StructureBuilder } from 'sanity/structure'
import CustomerDashboard from './components/studio/CustomerDashboard'
import BulkLabelGenerator from './components/studio/BulkLabelGenerator'
import BulkPackingSlipGenerator from './components/studio/BulkPackingSlipGenerator'
import FinancialDashboard from './components/studio/FinancialDashboard'
import FinancialReports from './components/studio/FinancialReports'

const deskStructure = (S: StructureBuilder) =>
  S.list()
    .title('Store')
    .items([
      S.listItem()
        .title('Products')
        .schemaType('wooProduct')
        .child(S.documentTypeList('wooProduct').title('Products')),

      S.listItem()
        .title('Categories')
        .schemaType('category')
        .child(S.documentTypeList('category').title('Categories')),

      S.divider(),
      
      S.listItem()
        .title('Build Quotes')
        .child(
          S.list()
            .title('Build Quotes Sections')
            .items([
              S.listItem()
                .title('Quote Requests')
                .schemaType('quote')
                .child(S.documentTypeList('quote').title('Quote Requests')),
              S.listItem()
                .title('Custom Builds')
                .schemaType('buildQuote')
                .child(S.documentTypeList('buildQuote').title('Custom Builds')),
            ])
        ),

      S.divider(),

      S.listItem()
        .title('Customers')
        .child(
          S.list()
            .title('Customer Data')
            .items([
              S.listItem()
                .title('Customer Profiles')
                .schemaType('customer')
                .child(S.documentTypeList('customer').title('Customer Profiles')),

              S.listItem()
                .title('Quote Requests')
                .schemaType('quote')
                .child(S.documentTypeList('quote').title('Quote Requests')),

              S.listItem()
                .title('Orders & Invoices')
                .schemaType('invoice')
                .child(S.documentTypeList('invoice').title('Orders & Invoices')),
            ])
        ),

      S.divider(),

      S.listItem()
        .title('Vendors')
        .schemaType('vendor')
        .child(S.documentTypeList('vendor').title('Vendors')),

      S.divider(),

      S.listItem()
        .title('Accounts Payable')
        .child(
          S.list()
            .title('Accounts Payable')
            .items([
              S.listItem()
                .title('Bills & Payables')
                .schemaType('bill')
                .child(S.documentTypeList('bill').title('Bills & Payables'))
            ])
        ),

      S.divider(),

      S.listItem()
        .title('Shipping Labels')
        .schemaType('shippingLabel')
        .child(S.documentTypeList('shippingLabel').title('Shipping Labels')),

      S.listItem()
        .title('Shipping Options')
        .schemaType('shippingOption')
        .child(S.documentTypeList('shippingOption')),

      S.listItem()
        .title('Orders & Fulfillment')
        .child(
          S.list()
            .title('Orders & Fulfillment')
            .items([
              S.listItem()
                .title('➕ Create Order')
                .child(
                  S.document()
                    .schemaType('invoice')
                    .documentId('new-invoice')
                    .title('New Order')
                ),
              S.listItem()
                .title('All Orders')
                .schemaType('invoice')
                .child(S.documentTypeList('invoice').title('All Orders')),
              S.listItem()
                .title('Unshipped Orders')
                .child(
                  S.documentList()
                    .title('Unshipped Orders')
                    .filter('_type == "invoice" && !defined(shippingLabel)')
                ),
              S.listItem()
                .title('Shipped Orders')
                .child(
                  S.documentList()
                    .title('Shipped Orders')
                    .filter('_type == "invoice" && defined(shippingLabel)')
                ),
              S.listItem()
                .title('Paid Orders')
                .child(
                  S.documentList()
                    .title('Paid Orders')
                    .filter('_type == "invoice" && status == "Paid"')
                ),
              S.listItem()
                .title('Shipped Orders (Tag)')
                .child(
                  S.documentList()
                    .title('Shipped Orders (Tag)')
                    .filter('_type == "invoice" && status == "Shipped"')
                ),
              S.listItem()
                .title('Delivered Orders (Tag)')
                .child(
                  S.documentList()
                    .title('Delivered Orders (Tag)')
                    .filter('_type == "invoice" && status == "Delivered"')
                ),
              S.listItem()
                .title('Stripe Orders')
                .child(
                  S.documentList()
                    .title('Stripe Orders')
                    .filter('_type == "invoice" && paymentMethod == $method')
                    .params({ method: 'Stripe' })
                ),
              S.listItem()
                .title('Next Day Air Orders')
                .child(
                  S.documentList()
                    .title('Next Day Air Orders')
                    .filter('_type == "invoice" && shippingMethod == $method')
                    .params({ method: 'Next Day Air' })
                ),
              S.listItem()
                .title('Unpaid Orders')
                .child(
                  S.documentList()
                    .title('Unpaid Orders')
                    .filter('_type == "invoice" && status == "Pending"')
                ),
              S.listItem()
                .title('Delivered Orders')
                .child(
                  S.documentList()
                    .title('Delivered Orders')
                    .filter('_type == "invoice" && status == "Delivered"')
                ),
              S.listItem()
                .title('Bulk Label Generator')
                .child(
                  S.component()
                    .title('Bulk Label Generator')
                    .component(BulkLabelGenerator)
                ),
              S.listItem()
                .title('Bulk Packing Slips')
                .child(
                  S.component()
                    .title('Bulk Packing Slips')
                    .component(BulkPackingSlipGenerator)
                ),
            ])
        ),

      S.listItem()
        .title('Customer Dashboard')
        .child(S.component().title('Dashboard').component(CustomerDashboard)),

      S.listItem()
        .title('Financial Dashboard')
        .child(
          S.component()
            .title('Financial Overview')
            .component(FinancialDashboard)
        ),

      S.listItem()
        .title('📥 Financial Reports')
        .child(
          S.component()
            .title('Downloadable Reports')
            .component(FinancialReports)
        ),

      S.divider(),

      // Optional: Site Settings
      S.listItem()
        .title('Site Settings')
        .id('globalSettings')
        .schemaType('siteSettings')
        .child(S.documentTypeList('siteSettings')),  
   
    ])

export default deskStructure