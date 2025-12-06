// NOTE: orderId is deprecated; prefer orderNumber for identifiers.
import React from 'react'
import {Button} from '@sanity/ui'
import type {StringInputProps} from 'sanity'

interface ExtendedStringInputProps extends StringInputProps {
  document?: {
    _id?: string
    orderRef?: {
      _ref?: string
    }
    orderNumber?: string | null
  }
}

export default function PrintPackingSlipButton(props: ExtendedStringInputProps) {
  const [loading, setLoading] = React.useState(false)

  // Get the order ID from the invoice's orderRef
  const orderId = props?.document?.orderRef?._ref?.replace('drafts.', '')
  const orderNumber =
    typeof props?.document?.orderNumber === 'string' ? props.document.orderNumber : ''
  const downloadLabel = (orderNumber || 'order').replace(/[^a-z0-9_-]/gi, '') || 'order'

  if (!orderId) {
    return <Button text="No Order Linked" tone="critical" disabled />
  }

  const handleClick = async () => {
    setLoading(true)

    try {
      const response = await fetch('/.netlify/functions/generatePackingSlips', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({orderId}), // Changed from invoiceId to orderId
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)

      const a = document.createElement('a')
      a.href = url
      a.download = `packing-slip-${downloadLabel}.pdf`
      a.click()

      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('❌ Failed to download packing slip:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      text={loading ? 'Generating…' : 'Print Packing Slip'}
      onClick={handleClick}
      tone="primary"
      disabled={loading}
    />
  )
}
