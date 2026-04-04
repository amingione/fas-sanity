import type {DocumentActionsResolver} from 'sanity'
import SyncMerchantFeedAction from './schemaTypes/documentActions/syncMerchantFeedAction'
import {forceDeleteUnlinkAction} from './schemaTypes/documentActions/forceDeleteUnlinkAction'
import {syncVendorTierAction} from './schemaTypes/documentActions/syncVendorTierAction'
import {
  convertVendorQuoteAction,
  sendVendorQuoteEmailAction,
} from './schemaTypes/documentActions/vendorQuoteActions'
import {
  convertVendorInvoiceToOrderAction,
  printInvoiceAction,
  sendInvoiceEmailAction,
} from './schemaTypes/documentActions/vendorInvoiceActions'

const resolveDocumentActions: DocumentActionsResolver = (prev, context) => {
  const list = [...prev]

  if (context.schemaType === 'product') {
    list.push(SyncMerchantFeedAction)
  }

  if (['vehicleModel', 'filterTag', 'product'].includes(context.schemaType)) {
    list.push(forceDeleteUnlinkAction)
  }

  // Vendor tier → Medusa customer group sync
  if (context.schemaType === 'vendor') {
    list.push(syncVendorTierAction)
  }

  if (context.schemaType === 'vendorQuote') {
    list.push(sendVendorQuoteEmailAction)
    list.push(convertVendorQuoteAction)
  }

  if (context.schemaType === 'invoice') {
    list.push(printInvoiceAction)
    list.push(sendInvoiceEmailAction)
    list.push(convertVendorInvoiceToOrderAction)
  }

  return list
}

export default resolveDocumentActions
