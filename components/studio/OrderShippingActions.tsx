import React from 'react'
import { useFormValue } from 'sanity'
import ShippingLabelActions from './ShippingLabelActions'

function getFnBase(): string {
  const envBase = (typeof process !== 'undefined' ? (process as any)?.env?.SANITY_STUDIO_NETLIFY_BASE : undefined) as string | undefined
  if (envBase) return envBase
  if (typeof window !== 'undefined') {
    try {
      const ls = window.localStorage?.getItem('NLFY_BASE')
      if (ls) return ls
      const origin = window.location?.origin
      if (origin && /^https?:\/\//i.test(origin)) return origin
    } catch {}
  }
  return ''
}

export default function OrderShippingActions() {
  const doc = useFormValue([]) as any
  const base = getFnBase() || 'https://fassanity.fasmotorsports.com'

  async function generateSlip() {
    try {
      const payload: Record<string, any> = {}
      const orderId = (doc?._id || '').replace(/^drafts\./, '')
      const invoiceId = (doc?.invoiceRef?._ref || '').replace(/^drafts\./, '')
      if (orderId) payload.orderId = orderId
      if (invoiceId) payload.invoiceId = invoiceId
      if (!payload.orderId && !payload.invoiceId) {
        throw new Error('Missing order or invoice reference for packing slip generation')
      }

      const res = await fetch(`${base}/.netlify/functions/generatePackingSlips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error(await res.text())
      const ct = (res.headers.get('content-type') || '').toLowerCase()
      let blob: Blob
      if (ct.includes('application/pdf')) {
        try {
          const ab = await res.arrayBuffer()
          blob = new Blob([ab], { type: 'application/pdf' })
        } catch {
          const b64 = await res.text()
          const clean = b64.replace(/^\"|\"$/g, '')
          const bytes = atob(clean)
          const buf = new Uint8Array(bytes.length)
          for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i)
          blob = new Blob([buf], { type: 'application/pdf' })
        }
      } else {
        const b64 = await res.text()
        const clean = b64.replace(/^\"|\"$/g, '')
        const bytes = atob(clean)
        const buf = new Uint8Array(bytes.length)
        for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i)
        blob = new Blob([buf], { type: 'application/pdf' })
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `packing-slip-${(doc?.stripeSessionId || doc?._id || '').toString()}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      alert(`Packing slip failed: ${e?.message || e}`)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <ShippingLabelActions doc={doc} />
      <button type="button" onClick={generateSlip} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #bbb', background: '#eaeaea' }}>
        Generate Packing Slip (PDF)
      </button>
    </div>
  )
}
