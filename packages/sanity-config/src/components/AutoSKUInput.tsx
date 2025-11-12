import {useEffect, useMemo, useRef} from 'react'
import {TextInput} from '@sanity/ui'
import {set, type StringInputProps, useClient, useFormValue} from 'sanity'

import {generateFasSKU, syncSKUToStripe} from '../utils/generateSKU'

const API_VERSION = '2024-10-01'

type Signature = {
  title: string
  platform: string
}

export default function AutoSKUInput(props: StringInputProps) {
  const {value, onChange, elementProps} = props
  const client = useClient({apiVersion: API_VERSION})
  const signatureRef = useRef<Signature | null>(null)

  const titleValue = useFormValue(['title']) as string | undefined
  const platformValue = useFormValue(['platform']) as string | undefined
  const stripeProductId = useFormValue(['stripeProductId']) as string | undefined

  const title = useMemo(() => (titleValue || '').toString().trim(), [titleValue])
  const platform = useMemo(() => (platformValue || '').toString().trim(), [platformValue])

  useEffect(() => {
    if (!title && !platform) {
      signatureRef.current = {title, platform}
      return
    }

    const previous = signatureRef.current
    const hasChanged = !previous || previous.title !== title || previous.platform !== platform
    const shouldGenerate = !value || (previous && hasChanged)

    if (!shouldGenerate) {
      signatureRef.current = {title, platform}
      return
    }

    let cancelled = false

    const ensureSku = async () => {
      try {
        const newSKU = await generateFasSKU(title, platform, client)
        if (cancelled || !newSKU || newSKU === value) return

        onChange?.(set(newSKU))

        if (stripeProductId) {
          await syncSKUToStripe(newSKU, stripeProductId)
        }
      } catch (error) {
        console.warn('Failed to auto-generate SKU:', error)
      } finally {
        if (!cancelled) {
          signatureRef.current = {title, platform}
        }
      }
    }

    ensureSku()

    return () => {
      cancelled = true
    }
  }, [client, onChange, platform, stripeProductId, title, value])

  return (
    <TextInput
      {...(elementProps || {})}
      readOnly
      value={(typeof value === 'string' ? value : '') || ''}
      style={{
        backgroundColor: '#000000',
        border: '1px solid #d1d5db',
        fontFamily: 'monospace',
      }}
      placeholder="Auto-generating…"
      aria-readonly="true"
    />
  )
}
