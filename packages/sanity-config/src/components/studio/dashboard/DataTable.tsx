import React, {useMemo, useState} from 'react'
import {Button, Card, Flex, Spinner, Stack, Text, TextInput} from '@sanity/ui'
import {ArrowLeftIcon, ArrowRightIcon, SearchIcon} from '@sanity/icons'

type ColumnAlign = 'left' | 'center' | 'right'

export type DataTableColumn<T> = {
  key: string
  title: string
  field?: keyof T
  width?: string
  align?: ColumnAlign
  sortable?: boolean
  render?: (row: T) => React.ReactNode
}

export type DataTableProps<T> = {
  columns: Array<DataTableColumn<T>>
  data: T[]
  pageSize?: number
  isLoading?: boolean
  emptyState?: string
  onRowClick?: (row: T) => void
  rowKey?: (row: T) => string
  searchableKeys?: Array<keyof T>
  filterPlaceholder?: string
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  pageSize = 10,
  isLoading,
  emptyState = 'No records found',
  onRowClick,
  rowKey,
  searchableKeys,
  filterPlaceholder = 'Search…',
}: DataTableProps<T>) {
  const [searchTerm, setSearchTerm] = useState('')
  const [sortKey, setSortKey] = useState<string>()
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    let rows = data

    if (searchTerm && searchableKeys?.length) {
      const normalized = searchTerm.toLowerCase()
      rows = rows.filter((row) =>
        searchableKeys.some((key) => {
          const value = row[key]
          if (value === null || value === undefined) return false
          return String(value).toLowerCase().includes(normalized)
        }),
      )
    }

    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        const column = columns.find((col) => col.key === sortKey)
        if (!column) return 0
        const field = column.field ?? (column.key as keyof T)
        const aValue = a[field]
        const bValue = b[field]
        if (aValue === bValue) return 0
        const direction = sortDirection === 'asc' ? 1 : -1
        if (aValue === undefined || aValue === null) return -direction
        if (bValue === undefined || bValue === null) return direction
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return (aValue - bValue) * direction
        }
        return String(aValue).localeCompare(String(bValue)) * direction
      })
    }

    return rows
  }, [columns, data, searchTerm, searchableKeys, sortDirection, sortKey])

  const pageCount = Math.max(Math.ceil(filtered.length / pageSize), 1)
  const currentPage = Math.min(page, pageCount - 1)
  const pageItems = filtered.slice(currentPage * pageSize, currentPage * pageSize + pageSize)

  const handleSort = (key: string, sortable?: boolean) => {
    if (!sortable) return
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  const resolveRowKey = (row: T, idx: number) => rowKey?.(row) ?? row._id ?? String(idx)

  return (
    <Card padding={4} radius={3} shadow={1}>
      <Stack space={4}>
        {searchableKeys?.length ? (
          <TextInput
            icon={SearchIcon}
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.currentTarget.value)
              setPage(0)
            }}
            placeholder={filterPlaceholder}
          />
        ) : null}
        <div style={{overflowX: 'auto'}}>
          <table style={{width: '100%', borderCollapse: 'collapse'}}>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    style={{
                      textAlign: column.align ?? 'left',
                      padding: '8px 12px',
                      cursor: column.sortable ? 'pointer' : 'default',
                      borderBottom: '1px solid var(--card-border-color)',
                      minWidth: column.width,
                    }}
                    onClick={() => handleSort(column.key, column.sortable)}
                  >
                    <Text size={1} weight="semibold" muted>
                      {column.title}
                      {sortKey === column.key ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
                    </Text>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={columns.length}>
                    <Flex align="center" justify="center" padding={4}>
                      <Spinner muted />
                    </Flex>
                  </td>
                </tr>
              ) : pageItems.length === 0 ? (
                <tr>
                  <td colSpan={columns.length}>
                    <Flex align="center" justify="center" padding={4}>
                      <Text muted>{emptyState}</Text>
                    </Flex>
                  </td>
                </tr>
              ) : (
                pageItems.map((row, idx) => (
                  <tr
                    key={resolveRowKey(row, idx)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    style={{
                      cursor: onRowClick ? 'pointer' : 'default',
                      backgroundColor: idx % 2 === 0 ? 'transparent' : 'var(--card-bg-secondary)',
                    }}
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        style={{
                          padding: '10px 12px',
                          textAlign: column.align ?? 'left',
                          borderBottom: '1px solid var(--card-border-color)',
                        }}
                      >
                        <Text size={1}>
                          {column.render
                            ? column.render(row)
                            : column.field
                              ? row[column.field]
                              : row[column.key as keyof T]}
                        </Text>
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Flex align="center" justify="space-between">
          <Text size={1}>
            Page {currentPage + 1} of {pageCount}
          </Text>
          <Flex gap={2}>
            <Button
              icon={ArrowLeftIcon}
              mode="ghost"
              tone="primary"
              disabled={currentPage === 0}
              onClick={() => setPage((prev) => Math.max(prev - 1, 0))}
            />
            <Button
              icon={ArrowRightIcon}
              mode="ghost"
              tone="primary"
              disabled={currentPage >= pageCount - 1}
              onClick={() => setPage((prev) => Math.min(prev + 1, pageCount - 1))}
            />
          </Flex>
        </Flex>
      </Stack>
    </Card>
  )
}

export default DataTable
