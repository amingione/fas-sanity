import type {SanityClient} from '@sanity/client'

export type ProfitLossDoc = {
  _type: 'profitLoss'
  period: string
  startDate: string
  endDate: string
  grossRevenue: number
  returns: number
  netRevenue: number
  revenueOnline: number
  revenueInStore: number
  revenueWholesale: number
  cogs: number
  grossProfit: number
  grossMargin: number
  laborCosts: number
  rentUtilities: number
  marketing: number
  equipment: number
  insurance: number
  shipping: number
  software: number
  other: number
  totalExpenses: number
  operatingProfit: number
  netProfit: number
  netMargin: number
  totalOrders: number
  avgOrderValue: number
  avgProfitPerOrder: number
}

export type CashFlowDoc = {
  _type: 'cashFlow'
  period: string
  startDate: string
  endDate: string
  cashFromSales: number
  cashFromWholesale: number
  otherIncome: number
  totalCashIn: number
  cashForCOGS: number
  cashForExpenses: number
  totalCashOut: number
  netCashFlow: number
  beginningBalance: number
  endingBalance: number
  accountsReceivable: number
  accountsPayable: number
}

export type MonthlyFinancialResult = {
  profitLoss: ProfitLossDoc
  cashFlow: CashFlowDoc
  expenseTotals: Record<string, number>
}

export type ComputeFinancialsOptions = {
  client: SanityClient
  start: Date
  end: Date
  period: string
  beginningBalance?: number
  otherIncome?: number
}

type FinanceQueryResult = {
  grossRevenue: number
  returns: number
  revenueOnline: number
  revenueInStore: number
  revenueWholesale: number
  ordersPaid: number
  cogs: number
  inventoryPurchases: number
  expenseDetails: Array<{category?: string; amount?: number}>
  cashForExpenses: number
  accountsReceivable: number
  accountsPayable: number
}

const PURCHASE_TYPES = ['purchase', 'purchased', 'restock', 'received', 'stock_in']

const FINANCE_QUERY = `
{
  "grossRevenue": coalesce(sum(*[_type == "order" && status == "paid" && _createdAt >= $start && _createdAt < $end].totalAmount), 0),
  "returns": coalesce(sum(*[_type == "order" && status == "refunded" && _createdAt >= $start && _createdAt < $end].totalAmount), 0),
  "revenueOnline": coalesce(sum(*[_type == "order" && status == "paid" && orderType == "online" && _createdAt >= $start && _createdAt < $end].totalAmount), 0),
  "revenueInStore": coalesce(sum(*[_type == "order" && status == "paid" && orderType == "in-store" && _createdAt >= $start && _createdAt < $end].totalAmount), 0),
  "revenueWholesale": coalesce(sum(*[_type == "order" && status == "paid" && orderType == "wholesale" && _createdAt >= $start && _createdAt < $end].totalAmount), 0),
  "ordersPaid": count(*[_type == "order" && status == "paid" && _createdAt >= $start && _createdAt < $end]),
  "cogs": coalesce(sum(*[_type == "inventoryTransaction" && type == "sold" && transactionDate >= $start && transactionDate < $end].(coalesce(quantity, 0) * coalesce(unitCost, 0))), 0),
  "inventoryPurchases": coalesce(sum(*[_type == "inventoryTransaction" && type in $purchaseTypes && transactionDate >= $start && transactionDate < $end].(coalesce(quantity, 0) * coalesce(unitCost, 0))), 0),
  "expenseDetails": *[_type == "expense" && date >= $start && date < $end]{category, amount},
  "cashForExpenses": coalesce(sum(*[_type == "expense" && status == "paid" && defined(coalesce(paidDate, date)) && coalesce(paidDate, date) >= $start && coalesce(paidDate, date) < $end].amount), 0),
  "accountsReceivable": coalesce(sum(*[_type == "invoice" && status != "paid" && orderRef->orderType == "wholesale"].(coalesce(total, amountSubtotal + amountTax + coalesce(amountShipping, shippingAmount, 0)))), 0),
  "accountsPayable": coalesce(sum(*[_type == "bill" && paid != true].amount), 0)
}
`

const CATEGORY_FIELDS: Record<
  string,
  | 'laborCosts'
  | 'rentUtilities'
  | 'marketing'
  | 'equipment'
  | 'insurance'
  | 'shipping'
  | 'software'
  | 'other'
> = {
  labor: 'laborCosts',
  rent_utilities: 'rentUtilities',
  marketing: 'marketing',
  equipment: 'equipment',
  insurance: 'insurance',
  shipping: 'shipping',
  software: 'software',
  other: 'other',
}

const EXTRA_OTHER_CATEGORIES = [
  'materials',
  'communications',
  'vehicle',
  'office',
  'training',
  'legal',
  'bank_fees',
]

const toNumber = (value: unknown): number => {
  const num = typeof value === 'string' ? Number(value) : (value as number)
  return Number.isFinite(num) ? Number(num) : 0
}

const toFixedNumber = (value: number, digits = 2) =>
  Number.isFinite(value) ? Number(value.toFixed(digits)) : 0

const getDateString = (date: Date) => date.toISOString().slice(0, 10)

