import {
  ChangeEvent,
  Dispatch,
  SetStateAction,
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Flex,
  Grid,
  Inline,
  Menu,
  MenuButton,
  MenuItem,
  Select,
  Spinner,
  Stack,
  Text,
  TextInput,
  useToast,
} from '@sanity/ui'
import {
  AddIcon,
  CheckmarkIcon,
  CloseIcon,
  FilterIcon,
  SearchIcon,
} from '@sanity/icons'
import {useClient} from 'sanity'
import {useRouter} from 'sanity/router'

const PRODUCT_LIST_QUERY = `*[_type == "product"]{
  _id,
  title,
  sku,
  price,
  salePrice,
  availability,
  installOnly,
  status,
  manualInventoryCount,
  "categories": coalesce(category[]->title, []),
  "filterTags": coalesce(filters[]->title, []),
  "previewImageUrl": coalesce(store.previewImageUrl, images[0].asset->url),
  "updatedAt": coalesce(store.updatedAt, _updatedAt),
  store{
    status,
    isDeleted,
    title,
    vendor,
    tags,
    tracksInventory,
    totalInventory,
    updatedAt,
    options[]{name, values},
    variants[]{
      store{
        id,
        sku,
        price,
        compareAtPrice,
        inventoryQuantity,
        inventoryPolicy,
        availableForSale,
        requiresShipping
      }
    }
  }
}`

const GRID_TEMPLATE_COLUMNS = '56px minmax(320px, 2.2fr) 150px 220px 190px 120px 120px 120px'
const GRID_COLUMN_GAP = 20
const TABLE_MIN_WIDTH = 1120
const ROW_MIN_HEIGHT = 64
const HEADER_BACKGROUND = 'var(--card-muted-bg-color, #f3f4f6)'
const ROW_BACKGROUND = '#ffffff'
const ROW_SELECTED_BACKGROUND = 'rgba(37, 99, 235, 0.12)'
const STICKY_COLUMN_BACKGROUND = '#ffffff'
const STICKY_PRODUCT_LEFT = 56 + GRID_COLUMN_GAP

type VariantStore = {
  id?: string | number | null
  sku?: string | null
  price?: number | string | {amount?: number | string | null} | null
  compareAtPrice?: number | string | {amount?: number | string | null} | null
  inventoryQuantity?: number | string | null
  inventoryPolicy?: string | null
  availableForSale?: boolean | null
  requiresShipping?: boolean | null
}

type RawVariant = {
  store?: VariantStore | null
} | null

type RawProductStore = {
  status?: string | null
  isDeleted?: boolean | null
  title?: string | null
  vendor?: string | null
  tags?: unknown
  tracksInventory?: boolean | null
  totalInventory?: number | string | null
  updatedAt?: string | null
  variants?: RawVariant[] | null
}

type RawProduct = {
  _id: string
  title?: string | null
  sku?: string | null
  price?: number | string | null
  salePrice?: number | string | null
  availability?: string | null
  installOnly?: boolean | null
  status?: string | null
  manualInventoryCount?: number | string | null
  categories?: string[] | null
  filterTags?: string[] | null
  previewImageUrl?: string | null
  updatedAt?: string | null
  store?: RawProductStore | null
}

type InventoryStatus = 'not_tracked' | 'out' | 'low' | 'in'

type ProductRow = {
  id: string
  title: string
  sku: string | null
  vendor: string | null
  status: string
  statusTone: 'positive' | 'primary' | 'caution' | 'critical'
  isDeleted: boolean
  availability: string | null
  previewImageUrl: string | null
  categories: string[]
  categoryLabel: string
  tags: string[]
  installOnly: boolean
  totalInventory: number | null
  inventoryTracked: boolean
  inventoryDescription: string
  inventoryStatus: InventoryStatus
  basePrice: number | null
  inventoryValue: number | null
  channelCount: number
  catalogCount: number
  restrictionCount: number
  searchIndex: string
  updatedAtValue: number | null
}

type SavedView = {
  id: string
  name: string
  searchTerm: string
  vendors: string[]
  tags: string[]
  statuses: string[]
  inventories: InventoryStatus[]
}

type Metrics = {
  sellThroughRate: number | null
  lowOrOutCount: number
  trackedCount: number
  inventoryValue: number | null
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const normalized = value.replace(/[^0-9.-]+/g, '').trim()
    if (!normalized) return null
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : null
  }
  if (typeof value === 'object' && value !== null && 'amount' in value) {
    return parseNumber((value as {amount?: unknown}).amount)
  }
  return null
}

function parseDateValue(value: unknown): number | null {
  if (!value) return null
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const timestamp = Date.parse(value)
    return Number.isFinite(timestamp) ? timestamp : null
  }
  return null
}

function toStringArray(value: unknown): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry): entry is string => Boolean(entry))
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((segment) => segment.trim())
      .filter(Boolean)
  }
  return []
}

function normalizeStatus(rawStatus: string | null | undefined, isDeleted: boolean): string {
  if (isDeleted) return 'Deleted'
  if (!rawStatus) return 'Active'
  const normalized = rawStatus.trim().toLowerCase()
  switch (normalized) {
    case 'active':
      return 'Active'
    case 'archived':
      return 'Archived'
    case 'draft':
      return 'Draft'
    case 'paused':
      return 'Paused'
    case 'sold_out':
      return 'Sold out'
    default:
      return normalized
        .split(/\s|_/)
        .filter(Boolean)
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ')
  }
}

