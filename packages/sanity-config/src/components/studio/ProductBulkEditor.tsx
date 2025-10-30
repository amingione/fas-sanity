import React, {useCallback, useEffect, useMemo, useState} from 'react'
import {Box, Button, Card, Flex, Inline, Spinner, Stack, Text, TextInput, Tooltip, useToast} from '@sanity/ui'
import {useClient} from 'sanity'
import {googleProductCategories} from '../../schemaTypes/constants/googleProductCategories'
import type {DerivedProductFeedFields, ProductAttribute, ProductOptionSet, ProductSpecification} from '../../utils/productFeed'
import {deriveProductFeedFields, detailsToStrings} from '../../utils/productFeed'

declare global {
  interface Window {
    __SITE_BASE_URL__?: string
  }
}

type ProductDoc = {
  _id: string
  title?: string
  slug?: {current?: string}
  sku?: string
  mpn?: string
  price?: number
  salePrice?: number
  onSale?: boolean
  availability?: 'in_stock' | 'out_of_stock' | 'preorder' | 'backorder'
  condition?: 'new' | 'refurbished' | 'used'
  manualInventoryCount?: number
  taxBehavior?: 'taxable' | 'exempt'
  taxCode?: string
  shippingWeight?: number
  boxDimensions?: string
  brand?: string
  canonicalUrl?: string
  seo?: {
    canonicalUrl?: string | null
  } | null
  googleProductCategory?: string
  installOnly?: boolean
  shippingLabel?: string
  productHighlights?: string[]
  productDetails?: string[]
  specifications?: ProductSpecification[] | null
  attributes?: ProductAttribute[] | null
  options?: ProductOptionSet[] | null
  color?: string
  size?: string
  material?: string
  productLength?: string
  productWidth?: string
  shortDescription?: any
  description?: any
  images?: string[]
  categories?: string[]
}

type EditableProduct = ProductDoc & {
  _key: string
  derivedFeed?: DerivedProductFeedFields
  isSaving?: boolean
  dirty?: boolean
}

import {readStudioEnv} from '../../utils/studioEnv'

const readEnv = (key: string): string | undefined =>
  readStudioEnv(key) ||
  (typeof window !== 'undefined' ? (window as any)?.__SITE_BASE_URL__ : undefined)

const SITE_BASE =
  readEnv('SANITY_STUDIO_SITE_BASE_URL') ||
  (typeof window !== 'undefined' ? window?.__SITE_BASE_URL__ : undefined) ||
  'https://fasmotorsports.com'

