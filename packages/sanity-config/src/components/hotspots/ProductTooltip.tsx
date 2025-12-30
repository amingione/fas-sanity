import {styled} from 'styled-components'
import {PreviewLayoutKey, SchemaType, useSchema} from 'sanity'
import {Box} from '@sanity/ui'
import {HotspotTooltipProps} from 'sanity-plugin-hotspot-array'
import React, {useMemo, type ReactNode} from 'react'

interface HotspotFields {
  productWithVariant?: {
    product: {
      _ref: string
    }
  }
}

const StyledBox = styled(Box)`
  width: 200px;
`

export default function ProductPreview(props: HotspotTooltipProps<HotspotFields>) {
  const {value, renderPreview} = props
  const productSchemaType = useSchema().get('product')
  const hasProduct = value?.productWithVariant?.product?._ref && productSchemaType

  const previewProps = useMemo(
    () => ({
      value: value?.productWithVariant?.product,
      schemaType: productSchemaType as SchemaType,
      layout: 'default' as PreviewLayoutKey,
    }),
    [productSchemaType, value?.productWithVariant?.product],
  )

  const enhancedPreview = useMemo<ReactNode>(() => {
    if (!hasProduct || !previewProps) return null
    const node = renderPreview(previewProps)
    return emphasizePreviewLabels(node)
  }, [hasProduct, previewProps, renderPreview])

  return (
    <StyledBox padding={2}>
      {hasProduct ? (enhancedPreview ?? 'Preview unavailable') : 'No product selected'}
    </StyledBox>
  )
}

const TITLE_PATTERN = /^([A-Za-z][^:]*):([\s\S]*)$/

function emphasizePreviewLabels(node: ReactNode): ReactNode {
  if (node === null || node === undefined) return node

  if (typeof node === 'string') {
    const match = node.match(TITLE_PATTERN)
    if (match) {
      const [, label, rest] = match
      return (
        <>
          <strong>{label}:</strong>
          {rest}
        </>
      )
    }
    return node
  }

  if (Array.isArray(node)) {
    return node.map((child, index) => (
      <React.Fragment key={index}>{emphasizePreviewLabels(child)}</React.Fragment>
    ))
  }

  if (React.isValidElement(node)) {
    const children = (node.props as any).children
    if (!children) return node
    const nextChildren = React.Children.map(children, (child) => emphasizePreviewLabels(child))
    return React.cloneElement(node, undefined, nextChildren)
  }

  return node
}
