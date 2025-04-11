import React from 'react'
import { Button, Card, Text, useToast } from '@sanity/ui'
import { useFormValue, useClient } from 'sanity'

export default function ConvertToInvoiceButton() {
  const toast = useToast()
  const sanityClient = useClient({ apiVersion: '2024-04-10' })
  const quote = useFormValue([]) as any

  const handleConvert = async () => {
    if (!quote || !quote._id) return

    try {
      const newInvoice = await sanityClient.create({
        _type: 'invoice',
        quote: { _type: 'reference', _ref: quote._id },
        customer: quote.customer,
        lineItems: quote.lineItems,
        total: quote.total,
        createdAt: new Date().toISOString()
      })

      await sanityClient.patch(quote._id).set({
        conversionStatus: 'Converted'
      }).commit()

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
        />
      </div>
    </Card>
  )
}