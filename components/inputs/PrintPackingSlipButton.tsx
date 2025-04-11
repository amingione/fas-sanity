import React from 'react'
import { Button } from '@sanity/ui'

type Props = {
  invoiceId: string
  customerName: string
  products: { title: string; quantity: number }[]
}

export default function PrintPackingSlipButton({ invoiceId, customerName, products }: Props) {
  const handleClick = async () => {
    try {
      const response = await fetch('/.netlify/functions/generatePackingSlips', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ invoiceId, customerName, products })
      })

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `packing-slip-${invoiceId}.pdf`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to download packing slip', err)
    }
  }

  return (
    <Button text="🧾 Print Packing Slip" onClick={handleClick} tone="primary" />
  )
}
