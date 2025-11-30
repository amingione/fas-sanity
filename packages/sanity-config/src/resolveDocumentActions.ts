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
import {getShippingRatesAction} from './schemaTypes/documentActions/getShippingRates'
import {purchaseShippingLabelAction} from './schemaTypes/documentActions/purchaseShippingLabel'
import {purchaseOrderLabelAction} from './schemaTypes/documentActions/purchaseOrderLabel'
import {orderActions} from './schemaTypes/documents/order'
import {
  approveVendorApplicationAction,
  rejectVendorApplicationAction,
  holdVendorApplicationAction,
} from './schemaTypes/documentActions/vendorApplicationActions'
import {
  convertVendorQuoteAction,
  sendVendorQuoteEmailAction,
} from './schemaTypes/documentActions/vendorQuoteActions'
import {
  manageWorkOrderAction,
  startWorkOrderAction,
} from './schemaTypes/documentActions/inStoreOperationsActions'
import {
  sendCustomerEmailAction,
  bookAppointmentAction,
  createOrderFromCustomerAction,
  addVehicleAction,
  viewFullHistoryAction,
} from './schemaTypes/documentActions/customerActions'
import {
  duplicateExpenseAction,
  makeExpenseRecurringAction,
  markExpensePaidAction,
} from './schemaTypes/documentActions/expenseActions'
import SyncMerchantFeedAction from './schemaTypes/documentActions/syncMerchantFeedAction'
import {
  adjustInventoryAction,
  reserveInventoryAction,
  createManufacturingOrderAction,
  completeManufacturingOrderAction,
} from './schemaTypes/documentActions/inventoryActions'
import {INVENTORY_DOCUMENT_TYPE} from '../../../shared/docTypes'

const resolveDocumentActions: DocumentActionsResolver = (prev, context) => {
  const list = [...prev]
  if (context.schemaType === 'invoice') {
    list.push(createShippingLabel)
    list.push(getShippingRatesAction)
    list.push(purchaseShippingLabelAction)
    list.push(reprocessStripeSessionAction)
    list.push(backfillInvoicesAction)
    list.push(refundStripeInvoiceAction)
  }
  if (context.schemaType === 'order') {
    list.push(purchaseOrderLabelAction)
    return orderActions(list, context)
  }
  if (context.schemaType === 'vendorApplication') {
    list.push(approveVendorApplicationAction)
    list.push(rejectVendorApplicationAction)
    list.push(holdVendorApplicationAction)
  }
  if (context.schemaType === 'vendorQuote') {
    list.push(sendVendorQuoteEmailAction)
    list.push(convertVendorQuoteAction)
  }
  if (context.schemaType === 'customer') {
    list.push(backfillCustomersAction)
    list.push(sendCustomerEmailAction)
    list.push(bookAppointmentAction)
    list.push(createOrderFromCustomerAction)
    list.push(addVehicleAction)
    list.push(viewFullHistoryAction)
  }
  if (context.schemaType === 'product') {
    list.push(backfillProductAction)
    list.push(SyncMerchantFeedAction)
  }
  if (context.schemaType === 'appointment') {
    list.push(startWorkOrderAction)
  }
  if (context.schemaType === 'workOrder') {
    list.push(manageWorkOrderAction)
  }
  if (context.schemaType === INVENTORY_DOCUMENT_TYPE) {
    list.push(adjustInventoryAction)
    list.push(reserveInventoryAction)
    list.push(createManufacturingOrderAction)
  }
  if (context.schemaType === 'manufacturingOrder') {
    list.push(completeManufacturingOrderAction)
  }
  if (context.schemaType === 'expense') {
    list.push(markExpensePaidAction)
    list.push(duplicateExpenseAction)
    list.push(makeExpenseRecurringAction)
  }
  if (['vehicleModel', 'filterTag', 'product'].includes(context.schemaType)) {
    list.push(forceDeleteUnlinkAction)
  }
  return list
}

export default resolveDocumentActions
