// NOTE: orderId is deprecated; prefer orderNumber for identifiers.
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {Button, Flex} from '@sanity/ui'
import {useClient, useFormValue} from 'sanity'
import {decodeBase64ToArrayBuffer} from '../../utils/base64'
import {getNetlifyFunctionBaseCandidates} from '../../utils/netlifyBase'

const SANITY_API_VERSION =
  (typeof process !== 'undefined'
    ? ((process as any)?.env?.SANITY_STUDIO_API_VERSION ?? null)
    : null) || '2024-10-01'

function resolvePatchTargets(rawId?: string | null): string[] {
  if (!rawId) return []
  const id = String(rawId).trim()
  if (!id) return []
  const published = id.replace(/^drafts\./, '')
  const set = new Set<string>()
  set.add(id)
  if (published && published !== id) set.add(published)
  return Array.from(set)
}

export default function OrderShippingActions() {
  const doc = useFormValue([]) as any
  const client = useClient({apiVersion: SANITY_API_VERSION})
  const baseCandidates = useMemo(() => getNetlifyFunctionBaseCandidates(), [])
  const lastSuccessfulBaseRef = useRef<string | null>(baseCandidates[0] ?? null)

  const [isGenerating, setIsGenerating] = useState(false)
  const packingSlipUrl = typeof doc?.packingSlipUrl === 'string' ? doc.packingSlipUrl : ''
  const orderId = ((doc?._id || '') as string).replace(/^drafts\./, '')
  const orderNumber = typeof doc?.orderNumber === 'string' ? doc.orderNumber : ''
  const invoiceId = ((doc?.invoiceRef?._ref || '') as string).replace(/^drafts\./, '')
  const autoAttemptedRef = useRef(false)
  const patchTargets = useMemo(() => resolvePatchTargets(doc?._id), [doc?._id])

  const fetchPackingSlip = useCallback(
    async (payload: Record<string, any>) => {
      const attempted = new Set<string>()
      const payloadBody = JSON.stringify(payload)
      const bases = Array.from(
        new Set(
          [lastSuccessfulBaseRef.current, ...baseCandidates].filter(
            (candidate): candidate is string => Boolean(candidate),
          ),
        ),
      )

      let lastError: unknown = null

      for (const base of bases) {
        if (attempted.has(base)) continue
        attempted.add(base)
        const url = `${base}/.netlify/functions/generatePackingSlips`
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: payloadBody,
          })

          if (!response.ok) {
            const message = await response.text().catch(() => '')
            const error = new Error(message || 'Packing slip request failed')
            ;(error as any).status = response.status
            lastError = error
            if (response.status === 404) {
              continue
            }
            throw error
          }

          lastSuccessfulBaseRef.current = base

          if (typeof window !== 'undefined') {
            try {
              window.localStorage?.setItem('NLFY_BASE', base)
            } catch {
              // ignore storage write errors
            }
          }

          return response
        } catch (err) {
          lastError = err
          const rawStatus =
            (err as any)?.status ??
            (err as any)?.statusCode ??
            (err as any)?.response?.status ??
            (err as any)?.response?.statusCode
          const status = typeof rawStatus === 'number' ? rawStatus : Number.parseInt(rawStatus, 10)
          // Only fall back to the next base if the current attempt failed due to a network error.
          if (!(err instanceof TypeError) && status !== 404) {
            break
          }
        }
      }

      throw lastError ?? new Error('Packing slip request failed')
    },
    [baseCandidates],
  )

  const generateSlip = useCallback(
    async (options: {silent?: boolean} = {}) => {
      if (isGenerating) return
      if (!orderId && !invoiceId) {
        if (!options.silent)
          alert('Missing order or invoice reference for packing slip generation.')
        return
      }

      try {
        setIsGenerating(true)

        const payload: Record<string, any> = {}
        if (orderId) payload.orderId = orderId
        if (invoiceId) payload.invoiceId = invoiceId

        const res = await fetchPackingSlip(payload)

        const contentType = (res.headers.get('content-type') || '').toLowerCase()
        let arrayBuffer: ArrayBuffer
        if (contentType.includes('application/pdf')) {
          arrayBuffer = await res.arrayBuffer()
        } else {
          const base64 = (await res.text()).replace(/^"|"$/g, '')
          arrayBuffer = decodeBase64ToArrayBuffer(base64)
        }

        const blob = new Blob([arrayBuffer], {type: 'application/pdf'})
        const filenameBase = (orderNumber || 'order').replace(/[^a-z0-9_-]/gi, '') || 'order'
        const filename = `packing-slip-${filenameBase}.pdf`

        const asset = await client.assets.upload('file', blob, {
          filename,
          contentType: 'application/pdf',
        })

        const url = (asset as any)?.url
        if (!url) throw new Error('Unable to upload packing slip asset')

        for (const targetId of patchTargets) {
          try {
            await client
              .patch(targetId)
              .set({packingSlipUrl: url})
              .commit({autoGenerateArrayKeys: true})
          } catch (patchErr: any) {
            const statusCode = patchErr?.statusCode || patchErr?.response?.statusCode
            if (!statusCode || statusCode !== 404) {
              throw patchErr
            }
          }
        }

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
    },
    [
      client,
      fetchPackingSlip,
      invoiceId,
      isGenerating,
      orderNumber,
      orderId,
      patchTargets,
    ],
  )

  useEffect(() => {
    if (packingSlipUrl) return
    if (!orderId && !invoiceId) return
    if (autoAttemptedRef.current) return
    autoAttemptedRef.current = true
    generateSlip({silent: true})
  }, [generateSlip, invoiceId, orderId, packingSlipUrl])

  const hasPackingSlip = Boolean(packingSlipUrl)

  return (
    <Flex direction="column" gap={3}>
      <Button
        text={isGenerating ? 'Generating packing slip…' : '🧾 Download Packing Slip'}
        tone="primary"
        disabled={isGenerating}
        onClick={() => generateSlip()}
      />
      {hasPackingSlip ? (
        <Button
          text="Open current saved PDF"
          mode="bleed"
          as="a"
          href={packingSlipUrl}
          rel="noopener noreferrer"
          target="_blank"
        />
      ) : null}
    </Flex>
  )
}
