import product from './documents/product'
import category from './documents/category'
import order from './documents/order'
import tag from './documents/tag'
import bill from './documents/bill'
import {buildQuote} from './objects/buildQuote'
import {accordionGroupType} from './objects/module/accordionGroupType'
import {accordionType} from './objects/module/accordionType'
import {calloutType} from './objects/module/calloutType'
import {callToActionType} from './objects/module/callToActionType'
import {collectionGroupType} from './objects/collection/collectionGroupType'
import {collectionLinksType} from './objects/collection/collectionLinksType'
import {collectionReferenceType} from './objects/module/collectionReferenceType'
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
import {specItemType} from './objects/specItemType'
import {kitItemType} from './objects/kitItemType'
import {attributeType} from './objects/attributeType'
import {mediaItemType} from './objects/mediaItemType'
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
import tune from './documents/tune'
import wheelQuote from './documents/wheelQuote'
import {blogPostType} from './documents/blogPost'
import {blogTemplateType} from './documents/blogTemplate'
import {emailMarketingCampaignType} from './documents/emailMarketingCampaign'
import {outreachEmailTemplateLibraryType} from './documents/outreachEmailTemplateLibrary'

const annotations = [linkEmailType, linkExternalType, linkInternalType, linkProductType]

const objects = [
  accordionGroupType,
  accordionType,
  calloutType,
  callToActionType,
  collectionGroupType,
  collectionLinksType,
  collectionReferenceType,
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
  specItemType,
  kitItemType,
  attributeType,
  mediaItemType,
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
import checkout from './documents/checkout'
import {productVariantType} from './documents/productVariant'
import vehicleModel from './documents/vehicleModel'
import {productBundle} from './documents/productBundle'
import filterTag from './documents/filterTag'
import quote from './documents/quote'
import paymentLink from './documents/paymentLink'
import shippingLabel from './documents/shippingLabel'
import invoice from './documents/invoice'
import stripeWebhook from './documents/stripeWebhook'
import vendor from './documents/vendor'
import customer from './documents/customer'
import shippingOption from './documents/shippingOption'
import freightQuote from './documents/freightQuote'
import shipment from './documents/shipping/shipment'
import {bankAccountType} from './documents/bankAccount'
import {checkType} from './documents/check'
import expense from './documents/expense'
import booking from './documents/booking'
import stripeWebhookEvent from './documents/stripeWebhookEvent'
import stripeEvent from './documents/integrations/stripeEvent'

const documents = [
  collectionType,
  colorThemeType,
  pageType,
  blogPostType,
  blogTemplateType,
  emailMarketingCampaignType,
  outreachEmailTemplateLibraryType,
  product,
  productVariantType,
  quote,
  paymentLink,
  shippingLabel,
  invoice,
  stripeWebhook,
  vendor,
  bill,
  order,
  expiredCart,
  checkout,
  category,
  productBundle,
  tag,
  bankAccountType,
  checkType,
  customer,
  shippingOption,
  shipment,
  freightQuote,
  vehicleModel,
  filterTag,
  tune,
  wheelQuote,
  expense,
  booking,
  stripeWebhookEvent,
  stripeEvent,
]

import {homeType} from './singletons/homeType'
import {settingsType as siteSettingsType} from './singletons/siteSettingsType'

const singletons = [homeType, siteSettingsType]

export const schemaTypes = [
  ...annotations,
  ...objects,
  ...singletons,
  ...blocks,
  ...documents,
  buildQuote,
]
