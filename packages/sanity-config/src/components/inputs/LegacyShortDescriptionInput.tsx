import {useEffect} from 'react'
import {set, StringInputProps, StringSchemaType} from 'sanity'

type Props = StringInputProps<StringSchemaType>

type PortableTextNode = {
  _type?: string
  children?: Array<{_type?: string; text?: string}>
}

function fromPortableText(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined

  const lines = value
    .map((block) => {
      const node = block as PortableTextNode
      if (!node || node._type !== 'block' || !Array.isArray(node.children)) return ''
      return node.children
        .map((child) => (typeof child?.text === 'string' ? child.text : ''))
        .join('')
        .trim()
    })
    .filter(Boolean)

  return lines.length ? lines.join('\n\n') : undefined
}

function normalizeToString(value: unknown): string | undefined {
  if (typeof value === 'string') return value

  const fromArray = fromPortableText(value)
  if (fromArray !== undefined) return fromArray

  if (value && typeof value === 'object') {
    const maybeRecord = value as Record<string, unknown>
    const candidateKeys = ['en', 'value', 'text', 'description', 'shortDescription', 'current']

    for (const key of candidateKeys) {
      const candidate = maybeRecord[key]
      if (typeof candidate === 'string') return candidate
    }

    if (Array.isArray(maybeRecord.children)) {
      const fromChildren = fromPortableText([{_type: 'block', children: maybeRecord.children}])
      if (fromChildren !== undefined) return fromChildren
    }

    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  if (value === null || value === undefined) return undefined
  return String(value)
}

export default function LegacyShortDescriptionInput(props: Props) {
  const {onChange, renderDefault, value} = props

  useEffect(() => {
    if (typeof value === 'string' || value === undefined) return

    const normalized = normalizeToString(value)
    if (normalized !== undefined) {
      onChange(set(normalized))
    }
  }, [onChange, value])

  return renderDefault(props)
}
