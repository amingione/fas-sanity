// resolveDocumentActions.ts
import type { DocumentActionsResolver } from 'sanity'
import { createShippingLabel } from './schemaTypes/documentActions/invoiceActions'
import { reprocessStripeSessionAction } from './schemaTypes/documentActions/reprocessStripeAction'
import { cancelStripeOrderAction } from './schemaTypes/documentActions/cancelStripeOrderAction'
import { backfillInvoicesAction } from './schemaTypes/documentActions/backfillInvoicesAction'
import { backfillOrdersAction } from './schemaTypes/documentActions/backfillOrdersAction'
import { backfillCustomersAction } from './schemaTypes/documentActions/backfillCustomersAction'
import { forceDeleteUnlinkAction } from './schemaTypes/documentActions/forceDeleteUnlinkAction'
import {
  refundStripeInvoiceAction,
  refundStripeOrderAction,
} from './schemaTypes/documentActions/refundStripeAction'
import {orderDocumentActions} from './actions/orderActions'

const resolveDocumentActions: DocumentActionsResolver = (prev, context) => {
  const list = [...prev]
  if (context.schemaType === 'invoice') {
    list.push(createShippingLabel)
    list.push(reprocessStripeSessionAction)
    list.push(backfillInvoicesAction)
    list.push(refundStripeInvoiceAction)
  }
  if (context.schemaType === 'order') {
    list.push(reprocessStripeSessionAction)
    list.push(backfillOrdersAction)
    list.push(cancelStripeOrderAction)
    list.push(refundStripeOrderAction)
    orderDocumentActions.forEach((action) => list.push(action))
  }
  if (context.schemaType === 'customer') {
    list.push(backfillCustomersAction)
  }
  if (['vehicleModel', 'filterTag', 'product'].includes(context.schemaType)) {
    list.push(forceDeleteUnlinkAction)
  }
  return list
}

export default resolveDocumentActions
