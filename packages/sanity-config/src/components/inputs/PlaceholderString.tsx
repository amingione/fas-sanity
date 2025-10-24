import {StringInputProps, useFormValue, SanityDocument, StringSchemaType} from 'sanity'

import {getFieldValue} from './getFieldValue'

type Props = StringInputProps<StringSchemaType & {options?: {field?: string}}>

const PlaceholderStringInput = (props: Props) => {
  const {schemaType} = props

  const path = schemaType?.options?.field
  const doc = useFormValue([]) as SanityDocument
  const rawValue = getFieldValue(doc, path)
  const proxyValue = typeof rawValue === 'string' ? rawValue : ''

  return props.renderDefault({
    ...props,
    elementProps: {...props.elementProps, placeholder: proxyValue},
  })
}

export default PlaceholderStringInput
