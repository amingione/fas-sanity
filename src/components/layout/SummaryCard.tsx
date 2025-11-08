import type {ReactNode} from 'react'
import {Card, Heading, Stack, Text} from '@sanity/ui'

export type SummaryCardProps = {
  title: ReactNode
  description: ReactNode
  imageUrl?: string
  imageAlt?: string
  footer?: ReactNode
  children?: ReactNode
}

export function SummaryCard({
  title,
  description,
  imageUrl,
  imageAlt,
  children,
  footer,
}: SummaryCardProps) {
  return (
    <Card
      padding={4}
      radius={3}
      shadow={1}
      tone="transparent"
      className="grid gap-4 md:grid-cols-[auto,1fr]"
    >
      {imageUrl ? (
        <div className="flex items-start">
          <img
            src={imageUrl}
            alt={imageAlt || ''}
            className="h-20 w-20 flex-shrink-0 rounded-xl object-cover shadow-sm ring-1 ring-slate-200"
          />
        </div>
      ) : null}

      <Stack space={3} className="min-w-0">
        <Heading as="h2" size={2} weight="semibold">
          {title}
        </Heading>
        <Text size={1} muted>
          {description}
        </Text>
        {children ? <div className="grid gap-2 text-sm text-slate-600">{children}</div> : null}
        {footer ? (
          <div className="pt-2 text-xs uppercase tracking-wide text-slate-500">{footer}</div>
        ) : null}
      </Stack>
    </Card>
  )
}

export default SummaryCard
