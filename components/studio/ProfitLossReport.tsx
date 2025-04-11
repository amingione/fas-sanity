import React, { useEffect, useState } from 'react'
import { useClient } from 'sanity'
import { Card, Heading, Text, Stack } from '@sanity/ui'

export default function ProfitLossReport() {
  const client = useClient({ apiVersion: '2024-04-10' })
  const [revenue, setRevenue] = useState(0)
  const [expenses, setExpenses] = useState(0)
  const [net, setNet] = useState(0)
  const [categories, setCategories] = useState<Record<string, number>>({})
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  useEffect(() => {
    if (!from || !to) return
    const run = async () => {
      const revenueQuery = `*[_type == "invoice" && defined(amount) && dateTime(_createdAt) >= dateTime("${from}") && dateTime(_createdAt) <= dateTime("${to}")] { amount }`
      const expenseQuery = `*[_type == "expense" && dateTime(_createdAt) >= dateTime("${from}") && dateTime(_createdAt) <= dateTime("${to}")] { amount, category }`

      const invoices = await client.fetch(revenueQuery)
      const expenseDocs = await client.fetch(expenseQuery)

      const revenueTotal = invoices.reduce((sum: number, i: any) => sum + (i.amount || 0), 0)
      const expensesTotal = expenseDocs.reduce((sum: number, e: any) => sum + (e.amount || 0), 0)

      const grouped: Record<string, number> = {}
      expenseDocs.forEach((e: any) => {
        const cat = e.category || 'Uncategorized'
        grouped[cat] = (grouped[cat] || 0) + (e.amount || 0)
      })

      setRevenue(revenueTotal)
      setExpenses(expensesTotal)
      setNet(revenueTotal - expensesTotal)
      setCategories(grouped)
    }

    run()
  }, [client, from, to])

  return (
    <Card padding={4}>
      <Heading size={2}>📈 Profit & Loss Report</Heading>
      <Stack space={3} marginBottom={4}>
        <label>
          <Text size={1}>From Date</Text>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          <Text size={1}>To Date</Text>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </Stack>
      <Stack space={4} marginTop={4}>
        <Text>💰 Revenue: ${revenue.toFixed(2)}</Text>
        <Text>💸 Expenses: ${expenses.toFixed(2)}</Text>
        <Text>🧮 Net Profit: ${net.toFixed(2)}</Text>
        <Stack marginTop={3}>
          <Text weight="semibold">Expense Breakdown:</Text>
          {Object.entries(categories).map(([cat, amt]) => (
            <Text key={cat}>• {cat}: ${amt.toFixed(2)}</Text>
          ))}
        </Stack>
      </Stack>
    </Card>
  )
}
