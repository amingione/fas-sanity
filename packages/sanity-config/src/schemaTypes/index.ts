import product from './documents/product'
import category from './documents/category'
import order from './documents/order'
import abandonedCheckout from './documents/abandonedCheckout'
import bill from './documents/bill'
import checkoutSession from './documents/checkoutSession'
import merchantFeed from './documents/merchantFeed'
import shoppingCampaign from './documents/shoppingCampaign'
import blogCategory from './documents/blog/blogCategory'
import blogPost from './documents/blog/blogPost'
import {buildQuote} from './objects/buildQuote'
import {accordionGroupType} from './objects/module/accordionGroupType'
import {accordionType} from './objects/module/accordionType'
import {calloutType} from './objects/module/calloutType'
import {callToActionType} from './objects/module/callToActionType'
import {collectionGroupType} from './objects/collection/collectionGroupType'
import {collectionLinksType} from './objects/collection/collectionLinksType'
import {collectionReferenceType} from './objects/module/collectionReferenceType'
import {collapsibleFeatureType} from './objects/collapsibleFeatureType'
import {collectionRuleType} from './objects/shopify/collectionRuleType'
import {customProductOptionColorObjectType} from './objects/customProductOption/customProductOptionColorObjectType'
import {customProductOptionColorType} from './objects/customProductOption/customProductOptionColorType'
import {customProductOptionSizeObjectType} from './objects/customProductOption/customProductOptionSizeObjectType'
import {customProductOptionSizeType} from './objects/customProductOption/customProductOptionSizeType'
import {customProductOptionCustomObjectType} from './objects/customProductOption/customProductOptionCustomObjectType'
import {customProductOptionCustomType} from './objects/customProductOption/customProductOptionCustomType'
import {footerType} from './objects/global/footerType'
import {gridItemType} from './objects/module/gridItemType'
import {gridType} from './objects/module/gridType'
import {heroType} from './objects/module/heroType'
import {imageCallToActionType} from './objects/module/imageCallToActionType'
import {imageFeaturesType} from './objects/module/imageFeaturesType'
import {imageFeatureType} from './objects/module/imageFeatureType'
import {imageWithProductHotspotsType} from './objects/hotspot/imageWithProductHotspotsType'
import {instagramType} from './objects/module/instagramType'
import {inventoryType} from './objects/shopify/inventoryType'
import {linkEmailType} from './objects/link/linkEmailType'
import {linkExternalType} from './objects/link/linkExternalType'
import {linkInternalType} from './objects/link/linkInternalType'
import {linkProductType} from './objects/link/linkProductType'
import {menuLinksType} from './objects/global/menuLinksType'
import {menuType} from './objects/global/menuType'
import {notFoundPageType} from './objects/global/notFoundPageType'
import {optionType} from './objects/shopify/optionType'
import {placeholderStringType} from './objects/shopify/placeholderStringType'
import {priceRangeType} from './objects/shopify/priceRangeType'
import {productFeaturesType} from './objects/module/productFeaturesType'
import {productHotspotsType} from './objects/hotspot/productHotspotsType'
import {productReferenceType} from './objects/module/productReferenceType'
import {productWithVariantType} from './objects/shopify/productWithVariantType'
import {proxyStringType} from './objects/shopify/proxyStringType'
import {pricingTierType} from './objects/pricingTierType'
import {customPaintType} from './objects/customPaintType'
import {addOnType} from './objects/addOnType'
import {productAddOnType} from './objects/productAddOnType'
import {specItemType} from './objects/specItemType'
import {kitItemType} from './objects/kitItemType'
import {attributeType} from './objects/attributeType'
import {mediaItemType} from './objects/mediaItemType'
import {productCustomizationType} from './objects/productCustomizationType'
import {billToType} from './objects/billToType'
import {shipToType} from './objects/shipToType'
import {quoteLineItemType} from './objects/quoteLineItemType'
import {quoteTimelineEventType} from './objects/quoteTimelineEventType'
import {shipFromAddressType} from './objects/shipFromType'
import {shipToAddressType} from './objects/shipToSnakeType'
import {shipmentWeightType} from './objects/shipmentWeightType'
import {packageDimensionsType} from './objects/packageDimensionsType'
import {modListItemType} from './objects/modListItemType'
import {invoiceLineItemType} from './objects/invoiceLineItemType'
import {checkLineItemType} from './objects/checkLineItemType'
import {customerBillingAddressType} from './objects/customerBillingAddressType'
import {customerOrderSummaryType} from './objects/customerOrderSummaryType'
import {customerInvoiceSummaryType} from './objects/customerInvoiceSummaryType'
import {customerQuoteSummaryType} from './objects/customerQuoteSummaryType'
import {customerAddressType} from './objects/customerAddressType'
import {customerDiscountType} from './objects/customerDiscountType'
import {vendorOrderSummaryType} from './objects/vendorOrderSummaryType'
import {vendorQuoteSummaryType} from './objects/vendorQuoteSummaryType'
import {orderCartItemType} from './objects/orderCartItemType'
import {orderCartItemMetaType} from './objects/orderCartItemMetaType'
import {orderEventType} from './objects/orderEventType'
import {shippingAddressType} from './objects/shippingAddressType'
import {shippingLogEntryType} from './objects/shippingLogEntryType'
import {shippingOptionCustomerAddressType} from './objects/shippingOptionCustomerAddressType'
import {shippingOptionDimensionsType} from './objects/shippingOptionDimensionsType'
import {packageDetailsType} from './objects/packageDetailsType'
import {seoType} from './objects/seoType'
import {shopifyCollectionType} from './objects/shopify/shopifyCollectionType'
import {shopifyProductType} from './objects/shopify/shopifyProductType'
import {shopifyProductVariantType} from './objects/shopify/shopifyProductVariantType'
import {spotType} from './objects/hotspot/spotType'
import {stripePriceSnapshotType} from './objects/stripePriceSnapshotType'
import {stripeOrderSummaryType} from './objects/stripeOrderSummaryType'
import {stripeMetadataEntryType} from './objects/stripeMetadataEntry'
import {stripePaymentMethodType} from './objects/stripePaymentMethodType'
import {colorValueType} from './objects/colorValueType'
import tune from './documents/tune'
import wheelQuote from './documents/wheelQuote'
import downloadResource from './documents/downloadResource'
import campaign from './marketing/campaigns/campaign'
import marketingChannel from './marketing/marketingChannel'
import altText from './documents/altText'
import customerPortalAccess from './documents/customerPortalAccess'

