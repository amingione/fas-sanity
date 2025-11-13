import {useCallback, useMemo, useState} from 'react'
import {
  Box,
  Button,
  Dialog,
  Flex,
  Stack,
  Text,
  TextArea,
  TextInput,
} from '@sanity/ui'
import {PatchEvent, StringInputProps, set, unset} from 'sanity'

/**
 * Basic list of stop words to remove from the generated keywords.
 * The list is intentionally small to preserve product specific phrases.
 */
const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'in',
  'a',
  'of',
  'with',
  'to',
  'on',
  'an',
  'by',
  'from',
  'at',
  'is',
  'its',
  'this',
  'that',
])

const KEYWORD_REGEX = /[\p{L}0-9+/.-]+/gu

/**
 * Extract keywords from the provided product information.
 */
function extractKeywords(productTitle: string, productDescription: string): string[] {
  const source = `${productTitle} ${productDescription}`.trim()

  if (!source) {
    return []
  }

  const seen = new Set<string>()
  const keywords: string[] = []

  const matches = source.match(KEYWORD_REGEX) ?? []

  matches.forEach((token) => {
    const trimmedToken = token.trim()
    if (!trimmedToken) {
      return
    }

    // Split composite values (e.g. "F250/F350") into individual keywords.
    const parts = trimmedToken.split(/\//)

    parts.forEach((part) => {
      const cleaned = part
        .replace(/^[^\p{L}0-9+.-]+/u, '')
        .replace(/[^\p{L}0-9+.-]+$/u, '')

      if (!cleaned) {
        return
      }

      const normalized = cleaned.toLowerCase()
      if (STOP_WORDS.has(normalized)) {
        return
      }

      if (!seen.has(normalized)) {
        seen.add(normalized)
        keywords.push(cleaned)
      }
    })
  })

  return keywords
}

/**
 * Normalise the generated text to ensure consistent spacing, casing and length.
 */
function normalizeAltText(text: string): string {
  const condensed = text.trim().replace(/\s+/g, ' ')
  if (!condensed) {
    return ''
  }

  const limited = condensed.length > 125 ? condensed.slice(0, 125).trim() : condensed
  return limited.charAt(0).toUpperCase() + limited.slice(1)
}

/**
 * Build a readable alt text suggestion from the extracted keywords.
 */
function buildAltText(keywords: string[]): string {
  if (!keywords.length) {
    return ''
  }

  // Make a copy so we don't mutate the input array.
  const trimmedKeywords = [...keywords]
  // Construct the alt text and trim to stay within the 125 character recommendation.
  let suggestion = trimmedKeywords.join(' ')
  while (suggestion.length > 125 && trimmedKeywords.length > 1) {
    trimmedKeywords.pop()
    suggestion = trimmedKeywords.join(' ')
  }

  return normalizeAltText(suggestion)
}

const AltTextInput = (props: StringInputProps) => {
  const {renderDefault, value, onChange} = props

  const [dialogOpen, setDialogOpen] = useState(false)
  const [productTitle, setProductTitle] = useState('')
  const [productDescription, setProductDescription] = useState('')
  const [draftAltText, setDraftAltText] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const openDialog = useCallback(() => {
    setProductTitle('')
    setProductDescription('')
    setDraftAltText(typeof value === 'string' ? value : '')
    setErrorMessage(null)
    setDialogOpen(true)
  }, [value])

  const closeDialog = useCallback(() => {
    setDialogOpen(false)
  }, [])

  const handleGenerate = useCallback(() => {
    const keywords = extractKeywords(productTitle, productDescription)

    if (!keywords.length) {
      setErrorMessage('Add a product title or description to generate alt text.')
      setDraftAltText('')
      return
    }

    const generated = buildAltText([...keywords])

    if (!generated) {
      setErrorMessage('Unable to generate alt text from the provided information.')
      setDraftAltText('')
      return
    }

    setDraftAltText(generated)
    setErrorMessage(null)
  }, [productTitle, productDescription])

  const handleApply = useCallback(() => {
    const normalized = normalizeAltText(draftAltText)

    if (!normalized) {
      setErrorMessage('Enter a valid alt text before applying.')
      return
    }

    onChange?.(PatchEvent.from(normalized ? set(normalized) : unset()))
    setDialogOpen(false)
  }, [draftAltText, onChange])

  const helperText = useMemo(() => {
    if (draftAltText.length > 125) {
      return 'Alt text is longer than 125 characters and will be truncated when applied.'
    }

    if (draftAltText.length > 0 && draftAltText.length < 10) {
      return 'Alt text is shorter than the recommended 10 characters.'
    }

    return null
  }, [draftAltText])

  return (
    <Stack space={3}>
      {renderDefault(props)}

      <Button text="Generate Alt Text from Product" mode="ghost" onClick={openDialog} />

      {dialogOpen && (
        <Dialog
          id="alt-text-generator-dialog"
          header="Generate alt text"
          onClose={closeDialog}
          width={1}
        >
          <Box padding={4}>
            <Stack space={4}>
              <Text size={1} muted>
                Paste a product title and description to auto-generate accessible, SEO-friendly alt text.
              </Text>

              <Box>
                <Text size={1} weight="semibold">
                  Product title
                </Text>
                <TextInput
                  value={productTitle}
                  onChange={(event) => setProductTitle(event.currentTarget.value)}
                  placeholder="e.g. FAS Motorsports High-Flow Piping Kit for 2020+ 6.7L Ford Powerstroke"
                />
              </Box>

              <Box>
                <Text size={1} weight="semibold">
                  Product description
                </Text>
                <TextArea
                  value={productDescription}
                  rows={4}
                  onChange={(event) => setProductDescription(event.currentTarget.value)}
                  placeholder="e.g. Performance upgrade, bolt-on fit, compatible with F250/F350 diesel engines"
                />
              </Box>

              <Flex gap={3}>
                <Button text="Generate" tone="primary" onClick={handleGenerate} />
                <Button text="Reset" mode="bleed" onClick={() => {
                  setProductTitle('')
                  setProductDescription('')
                  setDraftAltText('')
                  setErrorMessage(null)
                }} />
              </Flex>

              <Box>
                <Text size={1} weight="semibold">
                  Preview &amp; edit
                </Text>
                <TextArea
                  value={draftAltText}
                  rows={3}
                  onChange={(event) => setDraftAltText(event.currentTarget.value)}
                  placeholder="Generated alt text will appear here for review"
                />
                {helperText && (
                  <Text size={1} tone="caution">
                    {helperText}
                  </Text>
                )}
                {errorMessage && (
                  <Text size={1} tone="critical">
                    {errorMessage}
                  </Text>
                )}
              </Box>

              <Flex gap={3} justify="flex-end">
                <Button text="Cancel" mode="ghost" onClick={closeDialog} />
                <Button text="Use Alt Text" tone="primary" onClick={handleApply} />
              </Flex>
            </Stack>
          </Box>
        </Dialog>
      )}
    </Stack>
  )
}

export default AltTextInput
