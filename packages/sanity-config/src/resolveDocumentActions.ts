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
import {orderActions} from './schemaTypes/documents/order.actions'
import {
  approveVendorApplicationAction,
  rejectVendorApplicationAction,
  holdVendorApplicationAction,
} from './schemaTypes/documentActions/vendorApplicationActions'
import {
  convertVendorQuoteAction,
  sendVendorQuoteEmailAction,
} from './schemaTypes/documentActions/vendorQuoteActions'
import {sendVendorInviteAction} from './schemaTypes/documentActions/vendorInviteAction'
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
import {generateVendorNumberAction} from './schemaTypes/documentActions/generateVendorNumberAction'
import {
  adjustInventoryAction,
  reserveInventoryAction,
  createManufacturingOrderAction,
  completeManufacturingOrderAction,
} from './schemaTypes/documentActions/inventoryActions'
import {
  printMergedShipmentDocumentsAction,
  printShipmentLabelAction,
} from './schemaTypes/documentActions/shipmentPrintActions'
import {INVENTORY_DOCUMENT_TYPE} from '../../../shared/docTypes'
import {purchaseShippingLabelAction} from './schemaTypes/documentActions/purchaseShippingLabel'
import {syncVendorToStripeAction} from './schemaTypes/documentActions/syncVendorToStripeAction'
import {
  GeneratePackingSlipAction,
  CreateShippingLabelAction,
  SendShippingConfirmationAction,
} from './schemaTypes/actions/orderActions'

const isOrderSchemaType = (schemaType: string): schemaType is 'order' => schemaType === 'order'

const resolveDocumentActions: DocumentActionsResolver = (prev, context) => {
  const list = [...prev]
  if (context.schemaType === 'invoice') {
    list.push(createShippingLabel)
    list.push(purchaseShippingLabelAction)
    list.push(getShippingRatesAction)
    list.push(reprocessStripeSessionAction)
    list.push(backfillInvoicesAction)
    list.push(refundStripeInvoiceAction)
  }
  if (isOrderSchemaType(context.schemaType)) {
    list.push(
      GeneratePackingSlipAction,
      CreateShippingLabelAction,
      SendShippingConfirmationAction,
    )
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
  if (context.schemaType === 'shipment') {
    list.push(printShipmentLabelAction)
    list.push(printMergedShipmentDocumentsAction)
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
  if (context.schemaType === 'vendor') {
    list.push(generateVendorNumberAction)
    list.push(sendVendorInviteAction)
    list.push(syncVendorToStripeAction)
  }
  return list
}

export default resolveDocumentActions
