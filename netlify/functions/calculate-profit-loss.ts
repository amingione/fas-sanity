import {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'
import {
  addMonths,
  computeMonthlyFinancials,
  formatPeriod,
  startOfMonth,
} from '../../shared/finance/calculateMonthlyFinancials'

const API_VERSION = '2024-10-01'
const projectId = process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET
const token = process.env.SANITY_API_TOKEN || process.env.SANITY_WRITE_TOKEN

if (!projectId || !dataset) {
  throw new Error('Missing Sanity configuration for calculate-profit-loss function')
}

const sanity = createClient({
  projectId,
  dataset,
  apiVersion: API_VERSION,
  token,
  useCdn: false,
})

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
}

type PeriodRange = {
  period: string
  start: Date
  end: Date
}

const parsePeriodRange = (input?: string): PeriodRange => {
  if (input) {
    const [yearPart, monthPart] = input.split('-')
    const year = Number(yearPart)
    const month = Number(monthPart) - 1
    if (Number.isFinite(year) && Number.isFinite(month) && month >= 0 && month < 12) {
      const start = new Date(Date.UTC(year, month, 1))
      const end = addMonths(start, 1)
      return {period: formatPeriod(start), start, end}
    }
  }
  const now = new Date()
  const start = addMonths(startOfMonth(now), -1)
  const end = addMonths(start, 1)
  return {period: formatPeriod(start), start, end}
}

const getHeader = (headers: Record<string, string | undefined>, name: string) =>
  headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()]

const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        ...jsonHeaders,
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      },
      body: '',
    }
  }

  if (!token) {
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({error: 'SANITY_API_TOKEN is required to calculate financials'}),
    }
  }

  if (!['GET', 'POST'].includes(event.httpMethod || '')) {
    return {
      statusCode: 405,
      headers: jsonHeaders,
      body: JSON.stringify({error: 'Method not allowed'}),
    }
  }

  const triggeredBySchedule = Boolean(getHeader(event.headers || {}, 'x-nf-scheduled'))
  const secret = process.env.FINANCE_AUTOMATION_SECRET
  if (secret && !triggeredBySchedule) {
    const authHeader = getHeader(event.headers || {}, 'authorization')
    if (!authHeader || authHeader !== `Bearer ${secret}`) {
      return {
        statusCode: 401,
        headers: jsonHeaders,
        body: JSON.stringify({error: 'Unauthorized'}),
      }
    }
  }

  let requestedPeriod = event.queryStringParameters?.period
  if (!requestedPeriod && event.body) {
    try {
      const payload = JSON.parse(event.body)
      requestedPeriod = payload?.period || payload?.month
    } catch {
      // ignore parse errors for GET requests
    }
  }

  const range = parsePeriodRange(requestedPeriod)
  const previousPeriod = formatPeriod(addMonths(range.start, -1))

  try {
    const existingCashFlow = await sanity.fetch(
      `*[_type == "cashFlow" && period == $period][0]{
        _id,
        beginningBalance,
        otherIncome
      }`,
      {period: range.period},
    )
    const previousBalance = await sanity.fetch(
      `*[_type == "cashFlow" && period == $period][0].endingBalance`,
      {period: previousPeriod},
    )

    const beginningBalance =
      (existingCashFlow?.beginningBalance as number | undefined) ||
      (previousBalance as number | undefined) ||
      0
    const otherIncome =
      (existingCashFlow?.otherIncome as number | undefined) || Number(process.env.FINANCE_OTHER_INCOME || 0)

    const results = await computeMonthlyFinancials({
      client: sanity,
      start: range.start,
      end: range.end,
      period: range.period,
      beginningBalance,
      otherIncome,
    })

    const profitLossDocId = `profitLoss-${range.period}`
    const cashFlowDocId = `cashFlow-${range.period}`

    await sanity.createOrReplace({
      _id: profitLossDocId,
      ...results.profitLoss,
    })

    await sanity.createOrReplace({
      _id: cashFlowDocId,
      ...results.cashFlow,
    })

    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify({
        ok: true,
        period: range.period,
        profitLossId: profitLossDocId,
        cashFlowId: cashFlowDocId,
        totals: results.expenseTotals,
      }),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('calculate-profit-loss error', err)
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({error: message}),
    }
  }
}

export {handler}

export const config = {
  schedule: '0 6 1 * *',
}
