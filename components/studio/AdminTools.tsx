import React, { useMemo, useState } from 'react'

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
  return 'https://fassanity.fasmotorsports.com'
}

export default function AdminTools() {
  const base = useMemo(() => getFnBase().replace(/\/$/, ''), [])
  const [dryRun, setDryRun] = useState(true)
  const [secret, setSecret] = useState<string>(() => {
    try {
      // @ts-ignore
      return (typeof process !== 'undefined' ? (process as any)?.env?.SANITY_STUDIO_BACKFILL_SECRET : '') || window.localStorage?.getItem('BACKFILL_SECRET') || ''
    } catch {
      return ''
    }
  })
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string>('')

  async function runBackfill() {
    setBusy(true)
    setResult('')
    try {
      const url = `${base}/.netlify/functions/backfillOrders${dryRun ? '?dryRun=true' : ''}`
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (secret) headers['Authorization'] = `Bearer ${secret}`
      const res = await fetch(url, { method: 'POST', headers })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.error) {
        setResult(`Error: ${data?.error || res.status}`)
      } else {
        setResult(`OK${dryRun ? ' (dry run)' : ''}: processed=${data.total}, changed=${data.changed}, migratedCustomer=${data.migratedCustomer}, cartFixed=${data.cartFixed}, remainingLegacyCustomer=${data.remainingCustomer}`)
      }
    } catch (e: any) {
      setResult(`Error: ${e?.message || String(e)}`)
    } finally {
      setBusy(false)
      try { if (secret) window.localStorage?.setItem('BACKFILL_SECRET', secret) } catch {}
    }
  }

  async function runCustomersBackfill() {
    setBusy(true)
    setResult('')
    try {
      const url = `${base}/.netlify/functions/backfillCustomers${dryRun ? '?dryRun=true' : ''}`
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (secret) headers['Authorization'] = `Bearer ${secret}`
      const res = await fetch(url, { method: 'POST', headers })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.error) {
        setResult(`Error: ${data?.error || res.status}`)
      } else {
        setResult(`OK${dryRun ? ' (dry run)' : ''}: processed=${data.total}, changed=${data.changed}, userIdSet=${data.userIdSet}, optInDefaults=${data.optInDefaults}, updatedStamped=${data.updatedStamped}`)
      }
    } catch (e: any) {
      setResult(`Error: ${e?.message || String(e)}`)
    } finally {
      setBusy(false)
      try { if (secret) window.localStorage?.setItem('BACKFILL_SECRET', secret) } catch {}
    }
  }
  async function runInvoiceBackfill() {
    setBusy(true)
    setResult('')
    try {
      const url = `${base}/.netlify/functions/backfillInvoices${dryRun ? '?dryRun=true' : ''}`
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (secret) headers['Authorization'] = `Bearer ${secret}`
      const res = await fetch(url, { method: 'POST', headers })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.error) {
        setResult(`Error: ${data?.error || res.status}`)
      } else {
        setResult(`OK${dryRun ? ' (dry run)' : ''}: processed=${data.total}, changed=${data.changed}, migratedCustomer=${data.migratedCustomer}, migratedOrder=${data.migratedOrder}, itemsFixed=${data.itemsFixed}`)
      }
    } catch (e: any) {
      setResult(`Error: ${e?.message || String(e)}`)
    } finally {
      setBusy(false)
      try { if (secret) window.localStorage?.setItem('BACKFILL_SECRET', secret) } catch {}
    }
  }

  return (
    <div style={{ padding: 16, maxWidth: 720 }}>
      <h2 style={{ margin: '8px 0' }}>Admin Tools</h2>
      <div style={{ padding: 12, border: '1px solid #eee', borderRadius: 6, marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>Orders Backfill</h3>
        <p style={{ color: '#ffffffff' }}>
          Runs a cleanup across all Order documents: sets cart item types, migrates legacy customer → customerRef, and removes the legacy field.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} /> Dry run
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#ffffffff', marginBottom: 4 }}>Optional BACKFILL secret</label>
          <input
            type="password"
            value={secret}
            placeholder="Enter secret or leave blank"
            onChange={(e) => setSecret(e.target.value)}
            style={{ width: '100%', padding: 8, border: '1px solid #ffffffff', borderRadius: 4 }}
          />
        </div>
        <button
          type="button"
          onClick={runBackfill}
          disabled={busy}
          style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #aa0000ff', background: busy ? '#f3f3f3' : '#aa0000ff', cursor: busy ? 'default' : 'pointer' }}
        >
          {busy ? 'Running…' : 'Run Backfill'}
        </button>
        {result ? (
          <pre style={{ background: '#fafafa', border: '1px solid #ffffffff', padding: 8, borderRadius: 6, marginTop: 10, whiteSpace: 'pre-wrap' }}>{result}</pre>
        ) : null}
      </div>

      <div style={{ padding: 12, border: '1px solid #ffffffff', borderRadius: 6 }}>
        <h3 style={{ marginTop: 0 }}>Invoices Backfill</h3>
        <p style={{ color: '#ffffffff' }}>
          Fixes line item keys, migrates legacy customer/order references.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} /> Dry run
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#ffffffff', marginBottom: 4 }}>Optional BACKFILL secret</label>
          <input
            type="password"
            value={secret}
            placeholder="Enter secret or leave blank"
            onChange={(e) => setSecret(e.target.value)}
            style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 4 }}
          />
        </div>
        <button
          type="button"
          onClick={runInvoiceBackfill}
          disabled={busy}
          style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #aa0000ff', background: busy ? '#f3f3f3' : '#aa0000ff', cursor: busy ? 'default' : 'pointer' }}
        >
          {busy ? 'Running…' : 'Run Backfill'}
        </button>
      </div>

      <div style={{ padding: 12, border: '1px solid #ffffffff', borderRadius: 6, marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Customers Backfill</h3>
        <p style={{ color: '#ffffffff' }}>
          Copies legacy authId/auth0Id to userId if missing, defaults opt-in flags, updates updatedAt.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} /> Dry run
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#ffffffff', marginBottom: 4 }}>Optional BACKFILL secret</label>
          <input
            type="password"
            value={secret}
            placeholder="Enter secret or leave blank"
            onChange={(e) => setSecret(e.target.value)}
            style={{ width: '100%', padding: 8, border: '1px solid #ffffffff', borderRadius: 4 }}
          />
        </div>
        <button
          type="button"
          onClick={runCustomersBackfill}
          disabled={busy}
          style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #aa0000ff', background: busy ? '#f3f3f3' : '#aa0000ff', cursor: busy ? 'default' : 'pointer' }}
        >
          {busy ? 'Running…' : 'Run Backfill'}
        </button>
      </div>
    </div>
  )
}
