import {Badge, Card, Inline, Stack, Text} from '@sanity/ui'
import type {ReactNode} from 'react'

type EditableFieldWrapperProps = {
  label: string
  description?: ReactNode
  children: ReactNode
}

function EditableFieldWrapper({label, description, children}: EditableFieldWrapperProps) {
  return (
    <Stack space={2}>
      <Inline space={3} style={{alignItems: 'center'}}>
        <Text weight="semibold">{label}</Text>
        <Badge tone="primary" mode="outline">
          Editable
        </Badge>
      </Inline>
      {description ? <div style={{fontSize: 'var(--font-size-1)'}}>{description}</div> : null}
      <Card
        padding={2}
        radius={2}
        tone="primary"
        border
        style={{
          boxShadow: '0 0 0 1px var(--card-focus-ring-color)',
        }}
      >
        {children}
      </Card>
    </Stack>
  )
}

export default EditableFieldWrapper
