import React, { useState, useEffect } from 'react'
import { useClient } from 'sanity'
import { Card, Button, Stack, Text } from '@sanity/ui'

type Invoice = {
  _id: string
  customerName: string
  shippingMethod: string
  quote: {
    products: { title: string; quantity: number }[]
  }
}

export default function BulkLabelGenerator() {
  const client = useClient({ apiVersion: '2024-04-10' })
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [status, setStatus] = useState<Record<string, string>>({})

  useEffect(() => {
    const fetchInvoices = async () => {
      const result = await client.fetch(`*[_type == "invoice" && !defined(shippingLabel)]{
        _id,
        shippingMethod,
        quote->{ products[]->{title}, customer->{ fullName } }
      }`)
      const formatted = result.map((doc: any) => ({
        _id: doc._id,
        shippingMethod: doc.shippingMethod,
        customerName: doc.quote?.customer?.fullName || 'Unknown',
        quote: {
          products: doc.quote?.products?.map((p: any) => ({
            title: p.title || 'Unnamed',
            quantity: 1
          })) || []
        }
      }))
      setInvoices(formatted)
    }

    fetchInvoices()
  }, [client])

  const generateLabel = async (invoice: Invoice) => {
    try {
      setStatus(prev => ({ ...prev, [invoice._id]: 'Generating...' }))
      const res = await fetch('/.netlify/functions/createShippingLabel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: invoice.customerName,
          labelDescription: 'Bulk Generated',
          invoiceId: invoice._id
        })
      })

      if (!res.ok) throw new Error('Failed to generate label')
      setStatus(prev => ({ ...prev, [invoice._id]: '✅ Success' }))
    } catch (err) {
      console.error(err)
      setStatus(prev => ({ ...prev, [invoice._id]: '❌ Failed' }))
    }
  }

  return (
    <Card padding={4}>
      <Stack space={3}>
        <Text size={2} weight="semibold">📦 Bulk Shipping Label Generator</Text>
      </Stack>
      <Stack space={4}>
        {invoices.map(invoice => (
          <Card key={invoice._id} padding={3} shadow={1} radius={2}>
            <Stack space={2}>
              <Text>🧾 {invoice.customerName}</Text>
              <Text>Method: {invoice.shippingMethod}</Text>
              <Button
                text={status[invoice._id] === 'Generating...' ? 'Generating…' : 'Generate Label'}
                onClick={() => generateLabel(invoice)}
                tone="primary"
                disabled={status[invoice._id] === 'Generating...'}
              />
              <Text size={1} muted>{status[invoice._id]}</Text>
            </Stack>
          </Card>
        ))}
        {invoices.length === 0 && <Text>No unshipped invoices found.</Text>}
      </Stack>
    </Card>
  )
}
