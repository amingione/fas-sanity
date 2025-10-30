// resolveDocumentActions.ts
import type { DocumentActionComponent, DocumentActionsResolver } from 'sanity'
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

const appendActions = (
  actions: DocumentActionComponent[],
  additions: DocumentActionComponent[]
) => {
  for (const action of additions) {
    if (!actions.includes(action)) {
      actions.push(action)
    }
  }
}

const resolveDocumentActions: DocumentActionsResolver = (prev, context) => {
  const list = [...prev]
  if (context.schemaType === 'invoice') {
    appendActions(list, [
      createShippingLabel,
      reprocessStripeSessionAction,
      backfillInvoicesAction,
      refundStripeInvoiceAction,
    ])
  }
  if (context.schemaType === 'order') {
    appendActions(list, [
      reprocessStripeSessionAction,
      backfillOrdersAction,
      cancelStripeOrderAction,
      refundStripeOrderAction,
    ])
  }
  if (context.schemaType === 'customer') {
    appendActions(list, [backfillCustomersAction])
  }
  if (['vehicleModel', 'filterTag', 'product'].includes(context.schemaType)) {
    appendActions(list, [forceDeleteUnlinkAction])
  }
  return list
}

export default resolveDocumentActions