function portableTextToPlain(blocks: any): string {
  if (!Array.isArray(blocks)) return ''
  return blocks
    .map((block) => {
      if (block?._type !== 'block' || !Array.isArray(block.children)) return ''
      return block.children.map((child: any) => child?.text || '').join('')
    })
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

function sanitizeNumber(value: string, fallback?: number): number | undefined {
  if (value === '') return undefined
  const num = Number(value)
  if (Number.isFinite(num)) return num
  return fallback
}

function buildProductLink(product: ProductDoc): string {
  const canonical = product.canonicalUrl || product.seo?.canonicalUrl || ''
  if (canonical) return canonical
  const slug = product.slug?.current || ''
  if (!slug) return ''
  return `${SITE_BASE.replace(/\/$/, '')}/product/${slug}`
}

function formatExportPrice(price?: number): string | undefined {
  if (!Number.isFinite(price || NaN)) return undefined
  return `${price!.toFixed(2)} USD`
}

const EXPORT_FEED_HEADERS = [
  'id',
  'title',
  'description',
  'link',
  'image_link',
  'additional_image_link',
  'availability',
  'price',
  'condition',
  'manual_inventory_count',
  'brand',
  'mpn',
  'identifier_exists',
  'shipping_weight',
  'product_type',
  'google_product_category',
  'shipping_label',
  'product_highlight',
  'product_detail',
  'color',
  'size',
  'material',
  'product_length',
  'product_width',
]

type ApplyResult =
  | {type: 'update'; key: keyof EditableProduct; value: EditableProduct[keyof EditableProduct]}
  | {type: 'error'; message: string}
  | null

type SpreadsheetColumn = {
  header: string
  headerKey: string
  getValue: (product: EditableProduct) => string
  setValue?: (raw: string, product: EditableProduct) => ApplyResult
}

const TRUE_VALUES = new Set(['true', '1', 'yes', 'y'])
const FALSE_VALUES = new Set(['false', '0', 'no', 'n'])

const AVAILABILITY_VALUES: Record<string, 'in_stock' | 'out_of_stock' | 'preorder' | 'backorder'> = {
  in_stock: 'in_stock',
  'in stock': 'in_stock',
  out_of_stock: 'out_of_stock',
  'out of stock': 'out_of_stock',
  preorder: 'preorder',
  'pre-order': 'preorder',
  backorder: 'backorder',
  'back order': 'backorder',
}

const CONDITION_VALUES: Record<string, 'new' | 'refurbished' | 'used'> = {
  new: 'new',
  'brand new': 'new',
  refurbished: 'refurbished',
  're-furbished': 'refurbished',
  used: 'used',
}

const TAX_BEHAVIOR_VALUES = new Set(['taxable', 'exempt'])

function formatNumberCell(value?: number): string {
  return Number.isFinite(value ?? NaN) ? String(value) : ''
}

function formatBooleanCell(value?: boolean): string {
  if (value === undefined) return ''
  return value ? 'TRUE' : 'FALSE'
}

function parseNumberCell(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return {ok: true as const, value: undefined as number | undefined}
  const num = Number(trimmed)
  if (!Number.isFinite(num)) {
    return {ok: false as const, message: `Expected a number, received "${raw}".`}
  }
  return {ok: true as const, value: num}
}

function parseBooleanCell(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return {ok: true as const, value: undefined as boolean | undefined}
  const normalized = trimmed.toLowerCase()
  if (TRUE_VALUES.has(normalized)) return {ok: true as const, value: true}
  if (FALSE_VALUES.has(normalized)) return {ok: true as const, value: false}
  return {ok: false as const, message: `Expected TRUE/FALSE, received "${raw}".`}
}

function parseAvailabilityCell(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return {ok: true as const, value: undefined as 'in_stock' | 'out_of_stock' | 'preorder' | 'backorder' | undefined}
  const normalized = trimmed.toLowerCase()
  const mapped = AVAILABILITY_VALUES[normalized]
  if (mapped) return {ok: true as const, value: mapped}
  return {ok: false as const, message: `Availability must be one of In stock, Out of stock, Preorder, Backorder.`}
}

function parseConditionCell(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return {ok: true as const, value: undefined as 'new' | 'refurbished' | 'used' | undefined}
  const normalized = trimmed.toLowerCase()
  const mapped = CONDITION_VALUES[normalized]
  if (mapped) return {ok: true as const, value: mapped}
  return {ok: false as const, message: `Condition must be New, Refurbished, or Used.`}
}

function parseTaxBehaviorCell(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return {ok: true as const, value: undefined as 'taxable' | 'exempt' | undefined}
  const normalized = trimmed.toLowerCase()
  if (TAX_BEHAVIOR_VALUES.has(normalized)) {
    return {ok: true as const, value: normalized as 'taxable' | 'exempt'}
  }
  return {ok: false as const, message: `Tax behavior must be Taxable or Exempt.`}
}

function makeUpdate<K extends keyof EditableProduct>(key: K, value: EditableProduct[K]): ApplyResult {
  return {type: 'update', key, value}
}

const SPREADSHEET_COLUMNS: SpreadsheetColumn[] = [
  {
    header: 'Title',
    headerKey: 'title',
    getValue: (product) => product.title || '',
    setValue: (raw) => makeUpdate('title', raw.trim() as EditableProduct['title']),
  },
  {
    header: 'Sanity ID',
    headerKey: 'sanity id',
    getValue: (product) => product._id,
  },
  {
    header: 'SKU',
    headerKey: 'sku',
    getValue: (product) => product.sku || '',
    setValue: (raw) => {
      const next = raw.trim()
      return makeUpdate('sku', (next ? next : undefined) as EditableProduct['sku'])
    },
  },
  {
    header: 'Price',
    headerKey: 'price',
    getValue: (product) => formatNumberCell(product.price),
    setValue: (raw) => {
      const result = parseNumberCell(raw)
      if (!result.ok) return {type: 'error', message: result.message}
      return makeUpdate('price', result.value as EditableProduct['price'])
    },
  },
  {
    header: 'Sale Price',
    headerKey: 'sale price',
    getValue: (product) => formatNumberCell(product.salePrice),
    setValue: (raw) => {
      const result = parseNumberCell(raw)
      if (!result.ok) return {type: 'error', message: result.message}
      return makeUpdate('salePrice', result.value as EditableProduct['salePrice'])
    },
  },
  {
    header: 'On Sale',
    headerKey: 'on sale',
    getValue: (product) => formatBooleanCell(product.onSale),
    setValue: (raw) => {
      const result = parseBooleanCell(raw)
      if (!result.ok) return {type: 'error', message: result.message}
      if (result.value === undefined) return null
      return makeUpdate('onSale', result.value as EditableProduct['onSale'])
    },
  },
  {
    header: 'Availability',
    headerKey: 'availability',
    getValue: (product) => product.availability || '',
    setValue: (raw) => {
      const result = parseAvailabilityCell(raw)
      if (!result.ok) return {type: 'error', message: result.message}
      if (result.value === undefined) return null
      return makeUpdate('availability', result.value as EditableProduct['availability'])
    },
  },
  {
    header: 'Condition',
    headerKey: 'condition',
    getValue: (product) => product.condition || '',
    setValue: (raw) => {
      const result = parseConditionCell(raw)
      if (!result.ok) return {type: 'error', message: result.message}
      if (result.value === undefined) return null
      return makeUpdate('condition', result.value as EditableProduct['condition'])
    },
  },
  {
    header: 'Manual Inventory Count',
    headerKey: 'manual inventory count',
    getValue: (product) => formatNumberCell(product.manualInventoryCount),
    setValue: (raw) => {
      const result = parseNumberCell(raw)
      if (!result.ok) return {type: 'error', message: result.message}
      return makeUpdate('manualInventoryCount', result.value as EditableProduct['manualInventoryCount'])
    },
  },
  {
    header: 'Brand',
    headerKey: 'brand',
    getValue: (product) => product.brand || '',
    setValue: (raw) => {
      const next = raw.trim()
      return makeUpdate('brand', (next || undefined) as EditableProduct['brand'])
    },
  },
  {
    header: 'MPN',
    headerKey: 'mpn',
    getValue: (product) => product.mpn || '',
    setValue: (raw) => {
      const next = raw.trim()
      return makeUpdate('mpn', (next || undefined) as EditableProduct['mpn'])
    },
  },
  {
    header: 'Identifier Exists',
    headerKey: 'identifier exists',
    getValue: (product) => (product.mpn ? 'TRUE' : 'FALSE'),
  },
  {
    header: 'Tax Behavior',
    headerKey: 'tax behavior',
    getValue: (product) => product.taxBehavior || '',
    setValue: (raw) => {
      const result = parseTaxBehaviorCell(raw)
      if (!result.ok) return {type: 'error', message: result.message}
      return makeUpdate('taxBehavior', result.value as EditableProduct['taxBehavior'])
    },
  },
  {
    header: 'Tax Code',
    headerKey: 'tax code',
    getValue: (product) => product.taxCode || '',
    setValue: (raw) => {
      const next = raw.trim()
      return makeUpdate('taxCode', (next || undefined) as EditableProduct['taxCode'])
    },
  },
  {
    header: 'Shipping Weight',
    headerKey: 'shipping weight',
    getValue: (product) => formatNumberCell(product.shippingWeight),
    setValue: (raw) => {
      const result = parseNumberCell(raw)
      if (!result.ok) return {type: 'error', message: result.message}
      return makeUpdate('shippingWeight', result.value as EditableProduct['shippingWeight'])
    },
  },
  {
    header: 'Box Dimensions',
    headerKey: 'box dimensions',
    getValue: (product) => product.boxDimensions || '',
    setValue: (raw) => {
      const next = raw.trim()
      return makeUpdate('boxDimensions', (next || undefined) as EditableProduct['boxDimensions'])
    },
  },
  {
    header: 'Google Product Category',
    headerKey: 'google product category',
    getValue: (product) => product.googleProductCategory || '',
    setValue: (raw) => {
      const next = raw.trim()
      return makeUpdate('googleProductCategory', (next || undefined) as EditableProduct['googleProductCategory'])
    },
  },
  {
    header: 'Install Only',
    headerKey: 'install only',
    getValue: (product) => formatBooleanCell(product.installOnly),
    setValue: (raw) => {
      const result = parseBooleanCell(raw)
      if (!result.ok) return {type: 'error', message: result.message}
      if (result.value === undefined) return null
      return makeUpdate('installOnly', result.value as EditableProduct['installOnly'])
    },
  },
  {
    header: 'Shipping Label',
    headerKey: 'shipping label',
    getValue: (product) => product.shippingLabel || '',
    setValue: (raw) => {
      const next = raw.trim()
      return makeUpdate('shippingLabel', (next || undefined) as EditableProduct['shippingLabel'])
    },
  },
]

const SANITY_ID_COLUMN_INDEX = SPREADSHEET_COLUMNS.findIndex((column) => column.headerKey === 'sanity id')

type ParsedRow = {
  line: number
  values: Record<string, string>
}

  function filterProductsByTerm(products: EditableProduct[], term: string): EditableProduct[] {
  if (!term) return products
  const lower = term.toLowerCase()
  return products.filter((product) =>
    [product.title, product.sku, product._id]
      .filter(Boolean)
      .some((value) => value!.toString().toLowerCase().includes(lower))
  )
}

function buildSpreadsheetMatrix(products: EditableProduct[]): string[][] {
  const header = SPREADSHEET_COLUMNS.map((column) => column.header)
  const rows = products.map((product) => SPREADSHEET_COLUMNS.map((column) => column.getValue(product)))
  return [header, ...rows]
}

function matrixToParsedRows(matrix: string[][]): {ok: true; rows: ParsedRow[]} | {ok: false; error: string} {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    return {ok: false, error: 'Spreadsheet is empty.'}
  }

  const [headerRow, ...dataRows] = matrix
  if (!headerRow || headerRow.length === 0) {
    return {ok: false, error: 'Spreadsheet header row is empty.'}
  }

  const headerKeys = headerRow.map((cell) => cell.trim().toLowerCase())
  if (!headerKeys.includes('sanity id')) {
    return {ok: false, error: 'Spreadsheet must include a "Sanity ID" column.'}
  }

  const rows: ParsedRow[] = []
  dataRows.forEach((row, index) => {
    const values: Record<string, string> = {}
    headerKeys.forEach((key, colIndex) => {
      values[key] = (row?.[colIndex] ?? '').trim()
    })
    const hasContent = Object.values(values).some((value) => value.length > 0)
    if (hasContent) {
      rows.push({line: index + 2, values})
    }
  })

  if (rows.length === 0) {
    return {ok: false, error: 'Spreadsheet contains no editable rows.'}
  }

  return {ok: true, rows}
}

