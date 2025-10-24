import React from 'react'
import {Box, Button, Card, Flex, Stack, Text} from '@sanity/ui'
import {useRouter} from 'sanity/router'

type IntentAction = {
  label: string
  intent: 'type' | 'create' | 'edit'
  params: Record<string, unknown>
  tone?: 'default' | 'positive' | 'primary' | 'critical'
}

type LinkAction = {
  label: string
  href: string
}

type ComingSoonOptions = {
  title?: string
  description?: string
  intentAction?: IntentAction
  secondaryAction?: LinkAction
}

type ComingSoonPaneProps = {
  options?: ComingSoonOptions
}

const ComingSoonPane = React.forwardRef<HTMLDivElement, ComingSoonPaneProps>((props, ref) => {
  const router = useRouter()
  const {options} = props

  const title = options?.title || 'Coming soon'
  const description =
    options?.description ||
    'We are still wiring up this workspace. Check back shortly for tools and shortcuts tailored to this area.'

  const intentAction = options?.intentAction
  const secondaryAction = options?.secondaryAction

  return (
    <Box ref={ref} padding={[4, 5, 6]}>
      <Card padding={[4, 5]} radius={4} shadow={2} tone="transparent">
        <Stack space={4}>
          <Stack space={2}>
            <Text size={4} weight="semibold">
              {title}
            </Text>
            <Text muted size={2} style={{maxWidth: 540}}>
              {description}
            </Text>
          </Stack>

          {(intentAction || secondaryAction) && (
            <Flex gap={3} wrap="wrap">
              {intentAction ? (
                <Button
                  text={intentAction.label}
                  tone={intentAction.tone}
                  onClick={() => router.navigateIntent(intentAction.intent, intentAction.params as any)}
                />
              ) : null}
              {secondaryAction ? (
                <Button
                  text={secondaryAction.label}
                  mode="ghost"
                  onClick={() => window.open(secondaryAction.href, '_blank', 'noopener')}
                />
              ) : null}
            </Flex>
          )}
        </Stack>
      </Card>
    </Box>
  )
})

ComingSoonPane.displayName = 'ComingSoonPane'

export default ComingSoonPane
