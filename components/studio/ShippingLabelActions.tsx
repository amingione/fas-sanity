import React, { useEffect, useRef, useState } from 'react'
import { Button, Flex, Text, useToast } from '@sanity/ui'
import { useClient, useFormValue } from 'sanity'

interface Props {
  doc: Record<string, any>
}

function asShipEngineAddress(raw?: any) {
  if (!raw) return null
  return {
    name: raw.name || `${raw.firstName ?? ''} ${raw.lastName ?? ''}`.trim() || undefined,
    phone: raw.phone || raw.phoneNumber || undefined,
    address_line1: raw.address_line1 || raw.addressLine1 || raw.street || raw.line1 || undefined,
    address_line2: raw.address_line2 || raw.addressLine2 || raw.line2 || undefined,
    city_locality: raw.city_locality || raw.city || undefined,
    state_province: raw.state_province || raw.state || undefined,
    postal_code: raw.postal_code || raw.postalCode || undefined,
    country_code: raw.country_code || raw.country || 'US',
  }
}

function getDefaultShipFrom(): Record<string, any> {
  const env = (typeof process !== 'undefined' ? (process as any)?.env : {}) as Record<string, string | undefined>
  const postal =
    env?.SANITY_STUDIO_SHIP_FROM_POSTAL ||
    env?.SANITY_STUDIO_SHIP_FROM_POSTAL_CODE ||
    env?.SHIP_FROM_POSTAL_CODE
  const state =
    env?.SANITY_STUDIO_SHIP_FROM_STATE ||
    env?.SHIP_FROM_STATE
  const country =
    env?.SANITY_STUDIO_SHIP_FROM_COUNTRY ||
    env?.SHIP_FROM_COUNTRY
  return {
    name: env?.SANITY_STUDIO_SHIP_FROM_NAME || 'F.A.S. Motorsports LLC',
    phone: env?.SANITY_STUDIO_SHIP_FROM_PHONE || '(812) 200-9012',
    address_line1: env?.SANITY_STUDIO_SHIP_FROM_ADDRESS1 || '6161 Riverside Dr',
    address_line2: env?.SANITY_STUDIO_SHIP_FROM_ADDRESS2 || undefined,
    city_locality: env?.SANITY_STUDIO_SHIP_FROM_CITY || 'Punta Gorda',
    state_province: state || 'FL',
    postal_code: postal || '33982',
    country_code: country || 'US',
  }
}

function parseDimensions(value?: string | null): { length: number; width: number; height: number } | null {
  if (!value) return null
  const clean = value.toString().trim()
  if (!clean) return null
  const match = clean.match(/(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/)
  if (!match) return null
  const [, L, W, H] = match
  return {
    length: Number(L),
    width: Number(W),
    height: Number(H),
  }
}

function getDefaultPackageDimensions(): { length: number; width: number; height: number } {
  const env = (typeof process !== 'undefined' ? (process as any)?.env : {}) as Record<string, string | undefined>
  const length = Number(env?.SANITY_STUDIO_DEFAULT_PACKAGE_LENGTH_IN || env?.DEFAULT_PACKAGE_LENGTH_IN || 12)
  const width = Number(env?.SANITY_STUDIO_DEFAULT_PACKAGE_WIDTH_IN || env?.DEFAULT_PACKAGE_WIDTH_IN || 9)
  const height = Number(env?.SANITY_STUDIO_DEFAULT_PACKAGE_HEIGHT_IN || env?.DEFAULT_PACKAGE_HEIGHT_IN || 4)
  return {
    length: Number.isFinite(length) && length > 0 ? length : 12,
    width: Number.isFinite(width) && width > 0 ? width : 9,
    height: Number.isFinite(height) && height > 0 ? height : 4,
  }
}

function getDefaultPackageWeight(): number {
  const env = (typeof process !== 'undefined' ? (process as any)?.env : {}) as Record<string, string | undefined>
  const raw = Number(env?.SANITY_STUDIO_DEFAULT_PACKAGE_WEIGHT_LBS || env?.DEFAULT_PACKAGE_WEIGHT_LB || 1)
  return Number.isFinite(raw) && raw > 0 ? raw : 1
}

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
  return ''
}

