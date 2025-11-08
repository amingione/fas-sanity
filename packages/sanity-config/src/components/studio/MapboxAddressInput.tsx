import React, {useEffect, useState} from 'react'
import {set, useClient, useFormValue} from 'sanity'

export default function MapboxAddressInput(props: any) {
  const {value, onChange, path} = props
  const client = useClient({apiVersion: '2024-10-01'})
  const _id = useFormValue(['_id']) as string
  const [q, setQ] = useState<string>(value || '')
  const [items, setItems] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const token = (
    typeof process !== 'undefined' ? process.env?.SANITY_STUDIO_MAPBOX_TOKEN : undefined
  ) as string | undefined

  // root field ("ship_to" or "ship_from") inferred from the input path
  const root: 'ship_to' | 'ship_from' = (Array.isArray(path) && path[0]) || 'ship_to'

  // Debounced fetch to Mapbox Places API
  useEffect(() => {
    if (!token) return
    const query = (q || '').trim()
    if (query.length < 2) {
      setItems([])
      setOpen(false)
      return
    }
    let t: any = setTimeout(async () => {
      try {
        setBusy(true)
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?types=address&autocomplete=true&limit=5&access_token=${token}`
        const res = await fetch(url)
        const data = await res.json().catch(() => ({features: []}))
        setItems(Array.isArray(data?.features) ? data.features : [])
        setOpen(true)
      } catch {
        setItems([])
        setOpen(false)
      } finally {
        setBusy(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [q, token])

  function usAbbr(val?: string) {
    if (!val) return undefined
    const s = String(val).trim()
    if (s.length === 2) return s.toUpperCase()
    const LUT: Record<string, string> = {
      alabama: 'AL',
      alaska: 'AK',
      arizona: 'AZ',
      arkansas: 'AR',
      california: 'CA',
      colorado: 'CO',
      connecticut: 'CT',
      delaware: 'DE',
      'district of columbia': 'DC',
      florida: 'FL',
      georgia: 'GA',
      hawaii: 'HI',
      idaho: 'ID',
      illinois: 'IL',
      indiana: 'IN',
      iowa: 'IA',
      kansas: 'KS',
      kentucky: 'KY',
      louisiana: 'LA',
      maine: 'ME',
      maryland: 'MD',
      massachusetts: 'MA',
      michigan: 'MI',
      minnesota: 'MN',
      mississippi: 'MS',
      missouri: 'MO',
      montana: 'MT',
      nebraska: 'NE',
      nevada: 'NV',
      'new hampshire': 'NH',
      'new jersey': 'NJ',
      'new mexico': 'NM',
      'new york': 'NY',
      'north carolina': 'NC',
      'north dakota': 'ND',
      ohio: 'OH',
      oklahoma: 'OK',
      oregon: 'OR',
      pennsylvania: 'PA',
      'rhode island': 'RI',
      'south carolina': 'SC',
      'south dakota': 'SD',
      tennessee: 'TN',
      texas: 'TX',
      utah: 'UT',
      vermont: 'VT',
      virginia: 'VA',
      washington: 'WA',
      'west virginia': 'WV',
      wisconsin: 'WI',
      wyoming: 'WY',
    }
    return LUT[s.toLowerCase()] || s.toUpperCase()
  }

  function pick(feature: any) {
    try {
      const addrNum = feature?.address || feature?.properties?.address
      const street = feature?.text || feature?.text_en || feature?.place_name?.split(',')[0]
      const line1 = [addrNum, street].filter(Boolean).join(' ')

      // Mapbox context lookups
      const ctx = Array.isArray(feature?.context) ? feature.context : []
      const place = ctx.find((c: any) => String(c.id || '').startsWith('place.'))
      const region = ctx.find((c: any) => String(c.id || '').startsWith('region.'))
      const postcode = ctx.find((c: any) => String(c.id || '').startsWith('postcode.'))
      const country = ctx.find((c: any) => String(c.id || '').startsWith('country.'))

      const city = feature?.properties?.city || place?.text
      const rawState = feature?.properties?.region || region?.text
      const countryCode =
        feature?.properties?.short_code || country?.short_code || country?.properties?.short_code
      const state = String(countryCode || '').toUpperCase() === 'US' ? usAbbr(rawState) : rawState
      const postal = feature?.properties?.postcode || postcode?.text

      // Update this field locally
      onChange(set(line1))

      // Patch sibling fields on the document
      const patch: Record<string, any> = {}
      patch[`${root}.address_line1`] = line1
      if (city) patch[`${root}.city_locality`] = city
      if (state) patch[`${root}.state_province`] = state
      if (postal) patch[`${root}.postal_code`] = postal
      if (countryCode) patch[`${root}.country_code`] = String(countryCode).toUpperCase()

      if (_id) {
        client
          .patch(_id)
          .set(patch)
          .commit({autoGenerateArrayKeys: true})
          .catch((err) => {
            console.error('MapboxAddressInput: failed to patch address fields', err)
          })
      }

      setOpen(false)
    } catch {
      // swallow
    }
  }

  return (
    <div style={{position: 'relative'}}>
      <input
        type="text"
        value={q}
        onChange={(e) => {
          setQ(e.currentTarget.value)
          onChange(set(e.currentTarget.value))
        }}
        onBlur={() => {
          setTimeout(() => setOpen(false), 120)
        }}
        placeholder="Start typing an address…"
        style={{width: '100%', padding: '6px 8px', color: '#000', background: '#fff'}}
      />
      {open && items.length > 0 && (
        <div
          style={{
            position: 'absolute',
            zIndex: 10,
            top: '100%',
            left: 0,
            right: 0,
            background: '#fff',
            border: '1px solid #ddd',
            borderTop: 'none',
            maxHeight: 220,
            overflowY: 'auto',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            color: '#000',
          }}
        >
          {items.map((f: any) => (
            <div
              key={f.id}
              onClick={() => pick(f)}
              style={{padding: '8px 10px', cursor: 'pointer', borderTop: '1px solid #eee'}}
              onMouseDown={(e) => e.preventDefault()}
            >
              {f.place_name}
            </div>
          ))}
          {busy && <div style={{padding: '8px 10px', fontSize: 12, color: '#666'}}>Searching…</div>}
        </div>
      )}
    </div>
  )
}
