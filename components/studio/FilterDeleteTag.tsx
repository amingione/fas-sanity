import React, {useEffect, useState} from 'react'
import {useClient} from 'sanity'

type Props = { tag: string }

function normalizeTag(s: string): string {
  return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

export default function FilterDeleteTag({ tag }: Props) {
  const client = useClient({ apiVersion: '2024-10-01' })
  const [count, setCount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string>('')
  const normTag = normalizeTag(tag)

  async function refresh() {
    setBusy(true)
    setMsg('')
    try {
      const c = await client.fetch('count(*[_type=="product" && defined(filters) && $tag in filters])', { tag: normTag })
      setCount(Number(c) || 0)
    } catch (e: any) {
      setMsg(String(e?.message || e))
      setCount(0)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { refresh() }, [tag])

  async function removeEverywhere() {
    const ok = typeof window !== 'undefined' ? window.confirm(`Delete filter "${normTag}" from all products?`) : false
    if (!ok) return
    setBusy(true)
    setMsg('')
    try {
      const ids: string[] = await client.fetch('*[_type=="product" && defined(filters) && $tag in filters][]._id', { tag: normTag })
      if (ids.length === 0) {
        setMsg('No products currently have this filter.')
        setCount(0)
        return
      }
      const docs: any[] = await client.fetch('*[_id in $ids]{_id, filters}', { ids })
      const tx = client.transaction()
      for (const d of docs) {
        const arr = Array.isArray(d.filters) ? d.filters : []
        const next = arr.filter((t: any) => normalizeTag(String(t)) !== normTag)
        tx.patch(d._id, { set: { filters: next } })
      }
      await tx.commit({ autoGenerateArrayKeys: true })
      setMsg(`Removed "${normTag}" from ${docs.length} product(s).`)
      setCount(0)
    } catch (e: any) {
      setMsg(String(e?.message || e) || 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: 12 }}>
      <h3 style={{ margin: '4px 0 10px' }}>Delete filter: “{normTag}”</h3>
      <div style={{ marginBottom: 8, color: '#444' }}>
        {count === null ? 'Counting…' : `Products with this filter: ${count}`}
      </div>
      {msg ? <div style={{ marginBottom: 8, color: '#555' }}>{msg}</div> : null}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={refresh} disabled={busy} style={{ padding: '6px 10px' }}>
          {busy ? 'Refreshing…' : 'Refresh'}
        </button>
        <button type="button" onClick={removeEverywhere} disabled={busy} style={{ padding: '6px 10px', background: '#e03a3a', color: '#fff', border: '1px solid #d22', borderRadius: 4 }}>
          {busy ? 'Deleting…' : 'Delete This Filter Everywhere'}
        </button>
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: '#666' }}>
        This removes the tag from all products. Since the filter list is auto‑generated from products, the tag disappears once no products have it.
      </div>
    </div>
  )
}

