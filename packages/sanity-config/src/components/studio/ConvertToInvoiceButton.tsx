import React from 'react'
import { Button, Card, Text, useToast } from '@sanity/ui'
import { useFormValue, useClient } from 'sanity'

interface QuoteDoc {
  _id: string
  customer?: any
  lineItems?: any[]
  total?: number
  conversionStatus?: string
}

export default function ConvertToInvoiceButton() {
  const toast = useToast()
  const sanityClient = useClient({ apiVersion: '2024-04-10' })
  const quote = useFormValue([]) as QuoteDoc

  const handleConvert = async () => {
    if (!quote?._id || !quote.customer || !quote.lineItems || !quote.total) {
      toast.push({
        status: 'warning',
        title: 'Missing fields',
        description: 'Quote must include customer, line items, and total.',
        closable: true
      })
      return
    }

    try {
      const newInvoice = await sanityClient.create({
        _type: 'invoice',
        quote: { _type: 'reference', _ref: quote._id },
        customerRef: quote.customer ? { _type: 'reference', _ref: (quote.customer as any)?._ref || (quote.customer as any)?._id || quote.customer } : undefined,
        lineItems: Array.isArray(quote.lineItems) ? quote.lineItems : [],
        total: typeof quote.total === 'number' ? quote.total : undefined,
        invoiceDate: new Date().toISOString().slice(0,10),
        status: 'pending',
      }, { autoGenerateArrayKeys: true })

      await sanityClient.patch(quote._id).set({
        conversionStatus: 'Converted'
      }).commit({ autoGenerateArrayKeys: true })

      toast.push({
        status: 'success',
        title: 'Invoice created!',
        description: `Invoice ID: ${newInvoice._id}`,
        closable: true
      })
    } catch (err: any) {
      console.error(err)
      toast.push({
        status: 'error',
        title: 'Failed to convert quote',
        description: err.message,
        closable: true
      })
    }
  }

  return (
    <Card padding={4} shadow={1} radius={2}>
      <Text size={1}>Ready to convert this quote into an invoice?</Text>
      <div style={{ marginTop: '12px' }}>
        <Button
          text="Convert to Invoice"
          tone="positive"
          onClick={handleConvert}
          disabled={quote?.conversionStatus === 'Converted'}
        />
      </div>
    </Card>
  )
}