const annotations = [linkEmailType, linkExternalType, linkInternalType, linkProductType]

const objects = [
  accordionGroupType,
  accordionType,
  colorValueType,
  calloutType,
  callToActionType,
  collectionGroupType,
  collectionLinksType,
  collectionReferenceType,
  collapsibleFeatureType,
  collectionRuleType,
  customProductOptionColorObjectType,
  customProductOptionColorType,
  customProductOptionSizeObjectType,
  customProductOptionSizeType,
  customProductOptionCustomObjectType,
  customProductOptionCustomType,
  footerType,
  gridItemType,
  gridType,
  heroType,
  imageCallToActionType,
  imageFeaturesType,
  imageFeatureType,
  imageWithProductHotspotsType,
  instagramType,
  inventoryType,
  menuLinksType,
  menuType,
  notFoundPageType,
  optionType,
  placeholderStringType,
  priceRangeType,
  productFeaturesType,
  productHotspotsType,
  productReferenceType,
  productWithVariantType,
  proxyStringType,
  pricingTierType,
  customPaintType,
  addOnType,
  productAddOnType,
  specItemType,
  kitItemType,
  attributeType,
  mediaItemType,
  productCustomizationType,
  billToType,
  shipToType,
  quoteLineItemType,
  quoteTimelineEventType,
  shipFromAddressType,
  shipToAddressType,
  shipmentWeightType,
  packageDimensionsType,
  modListItemType,
  invoiceLineItemType,
  checkLineItemType,
  customerBillingAddressType,
  customerOrderSummaryType,
  customerInvoiceSummaryType,
  customerQuoteSummaryType,
  customerAddressType,
  customerDiscountType,
  vendorOrderSummaryType,
  vendorQuoteSummaryType,
  orderCartItemType,
  orderCartItemMetaType,
  orderEventType,
  shippingAddressType,
  shippingLogEntryType,
  shippingOptionCustomerAddressType,
  shippingOptionDimensionsType,
  packageDetailsType,
  seoType,
  shopifyCollectionType,
  shopifyProductType,
  shopifyProductVariantType,
  spotType,
  stripePriceSnapshotType,
  stripeOrderSummaryType,
  stripeMetadataEntryType,
  stripePaymentMethodType,
  {
    name: 'siteSettings',
    type: 'document',
    title: 'Site Settings',
    fields: [
      {name: 'title', type: 'string', title: 'Site Title'},
      {name: 'description', type: 'text', title: 'Site Description'},
      {
        name: 'logo',
        type: 'image',
        title: 'Logo',
        options: {hotspot: true},
      },
      {
        name: 'favicon',
        type: 'image',
        title: 'Favicon',
        options: {hotspot: true},
      },
      {
        name: 'nextMpnNumber',
        type: 'number',
        title: 'Next MPN Serial Number',
        description: 'Auto-incrementing serial number for MPN generation',
        initialValue: 636,
      },
      {
        name: 'nextVendorNumber',
        type: 'number',
        title: 'Next Vendor Number',
        description: 'Auto-incrementing vendor number seed (e.g., 201 => VEN-201)',
        initialValue: 201,
      },
      {name: 'seo', type: 'seo', title: 'Global SEO'},
    ],
  },
]

