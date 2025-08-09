import React, { useMemo, useState } from 'react'
import { Button, Flex, Text, useToast } from '@sanity/ui'
import { useFormValue } from 'sanity'
import { createClient } from '@sanity/client'

interface Props {
  doc: Record<string, any>
}

function asShipEngineAddress(raw?: any) {
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

const getSanityClient = () =>
  createClient({
    projectId: 'r4og35qd',
    dataset: 'production',
    apiVersion: '2024-04-10',
    token: process.env.PUBLIC_SANITY_WRITE_TOKEN,
    useCdn: false
  })

export default function ShippingLabelActions({ doc }: Props) {
  const client = useMemo(() => getSanityClient(), [])

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
  const weight = useFormValue(['weight']) as number | undefined
  const dimensions = useFormValue(['dimensions']) as {
    length: number
    width: number
    height: number
  } | undefined
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

  const hasData = Boolean(localLabelUrl || localTrackingUrl)

  const handleCreateLabel = async () => {
    // Try to derive addresses from the current document
    const shipTo = asShipEngineAddress((doc as any)?.shipTo || (doc as any)?.shippingAddress || (doc as any)?.invoice?.shippingAddress)
    const shipFrom = asShipEngineAddress((doc as any)?.shipFrom || (doc as any)?.warehouseAddress || (doc as any)?.originAddress)

    if (!shipTo || !shipFrom) {
      toast.push({
        status: 'warning',
        title: 'Missing addresses',
        description: 'Please provide both Ship To and Ship From addresses on this document.',
        closable: true,
      })
      return
    }

    // Validate shipping fields from form
    if (!weight || weight <= 0) {
      toast.push({
        status: 'warning',
        title: 'Missing or invalid weight',
        description: 'Please enter a valid weight before generating a label.',
        closable: true
      })
      return
    }

    if (!dimensions) {
      toast.push({
        status: 'warning',
        title: 'Missing dimensions',
        description: 'Please enter package dimensions before generating a label.',
        closable: true,
      })
      return
    }

    setIsLoading(true)

    const logEvent = async (entry: Record<string, any>) => {
      await client
        .patch(doc._id)
        .setIfMissing({ shippingLog: [] })
        .append('shippingLog', [entry])
        .commit({ autoGenerateArrayKeys: true })
    }

    try {
      if (!selectedRate) {
        const ratesRes = await fetch('/.netlify/functions/getShipEngineRates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ship_to: shipTo,
            ship_from: shipFrom,
            package_details: {
              weight: { value: Number(weight), unit: 'pound' },
              dimensions: dimensions
                ? { unit: 'inch', length: Number(dimensions.length), width: Number(dimensions.width), height: Number(dimensions.height) }
                : undefined,
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

      const res = await fetch('/.netlify/functions/createShippingLabel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          labelSize: '4x6',
          serviceCode: selectedRate.serviceCode,
          carrier: selectedRate.carrierId,
          weight,
          dimensions,
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
        weight,
        dimensions,
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