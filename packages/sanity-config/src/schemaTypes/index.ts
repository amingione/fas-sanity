import {portableTextType} from './portableText/portableTextType'
import {portableTextSimpleType} from './portableText/portableTextSimpleType'

import {accordionGroupType} from './objects/module/accordionGroupType'
import {accordionType} from './objects/module/accordionType'
import {calloutType} from './objects/module/calloutType'
import {callToActionType} from './objects/module/callToActionType'
import {collectionReferenceType} from './objects/module/collectionReferenceType'
import {gridItemType} from './objects/module/gridItemType'
import {gridType} from './objects/module/gridType'
import {heroType} from './objects/module/heroType'
import {imageCallToActionType} from './objects/module/imageCallToActionType'
import {imageFeatureType} from './objects/module/imageFeatureType'
import {imageFeaturesType} from './objects/module/imageFeaturesType'
import {instagramType} from './objects/module/instagramType'
import {productFeaturesType} from './objects/module/productFeaturesType'
import {productWithVariantType} from './objects/module/productWithVariantType'
import {productReferenceType} from './objects/module/productReferenceType'

import {collectionGroupType} from './objects/collection/collectionGroupType'
import {collectionLinksType} from './objects/collection/collectionLinksType'

import {linkEmailType} from './objects/link/linkEmailType'
import {linkExternalType} from './objects/link/linkExternalType'
import {linkInternalType} from './objects/link/linkInternalType'
import {linkProductType} from './objects/link/linkProductType'

import {menuType} from './objects/global/menuType'
import {menuLinksType} from './objects/global/menuLinksType'
import {footerType} from './objects/global/footerType'
import {notFoundPageType} from './objects/global/notFoundPageType'

import {imageWithProductHotspotsType} from './objects/hotspot/imageWithProductHotspotsType'
import {productHotspotsType} from './objects/hotspot/productHotspotsType'
import {spotType} from './objects/hotspot/spotType'

import {seoType} from './objects/seoType'
import {specItemType} from './objects/specItemType'
import {attributeType} from './objects/attributeType'
import {kitItemType} from './objects/kitItemType'
import {mediaItemType} from './objects/mediaItemType'
import {collapsibleFeatureType} from './objects/collapsibleFeatureType'
import {addOnType} from './objects/addOnType'
import {productAddOnType} from './objects/productAddOnType'
import {productCustomizationType} from './objects/productCustomizationType'
import {customPaintType} from './objects/customPaintType'
import {colorValueType} from './objects/colorValueType'
import {stripeMetadataEntryType} from './objects/stripeMetadataEntryType'
import {stripePriceSnapshotType} from './objects/stripePriceSnapshotType'

import {customProductOptionColorType} from './objects/customProductOption/customProductOptionColorType'
import {customProductOptionColorObjectType} from './objects/customProductOption/customProductOptionColorObjectType'
import {customProductOptionSizeType} from './objects/customProductOption/customProductOptionSizeType'
import {customProductOptionSizeObjectType} from './objects/customProductOption/customProductOptionSizeObjectType'
import {customProductOptionCustomType} from './objects/customProductOption/customProductOptionCustomType'
import {customProductOptionCustomObjectType} from './objects/customProductOption/customProductOptionCustomObjectType'
import {legacyCustomProductOptionSizeType} from './objects/customProductOption/legacyCustomProductOptionSizeType'
import {legacyCustomProductOptionSizeObjectType} from './objects/customProductOption/legacyCustomProductOptionSizeObjectType'
import {legacyCustomProductOptionCustomType} from './objects/customProductOption/legacyCustomProductOptionCustomType'
import {legacyCustomProductOptionCustomObjectType} from './objects/customProductOption/legacyCustomProductOptionCustomObjectType'

import {badgeType} from './objects/badgeType'
import {comparisonRowType} from './objects/comparisonRowType'
import {faqItemType} from './objects/faqItemType'
import {templateBlockType} from './objects/templateBlockType'
import {megaMenuGroupType} from './objects/megaMenuGroupType'

import product from './documents/product'
import {productVariantType} from './documents/productVariant'
import category from './documents/category'
import {collectionType} from './documents/collection'
import {productBundle} from './documents/productBundle'
import filterTag from './documents/filterTag'
import tune from './documents/tune'
import vehicleModel from './documents/vehicleModel'
import altText from './documents/altText'
import downloadResource from './documents/downloadResource'
import internalDocCategory from './documents/internalDocCategory'
import productTable from './documents/productTable'
import wheelQuote from './documents/wheelQuote'

import blogPost from './documents/blog/blogPost'
import blogCategory from './documents/blog/blogCategory'
import article from './documents/article'
import {pageType} from './documents/page'

