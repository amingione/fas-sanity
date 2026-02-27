import type {StructureResolver} from 'sanity/structure'
import {
  BasketIcon,
  BillIcon,
  BulbOutlineIcon,
  CogIcon,
  ControlsIcon,
  DocumentIcon,
  DocumentTextIcon,
  HomeIcon,
  PresentationIcon,
  TagIcon,
} from '@sanity/icons'

const singleton = (S: any, type: string, id: string, title: string, icon?: any) =>
  S.listItem().id(id).title(title).icon(icon).child(S.editor().id(id).schemaType(type).documentId(id))

export const deskStructure: StructureResolver = (S) =>
  S.list()
    .title('F.A.S. Content')
    .items([
      singleton(S, 'home', 'home', 'Homepage', HomeIcon),
      S.divider(),
      S.listItem()
        .id('products')
        .title('Products')
        .icon(BasketIcon)
        .child(
          S.list()
            .title('Products')
            .items([
              S.documentTypeListItem('product').title('All Products'),
              S.documentTypeListItem('productVariant').title('Variants'),
              S.documentTypeListItem('category').title('Categories'),
              S.documentTypeListItem('collection').title('Collections'),
              S.documentTypeListItem('productBundle').title('Bundles'),
              S.documentTypeListItem('vehicleModel').title('Vehicle Models'),
              S.documentTypeListItem('tune').title('Tunes'),
              S.documentTypeListItem('filterTag').title('Filter Tags'),
              S.documentTypeListItem('badge').title('Badges'),
              S.documentTypeListItem('comparisonTable').title('Comparison Tables'),
              S.documentTypeListItem('downloadResource').title('Downloads & Resources'),
            ]),
        ),
      S.listItem()
        .id('marketing')
        .title('Marketing')
        .icon(BulbOutlineIcon)
        .child(
          S.list()
            .title('Marketing')
            .items([
              S.documentTypeListItem('campaign').title('Campaigns'),
              S.documentTypeListItem('promotion').title('Promotions'),
              S.documentTypeListItem('emailCampaign').title('Email Campaigns'),
              S.documentTypeListItem('emailTemplate').title('Email Templates'),
              S.documentTypeListItem('emailAutomation').title('Email Automations'),
              S.documentTypeListItem('merchantFeed').title('Merchant Feeds'),
              S.documentTypeListItem('shoppingCampaign').title('Shopping Campaigns'),
              S.documentTypeListItem('marketingChannel').title('Marketing Channels'),
              S.documentTypeListItem('attributionSnapshot').title('Attribution Snapshots'),
              S.documentTypeListItem('marketingOptIn').title('Marketing Opt-Ins'),
            ]),
        ),
      S.listItem()
        .id('content')
        .title('Content')
        .icon(DocumentTextIcon)
        .child(
          S.list()
            .title('Content')
            .items([
              S.documentTypeListItem('post').title('Blog Posts'),
              S.documentTypeListItem('blogCategory').title('Blog Categories'),
              S.documentTypeListItem('article').title('Articles'),
              S.documentTypeListItem('page').title('Landing Pages'),
              S.documentTypeListItem('faqPage').title('FAQ Pages'),
              S.documentTypeListItem('productTable').title('Product Tables'),
            ]),
        ),
      S.listItem()
        .id('site')
        .title('Site')
        .icon(ControlsIcon)
        .child(
          S.list()
            .title('Site')
            .items([
              singleton(S, 'settings', 'settings', 'Site Settings', CogIcon),
              singleton(S, 'dashboardView', 'dashboard-view', 'Dashboard View'),
              S.documentTypeListItem('navigationMenu').title('Navigation Menus'),
              S.documentTypeListItem('colorTheme').title('Color Themes').icon(PresentationIcon),
              S.documentTypeListItem('legalContent').title('Legal Content').icon(BillIcon),
              S.documentTypeListItem('storePolicy').title('Store Policies'),
              S.documentTypeListItem('altText').title('Alt Text Library'),
              S.documentTypeListItem('redirect').title('Redirects'),
            ]),
        ),
      S.listItem()
        .id('brand')
        .title('Brand')
        .icon(TagIcon)
        .child(
          S.list()
            .title('Brand')
            .items([
              S.documentTypeListItem('brandAsset').title('Brand Assets'),
              S.documentTypeListItem('reusableSnippet').title('Reusable Snippets'),
            ]),
        ),
      S.listItem()
        .id('templates')
        .title('Templates')
        .icon(DocumentIcon)
        .child(
          S.list()
            .title('Templates')
            .items([
              S.documentTypeListItem('orderEmailTemplate').title('Order Email Templates'),
              S.documentTypeListItem('quoteTemplate').title('Quote Templates'),
              S.documentTypeListItem('invoiceTemplate').title('Invoice Templates'),
            ]),
        ),
      S.listItem()
        .id('vendor-ops')
        .title('Vendor Ops')
        .icon(BillIcon)
        .child(
          S.list()
            .title('Vendor Ops')
            .items([
              S.documentTypeListItem('vendor').title('Vendor Accounts'),
              S.documentTypeListItem('vendorApplication').title('Vendor Applications'),
              S.documentTypeListItem('vendorOrder').title('Vendor Orders'),
              S.documentTypeListItem('vendorQuote').title('Vendor Quotes'),
              S.documentTypeListItem('invoice').title('Invoices'),
              S.documentTypeListItem('bill').title('Bills'),
              S.documentTypeListItem('vendorReturn').title('Vendor Returns'),
              S.documentTypeListItem('vendorDocument').title('Vendor Documents'),
              S.documentTypeListItem('vendorNotification').title('Vendor Notifications'),
              S.documentTypeListItem('vendorMessage').title('Vendor Messages'),
              S.documentTypeListItem('vendorActivityEvent').title('Vendor Timeline'),
              S.documentTypeListItem('customer').title('Customers'),
            ]),
        ),
    ])

export default deskStructure