function statusTone(status: string): 'positive' | 'primary' | 'caution' | 'critical' {
  const normalized = status.toLowerCase()
  if (normalized === 'active') return 'positive'
  if (normalized === 'draft') return 'primary'
  if (normalized === 'archived' || normalized === 'paused') return 'caution'
  if (normalized === 'deleted' || normalized === 'sold out') return 'critical'
  return 'primary'
}

function summarizeCategories(categories: string[]): string {
  if (categories.length === 0) return '—'
  if (categories.length === 1) return categories[0]
  return `${categories[0]} +${categories.length - 1} more`
}

function computeInventoryDescription(
  totalInventory: number | null,
  tracked: boolean,
  source: 'manual' | 'automatic' | null = null
): {
  description: string
  status: InventoryStatus
} {
  if (!tracked || totalInventory === null) {
    return {description: 'Inventory not tracked', status: 'not_tracked'}
  }
  if (totalInventory <= 0) {
    const description = source === 'manual' ? 'Manual count: Out of stock' : 'Out of stock'
    return {description, status: 'out'}
  }
  if (totalInventory <= 5) {
    const description =
      source === 'manual'
        ? `Manual count: ${totalInventory} (Low)`
        : `${totalInventory} in stock (Low)`
    return {description, status: 'low'}
  }
  const description =
    source === 'manual' ? `Manual count: ${totalInventory}` : `${totalInventory} in stock`
  return {description, status: 'in'}
}

function normalizeProduct(raw: RawProduct): ProductRow {
  const store = raw.store || {}
  const variants = (store.variants || [])
    .map((entry) => entry?.store)
    .filter((entry): entry is VariantStore => Boolean(entry))

  const variantInventory = variants.reduce<{
    total: number | null
    hasQuantity: boolean
    availableCount: number
    prices: number[]
  }>(
    (acc, variant) => {
      const quantity = parseNumber(variant.inventoryQuantity)
      if (quantity !== null) {
        acc.total = (acc.total ?? 0) + quantity
        acc.hasQuantity = true
      }
      if (variant.availableForSale) {
        acc.availableCount += 1
      }
      const price = parseNumber(variant.price)
      if (price !== null) acc.prices.push(price)
      return acc
    },
    {total: null, hasQuantity: false, availableCount: 0, prices: []}
  )

  const manualInventory = parseNumber(raw.manualInventoryCount)
  const explicitTotal = parseNumber(store.totalInventory)
  const computedTotal = variantInventory.hasQuantity ? variantInventory.total ?? 0 : null
  const totalInventory = manualInventory ?? explicitTotal ?? computedTotal
  const totalInventorySource: 'manual' | 'automatic' | null =
    manualInventory !== null
      ? 'manual'
      : totalInventory !== null
      ? 'automatic'
      : null
  const tracksInventory =
    manualInventory !== null ||
    Boolean(store.tracksInventory) ||
    variantInventory.hasQuantity ||
    explicitTotal !== null

  const salePrice = parseNumber(raw.salePrice)
  const listPrice = parseNumber(raw.price)
  const variantBasePrice = variantInventory.prices.length ? Math.min(...variantInventory.prices) : null
  const basePrice = salePrice ?? listPrice ?? variantBasePrice

  const {description: inventoryDescription, status: inventoryStatus} = computeInventoryDescription(
    totalInventory,
    tracksInventory,
    totalInventorySource
  )

  const statusSource = raw.status || store.status || null
  const normalizedStatus = normalizeStatus(statusSource, Boolean(store.isDeleted))

  const categories = (raw.categories || []).filter((entry): entry is string => Boolean(entry))
  const filterTags = (raw.filterTags || []).filter((entry): entry is string => Boolean(entry))
  const storeTags = toStringArray(store.tags)
  const dedupedTags = Array.from(new Set([...filterTags, ...storeTags]))

  const searchIndex = [
    raw.title,
    store.title,
    raw.sku,
    store.vendor,
    filterTags.join(' '),
    categories.join(' '),
    normalizedStatus,
    raw.availability || '',
  ]
    .join(' ')
    .toLowerCase()

  const inventoryValue = basePrice !== null && totalInventory !== null ? basePrice * totalInventory : null

  return {
    id: raw._id,
    title: (store.title || raw.title || 'Untitled product').trim(),
    sku: raw.sku || null,
    vendor: store.vendor || null,
    status: normalizedStatus,
    statusTone: statusTone(normalizedStatus),
    isDeleted: Boolean(store.isDeleted),
    availability: raw.availability || null,
    previewImageUrl: raw.previewImageUrl || null,
    categories,
    categoryLabel: summarizeCategories(categories),
    tags: dedupedTags,
    installOnly: Boolean(raw.installOnly),
    totalInventory,
    inventoryTracked: tracksInventory,
    inventoryDescription,
    inventoryStatus,
    basePrice,
    inventoryValue,
    channelCount: variantInventory.availableCount,
    catalogCount: categories.length,
    restrictionCount: (raw.installOnly ? 1 : 0) + filterTags.length,
    searchIndex,
    updatedAtValue: parseDateValue(raw.updatedAt || store.updatedAt),
  }
}

function createViewId(): string {
  return `view-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`
}

