import {LockIcon} from '@sanity/icons'
import {Card, Stack, Text, TextInput} from '@sanity/ui'
import {useEffect, useMemo} from 'react'
import {
  SanityDocument,
  StringInputProps,
  StringSchemaType,
  set,
  unset,
  useFormValue,
} from 'sanity'

import {computeCustomerName} from '../../../../../shared/customerName'

type Props = StringInputProps<StringSchemaType>

const ComputedCustomerNameInput = (props: Props) => {
  const doc = useFormValue([]) as SanityDocument
  const {value, onChange} = props
  const computedName = useMemo(
    () =>
      computeCustomerName({
        firstName: doc?.firstName as string | null | undefined,
        lastName: doc?.lastName as string | null | undefined,
        email: doc?.email as string | null | undefined,
      }) || '',
    [doc?.email, doc?.firstName, doc?.lastName],
  )

  useEffect(() => {
    if (!onChange) return
    const currentValue = typeof value === 'string' ? value : ''
    if (computedName && computedName !== currentValue) {
      onChange(set(computedName))
    } else if (!computedName && currentValue) {
      onChange(unset())
    }
  }, [computedName, onChange, value])

  return (
    <Card padding={3} tone="transparent">
      <Stack space={2}>
        <Text size={1} muted>
          Auto-generated from first + last name or email
        </Text>
        <TextInput value={computedName} readOnly iconRight={LockIcon} placeholder="Name will auto-fill" />
      </Stack>
    </Card>
  )
}

export default ComputedCustomerNameInput