export default function ShippingLabelActions({ doc }: Props) {
  const client = useClient({ apiVersion: '2024-04-10' })

  const saveSelectedRate = async (rate: {
    carrierId: string
    carrierCode: string
    carrier: string
    service: string
    serviceCode: string
    amount: number
    currency: string
    deliveryDays: number | null
    estimatedDeliveryDate: string | null
  }) => {
    await client
      .patch(doc._id)
      .set({
        selectedService: {
          serviceCode: rate.serviceCode,
          carrierId: rate.carrierId,
          carrier: rate.carrier,
          service: rate.service,
          amount: rate.amount,
          currency: rate.currency,
          deliveryDays: rate.deliveryDays ?? null,
        },
      })
      .commit()
  }

  const labelUrl = useFormValue(['labelUrl']) as string | undefined
  const trackingUrl = useFormValue(['trackingUrl']) as string | undefined
  // Pull additional fields from the form
  const weightValueRaw = useFormValue(['weight']) as any
  const weightValue = typeof weightValueRaw === 'number' ? weightValueRaw : Number(weightValueRaw?.value)
  const weightUnit =
    (weightValueRaw && typeof weightValueRaw === 'object' && typeof weightValueRaw.unit === 'string'
      ? weightValueRaw.unit
      : undefined) || 'pound'
  const hasWeight = Number.isFinite(weightValue) && weightValue > 0

  const dimensionsRaw = useFormValue(['dimensions']) as any
  const hasDimensions =
    dimensionsRaw &&
    Number.isFinite(Number(dimensionsRaw?.length)) &&
    Number.isFinite(Number(dimensionsRaw?.width)) &&
    Number.isFinite(Number(dimensionsRaw?.height))
  const normalizedDimensions = hasDimensions
    ? {
        length: Number(dimensionsRaw.length),
        width: Number(dimensionsRaw.width),
        height: Number(dimensionsRaw.height),
      }
    : undefined
  const carrier = useFormValue(['carrier']) as string | undefined
  const customerEmail = useFormValue(['customerEmail']) as string | undefined

  const [isLoading, setIsLoading] = useState(false)
  const toast = useToast()

  const [availableRates, setAvailableRates] = useState<
    {
      carrierId: string
      carrierCode: string
      carrier: string
      service: string
      serviceCode: string
      amount: number
      currency: string
      deliveryDays: number | null
      estimatedDeliveryDate: string | null
    }[]
  >([])
  const [selectedRate, setSelectedRate] = useState<
    {
      carrierId: string
      carrierCode: string
      carrier: string
      service: string
      serviceCode: string
      amount: number
      currency: string
      deliveryDays: number | null
      estimatedDeliveryDate: string | null
    } | null
  >(null)

  const [localLabelUrl, setLocalLabelUrl] = useState<string | undefined>(labelUrl)
  const [localTrackingUrl, setLocalTrackingUrl] = useState<string | undefined>(trackingUrl)
  const autoSettingRef = useRef(false)

  useEffect(() => {
    if (autoSettingRef.current) return
    const cart = Array.isArray(doc?.cart) ? doc.cart : []
    if (cart.length === 0) return
    if (hasWeight && hasDimensions) return

    let cancelled = false

    async function derivePackage() {
      try {
        autoSettingRef.current = true

        const skuSet = new Set<string>()
        const idSet = new Set<string>()
        cart.forEach((item: any) => {
          const sku = (item?.sku || '').toString().trim()
          if (sku) skuSet.add(sku)
          const productId = (item?.product?._id || item?.productId || item?._id || '').toString().replace(/^drafts\./, '').trim()
          if (productId) idSet.add(productId)
        })

        if (skuSet.size === 0 && idSet.size === 0) return

        const products: Array<{ _id?: string; sku?: string; shippingWeight?: number; boxDimensions?: string }> = await client.fetch(
          `*[_type == "product" && (sku in $skus || _id in $ids || _id in $draftIds)]{
            _id,
            sku,
            shippingWeight,
            boxDimensions
          }`,
          { skus: Array.from(skuSet), ids: Array.from(idSet), draftIds: Array.from(idSet).map((id) => `drafts.${id}`) }
        )

        const bySku = new Map<string, (typeof products)[number]>()
        const byId = new Map<string, (typeof products)[number]>()
        products.forEach((prod) => {
          if (prod?.sku) bySku.set(prod.sku, prod)
          if (prod?._id) byId.set(prod._id.replace(/^drafts\./, ''), prod)
        })

        const defaultWeight = getDefaultPackageWeight()
        let totalWeight = 0
        let maxLength = 0
        let maxWidth = 0
        let maxHeight = 0

        cart.forEach((item: any) => {
          const qty = Number(item?.quantity) > 0 ? Number(item.quantity) : 1
          const sku = (item?.sku || '').toString().trim()
          const pid = (item?.product?._id || item?.productId || item?._id || '').toString().replace(/^drafts\./, '').trim()
          const product = (sku && bySku.get(sku)) || (pid && byId.get(pid))

          const productWeight = Number(product?.shippingWeight)
          if (Number.isFinite(productWeight) && productWeight > 0) {
            totalWeight += productWeight * qty
          } else {
            totalWeight += defaultWeight * qty
          }

          const dims = parseDimensions(product?.boxDimensions)
          if (dims) {
            maxLength = Math.max(maxLength, dims.length)
            maxWidth = Math.max(maxWidth, dims.width)
            maxHeight = Math.max(maxHeight, dims.height)
          }
        })

        if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
          totalWeight = defaultWeight
        }

        if (maxLength <= 0 || maxWidth <= 0 || maxHeight <= 0) {
          const defaults = getDefaultPackageDimensions()
          maxLength = defaults.length
          maxWidth = defaults.width
          maxHeight = defaults.height
        }

        const patchOps: Record<string, any> = {}
        if (!hasWeight) {
          patchOps.weight = {
            _type: 'shipmentWeight',
            value: Number(totalWeight.toFixed(2)),
            unit: 'pound',
          }
        }
        if (!hasDimensions) {
          patchOps.dimensions = {
            _type: 'packageDimensions',
            length: Number(maxLength.toFixed(2)),
            width: Number(maxWidth.toFixed(2)),
            height: Number(maxHeight.toFixed(2)),
          }
        }

        if (!cancelled && Object.keys(patchOps).length > 0) {
          await client.patch(doc._id).set(patchOps).commit({ autoGenerateArrayKeys: true })
        }
      } catch (err) {
        console.warn('Failed to derive package defaults', err)
        autoSettingRef.current = false
      }
    }

    derivePackage()
    return () => {
      cancelled = true
    }
  }, [client, doc?._id, doc?.cart, hasDimensions, hasWeight])

  const hasData = Boolean(localLabelUrl || localTrackingUrl)

  const handleCreateLabel = async () => {
    const base = getFnBase() || 'https://fassanity.fasmotorsports.com'
    // Try to derive addresses from the current document
    const shipTo = asShipEngineAddress((doc as any)?.shipTo || (doc as any)?.shippingAddress || (doc as any)?.invoice?.shippingAddress)
    const shipFrom =
      asShipEngineAddress((doc as any)?.shipFrom || (doc as any)?.warehouseAddress || (doc as any)?.originAddress) ||
      getDefaultShipFrom()

    if (!shipTo) {
      toast.push({
        status: 'warning',
        title: 'Missing ship-to address',
        description: 'Please provide a Ship To address on this document before creating a label.',
        closable: true,
      })
      return
    }

    // Validate shipping fields from form
    if (!hasWeight) {
      toast.push({
        status: 'warning',
        title: 'Missing or invalid weight',
        description: 'Please enter a valid weight before generating a label.',
        closable: true
      })
      return
    }

    if (!normalizedDimensions) {
      toast.push({
        status: 'warning',
        title: 'Missing dimensions',
        description: 'Please enter package dimensions before generating a label.',
        closable: true,
      })
      return
    }

    setIsLoading(true)
    const weightPayload = { value: Number(weightValue.toFixed(2)), unit: weightUnit || 'pound' }
    const dimensionsPayload = normalizedDimensions
      ? {
          unit: 'inch',
          length: Number(normalizedDimensions.length),
          width: Number(normalizedDimensions.width),
          height: Number(normalizedDimensions.height),
        }
      : undefined

    const logEvent = async (entry: Record<string, any>) => {
      await client
        .patch(doc._id)
        .setIfMissing({ shippingLog: [] })
        .append('shippingLog', [entry])
        .commit({ autoGenerateArrayKeys: true })
    }

    try {
      if (!selectedRate) {
        const ratesRes = await fetch(`${base}/.netlify/functions/getShipEngineRates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ship_to: shipTo,
            ship_from: shipFrom,
            package_details: {
              weight: weightPayload,
              dimensions: dimensionsPayload,
            },
            // Optionally let backend auto-discover carriers; you can pass specific ids with `carrier_ids`
          }),
        })

        const ratesResult = await ratesRes.json()
        if (!ratesRes.ok) throw new Error(ratesResult?.error || 'Failed to fetch rates')

        const rates = Array.isArray(ratesResult?.rates) ? ratesResult.rates : []
        if (rates.length === 0) {
          toast.push({ status: 'warning', title: 'No rates available', description: 'Try different package details or verify carrier setup in ShipEngine.', closable: true })
          setIsLoading(false)
          return
        }

        setAvailableRates(rates)
        setSelectedRate(rates[0])
        await saveSelectedRate(rates[0])
        setIsLoading(false)
        return
      }

      const res = await fetch(`${base}/.netlify/functions/createShippingLabel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          labelSize: '4x6',
          serviceCode: selectedRate.serviceCode,
          carrier: selectedRate.carrierId,
          weight: weightPayload,
          dimensions: dimensionsPayload,
          orderId: doc._id,
        })
      })

      const result = await res.json()

      if (!res.ok) throw new Error(result.error)

      await client.patch(doc._id).set({
        trackingUrl: result.trackingUrl,
        labelUrl: result.labelUrl
      }).commit()

      await logEvent({
        _type: 'shippingLogEntry',
        status: 'created',
        labelUrl: result.labelUrl,
        trackingUrl: result.trackingUrl,
        trackingNumber: result.trackingNumber,
        createdAt: new Date().toISOString(),
        weight: weightPayload.value,
        dimensions: dimensionsPayload,
        carrier
      })

      toast.push({
        status: 'success',
        title: 'Shipping label created!',
        closable: true
      })

      setLocalLabelUrl(result.labelUrl)
      setLocalTrackingUrl(result.trackingUrl)
    } catch (error: any) {
      console.error(error)

      await logEvent({
        _type: 'shippingLogEntry',
        status: 'error',
        message: error.message || 'Label generation failed',
        createdAt: new Date().toISOString()
      })

      toast.push({
        status: 'error',
        title: 'Failed to create shipping label',
        description: error.message || 'Unknown error',
        closable: true
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Flex direction="column" gap={3} padding={4}>
      {!hasData && (
        <Text size={1} muted>
          No shipping label or tracking info yet.
        </Text>
      )}

      {availableRates.length > 0 && (
        <select
          onChange={(e) => {
            const selected = availableRates.find((rate) => rate.serviceCode === e.target.value)
            setSelectedRate(selected || null)
            if (selected) {
              saveSelectedRate(selected)
            }
          }}
          value={selectedRate?.serviceCode || ''}
        >
          {availableRates.map((rate, idx) => (
            <option key={`${rate.serviceCode}-${idx}`} value={rate.serviceCode}>
              {rate.carrier} — {rate.service} ({rate.serviceCode}) — ${rate.amount.toFixed(2)}{rate.deliveryDays ? ` • ${rate.deliveryDays}d` : ''}
            </option>
          ))}
        </select>
      )}

      {localLabelUrl && (
        <Button text="🔘 Download Label" tone="primary" as="a" href={localLabelUrl} target="_blank" />
      )}

      {localTrackingUrl && (
        <Button text="🚚 Track Package" tone="positive" as="a" href={localTrackingUrl} target="_blank" />
      )}

      {!hasData && (
        <Button
          text={isLoading ? 'Creating label...' : '📦 Create Label'}
          tone="default"
          onClick={handleCreateLabel}
          disabled={isLoading}
        />
      )}
    </Flex>
  )
}
