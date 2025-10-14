import React, { useEffect, useRef, useState } from 'react'
import { Button, Flex } from '@sanity/ui'
import { useClient, useFormValue } from 'sanity'
import ShippingLabelActions from './ShippingLabelActions'

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

export default function OrderShippingActions() {
  const doc = useFormValue([]) as any
  const base = getFnBase() || 'https://fassanity.fasmotorsports.com'
  const client = useClient({ apiVersion: '2024-04-10' })

  const [isGenerating, setIsGenerating] = useState(false)
  const packingSlipUrl = typeof doc?.packingSlipUrl === 'string' ? doc.packingSlipUrl : ''
  const orderId = ((doc?._id || '') as string).replace(/^drafts\./, '')
  const invoiceId = ((doc?.invoiceRef?._ref || '') as string).replace(/^drafts\./, '')
  const autoAttemptedRef = useRef(false)

  async function generateSlip(options: { silent?: boolean } = {}) {
    if (isGenerating) return
    if (!orderId && !invoiceId) {
      if (!options.silent) alert('Missing order or invoice reference for packing slip generation.')
      return
    }

    try {
      setIsGenerating(true)

      const payload: Record<string, any> = {}
      if (orderId) payload.orderId = orderId
      if (invoiceId) payload.invoiceId = invoiceId

      const res = await fetch(`${base}/.netlify/functions/generatePackingSlips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const message = await res.text().catch(() => '')
        throw new Error(message || 'Packing slip request failed')
      }

      const contentType = (res.headers.get('content-type') || '').toLowerCase()
      let arrayBuffer: ArrayBuffer
      if (contentType.includes('application/pdf')) {
        arrayBuffer = await res.arrayBuffer()
      } else {
        const base64 = (await res.text()).replace(/^\"|\"$/g, '')
        const binary = atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i)
        }
        arrayBuffer = bytes.buffer
      }

      const blob = new Blob([arrayBuffer], { type: 'application/pdf' })
      const filename = `packing-slip-${orderId || doc?.stripeSessionId || doc?._id || 'order'}.pdf`

      const asset = await client.assets.upload('file', blob, {
        filename,
        contentType: 'application/pdf',
      })

      const url = (asset as any)?.url
      if (!url) throw new Error('Unable to upload packing slip asset')

      await client.patch(doc._id).set({ packingSlipUrl: url }).commit({ autoGenerateArrayKeys: true })

      if (!options.silent) {
        try {
          window.open(url, '_blank', 'noopener')
        } catch {
          window.location.href = url
        }
      }
    } catch (err: any) {
      console.error('Packing slip generation failed', err)
      if (!options.silent) alert(`Packing slip failed: ${err?.message || err}`)
    } finally {
      setIsGenerating(false)
    }
  }

  useEffect(() => {
    if (packingSlipUrl) return
    if (!orderId && !invoiceId) return
    if (autoAttemptedRef.current) return
    autoAttemptedRef.current = true
    generateSlip({ silent: true })
  }, [invoiceId, orderId, packingSlipUrl])

  const hasPackingSlip = Boolean(packingSlipUrl)

  return (
    <Flex direction="column" gap={3}>
      <ShippingLabelActions doc={doc} />
      {hasPackingSlip ? (
        <Button
          text="🧾 Download Packing Slip"
          tone="primary"
          as="a"
          href={packingSlipUrl}
          rel="noopener noreferrer"
          target="_blank"
        />
      ) : (
        <Button
          text={isGenerating ? 'Generating packing slip…' : 'Generate Packing Slip'}
          tone="default"
          disabled={isGenerating}
          onClick={() => generateSlip()}
        />
      )}
    </Flex>
  )
}
