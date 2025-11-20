import {useCallback, useMemo} from 'react'
import {Card, Stack, Text, Button, useToast} from '@sanity/ui'
import {useDocumentOperation, useFormValue} from 'sanity'

const formatCurrency = (value: number | null | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(value)
}

const WholesalePricingControls = (props: any) => {
  const documentId = (useFormValue(['_id']) as string) || ''
  const productType = (useFormValue(['productType']) as string) || 'physical'
  const price = useFormValue(['price']) as number | undefined
  const publishedId = useMemo(() => (documentId ? documentId.replace(/^drafts\./, '') : ''), [documentId])
  const {patch} = useDocumentOperation(publishedId || documentId, 'product')
  const toast = useToast()

  const calculated = useMemo(() => {
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
      return null
    }
    return {
      standard: Math.round(price * 0.8 * 100) / 100,
      preferred: Math.round(price * 0.7 * 100) / 100,
      platinum: Math.round(price * 0.6 * 100) / 100,
    }
  }, [price])

  const handleApply = useCallback(() => {
    if (!publishedId && !documentId) {
      toast.push({status: 'warning', title: 'Save the product before calculating pricing'})
      return
    }
    if (!calculated) {
      toast.push({status: 'warning', title: 'Enter a base price first'})
      return
    }
    patch.execute([
      {
        set: {
          wholesalePriceStandard: calculated.standard,
          wholesalePricePreferred: calculated.preferred,
          wholesalePricePlatinum: calculated.platinum,
          availableForWholesale: true,
        },
      },
    ])
    toast.push({status: 'success', title: 'Wholesale pricing calculated'})
  }, [calculated, documentId, patch, publishedId, toast])

  if (productType === 'service') {
    return (
      <Card padding={3} tone="transparent" border radius={2}>
        <Text size={1} muted>
          Wholesale pricing is disabled for service products.
        </Text>
      </Card>
    )
  }

  return (
    <Card padding={4} tone="transparent" border radius={2}>
      <Stack space={3}>
        <Text size={1} weight="semibold">
          Wholesale Pricing Assistant
        </Text>
        <Text size={1} muted>
          Use this helper to populate standard (20%), preferred (30%), and platinum (40%) wholesale prices
          from the base retail price. Example: $1,000 retail becomes $800 / $700 / $600 respectively.
        </Text>
        <Stack space={1}>
          <Text size={1}>Retail Price: {formatCurrency(price)}</Text>
          <Text size={1} muted>
            Standard: {formatCurrency(calculated?.standard)} • Preferred: {formatCurrency(calculated?.preferred)} • Platinum: {formatCurrency(calculated?.platinum)}
          </Text>
        </Stack>
        <Button text="Calculate Wholesale Prices" tone="primary" onClick={handleApply} />
      </Stack>
    </Card>
  )
}

export default WholesalePricingControls
