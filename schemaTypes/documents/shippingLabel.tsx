import React, {useEffect, useMemo, useState} from 'react'
import {
  defineType,
  defineField,
  set,
  useClient,
  useFormValue,
} from 'sanity'

/**
 * Netlify base
 * - When running `netlify dev`, set SANITY_STUDIO_NETLIFY_BASE=http://localhost:8888
 * - In production, set SANITY_STUDIO_NETLIFY_BASE=https://your-site.netlify.app
 */
// Resolve the Netlify functions base dynamically.
// Priority: ENV -> localStorage -> empty (caller must set)
function getFnBase(): string {
  const envBase = (import.meta as any)?.env?.SANITY_STUDIO_NETLIFY_BASE as string | undefined
  if (envBase) return envBase
  if (typeof window !== 'undefined') {
    const saved = window.localStorage?.getItem('NLFY_BASE') || ''
    if (saved) return saved
  }
  return ''
}
function setFnBase(next: string) {
  try { if (typeof window !== 'undefined') window.localStorage?.setItem('NLFY_BASE', next) } catch {}
}


async function safeFetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init)
  const text = await res.text().catch(() => '')
  if (!text) {
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} (empty body)`) // treat empty but ok as no data
    return {}
  }
  try {
    return JSON.parse(text)
  } catch (e) {
    const snippet = text.slice(0, 200).replace(/\n/g, ' ')
    throw new Error(`Invalid JSON from ${url}: ${snippet}`)
  }
}

/**
 * Mapbox address autocomplete input
 * - Reads SANITY_STUDIO_MAPBOX_TOKEN from env
 * - Shows suggestions as you type
 * - On select, fills address_line1, city_locality, state_province (2-letter for US), postal_code, country_code
 */
function MapboxAddressInput(props: any) {
  const {value, onChange, path} = props
  const client = useClient({apiVersion: '2024-10-01'})
  const _id = useFormValue(["_id"]) as string
  const [q, setQ] = useState<string>(value || '')
  const [items, setItems] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const token = (import.meta as any)?.env?.SANITY_STUDIO_MAPBOX_TOKEN as string | undefined

  // root field ("ship_to" or "ship_from") inferred from the input path
  const root: 'ship_to' | 'ship_from' = (Array.isArray(path) && path[0]) || 'ship_to'

  // Debounced fetch to Mapbox Places API
  useEffect(() => {
    if (!token) return
    const query = (q || '').trim()
    if (query.length < 3) { setItems([]); setOpen(false); return }
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
    const LUT: Record<string,string> = {
      alabama:'AL', alaska:'AK', arizona:'AZ', arkansas:'AR', california:'CA', colorado:'CO', connecticut:'CT', delaware:'DE', 'district of columbia':'DC', florida:'FL', georgia:'GA', hawaii:'HI', idaho:'ID', illinois:'IL', indiana:'IN', iowa:'IA', kansas:'KS', kentucky:'KY', louisiana:'LA', maine:'ME', maryland:'MD', massachusetts:'MA', michigan:'MI', minnesota:'MN', mississippi:'MS', missouri:'MO', montana:'MT', nebraska:'NE', nevada:'NV', 'new hampshire':'NH', 'new jersey':'NJ', 'new mexico':'NM', 'new york':'NY', 'north carolina':'NC', 'north dakota':'ND', ohio:'OH', oklahoma:'OK', oregon:'OR', pennsylvania:'PA', 'rhode island':'RI', 'south carolina':'SC', 'south dakota':'SD', tennessee:'TN', texas:'TX', utah:'UT', vermont:'VT', virginia:'VA', washington:'WA', 'west virginia':'WV', wisconsin:'WI', wyoming:'WY'
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
      const byId: Record<string, any> = {}
      ctx.forEach((c: any) => { if (c?.id) byId[c.id.split('.')[0]] = c })

      const place = ctx.find((c:any)=> String(c.id||'').startsWith('place.'))
      const region = ctx.find((c:any)=> String(c.id||'').startsWith('region.'))
      const postcode = ctx.find((c:any)=> String(c.id||'').startsWith('postcode.'))
      const country = ctx.find((c:any)=> String(c.id||'').startsWith('country.'))

      const city = feature?.properties?.city || place?.text
      const rawState = feature?.properties?.region || region?.text
      const countryCode = feature?.properties?.short_code || country?.short_code || country?.properties?.short_code
      const state = (String(countryCode || '').toUpperCase() === 'US') ? usAbbr(rawState) : rawState
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
        client.patch(_id).set(patch).commit({autoGenerateArrayKeys: true}).catch(()=>{})
      }

      setOpen(false)
    } catch {
      // swallow
    }
  }

  return (
    <div style={{position:'relative'}}>
      <input
        type="text"
        value={q}
        onChange={(e)=>{ setQ(e.currentTarget.value); onChange(set(e.currentTarget.value)) }}
        placeholder="Start typing an address…"
        style={{width:'100%', padding:'6px 8px'}}
      />
      {open && items.length > 0 && (
        <div style={{position:'absolute', zIndex: 10, top:'100%', left:0, right:0, background:'#fff', border:'1px solid #ddd', borderTop:'none', maxHeight:220, overflowY:'auto', boxShadow:'0 4px 12px rgba(0,0,0,0.08)'}}>
          {items.map((f:any) => (
            <div
              key={f.id}
              onClick={()=>pick(f)}
              style={{padding:'8px 10px', cursor:'pointer', borderTop:'1px solid #eee'}}
              onMouseDown={(e)=> e.preventDefault()}
            >
              {f.place_name}
            </div>
          ))}
          {busy && <div style={{padding:'8px 10px', fontSize:12, color:'#666'}}>Searching…</div>}
        </div>
      )}
    </div>
  )
}

/**
 * Custom input to fetch live ShipEngine rates and select a service.
 * Reads sibling fields from the form: ship_to, ship_from, weight, dimensions
 */
function ServiceRateInput(props: any) {
  const {value, onChange, schemaType} = props
  const ship_to = useFormValue(["ship_to"]) as any
  const ship_from = useFormValue(["ship_from"]) as any
  const weight = useFormValue(["weight"]) as any
  const dimensions = useFormValue(["dimensions"]) as any

  const [rates, setRates] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [baseOverride, setBaseOverride] = useState<string>(typeof window !== 'undefined' ? (window.localStorage?.getItem('NLFY_BASE') || '') : '')
  const currentBase = (getFnBase() || baseOverride || '')

  const canQuote = useMemo(() => {
    const isToUS = ship_to?.country_code?.toUpperCase() === 'US'
    const isFromUS = ship_from?.country_code?.toUpperCase() === 'US'
    const hasTo = isToUS
      ? Boolean(ship_to?.postal_code && ship_to?.country_code)
      : Boolean(ship_to?.postal_code && ship_to?.country_code && ship_to?.city_locality && ship_to?.state_province)
    const hasFrom = isFromUS
      ? Boolean(ship_from?.postal_code && ship_from?.country_code)
      : Boolean(ship_from?.postal_code && ship_from?.country_code && ship_from?.city_locality && ship_from?.state_province)
    const hasWeight = Number(weight?.value) > 0 && Boolean(weight?.unit)
    const hasDims = Number(dimensions?.length) > 0 && Number(dimensions?.width) > 0 && Number(dimensions?.height) > 0
    return hasTo && hasFrom && hasWeight && hasDims
  }, [ship_to, ship_from, weight, dimensions])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!canQuote) {
        setRates([])
        setError('')
        return
      }
      setLoading(true)
      setError('')
      try {
        const data = (await safeFetchJson(`${currentBase || 'http://localhost:8888'}/.netlify/functions/getShipEngineRates`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            ship_to,
            ship_from,
            package_details: {
              weight: {value: Number(weight.value) || 1, unit: weight.unit || 'pound'},
              dimensions: dimensions
                ? {
                    unit: 'inch',
                    length: Number(dimensions.length) || undefined,
                    width: Number(dimensions.width) || undefined,
                    height: Number(dimensions.height) || undefined,
                  }
                : undefined,
            },
          }),
        })) as any
        if (!cancelled) {
          if (data?.error) {
            const errMsg = typeof data.error === 'string' ? data.error : JSON.stringify(data.error)
            throw new Error(errMsg)
          }
          setRates(Array.isArray(data?.rates) ? data.rates : [])
        }
      } catch (e: any) {
        if (!cancelled) {
          const msg = String(e?.message || 'Unable to load rates')
          const hint = ` • Tip: Verify functions running at ${currentBase || 'http://localhost:8888'} (run: netlify dev --port=8888)`
          setError(msg + hint)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [canQuote, ship_to, ship_from, weight, dimensions, currentBase])

  const isToUS = ship_to?.country_code?.toUpperCase() === 'US'
  const isFromUS = ship_from?.country_code?.toUpperCase() === 'US'
  const missing: string[] = []
  if (!ship_to?.postal_code) missing.push('Ship To postal code')
  if (!ship_to?.country_code) missing.push('Ship To country')
  if (!isToUS && !ship_to?.city_locality) missing.push('Ship To city')
  if (!isToUS && !ship_to?.state_province) missing.push('Ship To state')
  if (!ship_from?.postal_code) missing.push('Ship From postal code')
  if (!ship_from?.country_code) missing.push('Ship From country')
  if (!isFromUS && !ship_from?.city_locality) missing.push('Ship From city')
  if (!isFromUS && !ship_from?.state_province) missing.push('Ship From state')
  if (!(Number(weight?.value) > 0)) missing.push('Weight value')
  if (!weight?.unit) missing.push('Weight unit')
  if (!(Number(dimensions?.length) > 0)) missing.push('Length')
  if (!(Number(dimensions?.width) > 0)) missing.push('Width')
  if (!(Number(dimensions?.height) > 0)) missing.push('Height')

  return (
    <div>
      <div style={{display:'flex', gap:8, alignItems:'center', marginBottom:8}}>
        <label style={{fontSize:12}}>Functions Base:</label>
        <input
          type="text"
          placeholder="http://localhost:8888"
          value={baseOverride || currentBase}
          onChange={(e)=>{
            const v = e.currentTarget.value
            setBaseOverride(v)
            setFnBase(v)
          }}
          style={{flex:1, padding:'4px 6px'}}
        />
      </div>
      {!canQuote && (
        <p style={{color:'#b26b00', marginTop:4}}>
          Fill required fields: {missing.join(', ')}
        </p>
      )}
      {loading && <p>Loading rates…</p>}
      {error && <p style={{color: 'red'}}>{error}</p>}
      {!loading && !error && (
        <select
          value={value || ''}
          onChange={(e) => onChange(set(e.currentTarget.value))}
        >
          <option value="">Select a service</option>
          {rates.map((rate) => (
            <option key={rate.serviceCode} value={rate.serviceCode}>
              {rate.carrier} – {rate.service} (${rate.amount})
            </option>
          ))}
        </select>
      )}
      {!loading && !error && rates?.length === 0 && canQuote && (
        <p>No rates returned. Adjust details and try again.</p>
      )}
    </div>
  )
}

/**
 * Bottom action panel: Generate & Print
 * Calls a Netlify function to create a label, then patches the document with tracking + label URL.
 */
function GenerateAndPrintPanel(props: any) {
  const client = useClient({apiVersion: '2024-10-01'})
  const _id = useFormValue(["_id"]) as string
  const doc = {
    name: useFormValue(["name"]) as any,
    ship_to: useFormValue(["ship_to"]) as any,
    ship_from: useFormValue(["ship_from"]) as any,
    weight: useFormValue(["weight"]) as any,
    dimensions: useFormValue(["dimensions"]) as any,
    serviceSelection: useFormValue(["serviceSelection"]) as string,
  }

  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string>('')
  const currentBase = getFnBase()

  async function handleGenerate() {
    setBusy(true)
    setMsg('')
    try {
      if (!doc.serviceSelection) throw new Error('Select a service/rate first.')
      const payload = {
        ship_to: doc.ship_to,
        ship_from: doc.ship_from,
        service_code: doc.serviceSelection,
        package_details: {
          weight: {value: Number(doc?.weight?.value) || 1, unit: doc?.weight?.unit || 'pound'},
          dimensions: doc.dimensions
            ? {
                unit: 'inch',
                length: Number(doc.dimensions.length) || undefined,
                width: Number(doc.dimensions.width) || undefined,
                height: Number(doc.dimensions.height) || undefined,
              }
            : undefined,
        },
      }
      const res = (await safeFetchJson(`${currentBase || 'http://localhost:8888'}/.netlify/functions/createShippingLabel`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
      })) as any

      if (res?.error) {
        const errMsg = typeof res.error === 'string' ? res.error : JSON.stringify(res.error)
        throw new Error(errMsg)
      }

      const trackingNumber = res?.tracking_number || res?.trackingNumber
      const labelUrl = res?.label_download?.pdf || res?.labelUrl

      if (!trackingNumber || !labelUrl) {
        throw new Error('Label created but missing tracking or label URL in response')
      }

      await client
        .patch(_id)
        .set({trackingNumber, labelUrl})
        .commit({autoGenerateArrayKeys: true})

      setMsg('Label generated. Tracking & label URL saved below.')
      // Optionally, open label
      try { window?.open(labelUrl, '_blank') } catch {}
    } catch (e: any) {
      setMsg(String(e?.message || e) || 'Failed to generate label')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{borderTop: '1px solid #eee', paddingTop: 12}}>
      <button disabled={busy} onClick={handleGenerate}>
        {busy ? 'Generating…' : 'Generate & Print'}
      </button>
      {msg && <p style={{marginTop: 8}}>{msg}</p>}
    </div>
  )
}

export default defineType({
  name: 'shippingLabel',
  title: 'Shipping Label',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Label Name',
      type: 'string',
      description: 'Give this label a friendly name for later reference.',
      validation: (Rule) => Rule.required().min(2),
    }),

    defineField({
      name: 'ship_from',
      title: 'Ship From',
      type: 'object',
      options: {collapsible: true, columns: 2},
      fields: [
        {name: 'name', title: 'Name', type: 'string'},
        {name: 'phone', title: 'Phone', type: 'string'},
        {name: 'address_line1', title: 'Address 1', type: 'string', validation: (Rule) => Rule.required(), components: { input: MapboxAddressInput }},
        {name: 'address_line2', title: 'Address 2', type: 'string'},
        {name: 'city_locality', title: 'City', type: 'string', validation: (Rule) => Rule.required()},
        {name: 'state_province', title: 'State', type: 'string', validation: (Rule) => Rule.required()},
        {name: 'postal_code', title: 'Postal Code', type: 'string', validation: (Rule) => Rule.required()},
        {name: 'country_code', title: 'Country', type: 'string', initialValue: 'US', validation: (Rule) => Rule.required()},
      ],
      initialValue: {
        name: 'FAS Motorsports',
        address_line1: '6161 Riverside Dr',
        city_locality: 'Punta Gorda',
        state_province: 'FL',
        postal_code: '33982',
        country_code: 'US',
      },
      validation: (Rule) => Rule.required(),
    }),

    defineField({
      name: 'ship_to',
      title: 'Ship To',
      type: 'object',
      options: {collapsible: true, columns: 2},
      fields: [
        {name: 'name', title: 'Name', type: 'string', validation: (Rule) => Rule.required()},
        {name: 'phone', title: 'Phone', type: 'string'},
        {name: 'address_line1', title: 'Address 1', type: 'string', validation: (Rule) => Rule.required(), components: { input: MapboxAddressInput }},
        {name: 'address_line2', title: 'Address 2', type: 'string'},
        {name: 'city_locality', title: 'City', type: 'string', validation: (Rule) => Rule.required()},
        {name: 'state_province', title: 'State', type: 'string', validation: (Rule) => Rule.required()},
        {name: 'postal_code', title: 'Postal Code', type: 'string', validation: (Rule) => Rule.required()},
        {name: 'country_code', title: 'Country', type: 'string', initialValue: 'US', validation: (Rule) => Rule.required()},
      ],
      validation: (Rule) => Rule.required(),
    }),

    defineField({
      name: 'weight',
      title: 'Weight',
      type: 'object',
      fields: [
        {name: 'value', title: 'Value', type: 'number', validation: (Rule) => Rule.required().positive()},
        {name: 'unit', title: 'Unit', type: 'string', options: {list: ['pound', 'ounce', 'gram', 'kilogram']}, initialValue: 'pound', validation: (Rule) => Rule.required()},
      ],
      validation: (Rule) => Rule.required(),
    }),

    defineField({
      name: 'dimensions',
      title: 'Dimensions (inches)',
      type: 'object',
      fields: [
        {name: 'length', title: 'Length', type: 'number', validation: (Rule) => Rule.required().positive()},
        {name: 'width', title: 'Width', type: 'number', validation: (Rule) => Rule.required().positive()},
        {name: 'height', title: 'Height', type: 'number', validation: (Rule) => Rule.required().positive()},
      ],
      validation: (Rule) => Rule.required(),
    }),

    defineField({
      name: 'serviceSelection',
      title: 'Service / Rate',
      type: 'string',
      description: 'Live ShipEngine rates – choose a service to use for this label.',
      components: {input: ServiceRateInput},
      validation: (Rule) => Rule.required(),
    }),

    defineField({
      name: 'actions',
      title: 'Generate & Print',
      type: 'string',
      readOnly: true,
      description: 'Create the label and save tracking + label URL.',
      components: {input: GenerateAndPrintPanel},
    }),

    defineField({
      name: 'trackingNumber',
      title: 'Tracking Number',
      type: 'string',
      readOnly: true,
    }),

    defineField({
      name: 'labelUrl',
      title: 'Label URL (PDF)',
      type: 'url',
      readOnly: true,
    }),
  ],
  preview: {
    select: {title: 'name', subtitle: 'trackingNumber'},
    prepare({title, subtitle}) {
      return {title: title || 'Shipping Label', subtitle: subtitle ? `Tracking: ${subtitle}` : '—'}
    },
  },
})