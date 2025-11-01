import React, {Suspense, useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {
  Button,
  Card,
  Flex,
  Heading,
  Inline,
  Spinner,
  Stack,
  Text,
  Tooltip,
} from '@sanity/ui'
import {DownloadIcon, DocumentIcon} from '@sanity/icons'
import {useRouter} from 'sanity/router'
import {useClient} from 'sanity'
import {formatDate} from '../documentTables/PaginatedDocumentTable'

const API_VERSION = '2024-10-01'
const PAGE_SIZE = 8

type DownloadRow = {
  _id: string
  _type: string
  title?: string | null
  description?: string | null
  fileName?: string | null
  fileUrl?: string | null
  fileSize?: number | null
  fileType?: string | null
  publishedAt?: string | null
}

const LOADING_FALLBACK = (
  <Card radius={2} padding={3}>
    <Flex align="center" justify="center">
      <Spinner muted />
    </Flex>
  </Card>
)

const DOWNLOAD_PROJECTION = `{
  _id,
  _type,
  title,
  description,
  'fileName': file.asset->originalFilename,
  'fileUrl': file.asset->url,
  'fileSize': file.asset->size,
  'fileType': file.asset->extension,
  publishedAt
}`

function formatFileSize(size?: number | null): string {
  if (typeof size !== 'number' || Number.isNaN(size) || size <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let index = 0
  let bytes = size
  while (bytes >= 1024 && index < units.length - 1) {
    bytes /= 1024
    index += 1
  }
  return `${bytes.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

const EmptyState = () => (
  <Card padding={4} tone="transparent" border radius={3}>
    <Stack space={3}>
      <Text weight="medium">No downloads found</Text>
      <Text size={1} muted>
        Use the &ldquo;New download&rdquo; button to upload a PDF or ZIP file that the team can share.
      </Text>
    </Stack>
  </Card>
)

function DownloadPreview({download}: {download: DownloadRow}) {
  const ref = useRef<HTMLButtonElement | null>(null)
  const router = useRouter()

  const title = download.title || download.fileName || 'Untitled download'
  const subtitleParts = useMemo(() => {
    const parts: string[] = []
    if (download.fileType) parts.push((download.fileType ?? '').toUpperCase())
    if (typeof download.fileSize === 'number') parts.push(formatFileSize(download.fileSize))
    if (download.publishedAt) parts.push(`Published ${formatDate(download.publishedAt)}`)
    return parts
  }, [download.fileSize, download.fileType, download.publishedAt])

  const handleOpen = () =>
    router.navigateIntent('edit', {id: download._id, type: download._type})

  const handleDownload = (event: React.MouseEvent) => {
    event.stopPropagation()
    if (download.fileUrl) {
      window.open(download.fileUrl, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <Card padding={3} radius={3} tone="transparent" border>
      <Button
        ref={ref}
        mode="bleed"
        style={{width: '100%', textAlign: 'left'}}
        onClick={handleOpen}
      >
        <Flex align="center" gap={4}>
          <Card
            radius={3}
            padding={3}
            tone="primary"
            style={{flexShrink: 0, backgroundColor: 'var(--card-muted-fg-color)'}}
          >
            <DocumentIcon />
          </Card>
          <Stack flex={1} space={2}>
            <Text weight="medium" size={2}>
              {title}
            </Text>
            {download.description ? (
              <Text size={1} muted>
                {download.description}
              </Text>
            ) : null}
            <Inline space={3}>
              {download.fileName ? (
                <Text size={0} muted>
                  {download.fileName}
                </Text>
              ) : null}
              {subtitleParts.map((part, index) => (
                <Text key={`${part}-${index}`} size={0} muted>
                  {part}
                </Text>
              ))}
            </Inline>
          </Stack>
          {download.fileUrl ? (
            <Tooltip
              content={
                <Card padding={2}>
                  <Text size={1}>Open file</Text>
                </Card>
              }
              fallbackPlacements={['top', 'bottom']}
            >
              <Button
                mode="bleed"
                tone="primary"
                icon={DownloadIcon}
                onClick={handleDownload}
                aria-label="Open file"
              />
            </Tooltip>
          ) : null}
        </Flex>
      </Button>
    </Card>
  )
}

export default function DownloadsPreviewList() {
  const router = useRouter()
  const client = useClient({apiVersion: API_VERSION})
  const [downloads, setDownloads] = useState<DownloadRow[]>([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)

  const fetchPage = useCallback(
    async (pageIndex: number) => {
      const start = pageIndex * PAGE_SIZE
      const end = start + PAGE_SIZE
      const query = `*[_type == "downloadResource"] | order(coalesce(publishedAt, _createdAt) desc, _createdAt desc)[$start...$end]${DOWNLOAD_PROJECTION}`
      try {
        const result = await client.fetch<DownloadRow[]>(query, {start, end})
        return result
      } catch (err) {
        console.error('DownloadsPreviewList: failed to load downloads', err)
        return []
      }
    },
    [client],
  )

  useEffect(() => {
    let cancelled = false
    const loadInitial = async () => {
      setLoading(true)
      const result = await fetchPage(0)
      if (!cancelled) {
        setDownloads(result)
        setHasMore(result.length === PAGE_SIZE)
        setPage(0)
        setLoading(false)
      }
    }
    loadInitial()
    return () => {
      cancelled = true
    }
  }, [fetchPage])

  const handleLoadMore = async () => {
    if (loading || !hasMore) return
    setLoading(true)
    const nextPage = page + 1
    const result = await fetchPage(nextPage)
    setDownloads((prev) => [...prev, ...result])
    setHasMore(result.length === PAGE_SIZE)
    setPage(nextPage)
    setLoading(false)
  }

  const handleCreate = () => {
    router.navigateIntent('create', {type: 'downloadResource'})
  }

  if (downloads.length === 0 && !loading) {
    return (
      <Stack space={4}>
        <Flex justify="space-between" align="center">
          <Heading size={3}>Downloads</Heading>
          <Button text="New download" tone="primary" onClick={handleCreate} />
        </Flex>
        <EmptyState />
      </Stack>
    )
  }

  return (
    <Stack space={4}>
      <Flex justify="space-between" align="center">
        <Heading size={3}>Downloads</Heading>
        <Button text="New download" tone="primary" onClick={handleCreate} />
      </Flex>
      <Stack space={3}>
        {downloads.map((download) => (
          <Suspense fallback={LOADING_FALLBACK} key={download._id}>
            <DownloadPreview download={download} />
          </Suspense>
        ))}
        {hasMore ? (
          <Button text={loading ? 'Loading…' : 'Load more'} onClick={handleLoadMore} disabled={loading} />
        ) : null}
      </Stack>
    </Stack>
  )
}
