import {DashboardWidgetContainer, type DashboardWidget, type LayoutConfig} from '@sanity/dashboard'
import {Stack, Text} from '@sanity/ui'
import {useClient} from 'sanity'
import {IntentLink} from 'sanity/router'
import {useEffect, useMemo, useState} from 'react'

type DocumentListWidgetOptions = {
  title: string
  query: string
  layout?: LayoutConfig
}

type DocumentListItem = {
  _id: string
  _type: string
  _createdAt?: string
  title?: string
  name?: string
  orderNumber?: string
  customerName?: string
  status?: string
  totalAmount?: number
  scheduledDate?: string
  dueDate?: string
}

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

const getDocumentLabel = (item: DocumentListItem) =>
  item.orderNumber ||
  item.title ||
  item.name ||
  item.customerName ||
  `${item._type} ${item._id.slice(0, 8)}`

const getSecondaryLabel = (item: DocumentListItem) => {
  if (item.status) return item.status
  if (item.scheduledDate) return item.scheduledDate
  if (item.dueDate) return item.dueDate
  return undefined
}

const DocumentListWidget = ({title, query}: DocumentListWidgetOptions) => {
  const client = useClient({apiVersion: '2024-01-01'})
  const [items, setItems] = useState<DocumentListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const resolvedTitle = useMemo(() => title || 'Documents', [title])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await client.fetch<DocumentListItem[]>(query)
        if (!cancelled) {
          setItems(Array.isArray(result) ? result : [])
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load documents')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [client, query])

  return (
    <DashboardWidgetContainer header={resolvedTitle}>
      <Stack space={3} padding={2}>
        {loading ? <Text size={1}>Loading…</Text> : null}
        {!loading && error ? <Text size={1}>{error}</Text> : null}
        {!loading && !error && items.length === 0 ? <Text size={1}>No items found.</Text> : null}
        {!loading && !error
          ? items.map((item) => {
              const label = getDocumentLabel(item)
              const secondary = getSecondaryLabel(item)
              return (
                <Stack key={item._id} space={1}>
                  <Text size={1} weight="medium">
                    <IntentLink intent="edit" params={{type: item._type, id: item._id}}>
                      {label}
                    </IntentLink>
                  </Text>
                  {secondary ? (
                    <Text size={0} muted>
                      {secondary}
                    </Text>
                  ) : null}
                </Stack>
              )
            })
          : null}
      </Stack>
    </DashboardWidgetContainer>
  )
}

export const documentListWidget = (config: DocumentListWidgetOptions): DashboardWidget => ({
  name: `document-list-${slugify(config.title || 'documents')}`,
  component: () => <DocumentListWidget {...config} />,
  layout: config.layout,
})
