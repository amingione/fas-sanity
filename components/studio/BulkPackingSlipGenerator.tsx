import React, { useEffect, useState } from 'react'
import { useClient } from 'sanity'
import { Button, Card, Stack, Text, Box } from '@sanity/ui'

type Invoice = {
  _id: string
  customerName: string
  products: { title: string; quantity: number }[]
}

export default function BulkPackingSlipGenerator() {
  const client = useClient({ apiVersion: '2024-04-10' })
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [status, setStatus] = useState<Record<string, string>>({})

  useEffect(() => {
    const fetchData = async () => {
      const result = await client.fetch(`*[_type == "invoice" && !defined(shippingLabel)]{
        _id,
        quote->{ 
          customer->{ fullName },
          products[]->{ title }
        }
      }`)

      const formatted = result.map((doc: any) => ({
        _id: doc._id,
        customerName: doc.quote?.customer?.fullName || 'Unknown',
        products: (doc.quote?.products || []).map((p: any) => ({
          title: p.title || 'Unnamed',
          quantity: 1
        }))
      }))
      setInvoices(formatted)
    }

    fetchData()
  }, [client])

  const generateSlip = async (invoice: Invoice) => {
    try {
      setStatus(prev => ({ ...prev, [invoice._id]: 'Generating...' }))
      const res = await fetch('/.netlify/functions/generatePackingSlips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: invoice.customerName,
          invoiceId: invoice._id,
          products: invoice.products
        })
      })

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `packing-slip-${invoice._id}.pdf`
      a.click()
      window.URL.revokeObjectURL(url)

      setStatus(prev => ({ ...prev, [invoice._id]: '✅ Downloaded' }))
    } catch (err) {
      console.error(err)
      setStatus(prev => ({ ...prev, [invoice._id]: '❌ Failed' }))
    }
  }

  return (
    <Card padding={4}>
      <img
        src="https://fassite.netlify.app/logo.png"
        alt="FAS Logo"
        style={{ width: '150px', marginBottom: '1rem' }}
      />
      <Box marginBottom={3}>
        <Text size={2} weight="semibold">📄 Bulk Packing Slip Generator</Text>
      </Box>
      <Stack space={4}>
        {invoices.map((invoice) => (
          <Card key={invoice._id} padding={3} shadow={1} radius={2}>
            <Stack space={2}>
              <Text>🧾 {invoice.customerName}</Text>
              <Button
                text="Download Packing Slip"
                onClick={() => generateSlip(invoice)}
                tone="primary"
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
