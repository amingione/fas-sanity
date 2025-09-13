import React, {useEffect, useMemo, useState} from 'react'
import {useClient, set} from 'sanity'

type Props = {
  value?: string[]
  onChange: (patch: any) => void
  renderDefault?: (props: any) => React.ReactNode
}

function normalizeTag(s: string): string {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

export default function FilterTagsInput(props: Props) {
  const {value = [], onChange} = props
  const client = useClient({apiVersion: '2024-10-01'})
  const [allTags, setAllTags] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const tags: string[] = await client.fetch(
          'array::unique(*[_type == "product" && defined(filters)][].filters[])'
        )
        if (!cancelled) {
          const cleaned = (Array.isArray(tags) ? tags : [])
            .filter((t): t is string => typeof t === 'string')
            .map((t) => normalizeTag(t))
          setAllTags(Array.from(new Set(cleaned)).sort())
        }
      } catch {
        if (!cancelled) setAllTags([])
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [client])

  const current = useMemo(() => {
    const arr = Array.isArray(value) ? value : []
    return arr.map((t) => normalizeTag(t))
  }, [value])

  const filteredSuggestions = useMemo(() => {
    const q = normalizeTag(query)
    const suggestions = allTags.filter((t) => !current.includes(t))
    return q ? suggestions.filter((t) => t.includes(q)) : suggestions
  }, [allTags, current, query])

  function arraysEqual(a: string[], b: string[]) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
    return true
  }

  function commit(next: string[]) {
    // Deduplicate case-insensitive, normalized
    const normalized = next.map(normalizeTag).filter((s) => s.length > 0)
    const uniq = Array.from(new Set(normalized))
    // Avoid infinite loops: only patch if changed vs current normalized value
    if (!arraysEqual(uniq, current)) {
      onChange(set(uniq))
    }
  }

  function addTag(tag: string) {
    const norm = normalizeTag(tag)
    if (!norm) return
    if (current.includes(norm)) return
    commit([...(current || []), norm])
    setQuery('')
  }

  function removeTag(tag: string) {
    const norm = normalizeTag(tag)
    commit(current.filter((t) => t !== norm))
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      const raw = query
      if (!raw) return
      // Support comma-separated multi-add
      const parts = raw.split(',').map((s) => normalizeTag(s)).filter(Boolean)
      if (parts.length === 0) return
      commit([...(current || []), ...parts])
      setQuery('')
    } else if (e.key === 'Backspace' && !query) {
      // Quick remove last
      if (current.length > 0) removeTag(current[current.length - 1])
    }
  }

  return (
    <div style={{display: 'grid', gap: 8}}>
      <div style={{display: 'flex', flexWrap: 'wrap', gap: 6}}>
        {current.length === 0 ? (
          <span style={{fontSize: 12, color: '#666'}}>No filters yet. Type to add or pick from suggestions.</span>
        ) : (
          current.map((t) => (
            <span key={t} style={{display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 8px', border: '1px solid #ccc', background: '#f2f2f2', color: '#111', borderRadius: 12}}>
              <span>{t}</span>
              <button type="button" onClick={() => removeTag(t)} style={{border: 'none', background: 'transparent', cursor: 'pointer', color: '#444'}} aria-label={`Remove ${t}`}>
                ×
              </button>
            </span>
          ))
        )}
      </div>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.currentTarget.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          placeholder="Add filter… (press Enter)"
          style={{width: '100%', padding: '6px 8px', border: '1px solid #ddd', borderRadius: 4, background: '#fff', color: '#000'}}
        />

        {open && filteredSuggestions.length > 0 && (
          <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, background: '#fff', color: '#000', border: '1px solid #ddd', borderTop: 'none', maxHeight: 220, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.12)' }}>
            {filteredSuggestions.slice(0, 100).map((s) => (
              <div
                key={s}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addTag(s)}
                style={{ padding: '8px 10px', cursor: 'pointer', borderTop: '1px solid #eee' }}
              >
                {s}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
