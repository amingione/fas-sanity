import {Badge, Card, Flex, Stack, Text} from '@sanity/ui'
import type {ObjectInputProps} from 'sanity'
import {useFormValue} from 'sanity'

type Dimensions = {
  length: number
  width: number
  height: number
}

const currency = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'})

const ZONES = [
  {key: 'local', label: 'Local (WA/OR)', multiplier: 1},
  {key: 'regional', label: 'Regional (West Coast)', multiplier: 1.2},
  {key: 'national', label: 'National', multiplier: 1.45},
]

const DIMENSION_PATTERN = /(\d+(?:\.\d+)?)\s*(?:x|×)\s*(\d+(?:\.\d+)?)\s*(?:x|×)\s*(\d+(?:\.\d+)?)/i

function parseDimensions(value?: unknown): Dimensions | null {
  if (typeof value !== 'string') return null
  const match = value.match(DIMENSION_PATTERN)
  if (!match) return null
  const [length, width, height] = match.slice(1).map((num) => Number(num))
  if (Number.isNaN(length) || Number.isNaN(width) || Number.isNaN(height)) return null
  return {length, width, height}
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function estimateCost({
  weight,
  dimensions,
  shippingClass,
  handlingTime,
  shipsAlone,
}: {
  weight: number | null
  dimensions: Dimensions | null
  shippingClass: string
  handlingTime: number | null
  shipsAlone: boolean
}) {
  const volume = dimensions ? dimensions.length * dimensions.width * dimensions.height : 0
  const dimensionalWeight = volume ? volume / 139 : 0
  const normalizedWeight = Math.max(weight || 0, dimensionalWeight || 0.1)
  const base = shippingClass === 'Freight' ? 110 : shippingClass === 'Oversized' ? 32 : 18
  const handling = handlingTime && handlingTime > 2 ? (handlingTime - 2) * 3 : 0
  const shipAloneFee = shipsAlone ? 12 : 0
  const volumeFee = volume ? Math.min(volume / 500, 40) : 0
  const baseCost = base + normalizedWeight * 0.9 + volumeFee + handling + shipAloneFee

  return ZONES.map((zone) => ({
    ...zone,
    cost: Math.max(baseCost * zone.multiplier, 12),
  }))
}

export default function ShippingCalculatorPreview(props: ObjectInputProps) {
  const productType = (useFormValue(['productType']) as string | undefined) || 'physical'
  const weight = toNumber(useFormValue(['shippingWeight']))
  const dimensions = parseDimensions(useFormValue(['boxDimensions']))
  const shippingClassValue = useFormValue(['shippingClass'])
  const shippingClass =
    typeof shippingClassValue === 'string' && shippingClassValue ? shippingClassValue : 'Standard'
  const handlingTime = toNumber(useFormValue(['handlingTime']))
  const shipsAlone = Boolean(useFormValue(['shipsAlone']))

  if (productType !== 'physical') {
    return (
      <Text size={1} muted>
        Shipping preview is only shown for physical products.
      </Text>
    )
  }

  const hasWeight = typeof weight === 'number' && weight > 0
  const hasDimensions = Boolean(dimensions)
  const warnings: string[] = []
  if (!hasWeight) warnings.push('Add a shipping weight to calculate costs accurately.')
  if (!hasDimensions) warnings.push('Box dimensions help catch oversize charges.')
  if (weight && weight > 50) {
    warnings.push('Heavy item — consider Freight service or custom quote.')
  }
  if (dimensions && (dimensions.length > 60 || dimensions.width > 30)) {
    warnings.push('Large dimensions — verify they are correct to avoid surcharges.')
  }

  const costs = estimateCost({
    weight: hasWeight ? weight : null,
    dimensions: hasDimensions ? dimensions : null,
    shippingClass,
    handlingTime,
    shipsAlone,
  })

  return (
    <Stack space={3}>
      <Text size={2} weight="semibold">
        Shipping calculator preview
      </Text>
      <Text size={1} muted>
        Uses weight, box size, handling time, and shipping class to project sample rates. Actual
        EasyPost quotes may vary.
      </Text>
      {warnings.length > 0 && (
        <Stack space={2}>
          {warnings.map((warning) => (
            <Badge key={warning} tone="caution" mode="outline">
              {warning}
            </Badge>
          ))}
        </Stack>
      )}
      <Card padding={3} radius={2} border>
        <Stack space={2}>
          {costs.map((zone) => (
            <Flex key={zone.key} align="center" justify="space-between">
              <Text size={1}>{zone.label}</Text>
              <Text size={1} weight="semibold">
                {currency.format(zone.cost)}
              </Text>
            </Flex>
          ))}
        </Stack>
      </Card>
    </Stack>
  )
}