import {portableTextType} from './portableText/portableTextType'
import {portableTextSimpleType} from './portableText/portableTextSimpleType'

const blocks = [portableTextType, portableTextSimpleType]

import {collectionType} from './documents/collection'
import {colorThemeType} from './documents/colorTheme'
import {pageType} from './documents/page'
import expiredCart from './documents/expiredCart'
import {productVariantType} from './documents/productVariant'
import vehicleModel from './documents/vehicleModel'
import {productBundle} from './documents/productBundle'
import filterTag from './documents/filterTag'
import quote from './documents/quote'
import paymentLink from './documents/paymentLink'
import shippingLabel from './documents/shippingLabel'
import shipment from './documents/shipment'
import pickup from './documents/pickup'
import schedulePickup from './documents/schedulePickup'
import senderAddress from './documents/senderAddress'
import createLabel from './documents/createLabel'
import invoice from './documents/invoice'
import stripeWebhook from './documents/stripeWebhook'
import stripeCoupon from './documents/stripeCoupon'
import functionLog from './documents/functionLog'
import vendor from './documents/vendor'
import vendorApplication from './documents/vendorApplication'
import purchaseOrder from './documents/purchaseOrder'
import vendorMessage from './documents/vendorMessage'
import vendorNotification from './documents/vendorNotification'
import vendorProduct from './documents/vendorProduct'
import vendorDocument from './documents/vendorDocument'
import orderTemplate from './documents/orderTemplate'
import vendorReturn from './documents/vendorReturn'
import vendorFeedback from './documents/vendorFeedback'
import vendorQuote from './documents/vendorQuote'
import customer from './documents/customer'
import shippingOption from './documents/shippingOption'
import freightQuote from './documents/freightQuote'
import {bankAccountType} from './documents/bankAccount'
import {checkType} from './documents/check'
import expense from './documents/expense'
import profitLoss from './documents/profitLoss'
import cashFlow from './documents/cashFlow'
import stripeWebhookEvent from './documents/stripeWebhookEvent'
import emailCampaign from './documents/emailCampaign'
import emailTemplate from './documents/emailTemplate'
import emailAutomation from './documents/emailAutomation'
import emailLog from './documents/emailLog'
import vendorEmailLog from './documents/vendorEmailLog'
import vendorPost from './documents/vendorPost'
import vendorPostCategory from './documents/vendorPostCategory'
import integrationPack from './documents/integrationPack'
import connectorInstall from './documents/connectorInstall'
import workspace from './documents/workspace'
import attribution from './documents/attribution'
import marketingOptIn from './documents/marketingOptIn'
import service from './documents/service'
import appointment from './documents/appointment'
import workOrder from './documents/workOrder'
import vehicle from './documents/vehicle'
import inventory from './documents/inventoryRecord'
import inventoryTransaction from './documents/inventoryTransaction'
import manufacturingOrder from './documents/manufacturingOrder'
import attributionSnapshot from './marketing/attributionSnapshot'
import user from './documents/user'
import {analyticsSettingsType} from './documents/analyticsSettings'
import {searchSettingsType} from './documents/searchSettings'
import {searchQueryType} from './documents/searchQuery'
import customerMessage from './documents/customerMessage'
import quoteRequest from './documents/quoteRequest'
import promotion from './documents/promotion'
import vendorAuthToken from './documents/vendorAuthToken'
import empProfile from './documents/empProfile'
import empResources from './documents/empResources'
import empPortal from './documents/empPortal/empPortal'
import empFormSubmission from './documents/empFormSubmission'

