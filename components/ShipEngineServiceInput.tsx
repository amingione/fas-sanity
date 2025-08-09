import React, { useEffect, useMemo, useState } from 'react'
import { FormField, PatchEvent, set, unset, useFormValue } from 'sanity'
import { useId } from 'react'
import { Stack, Card, Text } from '@sanity/ui'

type RateOption = {
  carrierId: string
  carrierCode: string
  carrier: string
  service: string
  serviceCode: string
  amount: number
  currency: string
  deliveryDays: number | null
  estimatedDeliveryDate: string | null
}

type FetchRatesResponse = { title: string; value: string }[]

type ShipEngineServiceInputProps = {
  value?: string // we will store JSON string: { serviceCode, carrierId }
  onChange: (event: PatchEvent) => void
  fetchRates?: () => Promise<FetchRatesResponse> // optional legacy prop
}

function asShipEngineAddress(raw: any | undefined) {
  if (!raw) return null
  return {
    name: raw.name || `${raw.firstName ?? ''} ${raw.lastName ?? ''}`.trim() || undefined,
    address_line1: raw.address_line1 || raw.street || raw.line1 || undefined,
    city_locality: raw.city_locality || raw.city || undefined,
    state_province: raw.state_province || raw.state || undefined,
    postal_code: raw.postal_code || raw.postalCode || undefined,
    country_code: raw.country_code || raw.country || 'US',
  }
}

export default function ShipEngineServiceInput({ value, onChange, fetchRates }: ShipEngineServiceInputProps) {
  const inputId = useId()
  const [options, setOptions] = useState<{ title: string; value: string }[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Pull contextual values from the current document
  const docId = useFormValue(['_id']) as string | undefined
  const weight = useFormValue(['weight']) as number | string | undefined
  const dimensions = useFormValue(['dimensions']) as
    | { length?: number | string; width?: number | string; height?: number | string }
    | undefined
  const shipToVal = (useFormValue(['shipTo']) || useFormValue(['shippingAddress']) || useFormValue(['invoice', 'shippingAddress'])) as any
  const shipFromVal = (useFormValue(['shipFrom']) || useFormValue(['warehouseAddress']) || useFormValue(['originAddress'])) as any

  const ship_to = useMemo(() => asShipEngineAddress(shipToVal), [shipToVal])
  const ship_from = useMemo(() => asShipEngineAddress(shipFromVal), [shipFromVal])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)

      try {
        // Prefer provided fetchRates() if schema wired one; otherwise call Netlify function directly
        if (fetchRates) {
          const services = await fetchRates()
          if (!Array.isArray(services)) throw new Error('Invalid services format')
          if (!cancelled) setOptions(services)
          return
        }

        // Validate basics for ShipEngine request
        if (!ship_to || !ship_from) {
          throw new Error('Missing Ship To / Ship From addresses on this document')
        }

        const res = await fetch('/.netlify/functions/getShipEngineRates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ship_to,
            ship_from,
            package_details: {
              weight: { value: Number(weight) || 1, unit: 'pound' },
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
        })

        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || 'Failed to fetch rates')
        const rates: RateOption[] = Array.isArray(data?.rates) ? data.rates : []

        const opts = rates.map((r) => ({
          title: `${r.carrier} — ${r.service} (${r.serviceCode}) — $${(r.amount ?? 0).toFixed(2)}${
            r.deliveryDays ? ` • ${r.deliveryDays}d` : ''
          }`,
          // Store JSON string so downstream code can parse both values
          value: JSON.stringify({ serviceCode: r.serviceCode, carrierId: r.carrierId }),
        }))

        if (!cancelled) setOptions(opts)
      } catch (e: any) {
        if (!cancelled) {
          console.error(e)
          setError(e?.message || 'Unable to load rates')
          setOptions([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [fetchRates, ship_to, ship_from, weight, dimensions])

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const val = event.target.value
    onChange(PatchEvent.from(val ? set(val) : unset()))
  }

  return (
    <FormField description="Select a shipping service" title="Shipping Service" inputId={inputId}>
      <Stack space={2}>
        {!ship_to || !ship_from ? (
          <Card padding={2} radius={2} shadow={1} tone="caution">
            <Text size={1}>Add both Ship To and Ship From addresses to fetch rates.</Text>
          </Card>
        ) : null}

        {error ? (
          <Card padding={2} radius={2} shadow={1} tone="critical">
            <Text size={1}>{error}</Text>
          </Card>
        ) : null}

        <Card padding={2} radius={2} shadow={1} tone="default">
          <select id={inputId} value={value || ''} onChange={handleChange} disabled={loading || options.length === 0}>
            <option value="">{loading ? 'Loading…' : 'Select a service…'}</option>
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.title}
              </option>
            ))}
          </select>
        </Card>
      </Stack>
    </FormField>
  )
}