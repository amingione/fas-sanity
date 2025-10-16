import React, {useEffect, useMemo, useState} from 'react'
import {useClient} from 'sanity'
import {Box, Card, Flex, Grid, Spinner, Stack, Text} from '@sanity/ui'

type ProfitLossData = {
  incomeCategories: Array<{description: string; amount: number}>
  expenseCategories: Array<{description: string; amount: number}>
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(value || 0)

const ProfitLossDashboard = React.forwardRef<HTMLDivElement, Record<string, never>>((_props, ref) => {
  const client = useClient({apiVersion: '2024-10-01'})
  const [data, setData] = useState<ProfitLossData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await client.fetch(
          `{
            "invoiceIncome": *[_type == "invoice" && status in ["paid","refunded"]]{
              _key,
              total,
              status
            },
            "checks": *[_type == "check" && status != "void"]{
              amount,
              lineItems[]{category, amount}
            },
            "expenses": *[_type == "expense"]{
              amount,
              category
            }
          }`
        )
        if (cancelled) return

        const incomeMap = new Map<string, number>()
        const expenseMap = new Map<string, number>()

        const invoices: Array<{total?: number; status?: string}> = result.invoiceIncome || []
        invoices.forEach((invoice) => {
          const value = Number(invoice.total) || 0
          const adjusted = invoice.status === 'refunded' ? -Math.abs(value) : value
          incomeMap.set('Sales Revenue', (incomeMap.get('Sales Revenue') || 0) + adjusted)
        })

        const checks: Array<{
          amount?: number
          lineItems?: Array<{category?: string; amount?: number}>
        }> = result.checks || []
        checks.forEach((check) => {
          const total = Number(check.amount) || 0
          if (check.lineItems?.length) {
            check.lineItems.forEach((item) => {
              const label = item.category || 'Check Expense'
              expenseMap.set(label, (expenseMap.get(label) || 0) + (Number(item.amount) || 0))
            })
          } else {
            expenseMap.set('Check Expense', (expenseMap.get('Check Expense') || 0) + total)
          }
        })

        const expenses: Array<{amount?: number; category?: string}> = result.expenses || []
        expenses.forEach((expense) => {
          const label = expense.category || 'Operating Expense'
          expenseMap.set(label, (expenseMap.get(label) || 0) + (Number(expense.amount) || 0))
        })

        const incomeCategories = Array.from(incomeMap.entries()).map(([description, amount]) => ({
          description,
          amount,
        }))
        const expenseCategories = Array.from(expenseMap.entries()).map(([description, amount]) => ({
          description,
          amount,
        }))

        setData({incomeCategories, expenseCategories})
      } catch (err: any) {
        if (!cancelled) {
          console.error('ProfitLossDashboard error', err)
          setError(err?.message || 'Failed to load profit and loss data.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()
    return () => {
      cancelled = true
    }
  }, [client])

  const totals = useMemo(() => {
    if (!data) return {income: 0, expenses: 0, net: 0}
    const income = data.incomeCategories.reduce((sum, item) => sum + item.amount, 0)
    const expenses = data.expenseCategories.reduce((sum, item) => sum + item.amount, 0)
    return {income, expenses, net: income - expenses}
  }, [data])

  return (
    <Box ref={ref} padding={4}>
      <Stack space={4}>
        <Stack space={2}>
          <Text size={2} weight="semibold">
            Profit &amp; Loss
          </Text>
          <Text size={1} muted>
            Snapshot of invoice revenue and spending captured in the Studio.
          </Text>
        </Stack>

        {loading ? (
          <Card padding={5} radius={4} shadow={1}>
            <Flex align="center" justify="center" gap={3}>
              <Spinner muted />
              <Text muted>Calculating profit and loss…</Text>
            </Flex>
          </Card>
        ) : error ? (
          <Card padding={5} radius={4} shadow={1} tone="critical">
            <Text>{error}</Text>
          </Card>
        ) : (
          <>
            <Grid columns={[1, 2]} gap={4}>
              <Card padding={4} radius={4} shadow={1}>
                <Stack space={3}>
                  <Text size={1} weight="semibold">
                    Income
                  </Text>
                  <Stack space={2}>
                    {data?.incomeCategories.length ? (
                      data.incomeCategories.map((item, index) => (
                        <Flex key={index} justify="space-between">
                          <Text>{item.description}</Text>
                          <Text>{formatCurrency(item.amount)}</Text>
                        </Flex>
                      ))
                    ) : (
                      <Text muted size={1}>
                        No income recorded.
                      </Text>
                    )}
                  </Stack>
                  <Text weight="semibold">Total Income: {formatCurrency(totals.income)}</Text>
                </Stack>
              </Card>

              <Card padding={4} radius={4} shadow={1}>
                <Stack space={3}>
                  <Text size={1} weight="semibold">
                    Expenses
                  </Text>
                  <Stack space={2}>
                    {data?.expenseCategories.length ? (
                      data.expenseCategories.map((item, index) => (
                        <Flex key={index} justify="space-between">
                          <Text>{item.description}</Text>
                          <Text>{formatCurrency(item.amount)}</Text>
                        </Flex>
                      ))
                    ) : (
                      <Text muted size={1}>
                        No expenses captured.
                      </Text>
                    )}
                  </Stack>
                  <Text weight="semibold">Total Expenses: {formatCurrency(totals.expenses)}</Text>
                </Stack>
              </Card>
            </Grid>

            <Card padding={4} radius={4} shadow={1}>
              <Stack space={2}>
                <Text size={1} weight="semibold">
                  Net Profit
                </Text>
                <Text
                  size={2}
                  weight="bold"
                  style={{
                    color:
                      totals.net >= 0
                        ? 'var(--uui-color-positive-plain-enabled-fg, #15803d)'
                        : 'var(--uui-color-critical-plain-enabled-fg, #b91c1c)',
                  }}
                >
                  {formatCurrency(totals.net)}
                </Text>
              </Stack>
            </Card>
          </>
        )}
      </Stack>
    </Box>
  )
})

ProfitLossDashboard.displayName = 'ProfitLossDashboard'

export default ProfitLossDashboard
