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

  function commit(next: string[]) {
    // Deduplicate case-insensitive, normalized
    const normalized = next.map(normalizeTag).filter((s) => s.length > 0)
    const uniq = Array.from(new Set(normalized))
    onChange(set(uniq))
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
            <span key={t} style={{display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 8px', border: '1px solid #ddd', borderRadius: 12}}>
              {t}
              <button type="button" onClick={() => removeTag(t)} style={{border: 'none', background: 'transparent', cursor: 'pointer', color: '#888'}} aria-label={`Remove ${t}`}>
                ×
              </button>
            </span>
          ))
        )}
      </div>
      <div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          placeholder="Add filter… (press Enter)"
          list="filter-suggestions"
          style={{width: '100%', padding: '6px 8px', border: '1px solid #ddd', borderRadius: 4}}
        />
        <datalist id="filter-suggestions">
          {filteredSuggestions.slice(0, 100).map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        {filteredSuggestions.length > 0 && (
          <div style={{marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap'}}>
            {filteredSuggestions.slice(0, 10).map((s) => (
              <button key={s} type="button" onClick={() => addTag(s)} style={{padding: '2px 8px', border: '1px solid #ddd', borderRadius: 12, background: '#f8f8f8', cursor: 'pointer'}}>
                + {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

