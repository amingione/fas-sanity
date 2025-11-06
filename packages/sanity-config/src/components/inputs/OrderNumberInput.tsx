import React from 'react'
import {Stack, Text} from '@sanity/ui'
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

  if (!props.renderDefault) {
    return null
  }

  return (
    <Stack space={showRawHint ? 2 : 0}>
      {props.renderDefault(formatted ? {...props, value: formatted} : props)}
      {showRawHint && (
        <Text size={1} style={{opacity: 0.6}}>
          Raw value from Stripe: {raw}
        </Text>
      )}
    </Stack>
  )
}
