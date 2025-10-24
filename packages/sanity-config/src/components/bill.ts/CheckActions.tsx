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
    setLoading(true)
    try {
      const res = await fetch('/.netlify/functions/generateCheckPDF', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billId: id }),
      })

      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        console.error('Failed to generate check:', error)
        window.alert(`Error: ${error.error || 'Check generation failed'}`)
        return
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch (err) {
      console.error('Failed to request check generation:', err)
      window.alert('Unable to generate check. Please try again later.')
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
