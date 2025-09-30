import {createBackfillAction} from './backfillActionFactory'

function summarizeInvoices(data: Record<string, any>): string {
  const parts: string[] = []
  if (typeof data.total !== 'undefined') parts.push(`Processed ${data.total}`)
  if (typeof data.changed !== 'undefined') parts.push(`Changed ${data.changed}`)
  if (typeof data.migratedCustomer !== 'undefined') parts.push(`Migrated customer ${data.migratedCustomer}`)
  if (typeof data.migratedOrder !== 'undefined') parts.push(`Migrated order ${data.migratedOrder}`)
  if (typeof data.itemsFixed !== 'undefined') parts.push(`Items fixed ${data.itemsFixed}`)
  return parts.join(', ') || 'Completed.'
}

export const backfillInvoicesAction = createBackfillAction({
  label: 'Backfill Invoices',
  functionName: 'backfillInvoices',
  resultSummary: (data, dryRun) => {
    const prefix = dryRun ? 'Dry run: ' : ''
    return `${prefix}${summarizeInvoices(data)}`
  },
})
