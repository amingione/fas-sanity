import {createBackfillAction} from './backfillActionFactory'

function summarizeCustomers(data: Record<string, any>): string {
  const parts: string[] = []
  if (typeof data.total !== 'undefined') parts.push(`Processed ${data.total}`)
  if (typeof data.changed !== 'undefined') parts.push(`Changed ${data.changed}`)
  if (typeof data.userIdSet !== 'undefined') parts.push(`userId set ${data.userIdSet}`)
  if (typeof data.optInDefaults !== 'undefined') parts.push(`Opt-in defaults ${data.optInDefaults}`)
  if (typeof data.updatedStamped !== 'undefined') parts.push(`Stamped updatedAt ${data.updatedStamped}`)
  return parts.join(', ') || 'Completed.'
}

export const backfillCustomersAction = createBackfillAction({
  label: 'Backfill Customers',
  functionName: 'backfillCustomers',
  resultSummary: (data, dryRun) => {
    const prefix = dryRun ? 'Dry run: ' : ''
    return `${prefix}${summarizeCustomers(data)}`
  },
})