function buildCsv(rows: ProductRow[]): string {
  const headers = [
    'Title',
    'SKU',
    'Vendor',
    'Status',
    'Inventory description',
    'Total inventory',
    'Category',
    'Tags',
    'Channels',
    'Catalogs',
    'Restrictions',
    'Base price',
    'Inventory value',
  ]

  const data = rows.map((row) => [
    row.title,
    row.sku ?? '',
    row.vendor ?? '',
    row.status,
    row.inventoryDescription,
    row.totalInventory ?? '',
    row.categories.join('; '),
    row.tags.join('; '),
    row.channelCount,
    row.catalogCount,
    row.restrictionCount,
    row.basePrice ?? '',
    row.inventoryValue ?? '',
  ])

  return [headers, ...data]
    .map((line) =>
      line
        .map((value) => {
          const stringValue = String(value ?? '')
          if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            return `"${stringValue.replace(/"/g, '""')}"`
          }
          return stringValue
        })
        .join(',')
    )
    .join('\n')
}

function splitCsvLine(line: string): string[] {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        current += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      values.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  values.push(current.trim())
  return values
}

function parseCsvContent(text: string): {headers: string[]; rows: Array<Record<string, string>>} {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return {headers: [], rows: []}
  }

  const headers = splitCsvLine(lines[0])
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line)
    const row: Record<string, string> = {}
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? ''
    })
    return row
  })

  return {headers, rows}
}

const TRUE_VALUES = new Set(['true', '1', 'yes', 'y'])
const FALSE_VALUES = new Set(['false', '0', 'no', 'n'])

function parseOptionalBoolean(raw: string | undefined): boolean | null {
  if (raw === undefined) return null
  const normalized = raw.trim().toLowerCase()
  if (!normalized) return null
  if (TRUE_VALUES.has(normalized)) return true
  if (FALSE_VALUES.has(normalized)) return false
  return null
}

function computeMetrics(rows: ProductRow[]): Metrics {
  if (rows.length === 0) {
    return {sellThroughRate: null, lowOrOutCount: 0, trackedCount: 0, inventoryValue: null}
  }

  const trackedRows = rows.filter((row) => row.inventoryTracked && row.totalInventory !== null)
  const soldOutTracked = trackedRows.filter((row) => (row.totalInventory ?? 0) === 0)
  const sellThroughRate = trackedRows.length > 0 ? soldOutTracked.length / trackedRows.length : null
  const lowOrOutCount = rows.filter((row) => row.inventoryStatus === 'low' || row.inventoryStatus === 'out').length
  const inventoryValue = rows.reduce<number>((sum, row) => sum + (row.inventoryValue ?? 0), 0)

  return {
    sellThroughRate,
    lowOrOutCount,
    trackedCount: trackedRows.length,
    inventoryValue: Number.isFinite(inventoryValue) ? inventoryValue : null,
  }
}

function percentDisplay(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—'
  return `${(value * 100).toFixed(1)}%`
}

function inventoryMessage(lowOrOutCount: number): string {
  if (lowOrOutCount === 0) return 'Fully stocked'
  if (lowOrOutCount === 1) return '1 product needs attention'
  return `${lowOrOutCount} products need attention`
}

function hasActiveFilters(
  searchTerm: string,
  vendors: Set<string>,
  tags: Set<string>,
  statuses: Set<string>,
  inventories: Set<InventoryStatus>
): boolean {
  return Boolean(searchTerm.trim()) || vendors.size > 0 || tags.size > 0 || statuses.size > 0 || inventories.size > 0
}

const inventoryFilterLabels: Record<InventoryStatus, string> = {
  not_tracked: 'Inventory not tracked',
  out: 'Out of stock',
  low: 'Low stock',
  in: 'In stock',
}

