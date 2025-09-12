// resolveDocumentActions.ts
import type { DocumentActionsResolver } from 'sanity'
import { createShippingLabel } from './schemaTypes/documentActions/invoiceActions'
import { reprocessStripeSessionAction } from './schemaTypes/documentActions/reprocessStripeAction'
import { backfillInvoicesAction } from './schemaTypes/documentActions/backfillInvoicesAction'
import { backfillOrdersAction } from './schemaTypes/documentActions/backfillOrdersAction'
import { backfillCustomersAction } from './schemaTypes/documentActions/backfillCustomersAction'

const resolveDocumentActions: DocumentActionsResolver = (prev, context) => {
  const list = [...prev]
  if (context.schemaType === 'invoice') {
    list.push(createShippingLabel)
    list.push(reprocessStripeSessionAction)
    list.push(backfillInvoicesAction)
  }
  if (context.schemaType === 'order') {
    list.push(reprocessStripeSessionAction)
    list.push(backfillOrdersAction)
  }
  if (context.schemaType === 'customer') {
    list.push(backfillCustomersAction)
  }
  return list
}

export default resolveDocumentActions
