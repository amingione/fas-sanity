import React, {useCallback, useEffect, useMemo, useState} from 'react'
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  Flex,
  Inline,
  Menu,
  MenuButton,
  MenuDivider,
  MenuItem,
  Stack,
  Text,
  TextInput,
} from '@sanity/ui'
import {CheckmarkIcon, EllipsisVerticalIcon} from '@sanity/icons'
import {
  PaginatedDocumentTable,
  formatBoolean,
  formatCurrency,
  formatDate,
} from './PaginatedDocumentTable'
import {DocumentBadge, formatBadgeLabel, resolveBadgeTone} from './DocumentBadge'
import ProductBulkEditor from '../ProductBulkEditor'

type ProductRowData = {
  title?: string | null
  sku?: string | null
  status?: string | null
  price?: number | null
  salePrice?: number | null
  onSale?: boolean | null
  featured?: boolean | null
  stripeActive?: boolean | null
  updatedAt?: string | null
  primaryImage?: string | null
}

type ProductRow = ProductRowData & {
  _id: string
  _type: string
}

type StatusFilterId = 'all' | 'active' | 'draft' | 'paused' | 'archived'

type StatusFilterOption = {
  id: StatusFilterId
  title: string
  filter?: string
}

type SortOption = {
  id: string
  title: string
  orderings: Array<{field: string; direction: 'asc' | 'desc'}>
}

type ProductsDocumentTableProps = {
  title?: string
  baseFilter?: string
  initialStatusFilter?: StatusFilterId
  pageSize?: number
}

const PRODUCT_PROJECTION = `{
  title,
  sku,
  status,
  price,
  salePrice,
  onSale,
  featured,
  stripeActive,
  "updatedAt": coalesce(_updatedAt, _createdAt),
  "primaryImage": coalesce(images[0].asset->url, ${JSON.stringify(
    'https://dummyimage.com/128x128/ededed/8c8c8c&text=No+Image',
  )})
}`

const STATUS_FILTERS: StatusFilterOption[] = [
  {id: 'all', title: 'All statuses'},
  {id: 'active', title: 'Active', filter: 'status == "active" || !defined(status)'},
  {id: 'draft', title: 'Draft', filter: 'status == "draft"'},
  {id: 'paused', title: 'Paused', filter: 'status == "paused"'},
  {id: 'archived', title: 'Archived', filter: 'status == "archived"'},
]

const SORT_OPTIONS: SortOption[] = [
  {
    id: 'updatedDesc',
    title: 'Last updated (newest)',
    orderings: [{field: 'coalesce(_updatedAt, _createdAt)', direction: 'desc'}],
  },
  {
    id: 'updatedAsc',
    title: 'Last updated (oldest)',
    orderings: [{field: 'coalesce(_updatedAt, _createdAt)', direction: 'asc'}],
  },
  {
    id: 'statusAsc',
    title: 'Status (A → Z)',
    orderings: [
      {field: 'status', direction: 'asc'},
      {field: 'coalesce(_updatedAt, _createdAt)', direction: 'desc'},
    ],
  },
  {
    id: 'priceDesc',
    title: 'Price (high → low)',
    orderings: [
      {field: 'coalesce(salePrice, price, 0)', direction: 'desc'},
      {field: 'coalesce(_updatedAt, _createdAt)', direction: 'desc'},
    ],
  },
  {
    id: 'priceAsc',
    title: 'Price (low → high)',
    orderings: [
      {field: 'coalesce(salePrice, price, 0)', direction: 'asc'},
      {field: 'coalesce(_updatedAt, _createdAt)', direction: 'desc'},
    ],
  },
]

const DEFAULT_ORDERINGS: Array<{field: string; direction: 'asc' | 'desc'}> = [
  {field: 'coalesce(_updatedAt, _createdAt)', direction: 'desc'},
]

const PriceCell = ({row}: {row: ProductRowData}) => {
  if (row.onSale && typeof row.salePrice === 'number') {
    return (
      <Flex direction="column">
        <Text size={1} weight="medium">
          {formatCurrency(row.salePrice, 'USD')}
        </Text>
        <Text size={0} muted style={{textDecoration: 'line-through'}}>
          {formatCurrency(row.price ?? null, 'USD')}
        </Text>
      </Flex>
    )
  }

  return (
    <Text size={1} weight="medium">
      {formatCurrency(row.price ?? null, 'USD')}
    </Text>
  )
}

