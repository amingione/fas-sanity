import type {ReactNode} from 'react'
import {Card, Heading, Stack, Text} from '@sanity/ui'

export type AppLayoutProps = {
  title: string
  description?: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  tone?: 'default' | 'primary'
}

const DEFAULT_CARD_TONE: AppLayoutProps['tone'] = 'default'

export function AppLayout({
  title,
  subtitle,
  description,
  children,
  tone = DEFAULT_CARD_TONE,
}: AppLayoutProps) {
  return (
    <Card padding={6} radius={4} shadow={1} tone={tone} className="bg-white/90 dark:bg-slate-950/80">
      <Stack space={6}>
        <Stack space={3}>
          <Heading as="h1" size={3} weight="bold">
            {title}
          </Heading>
          {subtitle ? (
            <Text size={2} muted>
              {subtitle}
            </Text>
          ) : null}
          {description ? (
            <Text as="p" size={2} className="text-slate-600 dark:text-slate-300">
              {description}
            </Text>
          ) : null}
        </Stack>

        <Stack space={5}>{children}</Stack>
      </Stack>
    </Card>
  )
}

export default AppLayout
