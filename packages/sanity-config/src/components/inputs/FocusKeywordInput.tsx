import {Badge, Card, Flex, Stack, Text} from '@sanity/ui'
import type {StringInputProps} from 'sanity'
import {useFormValue} from 'sanity'

type PortableTextBlock = {
  _type?: string
  children?: {_type?: string; text?: string}[]
}

function portableTextToPlainText(blocks?: PortableTextBlock[] | null): string {
  if (!Array.isArray(blocks)) return ''
  return blocks
    .map((block) => {
      if (!block || typeof block !== 'object' || block._type !== 'block') return ''
      const text = Array.isArray(block.children)
        ? block.children
            .map((child) => (typeof child?.text === 'string' ? child.text : ''))
            .join('')
        : ''
      return text
    })
    .filter(Boolean)
    .join(' ')
    .trim()
}

function normalizeText(value?: unknown): string {
  if (typeof value === 'string') return value.trim()
  return ''
}

function containsKeyword(keyword: string, target?: string): boolean {
  if (!keyword) return false
  if (!target) return false
  return target.toLowerCase().includes(keyword)
}

export default function FocusKeywordInput(props: StringInputProps) {
  const {renderDefault, value} = props
  const keyword = normalizeText(value).toLowerCase()
  const title = normalizeText(useFormValue(['title']))
  const metaTitle = normalizeText(useFormValue(['metaTitle']))
  const metaDescription = normalizeText(useFormValue(['metaDescription']))
  const shortDescription = portableTextToPlainText(
    useFormValue(['shortDescription']) as PortableTextBlock[] | null,
  )

  const signals = [
    {label: 'Title', present: containsKeyword(keyword, title)},
    {label: 'Meta Title', present: containsKeyword(keyword, metaTitle)},
    {label: 'Meta Description', present: containsKeyword(keyword, metaDescription)},
    {label: 'Short Description', present: containsKeyword(keyword, shortDescription)},
  ]

  return (
    <Stack space={3}>
      {renderDefault(props)}
      {keyword && (
        <Card padding={3} radius={2} tone="primary" border>
          <Stack space={2}>
            <Text size={1} weight="medium">
              Keyword usage
            </Text>
            {signals.map((signal) => (
              <Flex key={signal.label} align="center" justify="space-between">
                <Text size={1}>{signal.label}</Text>
                <Badge tone={signal.present ? 'positive' : 'caution'} mode="outline">
                  {signal.present ? 'Present' : 'Missing'}
                </Badge>
              </Flex>
            ))}
          </Stack>
        </Card>
      )}
      {!keyword && (
        <Text size={1} muted>
          Add a focus keyword to see where it appears in your on-page content.
        </Text>
      )}
    </Stack>
  )
}