export default function ProductsDocumentTable({
  title = 'Products',
  baseFilter,
  initialStatusFilter = 'all',
  pageSize = 8,
}: ProductsDocumentTableProps = {}) {
  const [statusFilterId, setStatusFilterId] = useState<StatusFilterId>(initialStatusFilter)
  const [sortId, setSortId] = useState<string>(SORT_OPTIONS[0]?.id ?? 'updatedDesc')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [currentItems, setCurrentItems] = useState<ProductRow[]>([])
  const [bulkEditorOpen, setBulkEditorOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const activeStatus = useMemo(() => {
    return STATUS_FILTERS.find((option) => option.id === statusFilterId) ?? STATUS_FILTERS[0]
  }, [statusFilterId])

  const activeSort = useMemo(() => {
    return SORT_OPTIONS.find((option) => option.id === sortId) ?? SORT_OPTIONS[0]
  }, [sortId])

  const combinedFilter = useMemo(() => {
    const clauses: string[] = []
    if (baseFilter && baseFilter.trim().length > 0) {
      clauses.push(`(${baseFilter.trim()})`)
    }
    if (activeStatus.filter) {
      clauses.push(`(${activeStatus.filter})`)
    }
    const trimmedSearch = searchTerm.trim()
    if (trimmedSearch.length > 0) {
      const like = `*${trimmedSearch}*`
      clauses.push(`(title match ${JSON.stringify(like)} || sku match ${JSON.stringify(like)})`)
    }
    return clauses.join(' && ')
  }, [activeStatus.filter, baseFilter, searchTerm])

  const orderings = useMemo(() => activeSort?.orderings ?? DEFAULT_ORDERINGS, [activeSort])

  useEffect(() => {
    // Clear selection when filter or sort changes to avoid acting on stale rows.
    setSelectedIds(new Set())
  }, [statusFilterId, sortId, baseFilter, searchTerm])

  const handlePageItemsChange = useCallback((rows: ProductRow[]) => {
    setCurrentItems(rows)
  }, [])

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const toggleAllOnPage = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const everySelected =
        currentItems.length > 0 && currentItems.every((item) => next.has(item._id))
      if (everySelected) {
        currentItems.forEach((item) => next.delete(item._id))
      } else {
        currentItems.forEach((item) => next.add(item._id))
      }
      return next
    })
  }, [currentItems])

  const selectionMeta = useMemo(() => {
    const selectedOnPage = currentItems.filter((item) => selectedIds.has(item._id))
    const allSelected = currentItems.length > 0 && selectedOnPage.length === currentItems.length
    const someSelected = selectedOnPage.length > 0 && !allSelected
    return {
      allSelected,
      someSelected,
    }
  }, [currentItems, selectedIds])

  const selectedCount = selectedIds.size
  const selectedIdList = useMemo(() => Array.from(selectedIds), [selectedIds])

  const openBulkEditor = useCallback(() => {
    if (selectedCount > 0) {
      setBulkEditorOpen(true)
    }
  }, [selectedCount])

  const closeBulkEditor = useCallback(() => {
    setBulkEditorOpen(false)
  }, [])

  const columns = useMemo(
    () => [
      {
        key: 'select',
        header: (
          <Checkbox
            aria-label="Select all products on this page"
            checked={selectionMeta.allSelected}
            indeterminate={selectionMeta.someSelected}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => {
              event.stopPropagation()
              toggleAllOnPage()
            }}
          />
        ),
        width: 48,
        align: 'center' as const,
        render: (data: ProductRow) => (
          <Checkbox
            aria-label={`Select ${data.title ?? 'product'}`}
            checked={selectedIds.has(data._id)}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => {
              event.stopPropagation()
              toggleSelection(data._id)
            }}
          />
        ),
      },
      {
        key: 'title',
        header: 'Product',
        width: 320,
        render: (data: ProductRow) => {
          const badges: React.ReactNode[] = []
          if (data.featured) {
            badges.push(<DocumentBadge key="featured" label="Featured" tone="primary" />)
          }
          if (data.onSale) {
            badges.push(<DocumentBadge key="sale" label="On Sale" tone="caution" />)
          }

          return (
            <Flex align="center" style={{gap: '12px'}}>
              {data.primaryImage ? (
                <Box
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 6,
                    overflow: 'hidden',
                    backgroundColor: 'var(--card-muted-fg-color)',
                    flexShrink: 0,
                  }}
                >
                  <img
                    src={data.primaryImage}
                    alt={data.title ?? 'Product image'}
                    style={{width: '100%', height: '100%', objectFit: 'cover'}}
                  />
                </Box>
              ) : null}
              <Box style={{minWidth: 0}}>
                <Stack space={2}>
                  <Text size={1} weight="medium">
                    {data.title || 'Untitled product'}
                  </Text>
                  {badges.length > 0 ? (
                    <Inline space={2} style={{flexWrap: 'wrap', rowGap: '4px'}}>
                      {badges}
                    </Inline>
                  ) : null}
                </Stack>
              </Box>
            </Flex>
          )
        },
      },
      {
        key: 'sku',
        header: 'SKU',
        width: 160,
        render: (data: ProductRow) => <Text size={1}>{data.sku || '—'}</Text>,
      },
      {
        key: 'status',
        header: 'Status',
        width: 140,
        render: (data: ProductRow) => {
          const label = formatBadgeLabel(data.status)
          if (!label) {
            return <Text size={1}>—</Text>
          }
          return <DocumentBadge label={label} tone={resolveBadgeTone(data.status)} />
        },
      },
      {
        key: 'price',
        header: 'Price',
        align: 'right' as const,
        width: 120,
        render: (data: ProductRow) => <PriceCell row={data} />,
      },
      {
        key: 'stripe',
        header: 'Stripe',
        width: 100,
        render: (data: ProductRow) => (
          <Text size={1}>{formatBoolean(Boolean(data.stripeActive))}</Text>
        ),
      },
      {
        key: 'updatedAt',
        header: 'Last Updated',
        width: 160,
        render: (data: ProductRow) => <Text size={1}>{formatDate(data.updatedAt)}</Text>,
      },
    ],
    [
      selectionMeta.allSelected,
      selectionMeta.someSelected,
      selectedIds,
      toggleAllOnPage,
      toggleSelection,
    ],
  )

  const headerActions = (
    <Flex align="center" gap={3} wrap="wrap">
      <TextInput
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.currentTarget.value)}
        placeholder="Search by title or SKU…"
        style={{width: '240px'}}
      />
      {selectedCount > 0 ? (
        <Button text={`Bulk edit (${selectedCount})`} tone="primary" onClick={openBulkEditor} />
      ) : null}
      <MenuButton
        id="products-table-menu"
        button={
          <Button icon={EllipsisVerticalIcon} mode="ghost" aria-label="Product list options" />
        }
        menu={
          <Menu>
            <MenuItem text="Filter by status" disabled tone="primary" />
            {STATUS_FILTERS.map((option) => (
              <MenuItem
                key={option.id}
                text={option.title}
                pressed={option.id === activeStatus.id}
                icon={option.id === activeStatus.id ? CheckmarkIcon : undefined}
                onClick={() => setStatusFilterId(option.id)}
              />
            ))}
            <MenuDivider />
            <MenuItem text="Sort by" disabled tone="primary" />
            {SORT_OPTIONS.map((option) => (
              <MenuItem
                key={option.id}
                text={option.title}
                pressed={option.id === activeSort.id}
                icon={option.id === activeSort.id ? CheckmarkIcon : undefined}
                onClick={() => setSortId(option.id)}
              />
            ))}
            <MenuDivider />
            <MenuItem
              text="Bulk edit selected"
              tone="positive"
              disabled={selectedCount === 0}
              onClick={openBulkEditor}
            />
            {selectedCount > 0 ? (
              <MenuItem
                text="Clear selection"
                tone="critical"
                onClick={() => setSelectedIds(new Set())}
              />
            ) : null}
          </Menu>
        }
      />
    </Flex>
  )

  return (
    <>
      <PaginatedDocumentTable<ProductRowData>
        title={title}
        documentType="product"
        projection={PRODUCT_PROJECTION}
        orderings={orderings}
        pageSize={pageSize}
        filter={combinedFilter || undefined}
        headerActions={headerActions}
        onPageItemsChange={handlePageItemsChange}
        columns={columns}
      />

      {bulkEditorOpen ? (
        <Dialog
          id="bulk-product-editor"
          header={`Bulk edit products (${selectedCount})`}
          onClose={closeBulkEditor}
          width={4}
        >
          <Box padding={4} style={{maxHeight: '80vh', overflow: 'auto'}}>
            <ProductBulkEditor productIds={selectedIdList} />
          </Box>
        </Dialog>
      ) : null}
    </>
  )
}
