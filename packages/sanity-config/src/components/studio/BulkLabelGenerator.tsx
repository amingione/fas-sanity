import React, {useState, useEffect, useMemo} from 'react'
import {useClient} from 'sanity'
import {Card, Button, Stack, Text, Box} from '@sanity/ui'
import {formatApiError} from '../../utils/formatApiError'

type EasyPostAddress = {
  name?: string
  phone?: string
  email?: string
  address_line1?: string
  address_line2?: string
  city_locality?: string
  state_province?: string
  postal_code?: string
  country_code?: string
}

type ShipmentWeight = {value: number; unit?: string} | number | null | undefined
type ShipmentDimensions =
  | {
      unit?: string
      length?: number | null
      width?: number | null
      height?: number | null
    }
  | null
  | undefined

type ShippingLabelDoc = {
  _id: string
  name?: string
  serviceSelection?: string
  ship_from?: EasyPostAddress
  ship_to?: EasyPostAddress
  weight?: ShipmentWeight
  dimensions?: ShipmentDimensions
}

function getFnBase(): string {
  const envBase = (
    typeof process !== 'undefined' ? (process as any)?.env?.SANITY_STUDIO_NETLIFY_BASE : undefined
  ) as string | undefined
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

function isValidWeight(weight: ShipmentWeight): boolean {
  if (typeof weight === 'number') return Number.isFinite(weight) && weight > 0
  if (weight && typeof weight === 'object') {
    const value = Number(weight.value)
    return Number.isFinite(value) && value > 0
  }
  return false
}

function isValidDimensions(dimensions: ShipmentDimensions): boolean {
  if (!dimensions || typeof dimensions !== 'object') return false
  const length = Number(dimensions.length)
  const width = Number(dimensions.width)
  const height = Number(dimensions.height)
  return [length, width, height].every((val) => Number.isFinite(val) && val > 0)
}

function normalizeWeight(weight: ShipmentWeight): {value: number; unit: 'pound' | 'ounce'} {
  if (typeof weight === 'number') {
    return {value: weight, unit: 'pound'}
  }
  const value = Number(weight?.value) || 1
  const unit = weight && typeof weight === 'object' && weight.unit === 'ounce' ? 'ounce' : 'pound'
  return {value, unit}
}

function normalizeDimensions(dimensions: ShipmentDimensions): {
  unit: 'inch' | 'centimeter'
  length: number
  width: number
  height: number
} {
  const unit =
    dimensions && typeof dimensions === 'object' && dimensions.unit === 'centimeter'
      ? 'centimeter'
      : 'inch'
  const length = Number(dimensions?.length) || 0
  const width = Number(dimensions?.width) || 0
  const height = Number(dimensions?.height) || 0
  return {unit, length, width, height}
}

function summarizeAddress(addr?: EasyPostAddress): string {
  if (!addr) return 'No destination address'
  const parts = [
    addr.name,
    addr.address_line1,
    addr.city_locality,
    addr.state_province,
    addr.postal_code,
    addr.country_code,
  ]
  return parts.filter(Boolean).join(', ')
}

function stringifyDimensions(dimensions?: ShipmentDimensions): string {
  if (!dimensions) return '—'
  const {length, width, height, unit} = dimensions
  if (![length, width, height].every((v) => Number(v) > 0)) return 'Incomplete'
  return `${length}×${width}×${height} ${unit || 'in'}`
}

function stringifyWeight(weight?: ShipmentWeight): string {
  if (weight == null) return '—'
  if (typeof weight === 'number') return `${weight} lb`
  const value = Number(weight.value)
  if (!Number.isFinite(value) || value <= 0) return 'Invalid'
  return `${value} ${weight.unit || 'lb'}`
}

export default function BulkLabelGenerator() {
  const client = useClient({apiVersion: '2024-04-10'})
  const [labels, setLabels] = useState<ShippingLabelDoc[]>([])
  const [status, setStatus] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState<boolean>(true)

  const base = useMemo(() => getFnBase() || 'https://fassanity.fasmotorsports.com', [])

  useEffect(() => {
    let cancelled = false
    async function fetchLabels() {
      setLoading(true)
      try {
        const result: ShippingLabelDoc[] = await client.fetch(
          `*[_type == "shippingLabel" && !defined(labelUrl)]{
            _id,
            name,
            serviceSelection,
            ship_from,
            ship_to,
            weight,
            dimensions
          } | order(_createdAt asc)`,
        )
        if (!cancelled) setLabels(result)
      } catch (err) {
        console.error('BulkLabelGenerator: fetch failed', err)
        if (!cancelled) setLabels([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchLabels()
    return () => {
      cancelled = true
    }
  }, [client])

  const generateLabel = async (label: ShippingLabelDoc) => {
    const id = label._id
    const guard = (cond: boolean, message: string) => {
      if (!cond) {
        setStatus((prev) => ({...prev, [id]: `⚠️ ${message}`}))
        return false
      }
      return true
    }

    if (!guard(isValidWeight(label.weight), 'Missing or invalid weight')) return
    if (!guard(isValidDimensions(label.dimensions), 'Missing or invalid dimensions')) return

    setStatus((prev) => ({...prev, [id]: 'Generating…'}))

    try {
      const weightPayload = normalizeWeight(label.weight)
      const dimensionsPayload = normalizeDimensions(label.dimensions)

      const payload = {
        ship_to: label.ship_to,
        ship_from: label.ship_from,
        package_details: {
          weight: weightPayload,
          dimensions: dimensionsPayload,
        },
      }

      const res = await fetch(`${base}/.netlify/functions/easypostCreateLabel`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
      })

      const result = await res.json().catch(() => ({}))
      if (!res.ok || result?.error) {
        throw new Error(formatApiError(result?.error ?? result ?? `HTTP ${res.status}`))
      }

      const trackingNumber = result?.trackingNumber || result?.tracking_number
      const trackingUrl = result?.trackingUrl || result?.tracking_url || null
      const labelUrl = result?.labelUrl || result?.label_download?.pdf

      if (!labelUrl || !trackingNumber) {
        throw new Error('Label created but missing tracking number or label URL in response')
      }

      await client
        .patch(id)
        .set({trackingNumber, labelUrl, ...(trackingUrl ? {trackingUrl} : {})})
        .commit({autoGenerateArrayKeys: true})

      setStatus((prev) => ({...prev, [id]: '✅ EasyPost label created'}))
      setLabels((prev) => prev.filter((item) => item._id !== id))
    } catch (error: any) {
      console.error('BulkLabelGenerator: create label failed', error)
      setStatus((prev) => ({...prev, [id]: `❌ ${error?.message || 'Failed'}`}))
    }
  }

  return (
    <Card padding={4}>
      <Stack space={5}>
        <Text size={2} weight="semibold">
          📦 Bulk Shipping Label Generator
        </Text>
        <Box marginTop={3}>
          {loading ? (
            <Text>Loading shipping labels…</Text>
          ) : labels.length === 0 ? (
            <Text>No pending shipping labels found.</Text>
          ) : (
            <Stack space={4}>
              {labels.map((label) => (
                <Card key={label._id} padding={3} shadow={1} radius={2}>
                  <Stack space={3}>
                    <Text weight="semibold">{label.name || 'Shipping Label'}</Text>
                    <Text size={1} muted>
                      {summarizeAddress(label.ship_to)}
                    </Text>
                    <Text size={1}>Service Code: {label.serviceSelection || '—'}</Text>
                    <Text size={1}>Weight: {stringifyWeight(label.weight)}</Text>
                    <Text size={1}>Dimensions: {stringifyDimensions(label.dimensions)}</Text>
                    <Button
                      text={status[label._id] === 'Generating…' ? 'Generating…' : 'Generate Label'}
                      onClick={() => generateLabel(label)}
                      tone="primary"
                      disabled={status[label._id] === 'Generating…'}
                    />
                    <Text size={1} muted>
                      {status[label._id]}
                    </Text>
                  </Stack>
                </Card>
              ))}
            </Stack>
          )}
        </Box>
      </Stack>
    </Card>
  )
}
