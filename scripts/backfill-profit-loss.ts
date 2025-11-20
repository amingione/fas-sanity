#!/usr/bin/env tsx
import {createClient} from '@sanity/client'
import {
  addMonths,
  computeMonthlyFinancials,
  formatPeriod,
  startOfMonth,
} from '../shared/finance/calculateMonthlyFinancials'

type CliOptions = {
  months: number
  from?: string
  to?: string
}

const DEFAULT_MONTHS = 12

const parseArgs = (): CliOptions => {
  const options: CliOptions = {months: DEFAULT_MONTHS}
  for (const arg of process.argv.slice(2)) {
    const [key, rawValue] = arg.includes('=')
      ? (arg.split('=') as [string, string])
      : ([arg, undefined] as [string, string | undefined])
    const value = rawValue ?? process.argv[process.argv.indexOf(arg) + 1]
    switch (key) {
      case '--months':
      case '-m':
        if (value) {
          const parsed = Number(value)
          if (Number.isFinite(parsed) && parsed > 0) {
            options.months = Math.floor(parsed)
          }
        }
        break
      case '--from':
        options.from = value
        break
      case '--to':
        options.to = value
        break
      case '--help':
      case '-h':
        printUsage()
        process.exit(0)
        break
      default:
        break
    }
  }
  return options
}

function printUsage() {
  console.log(`
Usage: pnpm tsx scripts/backfill-profit-loss.ts [--months 12] [--from YYYY-MM] [--to YYYY-MM]

Options:
  --months   Number of months to backfill (default: ${DEFAULT_MONTHS}).
  --from     Optional period to start from (YYYY-MM). Defaults to N months ago.
  --to       Optional period to stop at (YYYY-MM). Defaults to last complete month.
`)
}

const parsePeriod = (value: string): Date => {
  const [yearPart, monthPart] = value.split('-')
  const year = Number(yearPart)
  const month = Number(monthPart) - 1
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 0 || month > 11) {
    throw new Error(`Invalid period format "${value}". Use YYYY-MM.`)
  }
  return new Date(Date.UTC(year, month, 1))
}

async function run() {
  const projectId = process.env.SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID
  const dataset = process.env.SANITY_DATASET || process.env.SANITY_STUDIO_DATASET
  const token = process.env.SANITY_WRITE_TOKEN || process.env.SANITY_API_TOKEN

  if (!projectId || !dataset || !token) {
    console.error('Set SANITY_PROJECT_ID, SANITY_DATASET, and SANITY_WRITE_TOKEN to run this script.')
    process.exit(1)
  }

  const client = createClient({
    projectId,
    dataset,
    apiVersion: '2024-10-01',
    token,
    useCdn: false,
  })

  const options = parseArgs()
  const latestCompleteMonth = startOfMonth(new Date())
  const defaultStart = addMonths(latestCompleteMonth, -options.months)
  const start = options.from ? parsePeriod(options.from) : defaultStart
  const stopExclusive = options.to ? addMonths(parsePeriod(options.to), 1) : latestCompleteMonth

  const periods: Array<{period: string; start: Date; end: Date}> = []
  let cursor = startOfMonth(start)
  while (cursor < stopExclusive) {
    const period = formatPeriod(cursor)
    periods.push({period, start: cursor, end: addMonths(cursor, 1)})
    cursor = addMonths(cursor, 1)
  }

  if (options.months && periods.length > options.months) {
    const sliceIndex = periods.length - options.months
    periods.splice(0, sliceIndex)
  }

  if (!periods.length) {
    console.log('No periods to backfill.')
    return
  }

  console.log(
    `Backfilling ${periods.length} month(s): ${periods
      .map((p) => p.period)
      .join(', ')}`,
  )

  let previousBalance = await client.fetch(
    `*[_type == "cashFlow" && period == $period][0].endingBalance`,
    {period: formatPeriod(addMonths(periods[0].start, -1))},
  )

  for (const entry of periods) {
    const existingCashFlow = await client.fetch(
      `*[_type == "cashFlow" && period == $period][0]{beginningBalance, otherIncome}`,
      {period: entry.period},
    )
    const beginningBalance =
      (existingCashFlow?.beginningBalance as number | undefined) ||
      (previousBalance as number | undefined) ||
      0
    const otherIncome =
      (existingCashFlow?.otherIncome as number | undefined) ||
      Number(process.env.FINANCE_OTHER_INCOME || 0)

    console.log(`→ Calculating ${entry.period} (beginning balance ${beginningBalance.toFixed(2)})`)
    const result = await computeMonthlyFinancials({
      client,
      start: entry.start,
      end: entry.end,
      period: entry.period,
      beginningBalance,
      otherIncome,
    })

    await client.createOrReplace({
      _id: `profitLoss-${entry.period}`,
      ...result.profitLoss,
    })
    await client.createOrReplace({
      _id: `cashFlow-${entry.period}`,
      ...result.cashFlow,
    })

    previousBalance = result.cashFlow.endingBalance
    console.log(
      `   Saved profit & loss + cash flow (ending balance ${result.cashFlow.endingBalance.toFixed(
        2,
      )})`,
    )
  }

  console.log('Financial backfill complete.')
}

run().catch((err) => {
  console.error('Backfill failed', err)
  process.exit(1)
})
