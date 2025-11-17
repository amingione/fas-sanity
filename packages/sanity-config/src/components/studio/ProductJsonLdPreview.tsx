import React, {useMemo, useState} from 'react'
import {Button, Card, Code, Flex, Inline, Stack, Text} from '@sanity/ui'
import {CopyIcon, RefreshIcon} from '@sanity/icons'
import imageUrlBuilder from '@sanity/image-url'
import {useClient, useFormValue, type StringInputProps} from 'sanity'
import {buildProductJsonLd} from '../../utils/productJsonLd'

const formatJson = (value: Record<string, unknown> | null) => {
  if (!value) return ''
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return ''
  }
}

const ProductJsonLdPreview = (props: StringInputProps) => {
  const formValue = (useFormValue([]) as Record<string, unknown> | null) ?? null
  const documentData = formValue || (props as any).document?.displayed || props.value
  const client = useClient({apiVersion: '2024-10-01'})
  const builder = useMemo(() => imageUrlBuilder(client), [client])
  const [lastCopied, setLastCopied] = useState<number | null>(null)
  const [nonce, setNonce] = useState(0)

  const siteUrl =
    (typeof window !== 'undefined' ? (window as any)?.ENV?.PUBLIC_SITE_URL : undefined) ||
    (typeof process !== 'undefined' ? (process.env as Record<string, string | undefined>)?.PUBLIC_SITE_URL : undefined) ||
    'https://fasmotorsports.com'

  const result = useMemo(() => {
    return buildProductJsonLd(documentData, {
      imageBuilder: builder,
      siteUrl,
    })
  }, [builder, documentData, siteUrl, nonce])

  const prettyJson = formatJson(result.json)

  const handleCopy = async () => {
    if (!prettyJson || typeof navigator === 'undefined' || !navigator.clipboard) return
    try {
      await navigator.clipboard.writeText(prettyJson)
      setLastCopied(Date.now())
    } catch {
      // ignore copy errors
    }
  }

  return (
    <Stack space={3}>
      <Flex align="center" justify="space-between">
        <Text weight="semibold">Product structured data</Text>
        <Inline space={2}>
          <Button icon={RefreshIcon} mode="bleed" text="Regenerate" onClick={() => setNonce((value) => value + 1)} />
          <Button icon={CopyIcon} text={lastCopied ? 'Copied!' : 'Copy JSON'} tone="primary" disabled={!prettyJson} onClick={handleCopy} />
        </Inline>
      </Flex>
      {result.errors.length > 0 && (
        <Card padding={3} radius={2} tone="critical">
          <Stack space={2}>
            <Text weight="semibold">Needs attention</Text>
            {result.errors.map((error) => (
              <Text key={error} size={1}>
                • {error}
              </Text>
            ))}
          </Stack>
        </Card>
      )}
      {result.errors.length === 0 && prettyJson && (
        <Card padding={3} radius={2} tone="transparent" shadow={1} style={{maxHeight: 320, overflow: 'auto'}}>
          <Code language="json" style={{display: 'block', whiteSpace: 'pre'}}>
            {prettyJson}
          </Code>
        </Card>
      )}
      {result.warnings.length > 0 && (
        <Card padding={3} radius={2} tone="caution">
          <Stack space={2}>
            <Text weight="semibold">Suggestions</Text>
            {result.warnings.map((warning) => (
              <Text key={warning} size={1}>
                • {warning}
              </Text>
            ))}
          </Stack>
        </Card>
      )}
      {!prettyJson && result.errors.length === 0 && (
        <Text size={1} muted>
          Add the required product information above to generate the JSON-LD snippet automatically.
        </Text>
      )}
    </Stack>
  )
}

export default ProductJsonLdPreview
