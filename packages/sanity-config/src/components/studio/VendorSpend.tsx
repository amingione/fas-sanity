import React, {useEffect, useState} from 'react'
import {useClient} from 'sanity'
import {Card, Heading, Stack, Text} from '@sanity/ui'

export default function VendorSpend() {
  const client = useClient({apiVersion: '2024-04-10'})
  const [totals, setTotals] = useState<Record<string, number>>({})
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  useEffect(() => {
    if (!from || !to) return
    const load = async () => {
      const billQuery = `*[_type == "bill" && defined(amount) && dateTime(_createdAt) >= dateTime("${from}") && dateTime(_createdAt) <= dateTime("${to}")]{
        amount, vendor->{name}
      }`
      const expenseQuery = `*[_type == "expense" && defined(amount) && dateTime(_createdAt) >= dateTime("${from}") && dateTime(_createdAt) <= dateTime("${to}")]{
        amount, vendor->{name}
      }`

      const bills = await client.fetch(billQuery)
      const expenses = await client.fetch(expenseQuery)
      const merged = [...bills, ...expenses]
      const spend: Record<string, number> = {}

      merged.forEach((entry: any) => {
        const name = entry.vendor?.name || 'Unknown Vendor'
        spend[name] = (spend[name] || 0) + (entry.amount || 0)
      })

      setTotals(spend)
    }
    load()
  }, [client, from, to])

  return (
    <Card padding={4}>
      <Heading size={2}>📦 Vendor Spend Overview</Heading>
      <Stack space={3} marginBottom={4}>
        <label>
          <Text size={1}>From</Text>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          <Text size={1}>To</Text>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </Stack>
      <Stack marginTop={4} space={3}>
        {Object.entries(totals).map(([vendor, amount]) => (
          <Text key={vendor}>
            • {vendor}: ${amount.toFixed(2)}
          </Text>
        ))}
        {Object.keys(totals).length === 0 && <Text>No vendor expenses recorded yet.</Text>}
      </Stack>
    </Card>
  )
}
