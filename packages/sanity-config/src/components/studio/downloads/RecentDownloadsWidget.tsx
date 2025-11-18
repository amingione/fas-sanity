import React, {useEffect, useMemo, useState} from 'react'
import {LaunchIcon, DownloadIcon} from '@sanity/icons'
import {Button, Card, Flex, Inline, Select, Spinner, Stack, Text} from '@sanity/ui'
import {useClient} from 'sanity'
import {useRouter} from 'sanity/router'
import {formatDate} from '../documentTables/PaginatedDocumentTable'
import {DOWNLOADS_STRUCTURE_ID} from '../../../structure/downloadsStructure'

const API_VERSION = '2024-10-01'

type RecentDownload = {
  _id: string
  _type: 'downloadResource'
  title?: string
  documentType?: 'download' | 'template' | 'reference' | 'guide'
  category?: 'marketing' | 'operations' | 'technical' | 'legal' | 'templates'
  version?: string
  lastUpdated?: string
  accessLevel?: 'public' | 'internal' | 'admin'
  'fileName'?: string
  'fileUrl'?: string
  _updatedAt?: string
}

const CATEGORY_FILTERS: Array<{value: 'all' | NonNullable<RecentDownload['category']>; label: string}> =
  [
    {value: 'all', label: 'All categories'},
    {value: 'marketing', label: 'Marketing'},
    {value: 'operations', label: 'Operations'},
    {value: 'technical', label: 'Technical'},
    {value: 'legal', label: 'Legal'},
    {value: 'templates', label: 'Templates'},
  ]

const DOCUMENT_TYPE_ICONS: Record<
  NonNullable<RecentDownload['documentType']>,
  {icon: string; label: string}
> = {
  download: {icon: '📥', label: 'Download'},
  template: {icon: '📋', label: 'Template'},
  reference: {icon: '📖', label: 'Reference Doc'},
  guide: {icon: '📚', label: 'Internal Guide'},
}

const CATEGORY_LABELS: Record<NonNullable<RecentDownload['category']>, string> = {
  marketing: 'Marketing',
  operations: 'Operations',
  technical: 'Technical',
  legal: 'Legal',
  templates: 'Templates',
}

const ACCESS_LABELS: Record<NonNullable<RecentDownload['accessLevel']>, string> = {
  public: 'Public',
  internal: 'Internal',
  admin: 'Admin Only',
}

export default function RecentDownloadsWidget() {
  const client = useClient({apiVersion: API_VERSION})
  const router = useRouter()
  const [categoryFilter, setCategoryFilter] =
    useState<(typeof CATEGORY_FILTERS)[number]['value']>('all')
  const [items, setItems] = useState<RecentDownload[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function fetchRecent() {
      setLoading(true)
      const filterClause =
        categoryFilter === 'all' ? '' : ' && category == $category'
      const query = `*[_type == "downloadResource" && isArchived != true${filterClause}] | order(coalesce(lastUpdated, _updatedAt) desc, _createdAt desc)[0...5]{
        _id,
        _type,
        title,
        documentType,
        category,
        version,
        lastUpdated,
        _updatedAt,
        accessLevel,
        "fileName": file.asset->originalFilename,
        "fileUrl": file.asset->url
      }`

      const docs =
        (await client.fetch<RecentDownload[]>(query, {
          category: categoryFilter === 'all' ? undefined : categoryFilter,
        })) ?? []
      if (!cancelled) {
        setItems(docs)
        setLoading(false)
      }
    }

    fetchRecent()
    return () => {
      cancelled = true
    }
  }, [categoryFilter, client])

  const categoryOptions = useMemo(
    () =>
      CATEGORY_FILTERS.map((filter) => (
        <option key={filter.value} value={filter.value}>
          {filter.label}
        </option>
      )),
    [],
  )

  const handleViewAll = () => {
    if (router.navigateUrl) {
      router.navigateUrl({path: `/desk/${DOWNLOADS_STRUCTURE_ID}`})
    } else if (typeof window !== 'undefined') {
      window.location.hash = `#/desk/${DOWNLOADS_STRUCTURE_ID}`
    }
  }

  const openDocument = (doc: RecentDownload) => {
    if (router.navigateIntent) {
      router.navigateIntent('edit', {id: doc._id, type: doc._type})
    } else if (typeof window !== 'undefined') {
      window.location.hash = `#/intent/edit/mode=edit&type=downloadResource&id=${doc._id}`
    }
  }

  const handleDownload = (doc: RecentDownload) => {
    if (!doc.fileUrl) {
      window.alert('Upload and publish a file before downloading.')
      return
    }
    window.open(doc.fileUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <Card radius={3} padding={4} border>
      <Stack space={4}>
        <Flex align="center" justify="space-between" gap={3}>
          <Stack space={2}>
            <Text size={2} weight="bold">
              Recent Documents
            </Text>
            <Text size={1} muted>
              Last 5 updated downloads, templates, or guides.
            </Text>
          </Stack>
          <Button
            icon={LaunchIcon}
            text="View All"
            mode="ghost"
            tone="primary"
            onClick={handleViewAll}
          />
        </Flex>
        <Flex gap={2} align="center">
          <Text size={1} muted>
            Filter:
          </Text>
          <Select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.currentTarget.value as any)}
            style={{minWidth: 180}}
          >
            {categoryOptions}
          </Select>
        </Flex>
        {loading ? (
          <Flex align="center" justify="center" paddingY={3}>
            <Spinner />
          </Flex>
        ) : items.length === 0 ? (
          <Card tone="transparent" border radius={2} padding={3}>
            <Text size={1} muted>
              No documents found for this filter yet.
            </Text>
          </Card>
        ) : (
          <Stack space={3}>
            {items.map((item) => {
              const typeMeta = item.documentType
                ? DOCUMENT_TYPE_ICONS[item.documentType]
                : null
              const badgeText = [
                typeMeta?.icon ? `${typeMeta.icon} ${typeMeta.label}` : null,
                item.version,
                item.category ? CATEGORY_LABELS[item.category] : null,
              ]
                .filter(Boolean)
                .join(' • ')
              const access = item.accessLevel ? ACCESS_LABELS[item.accessLevel] : null
              const updatedTimestamp = item.lastUpdated || item._updatedAt || ''
              return (
                <Card key={item._id} padding={3} radius={3} border>
                  <Stack space={3}>
                    <Stack space={1}>
                      <Text weight="medium">{item.title || 'Untitled document'}</Text>
                      <Text size={1} muted>
                        {badgeText || '—'}
                      </Text>
                      {access ? (
                        <Text size={0} muted>
                          Access: {access}
                        </Text>
                      ) : null}
                      {updatedTimestamp ? (
                        <Text size={0} muted>
                          Updated {formatDate(updatedTimestamp)}
                        </Text>
                      ) : null}
                    </Stack>
                    <Inline space={2}>
                      <Button
                        text="Open"
                        icon={LaunchIcon}
                        tone="primary"
                        mode="ghost"
                        onClick={() => openDocument(item)}
                      />
                      <Button
                        text="Download"
                        icon={DownloadIcon}
                        mode="ghost"
                        disabled={!item.fileUrl}
                        onClick={() => handleDownload(item)}
                      />
                    </Inline>
                  </Stack>
                </Card>
              )
            })}
          </Stack>
        )}
      </Stack>
    </Card>
  )
}
