// resolveDocumentActions.ts
import type {DocumentActionsResolver} from 'sanity'
import {createShippingLabel} from './schemaTypes/documentActions/invoiceActions'
import {reprocessStripeSessionAction} from './schemaTypes/documentActions/reprocessStripeAction'
import {backfillInvoicesAction} from './schemaTypes/documentActions/backfillInvoicesAction'
import {backfillCustomersAction} from './schemaTypes/documentActions/backfillCustomersAction'
import {forceDeleteUnlinkAction} from './schemaTypes/documentActions/forceDeleteUnlinkAction'
import {backfillProductAction} from './schemaTypes/documentActions/backfillProductAction'
import {
  refundStripeInvoiceAction,
} from './schemaTypes/documentActions/refundStripeAction'
import {orderActions} from './schemaTypes/documents/order'

const resolveDocumentActions: DocumentActionsResolver = (prev, context) => {
  const list = [...prev]
  if (context.schemaType === 'invoice') {
    list.push(createShippingLabel)
    list.push(reprocessStripeSessionAction)
    list.push(backfillInvoicesAction)
    list.push(refundStripeInvoiceAction)
  }
  if (context.schemaType === 'order') {
    return orderActions(list, context)
  }
  if (context.schemaType === 'customer') {
    list.push(backfillCustomersAction)
  }
  if (context.schemaType === 'product') {
    list.push(backfillProductAction)
  }
  if (['vehicleModel', 'filterTag', 'product'].includes(context.schemaType)) {
    list.push(forceDeleteUnlinkAction)
  }
  return list
}

export default resolveDocumentActions
