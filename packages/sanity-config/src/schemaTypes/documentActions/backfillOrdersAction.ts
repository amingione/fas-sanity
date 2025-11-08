import {createBackfillAction} from './backfillActionFactory'

function summarizeOrders(data: Record<string, any>): string {
  const parts: string[] = []
  if (typeof data.total !== 'undefined') parts.push(`Processed ${data.total}`)
  if (typeof data.changed !== 'undefined') parts.push(`Changed ${data.changed}`)
  if (typeof data.migratedCustomer !== 'undefined')
    parts.push(`Migrated customer ${data.migratedCustomer}`)
  if (typeof data.cartFixed !== 'undefined') parts.push(`Cart fixed ${data.cartFixed}`)
  if (typeof data.remainingCustomer !== 'undefined')
    parts.push(`Remaining legacy customer ${data.remainingCustomer}`)
  return parts.join(', ') || 'Completed.'
}

export const backfillOrdersAction = createBackfillAction({
  label: 'Backfill Orders',
  functionName: 'backfillOrders',
  resultSummary: (data, dryRun) => {
    const prefix = dryRun ? 'Dry run: ' : ''
    return `${prefix}${summarizeOrders(data)}`
  },
})