export default function ProductBulkEditor() {
  const client = useClient({apiVersion: '2024-04-10'})
  const toast = useToast()
  const [products, setProducts] = useState<EditableProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [savingAll, setSavingAll] = useState(false)
  const [viewMode, setViewMode] = useState<'table' | 'csv'>('table')
  const [sheetRows, setSheetRows] = useState<string[][]>([])
  const [sheetError, setSheetError] = useState<string | null>(null)
  const [sheetApplying, setSheetApplying] = useState(false)
  const [activeCell, setActiveCell] = useState<{row: number; col: number} | null>(null)
  const [selection, setSelection] = useState<{startRow: number; startCol: number; endRow: number; endCol: number} | null>(null)
  const [isDraggingSelection, setIsDraggingSelection] = useState(false)

  const headerCellStyle = {
    padding: '6px 10px',
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: '#111827',
    color: '#f9fafb',
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: 'nowrap' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    position: 'sticky' as const,
    top: 0,
    zIndex: 2,
  }

  const bodyCellBaseStyle = {
    border: '1px solid rgba(148, 163, 184, 0.25)',
    padding: 0,
    minWidth: 140,
    background: '#0f172a',
    position: 'relative' as const,
  }

  const inputStyle = {
    width: '100%',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    padding: '6px 8px',
    color: '#e5e7eb',
    fontSize: 13,
    fontFamily:
      'ui-monospace, SFMono-Regular, SFMono, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace',
  }

  useEffect(() => {
    let isMounted = true
    async function fetchProducts() {
      setLoading(true)
      try {
        const docs: ProductDoc[] = await client.fetch(
          `*[_type == "product"]{
            _id,
            title,
            slug,
            sku,
            mpn,
            price,
            salePrice,
            onSale,
            availability,
            condition,
            manualInventoryCount,
            taxBehavior,
            taxCode,
            installOnly,
            shippingLabel,
            shippingWeight,
            boxDimensions,
            brand,
            "canonicalUrl": coalesce(seo.canonicalUrl, canonicalUrl),
            "seo": {
              "canonicalUrl": seo.canonicalUrl
            },
            googleProductCategory,
            productHighlights,
            productDetails,
            specifications[]{
              label,
              value,
            },
            attributes[]{
              name,
              value,
            },
            options[]{
              _type,
              title,
              colors[]{
                title,
              },
              sizes[]{
                title,
              },
            },
            color,
            size,
            material,
            productLength,
            productWidth,
            shortDescription,
            description,
            "images": images[].asset->url,
            "categories": category[]->title
          }`
        )

        if (!isMounted) return

        const enriched: EditableProduct[] = docs.map((doc, idx) => ({
          ...doc,
          _key: doc._id || `idx-${idx}`,
          derivedFeed: deriveProductFeedFields(doc),
        }))
        setProducts(enriched)
      } catch (err) {
        console.error('ProductBulkEditor fetch failed', err)
        toast.push({status: 'error', title: 'Failed to load products', description: String((err as any)?.message || err)})
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    fetchProducts()
    return () => {
      isMounted = false
    }
  }, [client, toast])

  const filteredProducts = useMemo(() => filterProductsByTerm(products, searchTerm), [products, searchTerm])

  const handleSwitchToCsv = () => {
    setSheetError(null)
    setSheetRows(buildSpreadsheetMatrix(filteredProducts))
    setSelection(null)
    setActiveCell(null)
    setViewMode('csv')
  }

  const handleSwitchToTable = () => {
    setSheetError(null)
    setSelection(null)
    setActiveCell(null)
    setViewMode('table')
  }

  const handleRefreshCsv = () => {
    setSheetError(null)
    setSheetRows(buildSpreadsheetMatrix(filteredProducts))
    setSelection(null)
  }

  const handleApplyCsv = () => {
    setSheetApplying(true)
    setSheetError(null)
    const parsed = matrixToParsedRows(sheetRows)
    if (!parsed.ok) {
      setSheetError(parsed.error)
      setSheetApplying(false)
      return
    }

    const rowMap = new Map<string, ParsedRow>()
    parsed.rows.forEach((row) => {
      const id = row.values['sanity id']
      if (id) rowMap.set(id, row)
    })

    if (rowMap.size === 0) {
      setSheetError('Provide at least one row with a "Sanity ID" value.')
      setSheetApplying(false)
      return
    }

    const productIdSet = new Set(products.map((product) => product._id))
    const missing: string[] = []
    rowMap.forEach((_row, id) => {
      if (!productIdSet.has(id)) missing.push(id)
    })

    const errors: string[] = []
    let updatedCount = 0
    const updatedProducts = products.map((product) => {
      const row = rowMap.get(product._id)
      if (!row) return product

      const patches: Partial<EditableProduct> = {}
      let rowChanged = false
      let rowError = false

      for (const column of SPREADSHEET_COLUMNS) {
        if (!column.setValue) continue
        const rawValue = row.values[column.headerKey] ?? ''
        const result = column.setValue(rawValue, product)
        if (!result) continue
        if (result.type === 'error') {
          errors.push(`Row ${row.line}: ${result.message}`)
          rowError = true
          break
        }
        const {key, value} = result
        if (Object.is(product[key], value)) continue
        ;(patches as any)[key] = value
        rowChanged = true
      }

      if (rowError) return product
      if (!rowChanged) return product

      updatedCount += 1
      const nextProduct: EditableProduct = {
        ...product,
        ...patches,
        dirty: true,
        isSaving: false,
      }
      nextProduct.derivedFeed = deriveProductFeedFields(nextProduct)
      return nextProduct
    })

    if (errors.length > 0) {
      setSheetError(errors.join('\n'))
      setSheetApplying(false)
      return
    }

    if (updatedCount === 0) {
      setSheetApplying(false)
      toast.push({status: 'info', title: 'No changes detected in CSV data'})
      if (missing.length > 0) {
        toast.push({status: 'warning', title: 'Rows skipped', description: `No product found for ${missing.join(', ')}`})
      }
      return
    }

    setProducts(updatedProducts)
    const refreshed = filterProductsByTerm(updatedProducts, searchTerm)
    setSheetRows(buildSpreadsheetMatrix(refreshed))
    setSheetApplying(false)
    toast.push({
      status: 'success',
      title: `Applied CSV changes to ${updatedCount} product${updatedCount === 1 ? '' : 's'}`,
    })

    if (missing.length > 0) {
      toast.push({status: 'warning', title: 'Rows skipped', description: missing.join(', ')})
    }
  }

  const updateSheetCell = (row: number, col: number, value: string) => {
    setSheetRows((prev) => {
      if (!Array.isArray(prev) || !prev[row]) return prev
      const next = prev.map((cells, rowIndex) => (rowIndex === row ? [...cells] : [...cells]))
      next[row][col] = value
      return next
    })
  }

  const handleCellChange = (row: number, col: number, value: string) => {
    setSheetError(null)
    updateSheetCell(row, col, value)
  }

  const handleCellPaste = (event: React.ClipboardEvent<HTMLInputElement>, row: number, col: number) => {
    if (row === 0) return
    setSheetError(null)
    const text = event.clipboardData?.getData('text')
    if (!text) return
    const sanitized = text.replace(/\r/g, '')
    const lines = sanitized.split('\n').filter((line) => line.length > 0)
    if (lines.length === 0) return
    const hasMultiple = lines.length > 1 || lines[0].includes('\t') || lines[0].includes(',')
    if (!hasMultiple) return
    event.preventDefault()
    setSheetRows((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) return prev
      const next = prev.map((cells) => [...cells])
      lines.forEach((line, rowOffset) => {
        const parts = line.includes('\t') ? line.split('\t') : line.split(',')
        parts.forEach((part, colOffset) => {
          const targetRow = row + rowOffset
          const targetCol = col + colOffset
          if (targetRow < next.length && targetCol < next[targetRow].length && targetRow > 0) {
            next[targetRow][targetCol] = part.trim()
          }
        })
      })
      return next
    })
  }

  const beginSelection = (row: number, col: number, event: React.PointerEvent<HTMLTableCellElement>) => {
    if (row === 0) return
    if ((event.target as HTMLElement).tagName === 'INPUT') return
    if (!SPREADSHEET_COLUMNS[col]?.setValue) return
    event.preventDefault()
    setSelection({startRow: row, startCol: col, endRow: row, endCol: col})
    setIsDraggingSelection(true)
  }

  const extendSelection = (row: number, col: number) => {
    setSelection((prev) => {
      if (!prev || !isDraggingSelection) return prev
      if (row === 0 || !SPREADSHEET_COLUMNS[col]?.setValue) return prev
      return {
        startRow: prev.startRow,
        startCol: prev.startCol,
        endRow: row,
        endCol: col,
      }
    })
  }

  const clearSelectionDrag = () => {
    setIsDraggingSelection(false)
  }

  const isCellSelected = (row: number, col: number) => {
    if (!selection) return false
    const rowMin = Math.min(selection.startRow, selection.endRow)
    const rowMax = Math.max(selection.startRow, selection.endRow)
    const colMin = Math.min(selection.startCol, selection.endCol)
    const colMax = Math.max(selection.startCol, selection.endCol)
    return row >= rowMin && row <= rowMax && col >= colMin && col <= colMax
  }

  const handleCellFocus = (row: number, col: number) => {
    setActiveCell({row, col})
    setSelection({startRow: row, startCol: col, endRow: row, endCol: col})
  }

  const finalizeSelection = useCallback(() => {
    if (!isDraggingSelection || !selection) return
    const rowMin = Math.min(selection.startRow, selection.endRow)
    const rowMax = Math.max(selection.startRow, selection.endRow)
    const colMin = Math.min(selection.startCol, selection.endCol)
    const colMax = Math.max(selection.startCol, selection.endCol)
    if (rowMin === rowMax && colMin === colMax) {
      clearSelectionDrag()
      return
    }
    setSheetRows((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) return prev
      const anchorValue = prev[rowMin]?.[colMin] ?? ''
      const next = prev.map((cells) => [...cells])
      for (let r = rowMin; r <= rowMax; r += 1) {
        if (r === 0) continue
        for (let c = colMin; c <= colMax; c += 1) {
          if (r === rowMin && c === colMin) continue
          next[r][c] = anchorValue
        }
      }
      return next
    })
    clearSelectionDrag()
  }, [isDraggingSelection, selection])

  useEffect(() => {
    if (viewMode !== 'csv') return undefined
    const handlePointerUp = () => finalizeSelection()
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('mouseup', handlePointerUp)
    return () => {
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('mouseup', handlePointerUp)
    }
  }, [viewMode, finalizeSelection])

  useEffect(() => {
    if (viewMode !== 'csv') return
    const expectedRows = filteredProducts.length + 1
    if (sheetRows.length !== expectedRows) {
      setSheetRows(buildSpreadsheetMatrix(filteredProducts))
      setSelection(null)
      setActiveCell(null)
    }
  }, [viewMode, filteredProducts, sheetRows.length])

  const updateProductField = (id: string, field: keyof EditableProduct, value: any) => {
    setProducts((prev) =>
      prev.map((prod) =>
        prod._id === id
          ? {
              ...prod,
              [field]: value,
              dirty: true,
            }
          : prod
      )
    )
  }

  const handleSave = async (product: EditableProduct) => {
    if (!product._id) return
    try {
      updateProductField(product._id, 'isSaving', true)
      const canonicalUrlValue = (product.canonicalUrl || product.seo?.canonicalUrl || '')
        .toString()
        .trim()

      const payload: Record<string, any> = {
        title: product.title || '',
        sku: product.sku || undefined,
        price: Number.isFinite(product.price) ? Number(product.price) : undefined,
        salePrice: Number.isFinite(product.salePrice) ? Number(product.salePrice) : undefined,
        onSale: Boolean(product.onSale),
        availability: product.availability || 'in_stock',
        condition: product.condition || 'new',
        manualInventoryCount: Number.isFinite(product.manualInventoryCount)
          ? Number(product.manualInventoryCount)
          : undefined,
        taxBehavior: product.taxBehavior || undefined,
        taxCode: product.taxCode || undefined,
        shippingWeight: Number.isFinite(product.shippingWeight) ? Number(product.shippingWeight) : undefined,
        boxDimensions: product.boxDimensions || undefined,
        brand: product.brand || undefined,
        mpn: product.mpn || undefined,
        canonicalUrl: canonicalUrlValue || undefined,
        googleProductCategory: product.googleProductCategory || undefined,
        installOnly: Boolean(product.installOnly),
        shippingLabel: product.shippingLabel || undefined,
      }

      if (canonicalUrlValue) {
        payload['seo.canonicalUrl'] = canonicalUrlValue
      } else {
        delete payload.canonicalUrl
      }

      const unsetFields: string[] = []
      if (!canonicalUrlValue) {
        unsetFields.push('canonicalUrl', 'seo.canonicalUrl')
      }

      let patch = client.patch(product._id).set(payload)
      if (unsetFields.length > 0) {
        patch = patch.unset(unsetFields)
      }

      await patch.commit({autoGenerateArrayKeys: true})
      toast.push({status: 'success', title: 'Product saved', description: product.title || product.sku || product._id})
      setProducts((prev) =>
        prev.map((prod) =>
          prod._id === product._id
            ? {
                ...prod,
                canonicalUrl: canonicalUrlValue || undefined,
                seo: canonicalUrlValue
                  ? {
                      ...(prod.seo ?? {}),
                      canonicalUrl: canonicalUrlValue,
                    }
                  : prod.seo
                  ? {
                      ...(prod.seo ?? {}),
                      canonicalUrl: undefined,
                    }
                  : prod.seo ?? null,
                isSaving: false,
                dirty: false,
              }
            : prod
        )
      )
    } catch (err) {
      console.error('Product save failed', err)
      toast.push({status: 'error', title: 'Failed to save product', description: String((err as any)?.message || err)})
      updateProductField(product._id, 'isSaving', false)
    }
  }

  const handleSaveAll = async () => {
    const dirtyProducts = filteredProducts.filter((prod) => prod.dirty && !prod.isSaving)
    if (dirtyProducts.length === 0) {
      toast.push({status: 'info', title: 'No changes to save'})
      return
    }
    setSavingAll(true)
      for (const product of dirtyProducts) {
        await handleSave(product)
      }
    setSavingAll(false)
  }

  const createCsv = () => {
    const rows = [EXPORT_FEED_HEADERS]

    filteredProducts.forEach((product) => {
      const id = product.sku || product._id
      const title = product.title || ''
      const description = portableTextToPlain(product.shortDescription) || portableTextToPlain(product.description) || title
      const link = buildProductLink(product)
      const image = Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : ''
      const additionalImages = Array.isArray(product.images) && product.images.length > 1 ? product.images.slice(1).join(',') : ''
      const availabilityValue = product.availability || 'in_stock'
      const availabilityMap: Record<string, string> = {
        in_stock: 'in stock',
        out_of_stock: 'out of stock',
        preorder: 'preorder',
        backorder: 'backorder',
      }
      const availability = availabilityMap[availabilityValue] || 'in stock'
      const price = formatExportPrice(product.price)
      const condition = product.condition || 'new'
      const manualInventory = Number.isFinite(product.manualInventoryCount ?? NaN)
        ? String(product.manualInventoryCount)
        : ''
      const brand = product.brand || 'F.A.S. Motorsports'
      const mpn = product.mpn || product.sku || product._id
      const identifierExists = product.mpn ? 'TRUE' : 'FALSE'
      const shippingWeight = product.shippingWeight ? `${product.shippingWeight} lb` : ''
      const productType = Array.isArray(product.categories) ? product.categories.join(' > ') : ''
      const googleCategory = product.googleProductCategory || ''
      const shippingLabel = product.shippingLabel || (product.installOnly ? 'install_only' : '')
      const derived = product.derivedFeed
      const highlightsString = derived?.highlights?.join('; ') || ''
      const detailsString = derived && derived.details.length > 0 ? detailsToStrings(derived.details).join('; ') : ''
      const color = derived?.color || ''
      const size = derived && derived.sizes.length > 0 ? derived.sizes.join(', ') : ''
      const material = derived?.material || ''
      const productLength = derived?.productLength || ''
      const productWidth = derived?.productWidth || ''

      rows.push([
        id,
        title,
        description,
        link,
        image,
        additionalImages,
        availability,
        price || '',
        condition,
        manualInventory,
        brand,
        mpn,
        identifierExists,
        shippingWeight,
        productType,
        googleCategory,
        shippingLabel,
        highlightsString,
        detailsString,
        color,
        size,
        material,
        productLength,
        productWidth,
      ])
    })

    const csvContent = rows
      .map((row) =>
        row
          .map((value) => {
            const str = value ?? ''
            if (typeof str === 'string' && (str.includes(',') || str.includes('"') || str.includes('\n'))) {
              return `"${str.replace(/"/g, '""')}"`
            }
            return str
          })
          .join(',')
      )
      .join('\n')

    const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'})
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `product-feed-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card padding={4} radius={3} shadow={1} style={{background: '#0d1117'}}>
      <Stack space={4}>
        <Flex align="center" justify="space-between" gap={3} style={{flexWrap: 'wrap'}}>
          <Box>
            <Text size={2} weight="semibold" style={{color: '#fff'}}>
              Product Bulk Editor
            </Text>
            <Text size={1} style={{color: '#9ca3af'}}>
              Edit key fields and export a product feed CSV.
            </Text>
          </Box>
          <Inline space={2}>
            <TextInput
              name="bulkEditorSearch"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.currentTarget.value)}
              placeholder="Search by title, SKU, or ID"
              style={{minWidth: 240}}
            />
            <Button
              text={savingAll ? 'Saving…' : 'Save filtered'}
              tone="primary"
              onClick={handleSaveAll}
              disabled={savingAll || filteredProducts.every((prod) => !prod.dirty)}
            />
            <Button text="Download CSV" tone="default" onClick={createCsv} disabled={filteredProducts.length === 0} />
            <Button
              text={viewMode === 'csv' ? 'Table view' : 'CSV view'}
              tone={viewMode === 'csv' ? 'primary' : 'default'}
              mode={viewMode === 'csv' ? 'ghost' : 'default'}
              onClick={viewMode === 'csv' ? handleSwitchToTable : handleSwitchToCsv}
              disabled={loading || filteredProducts.length === 0}
            />
          </Inline>
        </Flex>

        {loading ? (
          <Flex align="center" justify="center" padding={5}>
            <Spinner muted />
          </Flex>
        ) : viewMode === 'csv' ? (
          <Card shadow={1} radius={2} padding={4} style={{background: '#111827'}}>
            <Stack space={3}>
              <Text size={1} style={{color: '#e5e7eb'}}>
                Spreadsheet view mirrors the feed columns. Edit directly, drag to fill, or paste from Excel. Title stays pinned on the left, and the Sanity ID column remains read-only.
              </Text>
              {sheetError && (
                <Card padding={3} radius={2} tone="critical">
                  <Text size={1} style={{whiteSpace: 'pre-wrap'}}>{sheetError}</Text>
                </Card>
              )}
              <div style={{overflowX: 'auto', borderRadius: 6, border: '1px solid rgba(148, 163, 184, 0.35)'}}>
                <table style={{width: '100%', borderCollapse: 'collapse', minWidth: 960}}
                  onPointerLeave={() => clearSelectionDrag()}
                >
                  <thead>
                    <tr>
                      {(sheetRows[0] || SPREADSHEET_COLUMNS.map((column) => column.header)).map((header, columnIndex) => {
                        const columnDef = SPREADSHEET_COLUMNS[columnIndex]
                        const isStickyColumn = columnDef?.headerKey === 'title'
                        const stickyStyle = isStickyColumn
                          ? {
                              left: 0,
                              zIndex: 4,
                              boxShadow: '4px 0 6px -4px rgba(15, 23, 42, 0.8)',
                              background: '#1f2937',
                              color: '#f9fafb',
                            }
                          : {}
                        return (
                          <th key={`header-${columnIndex}`} style={{...headerCellStyle, ...stickyStyle}}>
                            {header || SPREADSHEET_COLUMNS[columnIndex]?.header || ''}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {sheetRows.slice(1).map((row, dataIndex) => {
                      const sheetRowIndex = dataIndex + 1
                      const rowKey =
                        (SANITY_ID_COLUMN_INDEX >= 0 ? row?.[SANITY_ID_COLUMN_INDEX] : undefined) ||
                        row?.[0] ||
                        `row-${sheetRowIndex}`
                      return (
                        <tr key={rowKey}>
                          {row.map((value, columnIndex) => {
                            const sheetColIndex = columnIndex
                            const columnDef = SPREADSHEET_COLUMNS[sheetColIndex]
                            const editable = Boolean(columnDef?.setValue)
                            const selected = isCellSelected(sheetRowIndex, sheetColIndex)
                            const active = activeCell?.row === sheetRowIndex && activeCell?.col === sheetColIndex
                            const isStickyColumn = columnDef?.headerKey === 'title'
                            const cellStyle: React.CSSProperties = {
                              ...bodyCellBaseStyle,
                              background: active
                                ? 'rgba(59, 130, 246, 0.35)'
                                : selected
                                  ? 'rgba(59, 130, 246, 0.18)'
                                  : bodyCellBaseStyle.background,
                              cursor: editable ? 'text' : 'default',
                            }
                            if (isStickyColumn) {
                              cellStyle.position = 'sticky'
                              cellStyle.left = 0
                              cellStyle.zIndex = active ? 4 : selected ? 3 : 2
                              cellStyle.boxShadow = '4px 0 6px -4px rgba(15, 23, 42, 0.9)'
                              cellStyle.minWidth = 220
                              cellStyle.background = active ? '#1d4ed8' : selected ? '#1e3a8a' : '#1f2937'
                              cellStyle.color = '#f9fafb'
                            }

                            return (
                              <td
                                key={`${rowKey}-${sheetColIndex}`}
                                style={cellStyle}
                                onPointerDown={(event) => beginSelection(sheetRowIndex, sheetColIndex, event)}
                                onPointerEnter={() => extendSelection(sheetRowIndex, sheetColIndex)}
                              >
                                {editable ? (
                                  <input
                                    value={value}
                                    onChange={(event) => handleCellChange(sheetRowIndex, sheetColIndex, event.currentTarget.value)}
                                    onPaste={(event) => handleCellPaste(event, sheetRowIndex, sheetColIndex)}
                                    onFocus={() => handleCellFocus(sheetRowIndex, sheetColIndex)}
                                    style={inputStyle}
                                  />
                                ) : (
                                  <span
                                    style={{
                                      display: 'block',
                                      padding: '6px 10px',
                                      color: '#cbd5f5',
                                      fontFamily:
                                        'ui-monospace, SFMono-Regular, SFMono, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace',
                                      background: '#0b1220',
                                    }}
                                  >
                                    {value}
                                  </span>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <Inline space={2}>
                <Button
                  text={sheetApplying ? 'Applying…' : 'Apply changes'}
                  tone="positive"
                  onClick={handleApplyCsv}
                  disabled={sheetApplying || sheetRows.length <= 1}
                />
                <Button text="Refresh view" tone="default" onClick={handleRefreshCsv} disabled={sheetApplying} />
                <Button text="Table view" tone="default" mode="ghost" onClick={handleSwitchToTable} disabled={sheetApplying} />
              </Inline>
              <Text size={0} style={{color: '#9ca3af'}}>
                Tip: Paste data directly from Numbers, Excel, or Google Sheets. Drag the mouse across cells to fill down with the starting value.
              </Text>
            </Stack>
          </Card>
        ) : (
          <Card shadow={1} radius={2} padding={0} style={{overflowX: 'auto'}}>
            <table style={{width: '100%', borderCollapse: 'collapse', minWidth: 960}}>
              <thead>
                <tr style={{background: '#111827'}}>
                  {[
                    'ID / SKU',
                    'Title',
                    'Price',
                    'Sale Price',
                    'On Sale?',
                    'Availability',
                    'Condition',
                    'Manual Inventory Count',
                    'Brand',
                    'MPN',
                    'Tax Behavior',
                    'Tax Code',
                    'Shipping Weight (lb)',
                    'Box Dimensions',
                    'Google Product Category',
                    'Highlights',
                    'Details',
                    'Color',
                    'Size',
                    'Material',
                    'Length',
                    'Width',
                    'Install Only',
                    'Shipping Label',
                    'Actions',
                  ].map((header) => (
                    <th key={header} style={{textAlign: 'left', padding: '12px 16px', color: '#d1d5db', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5}}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => {
                  const derived = product.derivedFeed
                  const highlightLines = derived?.highlights ?? []
                  const detailLines = derived && derived.details.length > 0 ? detailsToStrings(derived.details) : []
                  const colorDisplay = derived?.color || ''
                  const sizeDisplay = derived && derived.sizes.length > 0 ? derived.sizes.join(', ') : ''
                  const materialDisplay = derived?.material || ''
                  const lengthDisplay = derived?.productLength || ''
                  const widthDisplay = derived?.productWidth || ''

                  return (
                    <tr key={product._key} style={{borderTop: '1px solid rgba(148, 163, 184, 0.1)'}}>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <Stack space={2}>
                        <Text size={1} style={{color: '#e5e7eb'}}>{product.sku || '—'}</Text>
                        <Text size={1} muted>{product._id}</Text>
                      </Stack>
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <TextInput
                        value={product.title || ''}
                        onChange={(event) => updateProductField(product._id, 'title', event.currentTarget.value)}
                      />
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <TextInput
                        value={product.price?.toString() ?? ''}
                        onChange={(event) =>
                          updateProductField(
                            product._id,
                            'price',
                            sanitizeNumber(event.currentTarget.value, product.price)
                          )
                        }
                        inputMode="decimal"
                      />
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <TextInput
                        value={product.salePrice?.toString() ?? ''}
                        onChange={(event) =>
                          updateProductField(
                            product._id,
                            'salePrice',
                            sanitizeNumber(event.currentTarget.value, product.salePrice)
                          )
                        }
                        inputMode="decimal"
                      />
                    </td>
                    <td style={{textAlign: 'center', padding: '12px 16px', verticalAlign: 'top'}}>
                      <input
                        type="checkbox"
                        checked={Boolean(product.onSale)}
                        onChange={(event) => updateProductField(product._id, 'onSale', event.currentTarget.checked)}
                      />
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <select
                        value={product.availability || 'in_stock'}
                        onChange={(event) => updateProductField(product._id, 'availability', event.currentTarget.value as any)}
                      >
                        <option value="in_stock">In stock</option>
                        <option value="out_of_stock">Out of stock</option>
                        <option value="preorder">Preorder</option>
                        <option value="backorder">Backorder</option>
                      </select>
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <select
                        value={product.condition || 'new'}
                        onChange={(event) => updateProductField(product._id, 'condition', event.currentTarget.value as any)}
                      >
                        <option value="new">New</option>
                        <option value="refurbished">Refurbished</option>
                        <option value="used">Used</option>
                      </select>
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <TextInput
                        value={
                          product.manualInventoryCount !== undefined && product.manualInventoryCount !== null
                            ? product.manualInventoryCount.toString()
                            : ''
                        }
                        onChange={(event) =>
                          updateProductField(
                            product._id,
                            'manualInventoryCount',
                            sanitizeNumber(event.currentTarget.value, product.manualInventoryCount)
                          )
                        }
                        inputMode="numeric"
                      />
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <TextInput
                        value={product.brand || ''}
                        onChange={(event) => updateProductField(product._id, 'brand', event.currentTarget.value)}
                      />
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <TextInput
                        value={product.mpn || ''}
                        onChange={(event) => updateProductField(product._id, 'mpn', event.currentTarget.value)}
                      />
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <select
                        value={product.taxBehavior || 'taxable'}
                        onChange={(event) => updateProductField(product._id, 'taxBehavior', event.currentTarget.value as any)}
                      >
                        <option value="taxable">Taxable</option>
                        <option value="exempt">Tax Exempt</option>
                      </select>
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <TextInput
                        value={product.taxCode || ''}
                        onChange={(event) => updateProductField(product._id, 'taxCode', event.currentTarget.value)}
                        disabled={product.taxBehavior === 'exempt'}
                      />
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <TextInput
                        value={product.shippingWeight?.toString() ?? ''}
                        onChange={(event) =>
                          updateProductField(
                            product._id,
                            'shippingWeight',
                            sanitizeNumber(event.currentTarget.value, product.shippingWeight)
                          )
                        }
                        inputMode="decimal"
                      />
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <TextInput
                        value={product.boxDimensions || ''}
                        onChange={(event) => updateProductField(product._id, 'boxDimensions', event.currentTarget.value)}
                        placeholder="LxWxH"
                      />
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <select
                        value={product.googleProductCategory || ''}
                        onChange={(event) => updateProductField(product._id, 'googleProductCategory', event.currentTarget.value)}
                      >
                        <option value="">Select category</option>
                        {googleProductCategories.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <Stack space={2}>
                        <textarea
                          value={highlightLines.join('\n')}
                          readOnly
                          rows={3}
                          style={{width: '100%', resize: 'vertical', background: 'rgba(15, 23, 42, 0.6)', color: '#e5e7eb', border: '1px solid rgba(148, 163, 184, 0.3)', borderRadius: 4, padding: 8}}
                        />
                        <Text size={0} style={{color: '#9ca3af'}}>Auto from specifications & attributes</Text>
                      </Stack>
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <Stack space={2}>
                        <textarea
                          value={detailLines.join('\n')}
                          readOnly
                          rows={3}
                          style={{width: '100%', resize: 'vertical', background: 'rgba(15, 23, 42, 0.6)', color: '#e5e7eb', border: '1px solid rgba(148, 163, 184, 0.3)', borderRadius: 4, padding: 8}}
                          placeholder="section: attribute: value"
                        />
                        <Text size={0} style={{color: '#9ca3af'}}>Auto from specifications & attributes</Text>
                      </Stack>
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <Stack space={1}>
                        <Text size={1} style={{color: '#e5e7eb'}}>{colorDisplay || '—'}</Text>
                        <Text size={0} style={{color: '#9ca3af'}}>Auto from options & attributes</Text>
                      </Stack>
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <Stack space={1}>
                        <Text size={1} style={{color: '#e5e7eb'}}>{sizeDisplay || '—'}</Text>
                        <Text size={0} style={{color: '#9ca3af'}}>Auto from options & attributes</Text>
                      </Stack>
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <Stack space={1}>
                        <Text size={1} style={{color: '#e5e7eb'}}>{materialDisplay || '—'}</Text>
                        <Text size={0} style={{color: '#9ca3af'}}>Auto from specifications & attributes</Text>
                      </Stack>
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <Stack space={1}>
                        <Text size={1} style={{color: '#e5e7eb'}}>{lengthDisplay || '—'}</Text>
                        <Text size={0} style={{color: '#9ca3af'}}>Auto from specifications</Text>
                      </Stack>
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <Stack space={1}>
                        <Text size={1} style={{color: '#e5e7eb'}}>{widthDisplay || '—'}</Text>
                        <Text size={0} style={{color: '#9ca3af'}}>Auto from specifications</Text>
                      </Stack>
                    </td>
                    <td style={{textAlign: 'center', padding: '12px 16px', verticalAlign: 'top'}}>
                      <input
                        type="checkbox"
                        checked={Boolean(product.installOnly)}
                        onChange={(event) => updateProductField(product._id, 'installOnly', event.currentTarget.checked)}
                      />
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <TextInput
                        value={product.shippingLabel || ''}
                        onChange={(event) => updateProductField(product._id, 'shippingLabel', event.currentTarget.value)}
                        placeholder="install_only"
                      />
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <Stack space={2}>
                        <Button
                          text={product.isSaving ? 'Saving…' : 'Save'}
                          tone="positive"
                          mode="ghost"
                          onClick={() => handleSave(product)}
                          disabled={product.isSaving || !product.dirty}
                        />
                        <Tooltip
                          content={<Text size={1}>View on site</Text>}
                          placement="top"
                        >
                          <Button
                            text="Preview"
                            tone="default"
                            mode="ghost"
                            as="a"
                            href={buildProductLink(product)}
                            target="_blank"
                            rel="noopener noreferrer"
                          />
                        </Tooltip>
                      </Stack>
                    </td>
                    </tr>
                )})}
              </tbody>
            </table>
          </Card>
        )}
      </Stack>
    </Card>
  )
}
