import {useEffect} from 'react'
import {BooleanInputProps, set, unset, useFormValue} from 'sanity'

const TEMPLATE_TYPE = 'template'

/**
 * Automatically keeps the `isTemplate` boolean in sync with the documentType field.
 * When the document is marked as a Template we always set the flag to true and hide the input.
 */
export function TemplateFlagInput(props: BooleanInputProps) {
  const documentType = useFormValue(['documentType']) as string | undefined
  const {value, onChange, renderDefault} = props

  useEffect(() => {
    if (!onChange) return

    if (documentType === TEMPLATE_TYPE) {
      if (value !== true) {
        onChange(set(true))
      }
      return
    }

    if (value) {
      onChange(unset())
    }
  }, [documentType, onChange, value])

  if (documentType !== TEMPLATE_TYPE) {
    return null
  }

  return renderDefault ? renderDefault({...props, readOnly: true}) : null
}

export default TemplateFlagInput
