import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {Button, Card, Flex, Spinner, Stack, Text, TextArea} from '@sanity/ui'
import {set, unset, useClient, useFormValue} from 'sanity'
import type {ReferenceInputProps, SanityDocument} from 'sanity'

type PortableTextChild = {_type?: string; text?: string}
type PortableTextBlock = {_type?: string; children?: PortableTextChild[]}

type ProductImageValue = {
  _key?: string
  asset?: {
    _ref?: string
  } | null
}

type ProductDocumentValue = SanityDocument & {
  title?: string
  promotionTagline?: string | null
  shortDescription?: PortableTextBlock[] | null
  description?: PortableTextBlock[] | null
  images?: ProductImageValue[] | null
}

type AltTextDocument = {
  _id: string
  text?: string
  title?: string
}

const LEGACY_LOOKUP_QUERY = `*[_type == "altText" && text == $text][0]{_id}`
const ALT_TEXT_DETAIL_QUERY = `*[_type == "altText" && (_id == $publishedId || _id == $draftId)][0]{_id, text, title}`
const ASSET_INFO_QUERY = `*[_type == "sanity.imageAsset" && _id == $id][0]{originalFilename}`

function normalizeLegacyText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function buildImportedTitle(text: string, productTitle?: string): string {
  const snippet = text.length > 60 ? `${text.substring(0, 57).trim()}…` : text

  if (productTitle) {
    const label = snippet ? ` – ${snippet}` : ' – Alt Text'
    return `${productTitle}${label}`
  }

  return snippet || 'Imported Alt Text'
}

function limitLength(text: string, max = 125): string {
  if (text.length <= max) return text
  const truncated = text.slice(0, max - 1)
  const lastSpace = truncated.lastIndexOf(' ')
  const clipped = lastSpace > 60 ? truncated.slice(0, lastSpace) : truncated
  return `${clipped.trim()}…`
}

