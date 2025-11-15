import {createBackfillAction} from './backfillActionFactory'

function summarizeProductSync(data: Record<string, any>): string {
  const results = Array.isArray(data.results) ? data.results : []
  const errors = Array.isArray(data.errors) ? data.errors : []
  const processed =
    typeof data.processed === 'number'
      ? data.processed
      : results.length
        ? results.length
        : 0
  const synced = results.filter((entry) =>
    typeof entry?.status === 'string' ? ['synced', 'updated'].includes(entry.status) : false,
  ).length
  const skipped = results.filter((entry) => entry?.status === 'skipped').length

  const parts: string[] = []
  if (processed) parts.push(`Processed ${processed}`)
  if (synced) parts.push(`Synced ${synced}`)
  if (skipped) parts.push(`Skipped ${skipped}`)
  if (errors.length) parts.push(`Errors ${errors.length}`)
  if (!parts.length && results[0]?.status) {
    parts.push(`Status: ${results[0].status}`)
  }
  return parts.join(', ') || 'Completed.'
}

export const backfillProductAction = createBackfillAction({
  label: 'Backfill Product (Stripe)',
  functionName: 'backfillStripeProducts',
  supportsDryRun: false,
  buildRequest: (props) => {
    const targetId = props.id || props.published?._id || props.draft?._id
    if (!targetId) {
      throw new Error('Unable to determine product ID for Stripe sync.')
    }
    return {
      body: {
        productIds: [targetId],
      },
    }
  },
  resultSummary: (data) => summarizeProductSync(data),
})