import campaign from './marketing/campaigns/campaign'
import marketingChannel from './marketing/marketingChannel'
import attributionSnapshot from './marketing/attributionSnapshot'
import promotion from './documents/promotion'
import emailCampaign from './documents/emailCampaign'
import emailTemplate from './documents/emailTemplate'
import emailAutomation from './documents/emailAutomation'
import marketingOptIn from './documents/marketingOptIn'
import merchantFeed from './documents/merchantFeed'
import shoppingCampaign from './documents/shoppingCampaign'

import {homeType} from './singletons/homeType'
import {settingsType as siteSettingsType} from './singletons/siteSettingsType'
import {dashboardViewType} from './singletons/dashboardViewType'
import {colorThemeType} from './documents/colorTheme'

import brandAsset from './documents/brandAsset'
import customer from './documents/customer'
import legalContent from './documents/legalContent'
import storePolicy from './documents/storePolicy'
import reusableSnippet from './documents/reusableSnippet'
import navigationMenu from './documents/navigationMenu'
import badge from './documents/badge'
import comparisonTable from './documents/comparisonTable'
import faqPage from './documents/faqPage'
import orderEmailTemplate from './documents/orderEmailTemplate'
import quoteTemplate from './documents/quoteTemplate'
import invoiceTemplate from './documents/invoiceTemplate'
import redirect from './documents/redirect'
import vendorActivityEvent from './documents/vendorActivityEvent'
import vendor from './documents/vendor'
import vendorApplication from './documents/vendorApplication'
import vendorAuthToken from './documents/vendorAuthToken'
import vendorContract from './documents/vendorContract'
import invoice from './documents/invoice'
import vendorQuote from './documents/vendorQuote'
import vendorOrder from './documents/vendorOrder'
import bill from './documents/bill'
import vendorNotification from './documents/vendorNotification'
import vendorDocument from './documents/vendorDocument'
import vendorReturn from './documents/vendorReturn'
import vendorMessage from './documents/vendorMessage'

const annotations = [linkEmailType, linkExternalType, linkInternalType, linkProductType]

const objects = [
  accordionGroupType,
  accordionType,
  calloutType,
  callToActionType,
  collectionGroupType,
  collectionLinksType,
  collectionReferenceType,
  gridItemType,
  gridType,
  heroType,
  imageCallToActionType,
  imageFeatureType,
  imageFeaturesType,
  imageWithProductHotspotsType,
  instagramType,
  productWithVariantType,
  productFeaturesType,
  productHotspotsType,
  productReferenceType,
  spotType,
  menuType,
  menuLinksType,
  footerType,
  notFoundPageType,
  seoType,
  specItemType,
  attributeType,
  kitItemType,
  mediaItemType,
  collapsibleFeatureType,
  addOnType,
  productAddOnType,
  productCustomizationType,
  customPaintType,
  colorValueType,
  stripeMetadataEntryType,
  stripePriceSnapshotType,
  customProductOptionColorType,
  customProductOptionColorObjectType,
  customProductOptionSizeType,
  customProductOptionSizeObjectType,
  customProductOptionCustomType,
  customProductOptionCustomObjectType,
  legacyCustomProductOptionSizeType,
  legacyCustomProductOptionSizeObjectType,
  legacyCustomProductOptionCustomType,
  legacyCustomProductOptionCustomObjectType,
  badgeType,
  comparisonRowType,
  faqItemType,
  templateBlockType,
  megaMenuGroupType,
]

const blocks = [portableTextType, portableTextSimpleType]

const singletons = [homeType, siteSettingsType, dashboardViewType]

const documents = [
  colorThemeType,
  pageType,
  blogPost,
  blogCategory,
  article,
  product,
  productVariantType,
  category,
  collectionType,
  productBundle,
  filterTag,
  tune,
  vehicleModel,
  altText,
  downloadResource,
  internalDocCategory,
  productTable,
  wheelQuote,
  campaign,
  marketingChannel,
  attributionSnapshot,
  promotion,
  emailCampaign,
  emailTemplate,
  emailAutomation,
  marketingOptIn,
  merchantFeed,
  shoppingCampaign,
  brandAsset,
  customer,
  legalContent,
  storePolicy,
  reusableSnippet,
  navigationMenu,
  badge,
  comparisonTable,
  faqPage,
  orderEmailTemplate,
  quoteTemplate,
  invoiceTemplate,
  redirect,
  vendor,
  vendorApplication,
  vendorActivityEvent,
  vendorAuthToken,
  vendorContract,
  invoice,
  vendorQuote,
  vendorOrder,
  bill,
  vendorNotification,
  vendorDocument,
  vendorReturn,
  vendorMessage,
]

export const schemaTypes = [...annotations, ...objects, ...singletons, ...blocks, ...documents]

export default schemaTypes
