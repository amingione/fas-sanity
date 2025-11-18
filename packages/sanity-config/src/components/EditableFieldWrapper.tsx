import {Badge, Card, Inline, Text} from '@sanity/ui'
import type {ReactNode} from 'react'
import {FormField, FormInput} from 'sanity'

type EditableFieldWrapperProps = {
  label: string
  description?: ReactNode
  children: ReactNode
}

function EditableFieldWrapper({label, description, children}: EditableFieldWrapperProps) {
  const title = (
    <Inline space={3} align="center">
      <Text>{label}</Text>
      <Badge tone="primary" mode="outline">
        Editable
      </Badge>
    </Inline>
  )

  return (
    <FormField title={title} description={description}>
      <FormInput>
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
      </FormInput>
    </FormField>
  )
}

export default EditableFieldWrapper