function portableTextToPlain(value?: PortableTextBlock[] | null): string {
  if (!Array.isArray(value)) return ''
  return value
    .map((block) => {
      if (!block || block._type !== 'block' || !Array.isArray(block.children)) return ''
      return block.children
        .map((child) => (typeof child?.text === 'string' ? child.text : ''))
        .join('')
    })
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function firstSentence(text?: string | null): string {
  if (!text) return ''
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  const sentenceMatch = normalized.match(/(.+?[.!?])(?=\s|$)/)
  const sentence = sentenceMatch ? sentenceMatch[1] : normalized
  return limitLength(sentence, 110)
}

function describeImagePosition(index?: number): string {
  if (typeof index !== 'number' || index < 0) {
    return 'product image'
  }
  if (index === 0) return 'primary product image'
  if (index === 1) return 'secondary angle photo'
  return `gallery image ${index + 1}`
}

function inferImageContext(filename?: string | null): string | null {
  if (!filename) return null
  const normalized = filename.toLowerCase()
  if (normalized.includes('installed') || normalized.includes('truck') || normalized.includes('vehicle')) {
    return 'installed on a vehicle'
  }
  if (normalized.includes('engine') || normalized.includes('bay')) {
    return 'engine bay view'
  }
  if (normalized.includes('close') || normalized.includes('detail')) {
    return 'close-up detail'
  }
  if (normalized.includes('kit') || normalized.includes('components')) {
    return 'kit components layout'
  }
  if (normalized.includes('packaging') || normalized.includes('box')) {
    return 'packaging photo'
  }
  return null
}

function buildGeneratedAltText(
  product: ProductDocumentValue | null,
  descriptor: string,
  context?: string | null,
): string | null {
  const title = (product?.title || '').trim()
  const summary =
    product?.promotionTagline?.trim() ||
    portableTextToPlain(product?.shortDescription) ||
    portableTextToPlain(product?.description) ||
    ''
  const condensedSummary = firstSentence(summary)

  const parts: string[] = []
  if (title) parts.push(title)
  if (descriptor) parts.push(descriptor)

  let suggestion = parts.join(' – ').trim() || descriptor || title
  if (context && !suggestion.toLowerCase().includes(context.toLowerCase())) {
    suggestion = `${suggestion} (${context})`
  }
  if (condensedSummary) {
    suggestion = `${suggestion} showing ${condensedSummary}`
  } else if (!suggestion.toLowerCase().includes('product')) {
    suggestion = `${suggestion} product photo`
  }

  return limitLength(suggestion)
}

function buildAutoDescription(productTitle?: string, descriptor?: string, index?: number): string {
  if (productTitle) {
    const suffix =
      typeof index === 'number' && index >= 0 ? ` gallery image ${index + 1}` : descriptor ? ` (${descriptor})` : ''
    return `Auto-generated alt text for ${productTitle}${suffix || ''}.`
  }
  return descriptor ? `Auto-generated alt text for ${descriptor}.` : 'Auto-generated alt text suggestion.'
}

const ProductImageAltReferenceInput = (props: ReferenceInputProps) => {
  const {renderDefault, value, onChange, path} = props
  const client = useClient({apiVersion: '2024-10-01'})
  const productValue = (useFormValue([]) as ProductDocumentValue | null) ?? null
  const productTitle = productValue?.title ?? undefined

  const imagePath = useMemo(() => {
    return Array.isArray(path) ? path.slice(0, -1) : []
  }, [path])
  const imageValue = useFormValue(imagePath) as ProductImageValue | null
  const images = (useFormValue(['images']) as ProductImageValue[] | null) ?? null

  const imageKey = imageValue?._key
  const imageIndex = useMemo(() => {
    if (!images || !imageKey) return undefined
    const index = images.findIndex((img) => img?._key === imageKey)
    return index >= 0 ? index : undefined
  }, [imageKey, images])

  const descriptor = describeImagePosition(imageIndex)

  const [legacyStatus, setLegacyStatus] = useState<'idle' | 'importing' | 'success' | 'error'>('idle')
  const [legacyMessage, setLegacyMessage] = useState<string | null>(null)
  const [legacyValue, setLegacyValue] = useState<string | null>(() =>
    typeof value === 'string' ? normalizeLegacyText(value) : null,
  )

  const [assetInfo, setAssetInfo] = useState<{originalFilename?: string} | null>(null)
  const [assetReady, setAssetReady] = useState(true)

  const [altDetails, setAltDetails] = useState<AltTextDocument | null>(null)
  const [altDraft, setAltDraft] = useState('')
  const [altLoading, setAltLoading] = useState(false)
  const [altSaving, setAltSaving] = useState(false)
  const [altSaveMessage, setAltSaveMessage] = useState<string | null>(null)

  const [autoStatus, setAutoStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
  const [autoMessage, setAutoMessage] = useState<string | null>(null)

  const attemptedValues = useRef<Set<string>>(new Set())
  const generatedTextCache = useRef<Map<string, string>>(new Map())
  const autoAppliedMap = useRef<Map<string, string>>(new Map())
  const altDocCache = useRef<Map<string, AltTextDocument>>(new Map())

  useEffect(() => {
    if (typeof value === 'string') {
      const normalized = normalizeLegacyText(value)
      setLegacyValue(normalized || null)
      setLegacyStatus('idle')
      setLegacyMessage(null)
      return
    }

    setLegacyValue(null)

    if (legacyStatus === 'importing') {
      setLegacyStatus('idle')
    }
  }, [legacyStatus, value])

  useEffect(() => {
    const assetId = imageValue?.asset?._ref
    if (!assetId) {
      setAssetInfo(null)
      setAssetReady(true)
      return
    }
    let cancelled = false
    setAssetReady(false)
    client
      .fetch<{originalFilename?: string} | null>(ASSET_INFO_QUERY, {id: assetId})
      .then((result) => {
        if (cancelled) return
        setAssetInfo(result)
        setAssetReady(true)
      })
      .catch((error) => {
        console.warn('Failed to load asset info for alt text suggestion', error)
        if (!cancelled) {
          setAssetInfo(null)
          setAssetReady(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [client, imageValue])

  const suggestion = useMemo(() => {
    const context = inferImageContext(assetInfo?.originalFilename)
    return buildGeneratedAltText(productValue, descriptor, context)
  }, [assetInfo, descriptor, productValue])

  const importLegacyValue = useCallback(
    async (text: string) => {
      if (!text) {
        onChange?.(unset())
        setLegacyMessage(null)
        setLegacyStatus('idle')
        return
      }

      setLegacyStatus('importing')
      setLegacyMessage('Importing legacy alt text so it can be reused...')

      try {
        const existing = await client.fetch<AltTextDocument | null>(LEGACY_LOOKUP_QUERY, {
          text,
        })

        let targetId = existing?._id

        if (!targetId) {
          const created = await client.create({
            _type: 'altText',
            title: buildImportedTitle(text, productTitle),
            text,
            description: productTitle
              ? `Imported from ${productTitle} product gallery`
              : 'Imported from legacy product alt text.',
          })

          targetId = created._id
        }

        onChange?.(
          set({
            _type: 'reference',
            _ref: targetId,
          }),
        )

        setLegacyStatus('success')
        setLegacyMessage('Legacy alt text saved as a reusable entry.')
      } catch (error) {
        console.error('Failed to import legacy alt text', error)
        setLegacyStatus('error')
        setLegacyMessage('Failed to import legacy alt text. Please retry.')
      }
    },
    [client, onChange, productTitle],
  )

  useEffect(() => {
    if (!legacyValue) {
      return
    }

    if (attemptedValues.current.has(legacyValue)) {
      return
    }

    attemptedValues.current.add(legacyValue)
    importLegacyValue(legacyValue)
  }, [importLegacyValue, legacyValue])

  const handleRetryLegacy = useCallback(() => {
    if (!legacyValue) return
    attemptedValues.current.delete(legacyValue)
    importLegacyValue(legacyValue)
  }, [importLegacyValue, legacyValue])

  const ensureAltTextDocument = useCallback(
    async (text: string) => {
      const normalized = normalizeLegacyText(text)
      if (!normalized) {
        throw new Error('Alt text cannot be empty.')
      }

      const cachedId = generatedTextCache.current.get(normalized)
      if (cachedId) {
        return {_id: cachedId, text: normalized}
      }

      const existing = await client.fetch<AltTextDocument | null>(LEGACY_LOOKUP_QUERY, {text: normalized})
      if (existing?._id) {
        generatedTextCache.current.set(normalized, existing._id)
        return {_id: existing._id, text: normalized}
      }

      const autoTitle = buildImportedTitle(normalized, productTitle)
      const newDoc = await client.create({
        _type: 'altText',
        title: autoTitle,
        text: normalized,
        description: buildAutoDescription(productTitle, descriptor, imageIndex),
      })
      generatedTextCache.current.set(normalized, newDoc._id)
      return {_id: newDoc._id, text: normalized}
    },
    [client, descriptor, imageIndex, productTitle],
  )

  const applySuggestion = useCallback(
    async (text: string, options: {auto?: boolean} = {}) => {
      const normalized = normalizeLegacyText(text)
      if (!normalized) return
      setAutoStatus('running')
      setAutoMessage(
        options.auto ? 'Generating descriptive alt text from the product content...' : 'Updating alt text for this image...',
      )
      try {
        const result = await ensureAltTextDocument(normalized)
        onChange?.(
          set({
            _type: 'reference',
            _ref: result._id,
          }),
        )
        setAutoStatus('success')
        setAutoMessage(
          options.auto
            ? 'Alt text auto-filled from the product description. Review below before publishing.'
            : 'Alt text updated. Review the text below before saving.',
        )
      } catch (error) {
        console.error('Failed to auto-generate alt text', error)
        setAutoStatus('error')
        setAutoMessage('Unable to generate alt text automatically. Please edit manually and try again.')
      }
    },
    [ensureAltTextDocument, onChange],
  )

  const referenceId =
    value && typeof value === 'object' && value && '_ref' in (value as any) && typeof (value as any)._ref === 'string'
      ? ((value as {_ref: string})._ref as string)
      : null

  useEffect(() => {
    if (!referenceId) {
      setAltDetails(null)
      setAltDraft('')
      return
    }

    const normalizedId = referenceId.replace(/^drafts\./, '')
    const cached = altDocCache.current.get(referenceId) || altDocCache.current.get(normalizedId)
    if (cached) {
      setAltDetails(cached)
      setAltDraft(cached.text || '')
    }

    let cancelled = false
    setAltLoading(true)

    client
      .fetch<AltTextDocument | null>(ALT_TEXT_DETAIL_QUERY, {
        publishedId: normalizedId,
        draftId: `drafts.${normalizedId}`,
      })
      .then((doc) => {
        if (cancelled) return
        if (doc?._id) {
          altDocCache.current.set(doc._id, doc)
          setAltDetails(doc)
          setAltDraft(doc.text || '')
        } else {
          setAltDetails(null)
          setAltDraft('')
        }
        setAltLoading(false)
      })
      .catch((error) => {
        console.error('Failed to load alt text document', error)
        if (!cancelled) {
          setAltLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [client, referenceId])

  useEffect(() => {
    if (!suggestion || typeof value === 'string') return
    if (!assetReady) return
    if (referenceId) return
    if (!imageKey) return
    if (autoAppliedMap.current.get(imageKey) === suggestion) return
    autoAppliedMap.current.set(imageKey, suggestion)
    applySuggestion(suggestion, {auto: true})
  }, [applySuggestion, assetReady, imageKey, referenceId, suggestion, value])

  const handleSaveAltText = useCallback(async () => {
    const textToPersist = normalizeLegacyText(altDraft || suggestion || '')
    if (!textToPersist) {
      setAltSaveMessage('Describe what is shown in the image before saving.')
      return
    }

    if (altDetails?._id) {
      setAltSaving(true)
      setAltSaveMessage(null)
      try {
        await client.patch(altDetails._id).set({text: textToPersist}).commit({autoGenerateArrayKeys: true})
        const updated = {...altDetails, text: textToPersist}
        altDocCache.current.set(updated._id, updated)
        setAltDetails(updated)
        setAltDraft(textToPersist)
        setAltSaving(false)
        setAltSaveMessage('Alt text saved.')
      } catch (error) {
        console.error('Failed to save alt text', error)
        setAltSaving(false)
        setAltSaveMessage('Unable to save alt text. Please try again.')
      }
    } else {
      await applySuggestion(textToPersist)
    }
  }, [altDetails, altDraft, applySuggestion, client, suggestion])

  const handleUseSuggestion = useCallback(() => {
    if (!suggestion) return
    setAltDraft(suggestion)
  }, [suggestion])

  const tone = useMemo(() => {
    if (legacyStatus === 'error') return 'critical'
    if (legacyStatus === 'success') return 'positive'
    if (legacyValue) return 'caution'
    return undefined
  }, [legacyStatus, legacyValue])

  const showDefaultInput = typeof value !== 'string'
  const helperMessage =
    legacyMessage ||
    (legacyValue
      ? 'Bringing your existing alt text into the reusable alt text generator...'
      : null)

  const showAltEditor = true
  const altPlaceholder =
    suggestion ||
    'Describe what is visible in this product photo (e.g., "Black intercooler pipes installed on a 2022 Ford F-250 engine bay").'

  return (
    <Stack space={4}>
      {helperMessage && (
        <Card padding={3} radius={2} shadow={1} tone={tone}>
          <Flex align="center" gap={3}>
            {legacyStatus === 'importing' && <Spinner muted />}
            <Text size={1}>{helperMessage}</Text>
            {legacyStatus === 'error' && legacyValue && (
              <Button text="Retry import" mode="bleed" onClick={handleRetryLegacy} />
            )}
          </Flex>
        </Card>
      )}

      {showAltEditor && (
        <Card padding={3} radius={2} shadow={1} tone="transparent">
          <Stack space={3}>
            <Flex align="center" gap={2}>
              <Text size={1} weight="semibold">
                Image alt text
              </Text>
              {altLoading && <Spinner muted size={1} />}
            </Flex>
            <TextArea
              value={altDraft}
              onChange={(event) => setAltDraft(event.currentTarget.value)}
              rows={4}
              placeholder={altPlaceholder}
              disabled={altSaving}
            />
            <Flex wrap="wrap" gap={2}>
              <Button
                text={altDetails?._id ? 'Save alt text' : 'Create alt text'}
                tone="primary"
                onClick={handleSaveAltText}
                disabled={altSaving}
                loading={altSaving}
              />
              {suggestion && (
                <Button text="Replace with suggestion" mode="ghost" onClick={handleUseSuggestion} disabled={altSaving} />
              )}
            </Flex>
            {(altSaveMessage || autoMessage) && (
              <Text size={1} muted>
                {altSaveMessage || autoMessage}
              </Text>
            )}
            {autoStatus === 'running' && (
              <Flex align="center" gap={2}>
                <Spinner muted size={1} />
                <Text size={1}>Generating suggested alt text…</Text>
              </Flex>
            )}
          </Stack>
        </Card>
      )}

      {showDefaultInput && renderDefault(props)}
    </Stack>
  )
}

export default ProductImageAltReferenceInput
