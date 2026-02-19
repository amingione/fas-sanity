import type {DocumentActionsResolver} from 'sanity'
import {backfillProductAction} from './schemaTypes/documentActions/backfillProductAction'
import SyncMerchantFeedAction from './schemaTypes/documentActions/syncMerchantFeedAction'
import {forceDeleteUnlinkAction} from './schemaTypes/documentActions/forceDeleteUnlinkAction'

const resolveDocumentActions: DocumentActionsResolver = (prev, context) => {
  const list = [...prev]

  if (context.schemaType === 'product') {
    list.push(backfillProductAction)
    list.push(SyncMerchantFeedAction)
  }

  if (['vehicleModel', 'filterTag', 'product'].includes(context.schemaType)) {
    list.push(forceDeleteUnlinkAction)
  }

  return list
}

export default resolveDocumentActions
