import React, {useCallback, useEffect, useMemo, useState} from 'react'
import {Button, Card, Flex, Heading, Stack, Text} from '@sanity/ui'
import {useRouter} from 'sanity/router'
import {useClient} from 'sanity'
import {GROQ_EXPIRED_ARRAY, GROQ_FILTER_EXCLUDE_EXPIRED} from '../../../utils/orderFilters'

const API_VERSION = '2024-10-01'

export type ColumnAlign = 'left' | 'right' | 'center'

export type PaginatedColumn<TData extends Record<string, unknown>> = {
  key: string
  header: React.ReactNode
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
  filter?: string
  includeDrafts?: boolean
  headerActions?: React.ReactNode
  onPageItemsChange?: (items: Array<RowResult<TData>>) => void
}

type RowResult<TData extends Record<string, unknown>> = TData & {
  _id: string
  _type: string
}

function normalizeProjection(projection: string) {
  const trimmed = projection.trim()
  const body =
    trimmed.startsWith('{') && trimmed.endsWith('}') ? trimmed.slice(1, -1).trim() : trimmed

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
  filter,
  includeDrafts = false,
  headerActions,
  onPageItemsChange,
}: PaginatedDocumentTableProps<TData>) {
  const client = useClient({apiVersion: API_VERSION})
  const router = useRouter()
  const [items, setItems] = useState<RowResult<TData>[]>([])
  const [total, setTotal] = useState<number>(0)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [loading, setLoading] = useState<boolean>(true)

  const normalizedProjection = useMemo(() => normalizeProjection(projection), [projection])
  const orderingClause = useMemo(() => buildOrderingClause(orderings), [orderings])
  const filterFragments = useMemo(() => {
    const fragments = ['_type == $documentType']
    if (documentType === 'order') {
      fragments.push(
        `(${GROQ_FILTER_EXCLUDE_EXPIRED})`,
        `!(defined(stripeCheckoutStatus) && lower(stripeCheckoutStatus) in ${GROQ_EXPIRED_ARRAY})`,
      )
    }
    if (!includeDrafts) {
      fragments.push('!(_id in path("drafts.**"))')
    }
    if (filter && filter.trim().length > 0) {
      fragments.push(`(${filter.trim()})`)
    }
    return fragments
  }, [documentType, filter, includeDrafts])
  const filterClause = useMemo(() => filterFragments.join(' && '), [filterFragments])

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(total / pageSize))
  }, [total, pageSize])

  const minTableWidth = useMemo(() => {
    if (!columns.length) return 320
    return columns.reduce((totalWidth, column) => {
      if (typeof column.width === 'number') {
        return totalWidth + column.width
      }
      if (typeof column.width === 'string') {
        const pxMatch = column.width.match(/^(\d+(?:\.\d+)?)px$/i)
        if (pxMatch) {
          const parsed = Number.parseFloat(pxMatch[1])
          if (!Number.isNaN(parsed)) {
            return totalWidth + parsed
          }
        }
      }
      return totalWidth + 160
    }, 0)
  }, [columns])

  useEffect(() => {
    let cancelled = false

    const fetchTotal = async () => {
      try {
        const countQuery = `count(*[${filterClause}])`
        const count = await client.fetch<number>(countQuery, {documentType})
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
  }, [client, documentType, pageSize, currentPage, filterClause])

  useEffect(() => {
    let cancelled = false

    const fetchPage = async () => {
      setLoading(true)
      const start = (currentPage - 1) * pageSize
      const end = start + pageSize
      const query = `*[${filterClause}] | order(${orderingClause})[$start...$end]${normalizedProjection}`

      try {
        const results = await client.fetch<RowResult<TData>[]>(query, {
          documentType,
          start,
          end,
        })
        if (!cancelled) {
          setItems(results)
          if (onPageItemsChange) {
            onPageItemsChange(results)
          }
        }
      } catch (err) {
        console.error('PaginatedDocumentTable: failed to load documents', err)
        if (!cancelled) {
          setItems([])
          if (onPageItemsChange) {
            onPageItemsChange([])
          }
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
  }, [
    client,
    currentPage,
    documentType,
    normalizedProjection,
    orderingClause,
    pageSize,
    filterClause,
    onPageItemsChange,
  ])

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

  return (
    <Card padding={4} radius={3} shadow={1} tone="transparent">
      <Stack space={4}>
        <Flex align="center" justify="space-between" wrap="wrap" gap={3}>
          <Heading as="h2" size={3}>
            {title}
          </Heading>
          {headerActions ? <div>{headerActions}</div> : null}
        </Flex>

        <div
          style={{
            overflowX: 'auto',
            backgroundColor: 'var(--card-bg-color)',
            borderRadius: 12,
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            padding: 16,
          }}
        >
          <table
            style={{
              width: '100%',
              minWidth: minTableWidth,
              borderCollapse: 'separate',
              borderSpacing: 0,
              fontSize: '14px',
            }}
          >
            <thead>
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    style={{
                      width: column.width,
                      textAlign: column.align ?? 'left',
                      padding: '12px 16px',
                      fontSize: '12px',
                      textTransform: 'uppercase',
                      color: 'var(--card-muted-fg-color)',
                      fontWeight: 600,
                      borderBottom: '1px solid var(--card-border-color)',
                    }}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columns.length} style={{padding: '20px 16px'}}>
                    <Text size={1} muted>
                      Loading…
                    </Text>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} style={{padding: '20px 16px'}}>
                    <Text size={1} muted>
                      {emptyState}
                    </Text>
                  </td>
                </tr>
              ) : (
                items.map((row, idx) => (
                  <tr
                    key={row._id}
                    onClick={() => handleRowClick(row)}
                    style={{
                      cursor: 'pointer',
                      backgroundColor: idx % 2 === 0 ? 'var(--card-bg-color)' : 'rgba(0,0,0,0.02)',
                      transition: 'background-color 150ms ease',
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)')
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor =
                        idx % 2 === 0 ? 'var(--card-bg-color)' : 'rgba(0,0,0,0.02)')
                    }
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        style={{
                          width: column.width,
                          padding: '16px 18px',
                          textAlign: column.align ?? 'left',
                          verticalAlign: 'middle',
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

          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 16,
              marginTop: 24,
            }}
          >
            <Button
              mode="ghost"
              tone="primary"
              text="Previous Page"
              disabled={currentPage <= 1}
              onClick={handlePrevious}
            />
            <Text size={1} weight="medium">
              Page {total === 0 ? 0 : currentPage} of {total === 0 ? 0 : totalPages}
            </Text>
            <Button
              mode="ghost"
              tone="primary"
              text="Next Page"
              disabled={currentPage >= totalPages}
              onClick={handleNext}
            />
          </div>
        </div>
      </Stack>
    </Card>
  )
}
