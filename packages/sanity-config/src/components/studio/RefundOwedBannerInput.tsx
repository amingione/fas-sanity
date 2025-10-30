import React from 'react'
import {Card, Flex, Text} from '@sanity/ui'
import {StringInputProps} from 'sanity'

const formatCurrency = (currency: string | undefined, value: number): string => {
  const safeCurrency = currency && typeof currency === 'string' ? currency : 'USD'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: safeCurrency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

const RefundOwedBannerInput = React.forwardRef<HTMLDivElement, StringInputProps>((props, ref) => {
  const document = (props as unknown as {document?: Record<string, any>}).document || {}

  const amountPaid = typeof document.amountPaid === 'number' ? document.amountPaid : 0
  const amountRefunded = typeof document.amountRefunded === 'number' ? document.amountRefunded : 0
  const balance = amountPaid - amountRefunded
  const status = typeof document.status === 'string' ? document.status : ''
  const systemTags: string[] = Array.isArray(document.systemTags)
    ? document.systemTags.filter((tag: unknown): tag is string => typeof tag === 'string')
    : []

  const hasReturnPending = systemTags.includes('Return pending')
  const shouldShowBanner = balance > 0 && (status === 'canceled' || hasReturnPending)

  if (!shouldShowBanner) {
    return <div ref={ref} />
  }

  const currency = typeof document.currency === 'string' && document.currency ? document.currency : 'USD'
  const formatted = formatCurrency(currency, balance)

  return (
    <Card ref={ref} padding={4} radius={3} shadow={1} tone="caution">
      <Flex>
        <Text size={3} weight="semibold">
          {`Refund owed ${formatted}`}
        </Text>
      </Flex>
    </Card>
  )
})

RefundOwedBannerInput.displayName = 'RefundOwedBannerInput'

export default RefundOwedBannerInput
