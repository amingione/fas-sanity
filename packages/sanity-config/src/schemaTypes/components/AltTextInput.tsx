import {useCallback, useMemo, useState} from 'react'
import type {SanityClient, SanityDocumentLike, StringInputProps} from 'sanity'
import {Button, Card, Stack, Text} from '@sanity/ui'
import {set, useClient, useFormValue} from 'sanity'

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'in',
  'a',
  'of',
  'with',
  'to',
  'by',
])

function normalizeId(id: string | undefined): string | undefined {
  return id?.replace(/^drafts\./, '')
}

function buildAltText(source?: {title?: string; description?: string}): string | null {
  const combined = [source?.title ?? '', source?.description ?? ''].join(' ').trim()

  if (!combined) {
    return null
  }

  const tokens = combined.split(/[^-A-Za-z0-9.+]+/).filter(Boolean)

  const seen = new Set<string>()
  const keywords: string[] = []

  for (const token of tokens) {
    const lower = token.toLowerCase()

    if (STOP_WORDS.has(lower)) {
      continue
    }

    if (lower.length < 3 && !/\d/.test(lower)) {
      continue
    }

    if (seen.has(lower)) {
      continue
    }

    seen.add(lower)
    keywords.push(token)
  }

  if (keywords.length === 0) {
    return null
  }

  let candidate = keywords.join(' ').trim()

  if (candidate.length > 125) {
    const truncated = candidate.slice(0, 125)
    const lastSpace = truncated.lastIndexOf(' ')
    candidate = (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated).trim()
  }

  if (!candidate) {
    return null
  }

  return candidate.charAt(0).toUpperCase() + candidate.slice(1)
}

async function fetchParentProduct(client: SanityClient, altTextId: string): Promise<{
  title?: string
  description?: string
} | null> {
  const publishedId = normalizeId(altTextId)

  if (!publishedId) {
    return null
  }

  const draftId = `drafts.${publishedId}`

  const query = `*[_type == "product" && (references($draftId) || references($publishedId))][0]{
    title,
    description
  }`

  const result = await client.fetch<{title?: string; description?: string} | null>(query, {
    draftId,
    publishedId,
  })

  return result
}

const AltTextInput = (props: StringInputProps) => {
  const {renderDefault, onChange} = props
  const client = useClient({apiVersion: '2023-10-01'})

  const documentId =
    (useFormValue(['_id']) as string | undefined) ??
    ((props as unknown as {context?: {document?: SanityDocumentLike}}).context?.document?._id as
      | string
      | undefined)

  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'success'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  const handleGenerate = useCallback(async () => {
    if (!documentId) {
      setStatus('error')
      setMessage('Cannot determine the current alt text document ID yet. Save the document first.')
      return
    }

    setStatus('loading')
    setMessage(null)

    try {
      const parent = await fetchParentProduct(client, documentId)

      if (!parent) {
        setStatus('error')
        setMessage('No related product with title and description was found for this alt text document.')
        return
      }

      const generated = buildAltText(parent)

      if (!generated) {
        setStatus('error')
        setMessage('Unable to generate alt text from the product details. Please add more descriptive content.')
        return
      }

      onChange(set(generated))
      setStatus('success')
      setMessage('Alt text generated from product content. Review and adjust as needed before saving.')
    } catch (error) {
      console.error('Failed to generate alt text from product', error)
      setStatus('error')
      setMessage('There was a problem fetching product details. Please try again or enter alt text manually.')
    }
  }, [client, documentId, onChange])

  const statusTone = useMemo(() => {
    if (status === 'error') return 'critical'
    if (status === 'success') return 'positive'
    return undefined
  }, [status])

  return (
    <Stack space={3}>
      {renderDefault(props)}
      <Button
        text="🤖 Generate from Product"
        tone="primary"
        disabled={status === 'loading'}
        loading={status === 'loading'}
        onClick={handleGenerate}
      />
      {message && (
        <Card padding={3} radius={2} shadow={1} tone={statusTone} role="status">
          <Text size={1}>{message}</Text>
        </Card>
      )}
    </Stack>
  )
}

export default AltTextInput
