import React, {useEffect, useMemo, useState} from 'react'
import {Button, Text} from '@sanity/ui'
import {set, useClient, useFormValue} from 'sanity'
import {formatApiError} from '../../utils/formatApiError'
import {resolveNetlifyBase} from '../../utils/netlifyBase'

// Resolve the Netlify functions base dynamically.
// Priority: ENV -> localStorage -> empty (caller must set)
const getFnBase = (): string => resolveNetlifyBase()

function setFnBase(next: string) {
  try {
    if (typeof window !== 'undefined') window.localStorage?.setItem('NLFY_BASE', next)
  } catch {}
}

const baseInputStyle: React.CSSProperties = {
  padding: '4px 6px',
  borderRadius: 4,
  border: '1px solid var(--input-border-color, var(--card-border-color))',
  backgroundColor: 'var(--input-bg-color, var(--card-bg-color))',
  color: 'var(--input-fg-color, var(--card-fg-color))',
}

const mutedLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--card-muted-fg-color)',
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
  } catch {
    const snippet = text.slice(0, 200).replace(/\n/g, ' ')
    throw new Error(`Invalid JSON from ${url}: ${snippet}`)
  }
}

/**
 * Custom input to fetch live EasyPost rates and select a service.
 * Reads sibling fields from the form: ship_to, ship_from, weight, dimensions
 */
export function ServiceRateInput(props: any) {
  const {value, onChange} = props
  const ship_to = useFormValue(['ship_to']) as any
  const ship_from = useFormValue(['ship_from']) as any
  const weight = useFormValue(['weight']) as any
  const dimensions = useFormValue(['dimensions']) as any

  const [rates, setRates] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [baseOverride, setBaseOverride] = useState<string>(
    typeof window !== 'undefined' ? window.localStorage?.getItem('NLFY_BASE') || '' : '',
  )
  const currentBase = getFnBase() || baseOverride || ''

  const canQuote = useMemo(() => {
    const isToUS = ship_to?.country_code?.toUpperCase() === 'US'
    const isFromUS = ship_from?.country_code?.toUpperCase() === 'US'
    const hasTo = isToUS
      ? Boolean(ship_to?.postal_code && ship_to?.country_code)
      : Boolean(
          ship_to?.postal_code &&
            ship_to?.country_code &&
            ship_to?.city_locality &&
            ship_to?.state_province,
        )
    const hasFrom = isFromUS
      ? Boolean(ship_from?.postal_code && ship_from?.country_code)
      : Boolean(
          ship_from?.postal_code &&
            ship_from?.country_code &&
            ship_from?.city_locality &&
            ship_from?.state_province,
        )
    const hasWeight = Number(weight?.value) > 0 && Boolean(weight?.unit)
    const hasDims =
      Number(dimensions?.length) > 0 &&
      Number(dimensions?.width) > 0 &&
      Number(dimensions?.height) > 0
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
        const data = (await safeFetchJson(
          `${currentBase || 'https://fassanity.fasmotorsports.com'}/.netlify/functions/getEasyPostRates`,
          {
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
          },
        )) as any
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
          const hint = currentBase
            ? ''
            : ' • Tip: Set SANITY_STUDIO_NETLIFY_BASE to https://fassanity.fasmotorsports.com'
          setError(msg + hint)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
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
      <div style={{display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8}}>
        <label style={mutedLabelStyle}>Functions Base:</label>
        <input
          type="text"
          placeholder="https://fassanity.fasmotorsports.com"
          value={baseOverride || currentBase}
          onChange={(e) => {
            const v = e.currentTarget.value
            setBaseOverride(v)
            setFnBase(v)
          }}
          style={{...baseInputStyle, flex: 1}}
        />
      </div>
      {!canQuote && (
        <Text size={1} style={{marginTop: 4, color: 'var(--card-caution-fg-color)'}}>
          Fill required fields: {missing.join(', ')}
        </Text>
      )}
      {loading && (
        <Text size={1} muted>
          Loading rates…
        </Text>
      )}
      {error && (
        <Text size={1} style={{color: 'var(--card-critical-fg-color)'}}>
          {error}
        </Text>
      )}
      {!loading && !error && (
        <select
          value={value || ''}
          onChange={(e) => onChange(set(e.currentTarget.value))}
          style={{...baseInputStyle}}
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
        <Text size={1} muted>
          No rates returned. Adjust details and try again.
        </Text>
      )}
    </div>
  )
}

/**
 * Bottom action panel: Generate & Print
 * Calls a Netlify function to create a label, then patches the document with tracking + label URL.
 */
export function GenerateAndPrintPanel(props: any) {
  const client = useClient({apiVersion: '2024-10-01'})
  const _id = useFormValue(['_id']) as string
  const doc = {
    name: useFormValue(['name']) as any,
    ship_to: useFormValue(['ship_to']) as any,
    ship_from: useFormValue(['ship_from']) as any,
    weight: useFormValue(['weight']) as any,
    dimensions: useFormValue(['dimensions']) as any,
    serviceSelection: useFormValue(['serviceSelection']) as string,
  }

  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{
    tone: 'positive' | 'critical' | 'default'
    text: string
  } | null>(null)
  const currentBase = getFnBase()

  async function handleGenerate() {
    setBusy(true)
    setMessage(null)
    try {
      const payload = {
        ship_to: doc.ship_to,
        ship_from: doc.ship_from,
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
      const res = (await safeFetchJson(
        `${currentBase || 'https://fassanity.fasmotorsports.com'}/.netlify/functions/easypostCreateLabel`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(payload),
        },
      )) as any

      if (res?.error) {
        throw new Error(formatApiError(res?.error ?? res))
      }

      const trackingNumber = res?.tracking_number || res?.trackingNumber
      const labelUrl = res?.label_download?.pdf || res?.labelUrl

      if (!trackingNumber || !labelUrl) {
        throw new Error('Label created but missing tracking or label URL in response')
      }

      await client.patch(_id).set({trackingNumber, labelUrl}).commit({autoGenerateArrayKeys: true})

      setMessage({
        tone: 'positive',
        text: 'EasyPost label generated. Tracking & label URL saved below.',
      })
      // Optionally, open label
      try {
        window?.open(labelUrl, '_blank')
      } catch {}
    } catch (e: any) {
      setMessage({
        tone: 'critical',
        text: String(e?.message || e) || 'Failed to generate label',
      })
    } finally {
      setBusy(false)
    }
  }

  const messageToneColors: Record<'positive' | 'critical' | 'default', string> = {
    positive: 'var(--card-positive-fg-color)',
    critical: 'var(--card-critical-fg-color)',
    default: 'inherit',
  }
  const messageColor = message ? messageToneColors[message.tone] : undefined

  return (
    <div style={{borderTop: '1px solid var(--card-border-color)', paddingTop: 12}}>
      <Button
        tone="primary"
        text={busy ? 'Generating…' : 'Generate & Print'}
        onClick={handleGenerate}
        disabled={busy}
        loading={busy}
      />
      {message ? (
        <Text size={1} style={{marginTop: 8, color: messageColor}}>
          {message.text}
        </Text>
      ) : null}
    </div>
  )
}
