import {useEffect} from 'react'
import {set, StringInputProps, StringSchemaType, useFormValue} from 'sanity'

type Props = StringInputProps<StringSchemaType>

const STATUS_MAP: Record<string, 'draft' | 'review' | 'published'> = {
  active: 'published',
  archived: 'draft',
  draft: 'draft',
  inactive: 'draft',
  live: 'published',
  preview: 'review',
  published: 'published',
  review: 'review',
}

export default function LegacyContentStatusInput(props: Props) {
  const {onChange, renderDefault, value} = props
  const legacyStatus = useFormValue(['status'])

  useEffect(() => {
    if (typeof value === 'string' && ['draft', 'review', 'published'].includes(value)) return

    if (typeof value === 'string') {
      const mapped = STATUS_MAP[value.toLowerCase()]
      if (mapped) {
        onChange(set(mapped))
        return
      }
    }

    if (typeof legacyStatus === 'string') {
      const mapped = STATUS_MAP[legacyStatus.toLowerCase()]
      if (mapped) {
        onChange(set(mapped))
        return
      }
    }

    if (value === undefined || value === null || value === '') {
      onChange(set('draft'))
    }
  }, [legacyStatus, onChange, value])

  return renderDefault(props)
}
