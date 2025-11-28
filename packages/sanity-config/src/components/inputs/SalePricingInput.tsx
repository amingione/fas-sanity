import React, {useEffect, useMemo} from 'react'
import {Card, Stack, Text} from '@sanity/ui'
import type {NumberInputProps} from 'sanity'
import {PatchEvent, set, unset, useFormValue} from 'sanity'

type DiscountType = 'percentage' | 'fixed_amount'

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return undefined
}

const roundCurrency = (value: number): number => Math.round(value * 100) / 100

const formatCurrency = (value: number | undefined): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value)
}

const SalePricingInput: React.FC<NumberInputProps> = (props) => {
  const {renderDefault, onChange, readOnly, value} = props

  const onSale = Boolean(useFormValue(['onSale']))
  const price = toNumber(useFormValue(['price']))
  const discountType = (useFormValue(['discountType']) as DiscountType | undefined) || undefined
  const discountValue = toNumber(useFormValue(['discountValue']))

  const computedSalePrice = useMemo(() => {
    if (!onSale) return undefined
    if (price === undefined || discountValue === undefined || !discountType) return undefined

    const raw =
      discountType === 'percentage'
        ? price - price * (discountValue / 100)
        : price - discountValue

    if (!Number.isFinite(raw)) return undefined
    return roundCurrency(raw)
  }, [discountType, discountValue, onSale, price])

  const savingsAmount = useMemo(() => {
    if (price === undefined || computedSalePrice === undefined) return undefined
    return roundCurrency(price - computedSalePrice)
  }, [computedSalePrice, price])

  const savingsPercent = useMemo(() => {
    if (price === undefined || computedSalePrice === undefined || price <= 0) return undefined
    return Math.max(0, Math.round(((price - computedSalePrice) / price) * 100))
  }, [computedSalePrice, price])

  useEffect(() => {
    if (!onChange || readOnly) return
    if (!onSale) return

    const patches = []

    if (computedSalePrice === undefined) {
      if (value !== undefined && value !== null) {
        patches.push(unset())
      }
    } else {
      if (typeof value !== 'number' || Math.abs(value - computedSalePrice) > 0.009) {
        patches.push(set(computedSalePrice))
      }
    }

    if (patches.length > 0) {
      onChange(PatchEvent.from(patches))
    }
  }, [computedSalePrice, onChange, onSale, value])

  return (
    <Stack space={3}>
      {renderDefault({...props, readOnly: true})}
      <Card padding={3} radius={2} tone="transparent" border>
        <Stack space={2}>
          <Text size={1} weight="semibold">
            Savings summary
          </Text>
          {!onSale && (
            <Text size={1} muted>
              Toggle "On Sale?" to enable sale pricing.
            </Text>
          )}
          {onSale && (price === undefined || !discountType || discountValue === undefined) && (
            <Text size={1} muted>
              Enter a base price, choose a discount type, and set a discount value to calculate a sale price.
            </Text>
          )}
          {onSale && computedSalePrice !== undefined && price !== undefined && (
            <>
              <Text size={1}>
                You save {formatCurrency(savingsAmount)}{' '}
                {savingsPercent !== undefined ? `(${savingsPercent}% off)` : ''}
              </Text>
              {computedSalePrice < 0 && (
                <Text size={1} tone="critical">
                  Discount exceeds the base price and would create a negative sale price.
                </Text>
              )}
            </>
          )}
        </Stack>
      </Card>
    </Stack>
  )
}

export default SalePricingInput
