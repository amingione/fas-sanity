// resolveDocumentActions.ts
import type { DocumentActionsResolver } from 'sanity'
import { createShippingLabel } from './schemaTypes/documentActions/invoiceActions'

const resolveDocumentActions: DocumentActionsResolver = (prev, context) => {
  if (context.schemaType === 'invoice') {
    return [...prev, createShippingLabel]
  }

  return prev
}

export default resolveDocumentActions