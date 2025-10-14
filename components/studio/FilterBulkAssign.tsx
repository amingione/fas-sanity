import React, { useEffect, useMemo, useState } from 'react'
import { useClient } from 'sanity'

type Props = { tag: string }

function normalizeTag(s: string): string {
  return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

export default function FilterBulkAssign({ tag }: Props) {
  const client = useClient({ apiVersion: '2024-10-01' })
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<any[]>([])
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [msg, setMsg] = useState<string>('')

  const normTag = useMemo(() => normalizeTag(tag), [tag])

  function toggle(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  async function load() {
    setLoading(true)
    setMsg('')
    try {
      const term = q.trim()
      const query = `*[_type == "product" && !( $tag in (defined(filters) ? filters : []) ) ${term ? ' && (title match $m || sku match $m)' : ''}][0...200]{ _id, title, sku }`
      const params: Record<string, unknown> = { tag: normTag }
      if (term) params.m = `${term}*`
      const result: any[] = await client.fetch(query, params)
      setItems(Array.isArray(result) ? result : [])
    } catch (e: any) {
      setMsg(String(e?.message || e))
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function apply() {
    const ids = Object.entries(checked).filter(([, v]) => v).map(([id]) => id)
    if (ids.length === 0) { setMsg('Select at least one product'); return }
    setLoading(true)
    setMsg('')
    try {
      const docs: any[] = await client.fetch(`*[_id in $ids]{ _id, filters }`, { ids })
      const tx = client.transaction()
      for (const d of docs) {
        const arr = Array.isArray(d.filters) ? d.filters : []
        const next = Array.from(new Set([...arr.map(normalizeTag), normTag]))
        tx.patch(d._id, { set: { filters: next } })
      }
      await tx.commit({ autoGenerateArrayKeys: true })
      setMsg(`Added "${normTag}" to ${ids.length} product(s).`)
      setChecked({})
      await load()
    } catch (e: any) {
      setMsg(String(e?.message || e) || 'Update failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 12 }}>
      <h3 style={{ margin: '4px 0 10px' }}>Bulk add products to filter: “{normTag}”</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input
          type="text"
          placeholder="Search by title or SKU…"
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') load() }}
          style={{ flex: 1, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 4 }}
        />
        <button type="button" onClick={load} disabled={loading} style={{ padding: '6px 10px' }}>
          {loading ? 'Loading…' : 'Search'}
        </button>
        <button type="button" onClick={apply} disabled={loading} style={{ padding: '6px 10px' }}>
          {loading ? 'Saving…' : 'Add to Filter'}
        </button>
      </div>
      {msg ? <div style={{ color: '#555', marginBottom: 8 }}>{msg}</div> : null}
      <div style={{ maxHeight: 380, overflowY: 'auto', border: '1px solid #eee', borderRadius: 6 }}>
        {items.length === 0 ? (
          <div style={{ padding: 10, color: '#777' }}>No matching products (or all already have “{normTag}”).</div>
        ) : (
          items.map((p) => (
            <label key={p._id} style={{ display: 'grid', gridTemplateColumns: '24px 1fr', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid #f3f3f3' }}>
              <input type="checkbox" checked={!!checked[p._id]} onChange={() => toggle(p._id)} />
              <div>
                <div style={{ fontWeight: 600 }}>{p.title}</div>
                <div style={{ fontSize: 12, color: '#666' }}>{p.sku || '—'}</div>
              </div>
            </label>
          ))
        )}
      </div>
    </div>
  )
}