const documents = [
  collectionType,
  colorThemeType,
  pageType,
  blogPost,
  product,
  productVariantType,
  quote,
  paymentLink,
  shippingLabel,
  invoice,
  stripeCoupon,
  stripeWebhook,
  functionLog,
  vendorApplication,
  vendor,
  purchaseOrder,
  vendorMessage,
  vendorNotification,
  vendorProduct,
  vendorDocument,
  orderTemplate,
  vendorReturn,
  vendorFeedback,
  vendorQuote,
  vendorPost,
  vendorPostCategory,
  vendorEmailLog,
  integrationPack,
  connectorInstall,
  workspace,
  bill,
  checkoutSession,
  order,
  abandonedCheckout,
  service,
  appointment,
  workOrder,
  manufacturingOrder,
  inventory,
  inventoryTransaction,
  expiredCart,
  category,
  blogCategory,
  productBundle,
  bankAccountType,
  checkType,
  customer,
  customerPortalAccess,
  vehicle,
  shippingOption,
  shipment,
  pickup,
  schedulePickup,
  senderAddress,
  createLabel,
  freightQuote,
  vehicleModel,
  filterTag,
  tune,
  wheelQuote,
  expense,
  profitLoss,
  cashFlow,
  stripeWebhookEvent,
  emailCampaign,
  emailTemplate,
  emailAutomation,
  emailLog,
  user,
  marketingOptIn,
  merchantFeed,
  shoppingCampaign,
  campaign,
  attribution,
  attributionSnapshot,
  marketingChannel,
  downloadResource,
  altText,
  searchQueryType,
  promotion,
  vendorAuthToken,
  empProfile,
  empResources,
  empPortal,
  empFormSubmission,
]

import {homeType} from './singletons/homeType'
import {settingsType as siteSettingsType} from './singletons/siteSettingsType'
import {dashboardViewType} from './singletons/dashboardViewType'
import {shippingSettingsType} from './singletons/shippingSettings'
import printSettings from './documents/printSettings'

const singletons = [
  homeType,
  siteSettingsType,
  dashboardViewType,
  shippingSettingsType,
  analyticsSettingsType,
  searchSettingsType,
]

export const schemaTypes = [
  ...annotations,
  ...objects,
  ...singletons,
  ...blocks,
  ...documents,
  buildQuote,
  printSettings,
  customerMessage,
  quoteRequest,
]
