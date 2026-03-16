import type {DocumentActionsResolver} from 'sanity'
import {backfillProductAction} from './schemaTypes/documentActions/backfillProductAction'
import SyncMerchantFeedAction from './schemaTypes/documentActions/syncMerchantFeedAction'
import {forceDeleteUnlinkAction} from './schemaTypes/documentActions/forceDeleteUnlinkAction'
import {syncVendorTierAction} from './schemaTypes/documentActions/syncVendorTierAction'

const resolveDocumentActions: DocumentActionsResolver = (prev, context) => {
  const list = [...prev]

  if (context.schemaType === 'product') {
    list.push(backfillProductAction)
    list.push(SyncMerchantFeedAction)
  }

  if (['vehicleModel', 'filterTag', 'product'].includes(context.schemaType)) {
    list.push(forceDeleteUnlinkAction)
  }

  // Vendor tier → Medusa customer group sync
  if (context.schemaType === 'vendor') {
    list.push(syncVendorTierAction)
  }

  return list
}

export default resolveDocumentActions
