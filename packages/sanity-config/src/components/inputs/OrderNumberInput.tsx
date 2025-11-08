import React from 'react'
import {Card, Stack, Text} from '@sanity/ui'
import type {StringInputProps} from 'sanity'
import {formatOrderNumber} from '../../utils/orderNumber'

function normalizeRaw(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

export default function OrderNumberInput(props: StringInputProps) {
  const formatted = formatOrderNumber(props.value) || null
  const raw = normalizeRaw(props.value)
  const showRawHint = Boolean(formatted && raw && formatted !== raw)

  // Render a consistent, read-only display so the formatted number is
  // always shown even when Sanity's default readOnly renderer ignores
  // value overrides.
  return (
    <Stack space={showRawHint ? 2 : 0}>
      <Card
        padding={3}
        radius={2}
        tone="transparent"
        style={{border: '1px solid var(--card-border-color)'}}
      >
        <Text size={2} weight="medium">
          {formatted || raw || '—'}
        </Text>
      </Card>
      {showRawHint && (
        <Text size={1} style={{opacity: 0.6}}>
          Raw value from Stripe: {raw}
        </Text>
      )}
    </Stack>
  )
}
