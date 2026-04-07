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
import {
  approveVendorApplicationAction,
  rejectVendorApplicationAction,
  holdVendorApplicationAction,
} from './schemaTypes/documentActions/vendorApplicationActions'
import {sendVendorInviteAction} from './schemaTypes/documentActions/vendorInviteAction'
import {linkVendorToCustomerAction} from './schemaTypes/documentActions/linkVendorToCustomerAction'
import {generateVendorNumberAction} from './schemaTypes/documentActions/generateVendorNumberAction'
import {
  sendCustomerEmailAction,
  bookAppointmentAction,
  createOrderFromCustomerAction,
  addVehicleAction,
  viewFullHistoryAction,
} from './schemaTypes/documentActions/customerActions'
import {
  markExpensePaidAction,
  duplicateExpenseAction,
  makeExpenseRecurringAction,
} from './schemaTypes/documentActions/expenseActions'
import {
  startWorkOrderAction,
  manageWorkOrderAction,
} from './schemaTypes/documentActions/inStoreOperationsActions'
import {
  adjustInventoryAction,
  reserveInventoryAction,
  createManufacturingOrderAction,
  completeManufacturingOrderAction,
} from './schemaTypes/documentActions/inventoryActions'
import {
  printShipmentLabelAction,
  printMergedShipmentDocumentsAction,
} from './schemaTypes/documentActions/shipmentPrintActions'

const resolveDocumentActions: DocumentActionsResolver = (prev, context) => {
  const list = [...prev]

  if (context.schemaType === 'product') {
    list.push(SyncMerchantFeedAction)
  }

  if (['vehicleModel', 'filterTag', 'product'].includes(context.schemaType)) {
    list.push(forceDeleteUnlinkAction)
  }

  // Vendor tier → Medusa customer group sync + invite + link + number generation
  if (context.schemaType === 'vendor') {
    list.push(syncVendorTierAction)
    list.push(sendVendorInviteAction)
    list.push(linkVendorToCustomerAction)
    list.push(generateVendorNumberAction)
  }

  // Vendor application lifecycle: approve → creates vendor doc; reject; hold
  if (context.schemaType === 'vendorApplication') {
    list.push(approveVendorApplicationAction)
    list.push(rejectVendorApplicationAction)
    list.push(holdVendorApplicationAction)
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

  // Customer CRM actions: email, book appointment, create order, add vehicle, history
  if (context.schemaType === 'customer') {
    list.push(sendCustomerEmailAction)
    list.push(bookAppointmentAction)
    list.push(createOrderFromCustomerAction)
    list.push(addVehicleAction)
    list.push(viewFullHistoryAction)
  }

  // Expense lifecycle: mark paid, duplicate, make recurring
  if (context.schemaType === 'expense') {
    list.push(markExpensePaidAction)
    list.push(duplicateExpenseAction)
    list.push(makeExpenseRecurringAction)
  }

  // Appointment → creates linked work order on start
  if (context.schemaType === 'appointment') {
    list.push(startWorkOrderAction)
  }

  // Work order management: add parts, charges, complete
  if (context.schemaType === 'workOrder') {
    list.push(manageWorkOrderAction)
  }

  // Inventory: adjust stock, reserve, create production order
  if (context.schemaType === 'inventoryRecord') {
    list.push(adjustInventoryAction)
    list.push(reserveInventoryAction)
    list.push(createManufacturingOrderAction)
  }

  // Manufacturing order completion
  if (context.schemaType === 'manufacturingOrder') {
    list.push(completeManufacturingOrderAction)
  }

  // Shipment label printing
  if (context.schemaType === 'shipment') {
    list.push(printShipmentLabelAction)
    list.push(printMergedShipmentDocumentsAction)
  }

  return list
}

export default resolveDocumentActions
