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
  const [loading, setLoading] = React.useState(false)

  const handlePrint = async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await fetch('/.netlify/functions/generateCheckPDF', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billId: id })
      })

      if (!res.ok) throw new Error('Failed to generate check PDF.')

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = window.document.createElement('a')
      a.href = url
      a.download = `check-${id}.pdf`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ marginTop: '2rem' }}>
      <button
        onClick={handlePrint}
        disabled={loading}
        style={{
          display: 'inline-block',
          padding: '10px 16px',
          backgroundColor: '#0070f3',
          color: '#fff',
          fontSize: '14px',
          borderRadius: '4px',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.6 : 1,
          border: 'none'
        }}
      >
        {loading ? 'Generating…' : '🧾 Print Check'}
      </button>
    </div>
  )
}
