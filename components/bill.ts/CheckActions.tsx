import React from 'react'

interface CheckActionsProps {
  doc: {
    displayed?: {
      _id?: string;
    };
  };
}

export default function CheckActions({ doc }: CheckActionsProps) {
  const id = doc?.displayed?._id?.replace('drafts.', '')

  const handlePrint = async () => {
    if (!id) return
    const res = await fetch('/.netlify/functions/generateCheckPDF', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ billId: id })
    })

    if (!res.ok) {
      alert('Failed to generate check PDF.')
      return
    }

    const blob = await res.blob()
    const url = window.URL.createObjectURL(blob)
    const a = window.document.createElement('a')
    a.href = url
    a.download = `check-${id}.pdf`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  return (
    <div style={{ marginTop: '2rem' }}>
      <button
        onClick={handlePrint}
        style={{
          display: 'inline-block',
          padding: '10px 16px',
          backgroundColor: '#0070f3',
          color: '#fff',
          fontSize: '14px',
          borderRadius: '4px',
          cursor: 'pointer',
          border: 'none'
        }}
      >
        🧾 Print Check
      </button>
    </div>
  )
}