const ProductListDashboard = forwardRef<HTMLDivElement | null, Record<string, never>>(function ProductListDashboard(
  _props,
  ref
) {
  const client = useClient({apiVersion: '2024-10-01'})
  const router = useRouter()
  const toast = useToast()

  const [rawProducts, setRawProducts] = useState<RawProduct[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [vendorFilters, setVendorFilters] = useState<Set<string>>(new Set())
  const [tagFilters, setTagFilters] = useState<Set<string>>(new Set())
  const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set())
  const [inventoryFilters, setInventoryFilters] = useState<Set<InventoryStatus>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [timeframe, setTimeframe] = useState<'30' | '60' | '90' | '365'>('30')
  const [savedViews, setSavedViews] = useState<SavedView[]>([])
  const [activeViewId, setActiveViewId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<boolean>(false)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  const normalizedProducts = useMemo(() => rawProducts.map(normalizeProduct), [rawProducts])

  const uniqueVendors = useMemo(() => {
    const values = new Set<string>()
    normalizedProducts.forEach((product) => {
      if (product.vendor) values.add(product.vendor)
    })
    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [normalizedProducts])

  const uniqueTags = useMemo(() => {
    const values = new Set<string>()
    normalizedProducts.forEach((product) => {
      product.tags.forEach((tag) => values.add(tag))
    })
    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [normalizedProducts])

  const uniqueStatuses = useMemo(() => {
    const values = new Set<string>()
    normalizedProducts.forEach((product) => {
      if (product.status) values.add(product.status)
    })
    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [normalizedProducts])

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()

    return normalizedProducts.filter((product) => {
      if (term && !product.searchIndex.includes(term)) return false
      if (vendorFilters.size > 0 && (!product.vendor || !vendorFilters.has(product.vendor))) return false
      if (tagFilters.size > 0 && !product.tags.some((tag) => tagFilters.has(tag))) return false
      if (statusFilters.size > 0 && !statusFilters.has(product.status)) return false
      if (inventoryFilters.size > 0 && !inventoryFilters.has(product.inventoryStatus)) return false
      return true
    })
  }, [normalizedProducts, searchTerm, vendorFilters, tagFilters, statusFilters, inventoryFilters])

  const timeframeRows = useMemo(() => {
    const days = Number(timeframe)
    if (!Number.isFinite(days) || days <= 0) return normalizedProducts
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    return normalizedProducts.filter((product) => {
      if (!product.updatedAtValue) return true
      return product.updatedAtValue >= cutoff
    })
  }, [normalizedProducts, timeframe])

  const metrics = useMemo(() => computeMetrics(timeframeRows), [timeframeRows])

  useEffect(() => {
    let isMounted = true
    async function fetchProducts() {
      setLoading(true)
      setError(null)
      try {
        const results: RawProduct[] = await client.fetch(PRODUCT_LIST_QUERY)
        if (!isMounted) return
        setRawProducts(results)
      } catch (err) {
        if (!isMounted) return
        console.error('Failed to load products', err)
        setError(
          (err as Error)?.message || 'Unable to load products. Please try again or check your connection.'
        )
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    fetchProducts()

    return () => {
      isMounted = false
    }
  }, [client])

  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set<string>()
      filteredProducts.forEach((product) => {
        if (prev.has(product.id)) next.add(product.id)
      })
      return next
    })
  }, [filteredProducts])

  const toggleSetValue = useCallback(<T,>(set: Dispatch<SetStateAction<Set<T>>>, value: T) => {
    set((prev) => {
      const next = new Set(prev)
      if (next.has(value)) {
        next.delete(value)
      } else {
        next.add(value)
      }
      return next
    })
  }, [])

  const handleResetFilters = useCallback(() => {
    setSearchTerm('')
    setVendorFilters(new Set())
    setTagFilters(new Set())
    setStatusFilters(new Set())
    setInventoryFilters(new Set())
    setActiveViewId(null)
  }, [])

  const handleSelect = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }, [])

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      setSelectedIds(() => {
        if (!checked) return new Set()
        return new Set(filteredProducts.map((product) => product.id))
      })
    },
    [filteredProducts]
  )

  const handleImportClick = useCallback(() => {
    importInputRef.current?.click()
  }, [])

  const handleImportFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0]
      event.currentTarget.value = ''
      if (!file) return

      try {
        setActionLoading(true)
        const text = await file.text()
        const parsed = parseCsvContent(text)

        if (parsed.headers.length === 0 || parsed.rows.length === 0) {
          toast.push({
            status: 'warning',
            title: 'No data found',
            description: 'The selected file did not contain any rows.',
          })
          return
        }

        const headerNames = parsed.headers.map((header) => header.trim())
        const normalizedHeaders = headerNames.map((header) => header.toLowerCase())
        const idIndex = normalizedHeaders.findIndex((header) => header === 'sanity id' || header === '_id' || header === 'id')
        const skuIndex = normalizedHeaders.findIndex((header) => header === 'sku')
        const installIndex = normalizedHeaders.findIndex((header) => header === 'install only' || header === 'install_only')

        if (installIndex === -1) {
          toast.push({
            status: 'warning',
            title: 'Install Only column missing',
            description: 'Include an "Install Only" column with TRUE or FALSE values to apply updates.',
          })
          return
        }

        if (idIndex === -1 && skuIndex === -1) {
          toast.push({
            status: 'warning',
            title: 'Identifier column missing',
            description: 'Include a "Sanity ID" or "SKU" column so products can be matched.',
          })
          return
        }

        const skuLookup = new Map<string, string>()
        rawProducts.forEach((product) => {
          if (product.sku) {
            skuLookup.set(product.sku.toLowerCase(), product._id)
          }
        })

        const updates = new Map<string, boolean>()
        parsed.rows.forEach((row) => {
          const idHeader = idIndex >= 0 ? headerNames[idIndex] : null
          const skuHeader = skuIndex >= 0 ? headerNames[skuIndex] : null
          const installHeader = headerNames[installIndex]

          let productId = idHeader ? row[idHeader]?.trim() : ''
          if (!productId && skuHeader) {
            const skuValue = row[skuHeader]?.trim().toLowerCase()
            if (skuValue && skuLookup.has(skuValue)) {
              productId = skuLookup.get(skuValue) || ''
            }
          }

          if (!productId) return

          const installRaw = row[installHeader]
          const installValue = parseOptionalBoolean(installRaw)
          if (installValue === null) return

          updates.set(productId, installValue)
        })

        if (updates.size === 0) {
          toast.push({
            status: 'warning',
            title: 'No valid updates detected',
            description: 'Ensure Install Only values are provided as TRUE or FALSE.',
          })
          return
        }

        let transaction = client.transaction()
        updates.forEach((value, id) => {
          transaction = transaction.patch(id, {set: {installOnly: value}})
        })
        await transaction.commit({autoGenerateArrayKeys: true})

        setRawProducts((prev) =>
          prev.map((product) => (updates.has(product._id) ? {...product, installOnly: updates.get(product._id)} : product))
        )

        toast.push({
          status: 'success',
          title: 'Import applied',
          description: `Updated install-only status for ${updates.size} product${updates.size === 1 ? '' : 's'}.`,
        })
      } catch (err) {
        console.error('Import failed', err)
        toast.push({
          status: 'error',
          title: 'Import failed',
          description: (err as Error)?.message || 'Unable to process the selected file.',
        })
      } finally {
        setActionLoading(false)
      }
    },
    [client, rawProducts, toast]
  )

  const handleExport = useCallback(() => {
    const rows = selectedIds.size > 0
      ? filteredProducts.filter((product) => selectedIds.has(product.id))
      : filteredProducts

    if (rows.length === 0) {
      toast.push({status: 'warning', title: 'No products to export', description: 'Adjust your filters and try again.'})
      return
    }

    const csv = buildCsv(rows)
    const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'})
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `products-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast.push({
      status: 'success',
      title: 'Export created',
      description: `Downloaded ${rows.length} product${rows.length === 1 ? '' : 's'}.`,
    })
  }, [filteredProducts, selectedIds, toast])

  const handleAddProduct = useCallback(() => {
    router.navigateIntent('create', {type: 'product'})
  }, [router])

  const handleOpenProduct = useCallback(
    (id: string) => {
      router.navigateIntent('edit', {id, type: 'product'})
    },
    [router]
  )

  const handleSetInstallOnly = useCallback(
    async (value: boolean) => {
      if (selectedIds.size === 0) return
      setActionLoading(true)
      try {
        let transaction = client.transaction()
        selectedIds.forEach((id) => {
          transaction = transaction.patch(id, {set: {installOnly: value}})
        })
        await transaction.commit({autoGenerateArrayKeys: true})
        setRawProducts((prev) =>
          prev.map((product) => (selectedIds.has(product._id) ? {...product, installOnly: value} : product))
        )
        toast.push({
          status: 'success',
          title: value ? 'Marked as install only' : 'Install-only removed',
          description: `${selectedIds.size} product${selectedIds.size === 1 ? '' : 's'} updated.`,
        })
      } catch (err) {
        console.error('Failed to update installOnly', err)
        toast.push({
          status: 'error',
          title: 'Bulk update failed',
          description: (err as Error)?.message || 'Unable to update products. Please try again.',
        })
      } finally {
        setActionLoading(false)
      }
    },
    [client, selectedIds, toast]
  )

  const handleSaveView = useCallback(() => {
    const name = prompt('Name this view')?.trim()
    if (!name) return

    const newView: SavedView = {
      id: createViewId(),
      name,
      searchTerm,
      vendors: Array.from(vendorFilters),
      tags: Array.from(tagFilters),
      statuses: Array.from(statusFilters),
      inventories: Array.from(inventoryFilters),
    }

    setSavedViews((prev) => [...prev.filter((view) => view.name !== name), newView])
    setActiveViewId(newView.id)
    toast.push({status: 'success', title: 'View saved', description: `Saved filters as "${name}".`})
  }, [inventoryFilters, searchTerm, statusFilters, tagFilters, toast, vendorFilters])

  const applySavedView = useCallback((view: SavedView) => {
    setSearchTerm(view.searchTerm)
    setVendorFilters(new Set(view.vendors))
    setTagFilters(new Set(view.tags))
    setStatusFilters(new Set(view.statuses))
    setInventoryFilters(new Set(view.inventories))
    setActiveViewId(view.id)
  }, [])

  const savedViewMenu = (
    <Menu>
      {savedViews.length === 0 ? (
        <MenuItem text="No saved views" disabled />
      ) : (
        savedViews.map((view) => (
          <MenuItem
            key={view.id}
            text={view.name}
            icon={activeViewId === view.id ? CheckmarkIcon : undefined}
            onClick={() => applySavedView(view)}
          />
        ))
      )}
    </Menu>
  )

  const activeFilters = hasActiveFilters(searchTerm, vendorFilters, tagFilters, statusFilters, inventoryFilters)
  const allSelected = filteredProducts.length > 0 && filteredProducts.every((product) => selectedIds.has(product.id))
  const partiallySelected = selectedIds.size > 0 && !allSelected

  return (
    <Flex ref={ref} direction="column" height="fill" style={{background: '#f8fafc'}}>
      <input
        ref={importInputRef}
        type="file"
        accept=".csv"
        style={{display: 'none'}}
        onChange={handleImportFile}
      />
      <Box padding={5} style={{flex: '1 1 auto', overflow: 'auto'}}>
        <Stack space={5}>
          <Flex align="flex-start" justify="space-between" wrap="wrap" gap={4}>
            <Stack space={3} style={{minWidth: 240}}>
              <Text size={1} muted>
                Catalog
              </Text>
              <Text size={4} weight="semibold">
                Products
              </Text>
              <Text muted size={1}>
                Monitor inventory health, sales readiness, and merchandising coverage across all channels.
              </Text>
            </Stack>
            <Flex gap={2} align="center" wrap="wrap">
              <Button
                text="Export"
                mode="ghost"
                onClick={handleExport}
                disabled={filteredProducts.length === 0 || loading}
              />
              <Button
                text="Import"
                mode="ghost"
                onClick={handleImportClick}
                disabled={loading || actionLoading}
                tone="default"
                title="Import install-only settings from CSV"
              />
              <MenuButton
                id="product-dashboard-more-actions"
                button={<Button text="More actions" mode="ghost" disabled={selectedIds.size === 0 || actionLoading} />}
                menu={
                  <Menu>
                    <MenuItem
                      text="Mark install-only"
                      disabled={selectedIds.size === 0 || actionLoading}
                      onClick={() => handleSetInstallOnly(true)}
                    />
                    <MenuItem
                      text="Remove install-only"
                      disabled={selectedIds.size === 0 || actionLoading}
                      onClick={() => handleSetInstallOnly(false)}
                    />
                  </Menu>
                }
              />
              <Button
                tone="primary"
                text="Add product"
                icon={AddIcon}
                onClick={handleAddProduct}
              />
            </Flex>
          </Flex>

          <Card padding={4} radius={4} shadow={1} tone="transparent" style={{border: '1px solid var(--card-border-color)'}}>
            <Stack space={4}>
              <Flex align="center" justify="space-between" wrap="wrap" gap={3}>
                <Flex align="center" gap={3} wrap="wrap" style={{flex: '1 1 480px'}}>
                  <Box style={{flex: '1 1 280px', minWidth: 240}}>
                    <TextInput
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.currentTarget.value)}
                      placeholder="Search products"
                      icon={SearchIcon}
                    />
                  </Box>
                  <MenuButton
                    id="product-filter-vendors"
                    button={<Button text="Vendors" mode="ghost" icon={FilterIcon} />}
                    menu={
                      <Menu>
                        {uniqueVendors.length === 0 ? (
                          <MenuItem text="No vendors available" disabled />
                        ) : (
                          uniqueVendors.map((vendor) => (
                            <MenuItem
                              key={vendor}
                              text={vendor}
                              icon={vendorFilters.has(vendor) ? CheckmarkIcon : undefined}
                              onClick={() => toggleSetValue(setVendorFilters, vendor)}
                            />
                          ))
                        )}
                      </Menu>
                    }
                  />
                  <MenuButton
                    id="product-filter-tags"
                    button={<Button text="Tagged with" mode="ghost" icon={FilterIcon} />}
                    menu={
                      <Menu>
                        {uniqueTags.length === 0 ? (
                          <MenuItem text="No tags available" disabled />
                        ) : (
                          uniqueTags.map((tag) => (
                            <MenuItem
                              key={tag}
                              text={tag}
                              icon={tagFilters.has(tag) ? CheckmarkIcon : undefined}
                              onClick={() => toggleSetValue(setTagFilters, tag)}
                            />
                          ))
                        )}
                      </Menu>
                    }
                  />
                  <MenuButton
                    id="product-filter-status"
                    button={<Button text="Statuses" mode="ghost" icon={FilterIcon} />}
                    menu={
                      <Menu>
                        {uniqueStatuses.length === 0 ? (
                          <MenuItem text="No status options" disabled />
                        ) : (
                          uniqueStatuses.map((status) => (
                            <MenuItem
                              key={status}
                              text={status}
                              icon={statusFilters.has(status) ? CheckmarkIcon : undefined}
                              onClick={() => toggleSetValue(setStatusFilters, status)}
                            />
                          ))
                        )}
                      </Menu>
                    }
                  />
                  <MenuButton
                    id="product-filter-inventory"
                    button={<Button text="Add filter" mode="ghost" icon={FilterIcon} />}
                    menu={
                      <Menu>
                        {(Object.keys(inventoryFilterLabels) as InventoryStatus[]).map((status) => (
                          <MenuItem
                            key={status}
                            text={inventoryFilterLabels[status]}
                            icon={inventoryFilters.has(status) ? CheckmarkIcon : undefined}
                            onClick={() => toggleSetValue(setInventoryFilters, status)}
                          />
                        ))}
                      </Menu>
                    }
                  />
                </Flex>
                <Flex align="center" gap={2} wrap="wrap">
                  <MenuButton
                    id="product-saved-views"
                    button={<Button text="Saved views" mode="ghost" />}
                    menu={savedViewMenu}
                  />
                  <Button text="Cancel" mode="ghost" onClick={handleResetFilters} disabled={!activeFilters} />
                  <Button text="Save as" mode="ghost" onClick={handleSaveView} />
                </Flex>
              </Flex>

              {activeFilters && (
                <Inline space={2} style={{flexWrap: 'wrap'}}>
                  {Array.from(vendorFilters).map((vendor) => (
                    <Card key={`vendor-${vendor}`} paddingX={2} paddingY={1} tone="primary" radius={3} border>
                      <Inline space={2} align="center">
                        <Text size={1}>Vendor: {vendor}</Text>
                        <Button
                          icon={CloseIcon}
                          mode="bleed"
                          onClick={() => toggleSetValue(setVendorFilters, vendor)}
                        />
                      </Inline>
                    </Card>
                  ))}
                  {Array.from(tagFilters).map((tag) => (
                    <Card key={`tag-${tag}`} paddingX={2} paddingY={1} tone="primary" radius={3} border>
                      <Inline space={2} align="center">
                        <Text size={1}>Tag: {tag}</Text>
                        <Button
                          icon={CloseIcon}
                          mode="bleed"
                          onClick={() => toggleSetValue(setTagFilters, tag)}
                        />
                      </Inline>
                    </Card>
                  ))}
                  {Array.from(statusFilters).map((status) => (
                    <Card key={`status-${status}`} paddingX={2} paddingY={1} tone="primary" radius={3} border>
                      <Inline space={2} align="center">
                        <Text size={1}>Status: {status}</Text>
                        <Button
                          icon={CloseIcon}
                          mode="bleed"
                          onClick={() => toggleSetValue(setStatusFilters, status)}
                        />
                      </Inline>
                    </Card>
                  ))}
                  {Array.from(inventoryFilters).map((status) => (
                    <Card key={`inventory-${status}`} paddingX={2} paddingY={1} tone="primary" radius={3} border>
                      <Inline space={2} align="center">
                        <Text size={1}>{inventoryFilterLabels[status]}</Text>
                        <Button
                          icon={CloseIcon}
                          mode="bleed"
                          onClick={() => toggleSetValue(setInventoryFilters, status)}
                        />
                      </Inline>
                    </Card>
                  ))}
                </Inline>
              )}

              <Grid columns={[1, 1, 3]} gap={3}>
                <Card padding={3} radius={3} shadow={1} tone="transparent" style={{border: '1px solid var(--card-border-color)'}}>
                  <Stack space={2}>
                    <Flex align="center" justify="space-between">
                      <Text size={1} muted>
                        Average sell-through rate
                      </Text>
                      <Select
                        value={timeframe}
                        onChange={(event) => setTimeframe(event.currentTarget.value as typeof timeframe)}
                        style={{maxWidth: 120}}
                      >
                        <option value="30">30 days</option>
                        <option value="60">60 days</option>
                        <option value="90">90 days</option>
                        <option value="365">12 months</option>
                      </Select>
                    </Flex>
                    <Text size={4} weight="bold">
                      {percentDisplay(metrics.sellThroughRate)}
                    </Text>
                    <Text size={1} muted>
                      Based on tracked inventory products updated within the selected timeframe.
                    </Text>
                  </Stack>
                </Card>
                <Card padding={3} radius={3} shadow={1} tone="transparent" style={{border: '1px solid var(--card-border-color)'}}>
                  <Stack space={2}>
                    <Text size={1} muted>
                      Products by days of inventory remaining
                    </Text>
                    <Text size={4} weight="bold">
                      {metrics.trackedCount > 0 ? `${metrics.trackedCount} tracked` : 'No data'}
                    </Text>
                    <Text size={1} muted>
                      {inventoryMessage(metrics.lowOrOutCount)}
                    </Text>
                  </Stack>
                </Card>
                <Card padding={3} radius={3} shadow={1} tone="transparent" style={{border: '1px solid var(--card-border-color)'}}>
                  <Stack space={2}>
                    <Text size={1} muted>
                      ABC product analysis
                    </Text>
                    <Text size={4} weight="bold">
                      {metrics.inventoryValue !== null
                        ? currencyFormatter.format(metrics.inventoryValue)
                        : '—'}
                    </Text>
                    <Text size={1} muted>
                      Estimated inventory value across tracked items.
                    </Text>
                  </Stack>
                </Card>
              </Grid>
            </Stack>
          </Card>

          {loading ? (
            <Card padding={4} radius={4} tone="transparent">
              <Flex align="center" justify="center" padding={4}>
                <Spinner muted />
              </Flex>
            </Card>
          ) : error ? (
            <Card padding={4} radius={4} tone="critical">
              <Text>{error}</Text>
            </Card>
          ) : filteredProducts.length === 0 ? (
            <Card padding={4} radius={4} tone="transparent">
              <Text muted>No products match the current filters.</Text>
            </Card>
          ) : (
            <Card
              padding={0}
              radius={4}
              shadow={1}
              tone="transparent"
              style={{overflowX: 'auto', border: '1px solid var(--card-border-color)', background: ROW_BACKGROUND}}
            >
              <Box style={{borderBottom: '1px solid var(--card-border-color)'}}>
                <Flex
                  style={{
                    padding: '12px 16px',
                    display: 'grid',
                    gridTemplateColumns: GRID_TEMPLATE_COLUMNS,
                    gap: `${GRID_COLUMN_GAP}px`,
                    fontSize: 12,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--card-muted-fg-color)',
                    width: '100%',
                    minWidth: `${TABLE_MIN_WIDTH}px`,
                    background: HEADER_BACKGROUND,
                    alignItems: 'center',
                  }}
                >
                  <span
                    style={{
                      position: 'sticky',
                      left: 0,
                      zIndex: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '100%',
                      background: STICKY_COLUMN_BACKGROUND,
                      boxShadow: 'inset -1px 0 0 rgba(148, 163, 184, 0.24)',
                    }}
                  >
                    <Checkbox
                      checked={allSelected}
                      indeterminate={partiallySelected}
                      onChange={(event) => handleSelectAll(event.currentTarget.checked)}
                    />
                  </span>
                  <span
                    style={{
                      position: 'sticky',
                      left: STICKY_PRODUCT_LEFT,
                      zIndex: 3,
                      display: 'flex',
                      alignItems: 'center',
                      height: '100%',
                      background: STICKY_COLUMN_BACKGROUND,
                      boxShadow: 'inset -1px 0 0 rgba(148, 163, 184, 0.24)',
                    }}
                  >
                    Product
                  </span>
                  <span style={{display: 'flex', alignItems: 'center', height: '100%'}}>Status</span>
                  <span style={{display: 'flex', alignItems: 'center', height: '100%'}}>Inventory</span>
                  <span style={{display: 'flex', alignItems: 'center', height: '100%'}}>Category</span>
                  <span style={{display: 'flex', alignItems: 'center', height: '100%'}}>Channels</span>
                  <span style={{display: 'flex', alignItems: 'center', height: '100%'}}>Catalogs</span>
                  <span style={{display: 'flex', alignItems: 'center', height: '100%'}}>Restrictions</span>
                </Flex>
              </Box>
              <Box>
                {filteredProducts.map((product) => {
                  const isSelected = selectedIds.has(product.id)
                  const rowBackground = isSelected ? ROW_SELECTED_BACKGROUND : ROW_BACKGROUND
                  const rowBoxShadow = isSelected ? 'inset 0 0 0 1px rgba(37, 99, 235, 0.25)' : 'none'

                  return (
                    <Flex
                      key={product.id}
                      onClick={() => handleOpenProduct(product.id)}
                      style={{
                        padding: '16px',
                        display: 'grid',
                        gridTemplateColumns: GRID_TEMPLATE_COLUMNS,
                        gap: `${GRID_COLUMN_GAP}px`,
                        alignItems: 'stretch',
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--card-border-color)',
                        width: '100%',
                        minWidth: `${TABLE_MIN_WIDTH}px`,
                        minHeight: ROW_MIN_HEIGHT,
                        background: rowBackground,
                        boxShadow: rowBoxShadow,
                        transition: 'background-color 120ms ease',
                      }}
                    >
                      <span
                        onClick={(event) => {
                          event.stopPropagation()
                        }}
                        style={{
                          position: 'sticky',
                          left: 0,
                          zIndex: 4,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          height: '100%',
                          background: STICKY_COLUMN_BACKGROUND,
                          boxShadow: 'inset -1px 0 0 rgba(148, 163, 184, 0.24)',
                        }}
                      >
                        <Checkbox
                          checked={isSelected}
                          onChange={(event) => handleSelect(product.id, event.currentTarget.checked)}
                        />
                      </span>
                      <span
                        style={{
                          position: 'sticky',
                          left: STICKY_PRODUCT_LEFT,
                          zIndex: 3,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-start',
                          gap: 12,
                          background: STICKY_COLUMN_BACKGROUND,
                          padding: '4px 0',
                          boxShadow: 'inset -1px 0 0 rgba(148, 163, 184, 0.24)',
                        }}
                      >
                        <span
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 8,
                            overflow: 'hidden',
                            background: '#e2e8f0',
                            flexShrink: 0,
                          }}
                        >
                          {product.previewImageUrl ? (
                            <img
                              src={`${product.previewImageUrl}?w=96&h=96&fit=crop`}
                              alt={product.title}
                              style={{width: '100%', height: '100%', objectFit: 'cover'}}
                            />
                          ) : (
                            <Flex align="center" justify="center" style={{width: '100%', height: '100%'}}>
                              <Text weight="bold" size={2} muted>
                                {product.title.charAt(0).toUpperCase()}
                              </Text>
                            </Flex>
                          )}
                        </span>
                        <span style={{display: 'flex', flexDirection: 'column', gap: 4}}>
                          <Text weight="semibold" size={2} style={{color: '#0f172a'}}>
                            {product.title}
                          </Text>
                          <Text size={1} muted>
                            {product.vendor ? product.vendor : 'No vendor'}
                            {product.sku ? ` · ${product.sku}` : ''}
                          </Text>
                          {product.tags.length > 0 && (
                            <Inline space={1} style={{flexWrap: 'wrap'}}>
                              {product.tags.slice(0, 3).map((tag) => (
                                <Card key={tag} paddingX={2} paddingY={1} radius={2} tone="transparent" border>
                                  <Text size={0}>{tag}</Text>
                                </Card>
                              ))}
                              {product.tags.length > 3 && (
                                <Card paddingX={2} paddingY={1} radius={2} tone="transparent" border>
                                  <Text size={0}>+{product.tags.length - 3}</Text>
                                </Card>
                              )}
                            </Inline>
                          )}
                        </span>
                      </span>
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-start',
                          minHeight: ROW_MIN_HEIGHT,
                        }}
                      >
                        <Badge tone={product.statusTone} mode="outline">
                          {product.status}
                        </Badge>
                      </span>
                      <span
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          gap: 4,
                        }}
                      >
                        <Text size={1}>{product.inventoryDescription}</Text>
                        {!product.inventoryTracked && (
                          <Text size={0} muted>
                            Tracking disabled
                          </Text>
                        )}
                      </span>
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          minHeight: ROW_MIN_HEIGHT,
                        }}
                      >
                        <Text size={1}>{product.categoryLabel}</Text>
                      </span>
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          minHeight: ROW_MIN_HEIGHT,
                        }}
                      >
                        <Text size={1}>{product.channelCount}</Text>
                      </span>
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          minHeight: ROW_MIN_HEIGHT,
                        }}
                      >
                        <Text size={1}>{product.catalogCount}</Text>
                      </span>
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          minHeight: ROW_MIN_HEIGHT,
                        }}
                      >
                        <Text size={1}>{product.restrictionCount}</Text>
                        {product.installOnly && <Badge tone="caution">Install only</Badge>}
                      </span>
                    </Flex>
                  )
                })}
              </Box>
            </Card>
          )}
        </Stack>
      </Box>
    </Flex>
  )
})

export default ProductListDashboard