export const formatPeriod = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`

export const startOfMonth = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))

export const addMonths = (date: Date, offset: number) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, date.getUTCDate()))

export async function computeMonthlyFinancials(
  options: ComputeFinancialsOptions,
): Promise<MonthlyFinancialResult> {
  const {client, start, end, period, beginningBalance = 0, otherIncome = 0} = options
  const params = {
    start: start.toISOString(),
    end: end.toISOString(),
    purchaseTypes: PURCHASE_TYPES,
  }
  const result = (await client.fetch(FINANCE_QUERY, params)) as FinanceQueryResult

  const grossRevenue = toNumber(result.grossRevenue)
  const returns = toNumber(result.returns)
  const netRevenue = grossRevenue - returns
  const revenueOnline = toNumber(result.revenueOnline)
  const revenueInStore = toNumber(result.revenueInStore)
  const revenueWholesale = toNumber(result.revenueWholesale)
  const ordersPaid = toNumber(result.ordersPaid)
  const cogs = toNumber(result.cogs)
  const inventoryPurchases = toNumber(result.inventoryPurchases)
  const expenseTotals = aggregateExpenses(result.expenseDetails || [])
  const cashForExpenses = toNumber(result.cashForExpenses)
  const accountsReceivable = toNumber(result.accountsReceivable)
  const accountsPayable = toNumber(result.accountsPayable)

  const grossProfit = netRevenue - cogs
  const grossMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0
  const totalExpenses = Object.values(expenseTotals).reduce((sum, value) => sum + value, 0)
  const operatingProfit = grossProfit - totalExpenses
  const netProfit = operatingProfit
  const netMargin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0
  const avgOrderValue = ordersPaid > 0 ? netRevenue / ordersPaid : 0
  const avgProfitPerOrder = ordersPaid > 0 ? netProfit / ordersPaid : 0

  const cashFromSales = revenueOnline + revenueInStore
  const cashFromWholesale = revenueWholesale
  const totalCashIn = cashFromSales + cashFromWholesale + otherIncome
  const cashForCOGS = inventoryPurchases
  const totalCashOut = cashForCOGS + cashForExpenses
  const netCashFlow = totalCashIn - totalCashOut
  const endingBalance = beginningBalance + netCashFlow

  const profitLoss: ProfitLossDoc = {
    _type: 'profitLoss',
    period,
    startDate: getDateString(start),
    endDate: getDateString(new Date(end.getTime() - 1)),
    grossRevenue: toFixedNumber(grossRevenue),
    returns: toFixedNumber(returns),
    netRevenue: toFixedNumber(netRevenue),
    revenueOnline: toFixedNumber(revenueOnline),
    revenueInStore: toFixedNumber(revenueInStore),
    revenueWholesale: toFixedNumber(revenueWholesale),
    cogs: toFixedNumber(cogs),
    grossProfit: toFixedNumber(grossProfit),
    grossMargin: toFixedNumber(grossMargin),
    laborCosts: toFixedNumber(expenseTotals.laborCosts || 0),
    rentUtilities: toFixedNumber(expenseTotals.rentUtilities || 0),
    marketing: toFixedNumber(expenseTotals.marketing || 0),
    equipment: toFixedNumber(expenseTotals.equipment || 0),
    insurance: toFixedNumber(expenseTotals.insurance || 0),
    shipping: toFixedNumber(expenseTotals.shipping || 0),
    software: toFixedNumber(expenseTotals.software || 0),
    other: toFixedNumber(expenseTotals.other || 0),
    totalExpenses: toFixedNumber(totalExpenses),
    operatingProfit: toFixedNumber(operatingProfit),
    netProfit: toFixedNumber(netProfit),
    netMargin: toFixedNumber(netMargin),
    totalOrders: Math.max(0, Math.round(ordersPaid)),
    avgOrderValue: toFixedNumber(avgOrderValue),
    avgProfitPerOrder: toFixedNumber(avgProfitPerOrder),
  }

  const cashFlow: CashFlowDoc = {
    _type: 'cashFlow',
    period,
    startDate: getDateString(start),
    endDate: getDateString(new Date(end.getTime() - 1)),
    cashFromSales: toFixedNumber(cashFromSales),
    cashFromWholesale: toFixedNumber(cashFromWholesale),
    otherIncome: toFixedNumber(otherIncome),
    totalCashIn: toFixedNumber(totalCashIn),
    cashForCOGS: toFixedNumber(cashForCOGS),
    cashForExpenses: toFixedNumber(cashForExpenses),
    totalCashOut: toFixedNumber(totalCashOut),
    netCashFlow: toFixedNumber(netCashFlow),
    beginningBalance: toFixedNumber(beginningBalance),
    endingBalance: toFixedNumber(endingBalance),
    accountsReceivable: toFixedNumber(accountsReceivable),
    accountsPayable: toFixedNumber(accountsPayable),
  }

  return {profitLoss, cashFlow, expenseTotals}
}

function aggregateExpenses(
  expenses: Array<{category?: string; amount?: number}>,
): Record<string, number> {
  const totals: Record<string, number> = {
    laborCosts: 0,
    rentUtilities: 0,
    marketing: 0,
    equipment: 0,
    insurance: 0,
    shipping: 0,
    software: 0,
    other: 0,
  }

  for (const expense of expenses) {
    const amount = toNumber(expense?.amount)
    if (!amount) continue
    const rawCategory = String(expense?.category || '').trim()
    const key = CATEGORY_FIELDS[rawCategory]
    if (key) {
      totals[key] += amount
    } else if (EXTRA_OTHER_CATEGORIES.includes(rawCategory) || !rawCategory) {
      totals.other += amount
    } else {
      totals.other += amount
    }
  }

  return totals
}
