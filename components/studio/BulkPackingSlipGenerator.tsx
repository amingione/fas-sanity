import React, { useEffect, useState } from 'react'
import { useClient } from 'sanity'
import { Button, Card, Stack, Text, Box, Flex, Grid } from '@sanity/ui'
import { EyeOpenIcon, DownloadIcon } from '@sanity/icons'
import { format } from 'date-fns'

type Invoice = {
  _id: string
  customerName: string
  products: { title: string; quantity: number }[]
}

type FileMeta = {
  size: number
  pages: number
}

export default function BulkPackingSlipGenerator() {
  const client = useClient({ apiVersion: '2024-04-10' })
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [status, setStatus] = useState<Record<string, string>>({})
  const [lastGenerated, setLastGenerated] = useState<Record<string, string>>({})
  const [fileMeta, setFileMeta] = useState<Record<string, FileMeta>>({})

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
        body: JSON.stringify(invoice)
      })

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)

      const a = document.createElement('a')
      a.href = url
      a.download = `packing-slip-${invoice._id}.pdf`
      a.click()
      window.URL.revokeObjectURL(url)

      const size = Math.round(blob.size / 1024)
      const pages = Math.max(1, Math.ceil(invoice.products.length / 12))

      setFileMeta(prev => ({
        ...prev,
        [invoice._id]: { size, pages }
      }))
      setStatus(prev => ({ ...prev, [invoice._id]: '✅ Downloaded' }))
      setLastGenerated(prev => ({
        ...prev,
        [invoice._id]: format(new Date(), 'PPpp')
      }))
    } catch (err) {
      console.error(err)
      setStatus(prev => ({ ...prev, [invoice._id]: '❌ Failed' }))
    }
  }

  const previewSlip = async (invoice: Invoice) => {
    try {
      const res = await fetch('/.netlify/functions/generatePackingSlips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoice)
      })

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      window.open(url, '_blank')

      const size = Math.round(blob.size / 1024)
      const pages = Math.max(1, Math.ceil(invoice.products.length / 12))

      setFileMeta(prev => ({
        ...prev,
        [invoice._id]: { size, pages }
      }))
    } catch (err) {
      console.error('Preview failed:', err)
    }
  }

  return (
    <Card padding={4}>
      <img
        src="/media/New Red FAS Logo.png"
        alt="FAS Logo"
        style={{ width: '150px', marginBottom: '1rem' }}
      />
      <Box marginBottom={3}>
        <Text size={2} weight="semibold" align="center">📦 Bulk Packing Slip Generator</Text>
      </Box>
      <Stack space={5}>
        {invoices.map((invoice) => (
          <Card key={invoice._id} padding={4} shadow={1} radius={3}>
            <Stack space={3}>
              <Text size={2}>🧾 {invoice.customerName}</Text>
              <Flex gap={2}>
                <Button
                  text="Download"
                  icon={DownloadIcon}
                  tone="primary"
                  disabled={status[invoice._id] === 'Generating...'}
                  onClick={() => generateSlip(invoice)}
                />
                <Button
                  text="Preview"
                  icon={EyeOpenIcon}
                  tone="default"
                  disabled={status[invoice._id] === 'Generating...'}
                  onClick={() => previewSlip(invoice)}
                />
              </Flex>
              <Text size={1} muted>
                {status[invoice._id]}{' '}
                {lastGenerated[invoice._id] && `| Last: ${lastGenerated[invoice._id]}`}
              </Text>
              {fileMeta[invoice._id] && (
                <Text size={1} muted>
                  PDF: {fileMeta[invoice._id].pages} page(s), {fileMeta[invoice._id].size} KB
                </Text>
              )}
            </Stack>
          </Card>
        ))}
        {invoices.length === 0 && <Text>No unshipped invoices found.</Text>}
      </Stack>
    </Card>
  )
}
