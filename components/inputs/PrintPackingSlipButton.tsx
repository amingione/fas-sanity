import React from 'react'
import { Button } from '@sanity/ui'
import type { StringInputProps } from 'sanity'

interface ExtendedStringInputProps extends StringInputProps {
  document?: {
    _id?: string
  }
}

export default function PrintPackingSlipButton(props: ExtendedStringInputProps) {
  const [loading, setLoading] = React.useState(false)

  const invoiceId = props?.document?._id?.replace('drafts.', '') || 'unknown'

  const handleClick = async () => {
    setLoading(true)

    try {
      const response = await fetch('/.netlify/functions/generatePackingSlips', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ invoiceId })
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)

      const a = document.createElement('a')
      a.href = url
      a.download = `packing-slip-${invoiceId}.pdf`
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
      text={loading ? 'Generating…' : '🧾 Print Packing Slip'}
      onClick={handleClick}
      tone="primary"
      disabled={loading}
    />
  )
}
