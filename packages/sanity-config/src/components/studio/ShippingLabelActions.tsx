import React, {useCallback, useMemo, useState} from 'react'
import {Button, Flex, Text, useToast} from '@sanity/ui'
import {useFormValue} from 'sanity'
import {readStudioEnv} from '../../utils/studioEnv'

function getFnBase(): string {
  const envBase = (
    typeof process !== 'undefined' ? (process as any)?.env?.SANITY_STUDIO_NETLIFY_BASE : undefined
  ) as string | undefined
  if (envBase) return envBase.replace(/\/$/, '')
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage?.getItem('NLFY_BASE')
      if (stored) return stored.replace(/\/$/, '')
      const origin = window.location?.origin
      if (origin && /^https?:\/\//i.test(origin)) return origin.replace(/\/$/, '')
    } catch {
      // ignore storage errors
    }
  }
  return 'https://fassanity.fasmotorsports.com'
}

interface ShippingLabelActionsProps {
  doc: Record<string, any>
}

function normalizeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

export default function ShippingLabelActions({doc}: ShippingLabelActionsProps) {
  const toast = useToast()
  const orderId: string = useMemo(
    () => (typeof doc?._id === 'string' ? doc._id.replace(/^drafts\./, '') : ''),
    [doc?._id],
  )

  const labelUrl =
    normalizeUrl(useFormValue(['shippingLabelUrl'])) || normalizeUrl(doc?.shippingLabelUrl)
  const trackingUrl = normalizeUrl(useFormValue(['trackingUrl'])) || normalizeUrl(doc?.trackingUrl)
  const trackingNumber =
    normalizeUrl(useFormValue(['trackingNumber'])) || normalizeUrl(doc?.trackingNumber)

  const [localLabelUrl, setLocalLabelUrl] = useState<string | undefined>(labelUrl)
  const [localTrackingUrl, setLocalTrackingUrl] = useState<string | undefined>(trackingUrl)
  const [isLoading, setIsLoading] = useState(false)

  const provider = useMemo(
    () => (readStudioEnv('SHIPPING_PROVIDER') || 'easypost').toLowerCase(),
    [],
  )

  const handleCreateLabel = useCallback(async () => {
    if (isLoading) return
    if (!orderId) {
      toast.push({
        status: 'warning',
        title: 'Save order first',
        description: 'Publish the order before creating a label.',
        closable: true,
      })
      return
    }

    const base = getFnBase()
    setIsLoading(true)
    try {
      const response = await fetch(`${base}/.netlify/functions/easypostCreateLabel`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({orderId}),
      })
      let result: any = null
      try {
        result = await response.json()
      } catch {
        result = null
      }

      if (!response.ok || (result && result.error)) {
        throw new Error(result?.error || `HTTP ${response.status}`)
      }

      const nextLabelUrl = normalizeUrl(result?.labelUrl)
      const nextTrackingUrl = normalizeUrl(result?.trackingUrl)
      const nextTrackingNumber = normalizeUrl(result?.trackingNumber)

      if (nextLabelUrl) setLocalLabelUrl(nextLabelUrl)
      if (nextTrackingUrl) setLocalTrackingUrl(nextTrackingUrl)

      if (typeof window !== 'undefined' && base) {
        try {
          window.localStorage?.setItem('NLFY_BASE', base)
        } catch {
          // ignore storage errors
        }
      }

      toast.push({
        status: 'success',
        title: 'Label created via EasyPost',
        description: nextTrackingNumber ? `Tracking: ${nextTrackingNumber}` : undefined,
        closable: true,
      })

      const target = nextLabelUrl || nextTrackingUrl
      if (target && typeof window !== 'undefined') {
        try {
          window.open(target, '_blank', 'noopener,noreferrer')
        } catch {
          window.location.href = target
        }
      }
    } catch (err: any) {
      console.error('EasyPost label creation failed', err)
      toast.push({
        status: 'error',
        title: 'Failed to create label',
        description: err?.message || 'Unknown error',
        closable: true,
      })
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, orderId, toast])

  const resolvedLabelUrl = localLabelUrl || labelUrl
  const resolvedTrackingUrl = localTrackingUrl || trackingUrl
  const resolvedTrackingNumber = trackingNumber

  return (
    <Flex direction="column" gap={3} padding={4}>
      {provider !== 'easypost' && (
        <Text size={1} muted>
          Shipping provider overridden to {provider}. EasyPost functions will still be used.
        </Text>
      )}

      {!resolvedLabelUrl && !resolvedTrackingUrl && (
        <Text size={1} muted>
          No shipping label yet. Create one to generate tracking automatically.
        </Text>
      )}

      {resolvedLabelUrl && (
        <Button
          text="🔘 Download Label"
          tone="primary"
          as="a"
          href={resolvedLabelUrl}
          target="_blank"
          rel="noopener noreferrer"
        />
      )}

      {resolvedTrackingUrl && (
        <Button
          text="🚚 Track Package"
          tone="positive"
          as="a"
          href={resolvedTrackingUrl}
          target="_blank"
          rel="noopener noreferrer"
        />
      )}

      {resolvedTrackingNumber && !resolvedTrackingUrl && (
        <Text size={1}>Tracking number: {resolvedTrackingNumber}</Text>
      )}

      <Button
        text={isLoading ? 'Creating EasyPost label…' : '📦 Create EasyPost Label'}
        tone="default"
        onClick={handleCreateLabel}
        disabled={isLoading}
      />
    </Flex>
  )
}
