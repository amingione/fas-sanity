import React, {useCallback, useEffect, useMemo, useState} from 'react'
import {Button, Card, Flex, Heading, Stack, Text} from '@sanity/ui'
import {useRouter} from 'sanity/router'
import {useClient} from 'sanity'

const API_VERSION = '2024-10-01'

export type ColumnAlign = 'left' | 'right' | 'center'

export type PaginatedColumn<TData extends Record<string, unknown>> = {
  key: string
  header: string
  width?: string | number
  align?: ColumnAlign
  render: (data: TData & {_id: string; _type: string}) => React.ReactNode
}

export interface PaginatedDocumentTableProps<TData extends Record<string, unknown>> {
  title: string
  documentType: string
  projection: string
  columns: PaginatedColumn<TData>[]
  orderings?: Array<{field: string; direction: 'asc' | 'desc'}>
  pageSize?: number
  emptyState?: string
}

type RowResult<TData extends Record<string, unknown>> = TData & {
  _id: string
  _type: string
}

function normalizeProjection(projection: string) {
  const trimmed = projection.trim()
  const body = trimmed.startsWith('{') && trimmed.endsWith('}')
    ? trimmed.slice(1, -1).trim()
    : trimmed

  const entries = body
    ? body
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : []

  const fields = new Set(entries)
  fields.add('_id')
  fields.add('_type')

  return `{${Array.from(fields).join(', ')}}`
}

function buildOrderingClause(orderings?: Array<{field: string; direction: 'asc' | 'desc'}>) {
  if (!orderings || orderings.length === 0) {
    return '_createdAt desc'
  }
  return orderings
    .map((ordering) => `${ordering.field} ${ordering.direction === 'asc' ? 'asc' : 'desc'}`)
    .join(', ')
}

export function formatCurrency(value?: number | null, currency: string = 'USD') {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatBoolean(value?: boolean | null) {
  if (typeof value !== 'boolean') return '—'
  return value ? 'Yes' : 'No'
}

export function PaginatedDocumentTable<TData extends Record<string, unknown>>({
  title,
  documentType,
  projection,
  columns,
  orderings,
  pageSize = 8,
  emptyState = 'No documents found.',
}: PaginatedDocumentTableProps<TData>) {
  const client = useClient({apiVersion: API_VERSION})
  const router = useRouter()
  const [items, setItems] = useState<RowResult<TData>[]>([])
  const [total, setTotal] = useState<number>(0)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [loading, setLoading] = useState<boolean>(true)

  const normalizedProjection = useMemo(() => normalizeProjection(projection), [projection])
  const orderingClause = useMemo(() => buildOrderingClause(orderings), [orderings])

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(total / pageSize))
  }, [total, pageSize])

  useEffect(() => {
    let cancelled = false

    const fetchTotal = async () => {
      try {
        const count = await client.fetch<number>(
          `count(*[_type == $documentType])`,
          {documentType},
        )
        if (!cancelled) {
          setTotal(count)
          if (currentPage > Math.max(1, Math.ceil(count / pageSize))) {
            setCurrentPage(1)
          }
        }
      } catch (err) {
        console.error('PaginatedDocumentTable: failed to load document count', err)
      }
    }

    fetchTotal()

    return () => {
      cancelled = true
    }
  }, [client, documentType, pageSize, currentPage])

  useEffect(() => {
    let cancelled = false

    const fetchPage = async () => {
      setLoading(true)
      const start = (currentPage - 1) * pageSize
      const end = start + pageSize
      const query = `*[_type == $documentType] | order(${orderingClause})[$start...$end]${normalizedProjection}`

      try {
        const results = await client.fetch<RowResult<TData>[]>(query, {
          documentType,
          start,
          end,
        })
        if (!cancelled) {
          setItems(results)
        }
      } catch (err) {
        console.error('PaginatedDocumentTable: failed to load documents', err)
        if (!cancelled) {
          setItems([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchPage()

    return () => {
      cancelled = true
    }
  }, [client, currentPage, documentType, normalizedProjection, orderingClause, pageSize])

  const handlePrevious = useCallback(() => {
    setCurrentPage((prev) => Math.max(1, prev - 1))
  }, [])

  const handleNext = useCallback(() => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1))
  }, [totalPages])

  const handleRowClick = useCallback(
    (row: RowResult<TData>) => {
      router.navigateIntent('edit', {id: row._id, type: row._type})
    },
    [router],
  )

  const columnHeaders = useMemo(
    () =>
      columns.map((column) => (
        <th
          key={column.key}
          style={{
            textAlign: column.align ?? 'left',
            padding: '12px',
            fontSize: '12px',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--card-muted-fg-color)',
            fontWeight: 600,
            borderBottom: '1px solid var(--card-border-color)',
          }}
        >
          {column.header}
        </th>
      )),
    [columns],
  )

  return (
    <Card padding={4} radius={3} shadow={1} tone="transparent">
      <Stack space={4}>
        <Heading as="h2" size={3}>
          {title}
        </Heading>

        <div style={{overflowX: 'auto'}}>
          <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '14px'}}>
            <thead>
              <tr>{columnHeaders}</tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columns.length} style={{padding: '16px'}}>
                    <Text size={1} muted>
                      Loading…
                    </Text>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} style={{padding: '16px'}}>
                    <Text size={1} muted>
                      {emptyState}
                    </Text>
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr
                    key={row._id}
                    onClick={() => handleRowClick(row)}
                    style={{
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--card-border-color)',
                      transition: 'background-color 120ms ease',
                    }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.04)'
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.backgroundColor = 'transparent'
                    }}
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        style={{
                          padding: '10px 12px',
                          textAlign: column.align ?? 'left',
                          whiteSpace: 'nowrap',
                          maxWidth:
                            typeof column.width === 'number'
                              ? `${column.width}px`
                              : column.width,
                        }}
                      >
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Flex align="center" justify="space-between">
          <Button mode="ghost" text="Previous" disabled={currentPage <= 1} onClick={handlePrevious} />
          <Text size={1} weight="medium">
            Page {total === 0 ? 0 : currentPage} of {total === 0 ? 0 : totalPages}
          </Text>
          <Button
            mode="ghost"
            text="Next"
            disabled={currentPage >= totalPages}
            onClick={handleNext}
          />
        </Flex>
      </Stack>
    </Card>
  )
}
