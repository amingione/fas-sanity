import React, {useCallback, useEffect, useMemo, useState} from 'react'
import {
  Box,
  Button,
  Card,
  Flex,
  Inline,
  Menu,
  MenuButton,
  MenuItem,
  Spinner,
  Stack,
  Text,
  TextInput,
  Tooltip,
  useToast,
} from '@sanity/ui'
import {useClient} from 'sanity'
import {googleProductCategories} from '../../schemaTypes/constants/googleProductCategories'
import type {
  DerivedProductFeedFields,
  ProductAttribute,
  ProductOptionSet,
  ProductSpecification,
} from '../../utils/productFeed'
import {deriveProductFeedFields, detailsToStrings} from '../../utils/productFeed'

declare global {
  interface Window {
    __SITE_BASE_URL__?: string
  }
}

type ProductStatus = 'active' | 'draft' | 'paused' | 'archived'

type ProductDoc = {
  _id: string
  title?: string
  slug?: {current?: string}
  sku?: string
  status?: ProductStatus
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
  googleProductCategory?: string
  installOnly?: boolean
  shippingLabel?: string
  shippingClass?: 'Standard' | 'Oversized' | 'Freight' | string
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
  productType?: 'physical' | 'service' | 'bundle' | string
  discountType?: 'percentage' | 'fixed_amount' | string
  discountValue?: number
  compareAtPrice?: number
  saleStartDate?: string
  saleEndDate?: string
  saleLabel?: string
  availableForWholesale?: boolean
  wholesalePriceStandard?: number
  wholesalePricePreferred?: number
  wholesalePricePlatinum?: number
  minimumWholesaleQuantity?: number
  manufacturingCost?: number
  shortDescription?: any
  description?: any
  images?: string[]
  categories?: Array<{_id?: string; title?: string}>
  compatibleVehicles?: Array<{_id?: string; title?: string}>
  tags?: string[]
}

type EditableProduct = ProductDoc & {
  _key: string
  derivedFeed?: DerivedProductFeedFields
  isSaving?: boolean
  dirty?: boolean
}

type NamedRef = {
  _id?: string
  title?: string
}

type ColumnKey =
  | 'title'
  | 'status'
  | 'productType'
  | 'sanityId'
  | 'sku'
  | 'price'
  | 'salePrice'
  | 'onSale'
  | 'discountType'
  | 'discountValue'
  | 'saleStartDate'
  | 'saleEndDate'
  | 'saleLabel'
  | 'availability'
  | 'condition'
  | 'manualInventoryCount'
  | 'brand'
  | 'mpn'
  | 'taxBehavior'
  | 'taxCode'
  | 'shippingWeight'
  | 'boxDimensions'
  | 'shippingClass'
  | 'googleProductCategory'
  | 'categories'
  | 'compatibleVehicles'
  | 'installOnly'
  | 'shippingLabel'
  | 'tags'
  | 'availableForWholesale'
  | 'wholesalePriceStandard'
  | 'wholesalePricePreferred'
  | 'wholesalePricePlatinum'
  | 'minimumWholesaleQuantity'
  | 'manufacturingCost'

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
  if (product.canonicalUrl) return product.canonicalUrl
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
  key: ColumnKey
  header: string
  headerKey: string
  getValue: (product: EditableProduct) => string
  setValue?: (raw: string, product: EditableProduct) => ApplyResult
}

const TRUE_VALUES = new Set(['true', '1', 'yes', 'y'])
const FALSE_VALUES = new Set(['false', '0', 'no', 'n'])

const PRODUCT_STATUS_OPTIONS: Array<{value: ProductStatus; label: string}> = [
  {value: 'active', label: 'Active — Live'},
  {value: 'draft', label: 'Draft — Hidden'},
  {value: 'paused', label: 'Paused — Temporarily hidden'},
  {value: 'archived', label: 'Archived — Retired'},
]

const PRODUCT_TYPE_OPTIONS: Array<{value: 'physical' | 'service' | 'bundle'; label: string}> = [
  {value: 'physical', label: 'Physical'},
  {value: 'service', label: 'Service'},
  {value: 'bundle', label: 'Bundle'},
]

const DISCOUNT_TYPE_OPTIONS: Array<{value: 'percentage' | 'fixed_amount'; label: string}> = [
  {value: 'percentage', label: 'Percentage Off'},
  {value: 'fixed_amount', label: 'Fixed Dollar Amount'},
]

const SALE_LABEL_OPTIONS: Array<{value: string; label: string}> = [
  {value: 'sale', label: 'Sale'},
  {value: 'black-friday', label: 'Black Friday'},
  {value: 'cyber-monday', label: 'Cyber Monday'},
  {value: 'clearance', label: 'Clearance'},
  {value: 'limited-time', label: 'Limited Time'},
  {value: 'hot-deal', label: 'Hot Deal'},
]

const SHIPPING_CLASS_OPTIONS: Array<{value: string; label: string}> = [
  {value: 'Standard', label: 'Standard'},
  {value: 'Oversized', label: 'Oversized'},
  {value: 'Freight', label: 'Freight'},
]

const DEFAULT_VISIBLE_COLUMNS: ColumnKey[] = [
  'title',
  'status',
  'productType',
  'sku',
  'price',
  'salePrice',
  'onSale',
  'discountType',
  'discountValue',
  'saleStartDate',
  'saleEndDate',
  'saleLabel',
  'availability',
  'condition',
  'manualInventoryCount',
  'brand',
  'mpn',
  'taxBehavior',
  'taxCode',
  'shippingWeight',
  'boxDimensions',
  'shippingClass',
  'googleProductCategory',
  'categories',
  'compatibleVehicles',
  'installOnly',
  'shippingLabel',
  'tags',
  'availableForWholesale',
  'wholesalePriceStandard',
  'wholesalePricePreferred',
  'wholesalePricePlatinum',
  'minimumWholesaleQuantity',
  'manufacturingCost',
]

const PRODUCT_STATUS_VALUES: Record<string, ProductStatus> = {
  active: 'active',
  live: 'active',
  'active — live': 'active',
  'active - live': 'active',
  draft: 'draft',
  paused: 'paused',
  'pause': 'paused',
  archived: 'archived',
  archive: 'archived',
}

const AVAILABILITY_VALUES: Record<string, 'in_stock' | 'out_of_stock' | 'preorder' | 'backorder'> =
  {
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

function parseStatusCell(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) {
    return {ok: true as const, value: undefined as ProductStatus | undefined}
  }
  const normalized = trimmed.toLowerCase()
  const mapped = PRODUCT_STATUS_VALUES[normalized]
  if (mapped) return {ok: true as const, value: mapped}
  return {
    ok: false as const,
    message: 'Status must be Active, Draft, Paused, or Archived.',
  }
}

function parseAvailabilityCell(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed)
    return {
      ok: true as const,
      value: undefined as 'in_stock' | 'out_of_stock' | 'preorder' | 'backorder' | undefined,
    }
  const normalized = trimmed.toLowerCase()
  const mapped = AVAILABILITY_VALUES[normalized]
  if (mapped) return {ok: true as const, value: mapped}
  return {
    ok: false as const,
    message: `Availability must be one of In stock, Out of stock, Preorder, Backorder.`,
  }
}

function parseConditionCell(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed)
    return {ok: true as const, value: undefined as 'new' | 'refurbished' | 'used' | undefined}
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

function splitMultiValue(raw: string): string[] {
  if (!raw.trim()) return []
  return raw
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function normalizeRefList(value?: NamedRef[] | null): NamedRef[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const normalized: NamedRef[] = []
  value.forEach((item) => {
    if (!item) return
    const id = typeof item._id === 'string' ? item._id : undefined
    const title = typeof item.title === 'string' ? item.title.trim() : undefined
    const key = id || (title ? title.toLowerCase() : '')
    if (!key || seen.has(key)) return
    seen.add(key)
    normalized.push({_id: id, title})
  })
  return normalized
}

function areRefsEqual(a?: NamedRef[] | null, b?: NamedRef[] | null): boolean {
  const aList = normalizeRefList(a)
  const bList = normalizeRefList(b)
  if (aList.length !== bList.length) return false
  return aList.every((item, index) => {
    const other = bList[index]
    const aKey = item._id || (item.title ? item.title.toLowerCase() : '')
    const bKey = other?._id || (other?.title ? other.title.toLowerCase() : '')
    return aKey === bKey
  })
}

function formatRefTitles(refs?: NamedRef[] | null): string {
  const normalized = normalizeRefList(refs)
  return normalized.map((ref) => ref.title || ref._id || '').filter(Boolean).join(', ')
}

function resolveNamesToRefs(
  names: string[],
  byId: Map<string, NamedRef>,
  byTitle: Map<string, NamedRef>,
) {
  const refs: NamedRef[] = []
  const missing: string[] = []
  names.forEach((name) => {
    const byIdMatch = byId.get(name)
    const byTitleMatch = byTitle.get(name.toLowerCase())
    const match = byIdMatch || byTitleMatch
    if (match) {
      refs.push({_id: match._id, title: match.title})
    } else {
      missing.push(name)
    }
  })
  return {refs: normalizeRefList(refs), missing}
}

function formatDateCell(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return localDate.toISOString().slice(0, 16).replace('T', ' ')
}

function toDateInputValue(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return localDate.toISOString().slice(0, 16)
}

function parseDateValue(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return {ok: true as const, value: undefined as string | undefined}
  const normalized = trimmed.replace(' ', 'T')
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) {
    return {ok: false as const, message: `Expected a valid date/time, received "${raw}".`}
  }
  return {ok: true as const, value: date.toISOString()}
}

function normalizeTagsList(value?: string[] | null): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const tags: string[] = []
  value.forEach((tag) => {
    if (typeof tag !== 'string') return
    const trimmed = tag.trim()
    if (!trimmed || seen.has(trimmed)) return
    seen.add(trimmed)
    tags.push(trimmed)
  })
  return tags
}

function parseTagsInput(raw: string): string[] {
  if (!raw.trim()) return []
  const parts = raw
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
  return normalizeTagsList(parts)
}

function formatTagsCell(tags?: string[] | null): string {
  const normalized = normalizeTagsList(tags)
  return normalized.join(', ')
}

function areTagsEqual(a?: string[] | null, b?: string[] | null): boolean {
  const aNorm = normalizeTagsList(a)
  const bNorm = normalizeTagsList(b)
  if (aNorm.length !== bNorm.length) return false
  return aNorm.every((tag, index) => tag === bNorm[index])
}

function makeUpdate<K extends keyof EditableProduct>(
  key: K,
  value: EditableProduct[K],
): ApplyResult {
  return {type: 'update', key, value}
}

function buildSpreadsheetColumns(options: {
  categoryById: Map<string, NamedRef>
  categoryByTitle: Map<string, NamedRef>
  vehicleById: Map<string, NamedRef>
  vehicleByTitle: Map<string, NamedRef>
}): SpreadsheetColumn[] {
  const resolveCategories = (raw: string, product: EditableProduct) => {
    const values = splitMultiValue(raw)
    if (values.length === 0) {
      if (normalizeRefList(product.categories).length === 0) return null
      return makeUpdate('categories', [] as any)
    }
    const {refs, missing} = resolveNamesToRefs(
      values,
      options.categoryById,
      options.categoryByTitle,
    )
    if (missing.length > 0) {
      return {
        type: 'error',
        message: `Unknown categories: ${missing.join(', ')}`,
      } as ApplyResult
    }
    if (areRefsEqual(product.categories, refs)) return null
    return makeUpdate('categories', refs as any)
  }

  const resolveVehicles = (raw: string, product: EditableProduct) => {
    const values = splitMultiValue(raw)
    if (values.length === 0) {
      if (normalizeRefList(product.compatibleVehicles).length === 0) return null
      return makeUpdate('compatibleVehicles', [] as any)
    }
    const {refs, missing} = resolveNamesToRefs(values, options.vehicleById, options.vehicleByTitle)
    if (missing.length > 0) {
      return {
        type: 'error',
        message: `Unknown vehicles: ${missing.join(', ')}`,
      } as ApplyResult
    }
    if (areRefsEqual(product.compatibleVehicles, refs)) return null
    return makeUpdate('compatibleVehicles', refs as any)
  }

  return [
    {
      key: 'title',
      header: 'Title',
      headerKey: 'title',
      getValue: (product) => product.title || '',
      setValue: (raw) => makeUpdate('title', raw.trim() as EditableProduct['title']),
    },
    {
      key: 'status',
      header: 'Status',
      headerKey: 'status',
      getValue: (product) => product.status || '',
      setValue: (raw) => {
        const result = parseStatusCell(raw)
        if (!result.ok) return {type: 'error', message: result.message}
        if (result.value === undefined) return null
        return makeUpdate('status', result.value as EditableProduct['status'])
      },
    },
    {
      key: 'productType',
      header: 'Product Type',
      headerKey: 'product type',
      getValue: (product) => product.productType || '',
      setValue: (raw) => {
        const value = raw.trim().toLowerCase()
        if (!value) return null
        if (!['physical', 'service', 'bundle'].includes(value)) {
          return {type: 'error', message: 'Product type must be Physical, Service, or Bundle.'}
        }
        return makeUpdate('productType', value as EditableProduct['productType'])
      },
    },
    {
      key: 'sanityId',
      header: 'Sanity ID',
      headerKey: 'sanity id',
      getValue: (product) => product._id,
    },
    {
      key: 'sku',
      header: 'SKU',
      headerKey: 'sku',
      getValue: (product) => product.sku || '',
      setValue: (raw) => {
        const next = raw.trim()
        return makeUpdate('sku', (next ? next : undefined) as EditableProduct['sku'])
      },
    },
    {
      key: 'price',
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
      key: 'salePrice',
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
      key: 'onSale',
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
      key: 'discountType',
      header: 'Discount Type',
      headerKey: 'discount type',
      getValue: (product) => product.discountType || '',
      setValue: (raw) => {
        const value = raw.trim().toLowerCase()
        if (!value) return null
        if (!['percentage', 'fixed_amount'].includes(value)) {
          return {type: 'error', message: 'Discount type must be Percentage or Fixed Dollar Amount.'}
        }
        return makeUpdate('discountType', value as EditableProduct['discountType'])
      },
    },
    {
      key: 'discountValue',
      header: 'Discount Value',
      headerKey: 'discount value',
      getValue: (product) => formatNumberCell(product.discountValue),
      setValue: (raw) => {
        const result = parseNumberCell(raw)
        if (!result.ok) return {type: 'error', message: result.message}
        return makeUpdate('discountValue', result.value as EditableProduct['discountValue'])
      },
    },
    {
      key: 'saleStartDate',
      header: 'Sale Start Date',
      headerKey: 'sale start date',
      getValue: (product) => formatDateCell(product.saleStartDate),
      setValue: (raw) => {
        const result = parseDateValue(raw)
        if (!result.ok) return {type: 'error', message: result.message}
        return makeUpdate('saleStartDate', result.value as EditableProduct['saleStartDate'])
      },
    },
    {
      key: 'saleEndDate',
      header: 'Sale End Date',
      headerKey: 'sale end date',
      getValue: (product) => formatDateCell(product.saleEndDate),
      setValue: (raw) => {
        const result = parseDateValue(raw)
        if (!result.ok) return {type: 'error', message: result.message}
        return makeUpdate('saleEndDate', result.value as EditableProduct['saleEndDate'])
      },
    },
    {
      key: 'saleLabel',
      header: 'Sale Badge Label',
      headerKey: 'sale badge label',
      getValue: (product) => product.saleLabel || '',
      setValue: (raw) => {
        const next = raw.trim()
        return makeUpdate('saleLabel', (next || undefined) as EditableProduct['saleLabel'])
      },
    },
    {
      key: 'availability',
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
      key: 'condition',
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
      key: 'manualInventoryCount',
      header: 'Manual Inventory Count',
      headerKey: 'manual inventory count',
      getValue: (product) => formatNumberCell(product.manualInventoryCount),
      setValue: (raw) => {
        const result = parseNumberCell(raw)
        if (!result.ok) return {type: 'error', message: result.message}
        return makeUpdate(
          'manualInventoryCount',
          result.value as EditableProduct['manualInventoryCount'],
        )
      },
    },
    {
      key: 'brand',
      header: 'Brand',
      headerKey: 'brand',
      getValue: (product) => product.brand || '',
      setValue: (raw) => {
        const next = raw.trim()
        return makeUpdate('brand', (next || undefined) as EditableProduct['brand'])
      },
    },
    {
      key: 'mpn',
      header: 'MPN',
      headerKey: 'mpn',
      getValue: (product) => product.mpn || '',
      setValue: (raw) => {
        const next = raw.trim()
        return makeUpdate('mpn', (next || undefined) as EditableProduct['mpn'])
      },
    },
    {
      key: 'taxBehavior',
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
      key: 'taxCode',
      header: 'Tax Code',
      headerKey: 'tax code',
      getValue: (product) => product.taxCode || '',
      setValue: (raw) => {
        const next = raw.trim()
        return makeUpdate('taxCode', (next || undefined) as EditableProduct['taxCode'])
      },
    },
    {
      key: 'shippingWeight',
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
      key: 'boxDimensions',
      header: 'Box Dimensions',
      headerKey: 'box dimensions',
      getValue: (product) => product.boxDimensions || '',
      setValue: (raw) => {
        const next = raw.trim()
        return makeUpdate('boxDimensions', (next || undefined) as EditableProduct['boxDimensions'])
      },
    },
    {
      key: 'shippingClass',
      header: 'Shipping Class',
      headerKey: 'shipping class',
      getValue: (product) => product.shippingClass || '',
      setValue: (raw) => {
        const next = raw.trim()
        return makeUpdate('shippingClass', (next || undefined) as EditableProduct['shippingClass'])
      },
    },
    {
      key: 'googleProductCategory',
      header: 'Google Product Category',
      headerKey: 'google product category',
      getValue: (product) => product.googleProductCategory || '',
      setValue: (raw) => {
        const next = raw.trim()
        return makeUpdate(
          'googleProductCategory',
          (next || undefined) as EditableProduct['googleProductCategory'],
        )
      },
    },
    {
      key: 'categories',
      header: 'Categories',
      headerKey: 'categories',
      getValue: (product) => formatRefTitles(product.categories),
      setValue: resolveCategories,
    },
    {
      key: 'compatibleVehicles',
      header: 'Compatible Vehicles',
      headerKey: 'compatible vehicles',
      getValue: (product) => formatRefTitles(product.compatibleVehicles),
      setValue: resolveVehicles,
    },
    {
      key: 'installOnly',
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
      key: 'shippingLabel',
      header: 'Shipping Label',
      headerKey: 'shipping label',
      getValue: (product) => product.shippingLabel || '',
      setValue: (raw) => {
        const next = raw.trim()
        return makeUpdate('shippingLabel', (next || undefined) as EditableProduct['shippingLabel'])
      },
    },
    {
      key: 'tags',
      header: 'Internal Tags',
      headerKey: 'internal tags',
      getValue: (product) => formatTagsCell(product.tags),
      setValue: (raw, product) => {
        const trimmed = raw.trim()
        const currentTags = normalizeTagsList(product.tags)
        if (!trimmed && currentTags.length === 0) return null
        const nextTags = parseTagsInput(raw)
        if (areTagsEqual(currentTags, nextTags)) return null
        return makeUpdate('tags', nextTags as EditableProduct['tags'])
      },
    },
    {
      key: 'availableForWholesale',
      header: 'Available for Wholesale',
      headerKey: 'available for wholesale',
      getValue: (product) => formatBooleanCell(product.availableForWholesale),
      setValue: (raw) => {
        const result = parseBooleanCell(raw)
        if (!result.ok) return {type: 'error', message: result.message}
        if (result.value === undefined) return null
        return makeUpdate(
          'availableForWholesale',
          result.value as EditableProduct['availableForWholesale'],
        )
      },
    },
    {
      key: 'wholesalePriceStandard',
      header: 'Wholesale Price - Standard',
      headerKey: 'wholesale price - standard',
      getValue: (product) => formatNumberCell(product.wholesalePriceStandard),
      setValue: (raw) => {
        const result = parseNumberCell(raw)
        if (!result.ok) return {type: 'error', message: result.message}
        return makeUpdate(
          'wholesalePriceStandard',
          result.value as EditableProduct['wholesalePriceStandard'],
        )
      },
    },
    {
      key: 'wholesalePricePreferred',
      header: 'Wholesale Price - Preferred',
      headerKey: 'wholesale price - preferred',
      getValue: (product) => formatNumberCell(product.wholesalePricePreferred),
      setValue: (raw) => {
        const result = parseNumberCell(raw)
        if (!result.ok) return {type: 'error', message: result.message}
        return makeUpdate(
          'wholesalePricePreferred',
          result.value as EditableProduct['wholesalePricePreferred'],
        )
      },
    },
    {
      key: 'wholesalePricePlatinum',
      header: 'Wholesale Price - Platinum',
      headerKey: 'wholesale price - platinum',
      getValue: (product) => formatNumberCell(product.wholesalePricePlatinum),
      setValue: (raw) => {
        const result = parseNumberCell(raw)
        if (!result.ok) return {type: 'error', message: result.message}
        return makeUpdate(
          'wholesalePricePlatinum',
          result.value as EditableProduct['wholesalePricePlatinum'],
        )
      },
    },
    {
      key: 'minimumWholesaleQuantity',
      header: 'Minimum Wholesale Quantity',
      headerKey: 'minimum wholesale quantity',
      getValue: (product) => formatNumberCell(product.minimumWholesaleQuantity),
      setValue: (raw) => {
        const result = parseNumberCell(raw)
        if (!result.ok) return {type: 'error', message: result.message}
        return makeUpdate(
          'minimumWholesaleQuantity',
          result.value as EditableProduct['minimumWholesaleQuantity'],
        )
      },
    },
    {
      key: 'manufacturingCost',
      header: 'Manufacturing Cost',
      headerKey: 'manufacturing cost',
      getValue: (product) => formatNumberCell(product.manufacturingCost),
      setValue: (raw) => {
        const result = parseNumberCell(raw)
        if (!result.ok) return {type: 'error', message: result.message}
        return makeUpdate(
          'manufacturingCost',
          result.value as EditableProduct['manufacturingCost'],
        )
      },
    },
  ]
}

type ParsedRow = {
  line: number
  values: Record<string, string>
}

function buildSpreadsheetMatrix(
  products: EditableProduct[],
  columns: SpreadsheetColumn[],
): string[][] {
  const header = columns.map((column) => column.header)
  const rows = products.map((product) => columns.map((column) => column.getValue(product)))
  return [header, ...rows]
}

function matrixToParsedRows(
  matrix: string[][],
): {ok: true; rows: ParsedRow[]} | {ok: false; error: string} {
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

export default function ProductBulkEditor({productIds}: {productIds?: string[]}) {
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
  const [selection, setSelection] = useState<{
    startRow: number
    startCol: number
    endRow: number
    endCol: number
  } | null>(null)
  const [isDraggingSelection, setIsDraggingSelection] = useState(false)
  const [categoryOptions, setCategoryOptions] = useState<NamedRef[]>([])
  const [vehicleOptions, setVehicleOptions] = useState<NamedRef[]>([])
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<Set<ColumnKey>>(
    () => new Set(DEFAULT_VISIBLE_COLUMNS),
  )
  const [filterProductType, setFilterProductType] = useState<string>('')
  const [filterOnSale, setFilterOnSale] = useState<'all' | 'true' | 'false'>('all')
  const [filterDiscountType, setFilterDiscountType] = useState<string>('')
  const [filterShippingClass, setFilterShippingClass] = useState<string>('')
  const [filterCategoryIds, setFilterCategoryIds] = useState<Set<string>>(new Set())
  const [filterVehicleIds, setFilterVehicleIds] = useState<Set<string>>(new Set())
  const [filterWholesale, setFilterWholesale] = useState<'all' | 'true' | 'false'>('all')

  const categoryById = useMemo(() => {
    const map = new Map<string, NamedRef>()
    categoryOptions.forEach((option) => {
      if (option?._id) map.set(option._id, option)
    })
    return map
  }, [categoryOptions])

  const categoryByTitle = useMemo(() => {
    const map = new Map<string, NamedRef>()
    categoryOptions.forEach((option) => {
      if (option?.title) map.set(option.title.toLowerCase(), option)
    })
    return map
  }, [categoryOptions])

  const vehicleById = useMemo(() => {
    const map = new Map<string, NamedRef>()
    vehicleOptions.forEach((option) => {
      if (option?._id) map.set(option._id, option)
    })
    return map
  }, [vehicleOptions])

  const vehicleByTitle = useMemo(() => {
    const map = new Map<string, NamedRef>()
    vehicleOptions.forEach((option) => {
      if (option?.title) map.set(option.title.toLowerCase(), option)
    })
    return map
  }, [vehicleOptions])

  const spreadsheetColumns = useMemo(
    () =>
      buildSpreadsheetColumns({
        categoryById,
        categoryByTitle,
        vehicleById,
        vehicleByTitle,
      }),
    [categoryById, categoryByTitle, vehicleById, vehicleByTitle],
  )

  const activeSpreadsheetColumns = useMemo(
    () =>
      spreadsheetColumns.filter(
        (column) => column.key === 'sanityId' || visibleColumnKeys.has(column.key),
      ),
    [spreadsheetColumns, visibleColumnKeys],
  )

  const sanityIdColumnIndex = useMemo(
    () => activeSpreadsheetColumns.findIndex((column) => column.headerKey === 'sanity id'),
    [activeSpreadsheetColumns],
  )

  const toggleVisibleColumn = useCallback((key: ColumnKey) => {
    setVisibleColumnKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  const toggleCategoryFilter = useCallback((id: string) => {
    setFilterCategoryIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleVehicleFilter = useCallback((id: string) => {
    setFilterVehicleIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clearFilters = useCallback(() => {
    setFilterProductType('')
    setFilterOnSale('all')
    setFilterDiscountType('')
    setFilterShippingClass('')
    setFilterCategoryIds(new Set())
    setFilterVehicleIds(new Set())
    setFilterWholesale('all')
  }, [])

  const headerCellStyle = {
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: '#111827',
    color: '#f9fafb',
    position: 'sticky' as const,
    top: 0,
    zIndex: 2,
  }

  const bodyCellBaseStyle = {
    border: '1px solid rgba(148, 163, 184, 0.25)',
    minWidth: 140,
    background: '#0f172a',
    position: 'relative' as const,
  }

  const inputStyle = {
    width: '100%',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: '#e5e7eb',
    fontFamily:
      'ui-monospace, SFMono-Regular, SFMono, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace',
  }

  const tableHeaderClassName =
    'px-space-4 py-space-3 text-text-caption font-semibold uppercase tracking-wide text-left text-slate-300'

  useEffect(() => {
    let cancelled = false
    async function fetchLookups() {
      try {
        const [cats, vehicles] = await Promise.all([
          client.fetch(`*[_type == "category"]{_id, title} | order(title asc)`),
          client.fetch(`*[_type == "vehicleModel"]{_id, title} | order(title asc)`),
        ])
        if (cancelled) return
        setCategoryOptions(Array.isArray(cats) ? cats : [])
        setVehicleOptions(Array.isArray(vehicles) ? vehicles : [])
      } catch (err) {
        console.error('Bulk editor lookup fetch failed', err)
      }
    }
    fetchLookups()
    return () => {
      cancelled = true
    }
  }, [client])

  useEffect(() => {
    let isMounted = true
    async function fetchProducts() {
      setLoading(true)
      try {
        const hasSelection = Array.isArray(productIds) && productIds.length > 0
        const projection = `{
            _id,
            title,
            status,
            productType,
            slug,
            sku,
            mpn,
            price,
            salePrice,
            discountType,
            discountValue,
            saleStartDate,
            saleEndDate,
            saleLabel,
            onSale,
            availability,
            condition,
            manualInventoryCount,
            taxBehavior,
            taxCode,
            installOnly,
            shippingLabel,
            shippingClass,
            shippingWeight,
            boxDimensions,
            brand,
            canonicalUrl,
            googleProductCategory,
            availableForWholesale,
            wholesalePriceStandard,
            wholesalePricePreferred,
            wholesalePricePlatinum,
            minimumWholesaleQuantity,
            manufacturingCost,
            tags,
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
            "categories": category[]->{_id, title},
            "compatibleVehicles": compatibleVehicles[]->{_id, title}
          }`
        const query = hasSelection
          ? `*[_type == "product" && _id in $ids]${projection}`
          : `*[_type == "product"]${projection}`

        const params = hasSelection ? {ids: productIds} : {}
        let docs: ProductDoc[] = await client.fetch(query, params)
        if (!Array.isArray(docs)) {
          docs = []
        }
        if (hasSelection) {
          const orderMap = new Map<string, number>(productIds!.map((id, index) => [id, index]))
          docs.sort((a, b) => {
            const aIndex = orderMap.get(a._id) ?? Number.MAX_SAFE_INTEGER
            const bIndex = orderMap.get(b._id) ?? Number.MAX_SAFE_INTEGER
            return aIndex - bIndex
          })
        }

        if (!isMounted) return

        const enriched: EditableProduct[] = docs.map((doc, idx) => ({
          ...doc,
          _key: doc._id || `idx-${idx}`,
          derivedFeed: deriveProductFeedFields(doc),
        }))
        setProducts(enriched)
      } catch (err) {
        console.error('ProductBulkEditor fetch failed', err)
        toast.push({
          status: 'error',
          title: 'Failed to load products',
          description: String((err as any)?.message || err),
        })
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    fetchProducts()
    return () => {
      isMounted = false
    }
  }, [client, productIds, toast])

  const applyFilters = useCallback(
    (list: EditableProduct[]) => {
      const term = searchTerm.trim().toLowerCase()
      return list.filter((product) => {
        if (term) {
          const matches = [product.title, product.sku, product._id]
            .filter(Boolean)
            .some((value) => value!.toString().toLowerCase().includes(term))
          if (!matches) return false
        }

        if (filterProductType && (product.productType || '').toLowerCase() !== filterProductType) {
          return false
        }

        if (filterOnSale !== 'all') {
          const onSale = Boolean(product.onSale)
          if (filterOnSale === 'true' && !onSale) return false
          if (filterOnSale === 'false' && onSale) return false
        }

        if (
          filterDiscountType &&
          (product.discountType || '').toString().toLowerCase() !== filterDiscountType
        ) {
          return false
        }

        if (filterShippingClass && (product.shippingClass || '') !== filterShippingClass) {
          return false
        }

        if (filterWholesale !== 'all') {
          const wholesale = Boolean(product.availableForWholesale)
          if (filterWholesale === 'true' && !wholesale) return false
          if (filterWholesale === 'false' && wholesale) return false
        }

        if (filterCategoryIds.size > 0) {
          const categoryIds = normalizeRefList(product.categories)
            .map((ref) => ref._id)
            .filter(Boolean)
          if (!categoryIds.some((id) => id && filterCategoryIds.has(id))) return false
        }

        if (filterVehicleIds.size > 0) {
          const vehicleIds = normalizeRefList(product.compatibleVehicles)
            .map((ref) => ref._id)
            .filter(Boolean)
          if (!vehicleIds.some((id) => id && filterVehicleIds.has(id))) return false
        }

        return true
      })
    },
    [
      searchTerm,
      filterProductType,
      filterOnSale,
      filterDiscountType,
      filterShippingClass,
      filterWholesale,
      filterCategoryIds,
      filterVehicleIds,
    ],
  )

  const filteredProducts = useMemo(() => applyFilters(products), [applyFilters, products])

  const handleSwitchToCsv = () => {
    setSheetError(null)
    setSheetRows(buildSpreadsheetMatrix(filteredProducts, activeSpreadsheetColumns))
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
    setSheetRows(buildSpreadsheetMatrix(filteredProducts, activeSpreadsheetColumns))
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

      for (const column of activeSpreadsheetColumns) {
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
        toast.push({
          status: 'warning',
          title: 'Rows skipped',
          description: `No product found for ${missing.join(', ')}`,
        })
      }
      return
    }

    setProducts(updatedProducts)
    const refreshed = applyFilters(updatedProducts)
    setSheetRows(buildSpreadsheetMatrix(refreshed, activeSpreadsheetColumns))
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

  const handleCellPaste = (
    event: React.ClipboardEvent<HTMLInputElement>,
    row: number,
    col: number,
  ) => {
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

  const beginSelection = (
    row: number,
    col: number,
    event: React.PointerEvent<HTMLTableCellElement>,
  ) => {
    if (row === 0) return
    if ((event.target as HTMLElement).tagName === 'INPUT') return
    if (!activeSpreadsheetColumns[col]?.setValue) return
    event.preventDefault()
    setSelection({startRow: row, startCol: col, endRow: row, endCol: col})
    setIsDraggingSelection(true)
  }

  const extendSelection = (row: number, col: number) => {
    setSelection((prev) => {
      if (!prev || !isDraggingSelection) return prev
      if (row === 0 || !activeSpreadsheetColumns[col]?.setValue) return prev
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
    const expectedCols = activeSpreadsheetColumns.length
    const currentCols = sheetRows[0]?.length ?? expectedCols
    if (sheetRows.length !== expectedRows || currentCols !== expectedCols) {
      setSheetRows(buildSpreadsheetMatrix(filteredProducts, activeSpreadsheetColumns))
      setSelection(null)
      setActiveCell(null)
    }
  }, [viewMode, filteredProducts, sheetRows, sheetRows.length, activeSpreadsheetColumns])

  const updateProductField = (id: string, field: keyof EditableProduct, value: any) => {
    setProducts((prev) =>
      prev.map((prod) =>
        prod._id === id
          ? {
              ...prod,
              [field]: value,
              dirty: true,
            }
          : prod,
      ),
    )
  }

  const handleSave = async (product: EditableProduct) => {
    if (!product._id) return
    try {
      updateProductField(product._id, 'isSaving', true)
      const tagsPayload = Array.isArray(product.tags) ? normalizeTagsList(product.tags) : undefined
      const categoryRefs = normalizeRefList(product.categories).filter((ref) => ref._id)
      const vehicleRefs = normalizeRefList(product.compatibleVehicles).filter((ref) => ref._id)
      const payload: Record<string, any> = {
        title: product.title || '',
        productType: product.productType || undefined,
        sku: product.sku || undefined,
        status: product.status || undefined,
        price: Number.isFinite(product.price) ? Number(product.price) : undefined,
        salePrice: Number.isFinite(product.salePrice) ? Number(product.salePrice) : undefined,
        discountType: product.discountType || undefined,
        discountValue: Number.isFinite(product.discountValue)
          ? Number(product.discountValue)
          : undefined,
        saleStartDate: product.saleStartDate || undefined,
        saleEndDate: product.saleEndDate || undefined,
        saleLabel: product.saleLabel || undefined,
        onSale: Boolean(product.onSale),
        availability: product.availability || 'in_stock',
        condition: product.condition || 'new',
        manualInventoryCount: Number.isFinite(product.manualInventoryCount)
          ? Number(product.manualInventoryCount)
          : undefined,
        taxBehavior: product.taxBehavior || undefined,
        taxCode: product.taxCode || undefined,
        shippingWeight: Number.isFinite(product.shippingWeight)
          ? Number(product.shippingWeight)
          : undefined,
        boxDimensions: product.boxDimensions || undefined,
        brand: product.brand || undefined,
        mpn: product.mpn || undefined,
        canonicalUrl: product.canonicalUrl || undefined,
        googleProductCategory: product.googleProductCategory || undefined,
        availableForWholesale:
          product.availableForWholesale === undefined
            ? undefined
            : Boolean(product.availableForWholesale),
        wholesalePriceStandard: Number.isFinite(product.wholesalePriceStandard)
          ? Number(product.wholesalePriceStandard)
          : undefined,
        wholesalePricePreferred: Number.isFinite(product.wholesalePricePreferred)
          ? Number(product.wholesalePricePreferred)
          : undefined,
        wholesalePricePlatinum: Number.isFinite(product.wholesalePricePlatinum)
          ? Number(product.wholesalePricePlatinum)
          : undefined,
        minimumWholesaleQuantity: Number.isFinite(product.minimumWholesaleQuantity)
          ? Number(product.minimumWholesaleQuantity)
          : undefined,
        manufacturingCost: Number.isFinite(product.manufacturingCost)
          ? Number(product.manufacturingCost)
          : undefined,
        installOnly: Boolean(product.installOnly),
        shippingLabel: product.shippingLabel || undefined,
        shippingClass: product.shippingClass || undefined,
      }
      if (tagsPayload !== undefined) {
        payload.tags = tagsPayload
      }
      payload.category =
        categoryRefs.length > 0
          ? categoryRefs.map((ref) => ({_type: 'reference', _ref: ref._id}))
          : []
      payload.compatibleVehicles =
        vehicleRefs.length > 0 ? vehicleRefs.map((ref) => ({_type: 'reference', _ref: ref._id})) : []

      await client.patch(product._id).set(payload).commit({autoGenerateArrayKeys: true})
      toast.push({
        status: 'success',
        title: 'Product saved',
        description: product.title || product.sku || product._id,
      })
      setProducts((prev) =>
        prev.map((prod) =>
          prod._id === product._id
            ? {
                ...prod,
                ...payload,
                category: undefined,
                categories: categoryRefs,
                compatibleVehicles: vehicleRefs,
                isSaving: false,
                dirty: false,
              }
            : prod,
        ),
      )
    } catch (err) {
      console.error('Product save failed', err)
      toast.push({
        status: 'error',
        title: 'Failed to save product',
        description: String((err as any)?.message || err),
      })
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
      const description =
        portableTextToPlain(product.shortDescription) ||
        portableTextToPlain(product.description) ||
        title
      const link = buildProductLink(product)
      const image =
        Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : ''
      const additionalImages =
        Array.isArray(product.images) && product.images.length > 1
          ? product.images.slice(1).join(',')
          : ''
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
      const categoryTitles = normalizeRefList(product.categories)
        .map((cat) => cat.title)
        .filter(Boolean)
      const productType = categoryTitles.join(' > ')
      const googleCategory = product.googleProductCategory || ''
      const shippingLabel = product.shippingLabel || (product.installOnly ? 'install_only' : '')
      const derived = product.derivedFeed
      const highlightsString = derived?.highlights?.join('; ') || ''
      const detailsString =
        derived && derived.details.length > 0 ? detailsToStrings(derived.details).join('; ') : ''
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
            if (
              typeof str === 'string' &&
              (str.includes(',') || str.includes('"') || str.includes('\n'))
            ) {
              return `"${str.replace(/"/g, '""')}"`
            }
            return str
          })
          .join(','),
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
            <MenuButton
              id="column-toggle"
              button={<Button text="Columns" mode="ghost" />}
              menu={
                <Menu>
                  {spreadsheetColumns
                    .filter((column) => column.key !== 'sanityId')
                    .map((column) => (
                      <MenuItem
                        key={column.key}
                        text={column.header}
                        selected={visibleColumnKeys.has(column.key)}
                        onClick={() => toggleVisibleColumn(column.key)}
                      />
                    ))}
                </Menu>
              }
            />
            <Button
              text={savingAll ? 'Saving…' : 'Save filtered'}
              tone="primary"
              onClick={handleSaveAll}
              disabled={savingAll || filteredProducts.every((prod) => !prod.dirty)}
            />
            <Button
              text="Download CSV"
              tone="default"
              onClick={createCsv}
              disabled={filteredProducts.length === 0}
            />
            <Button
              text={viewMode === 'csv' ? 'Table view' : 'CSV view'}
              tone={viewMode === 'csv' ? 'primary' : 'default'}
              mode={viewMode === 'csv' ? 'ghost' : 'default'}
              onClick={viewMode === 'csv' ? handleSwitchToTable : handleSwitchToCsv}
              disabled={loading || filteredProducts.length === 0}
            />
          </Inline>
        </Flex>
        <Inline space={2} style={{flexWrap: 'wrap'}}>
          <select
            value={filterProductType}
            onChange={(event) => setFilterProductType(event.currentTarget.value)}
          >
            <option value="">All product types</option>
            {PRODUCT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={filterOnSale}
            onChange={(event) => setFilterOnSale(event.currentTarget.value as any)}
          >
            <option value="all">All sale states</option>
            <option value="true">On sale</option>
            <option value="false">Not on sale</option>
          </select>
          <select
            value={filterDiscountType}
            onChange={(event) => setFilterDiscountType(event.currentTarget.value)}
          >
            <option value="">All discounts</option>
            {DISCOUNT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={filterShippingClass}
            onChange={(event) => setFilterShippingClass(event.currentTarget.value)}
          >
            <option value="">All shipping classes</option>
            {SHIPPING_CLASS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={filterWholesale}
            onChange={(event) => setFilterWholesale(event.currentTarget.value as any)}
          >
            <option value="all">All wholesale</option>
            <option value="true">Wholesale available</option>
            <option value="false">Wholesale disabled</option>
          </select>
          <MenuButton
            id="filter-categories"
            button={
              <Button
                text={
                  filterCategoryIds.size > 0
                    ? `Categories (${filterCategoryIds.size})`
                    : 'Categories'
                }
                mode="ghost"
              />
            }
            menu={
              <Menu style={{maxHeight: 320, overflowY: 'auto'}}>
                {categoryOptions.length === 0 ? (
                  <MenuItem text="No categories" disabled />
                ) : (
                  categoryOptions.map((option) => (
                    <MenuItem
                      key={option._id || option.title}
                      text={option.title || option._id || 'Untitled'}
                      selected={option._id ? filterCategoryIds.has(option._id) : false}
                      onClick={() => option._id && toggleCategoryFilter(option._id)}
                    />
                  ))
                )}
              </Menu>
            }
          />
          <MenuButton
            id="filter-vehicles"
            button={
              <Button
                text={
                  filterVehicleIds.size > 0 ? `Vehicles (${filterVehicleIds.size})` : 'Vehicles'
                }
                mode="ghost"
              />
            }
            menu={
              <Menu style={{maxHeight: 320, overflowY: 'auto'}}>
                {vehicleOptions.length === 0 ? (
                  <MenuItem text="No vehicles" disabled />
                ) : (
                  vehicleOptions.map((option) => (
                    <MenuItem
                      key={option._id || option.title}
                      text={option.title || option._id || 'Untitled'}
                      selected={option._id ? filterVehicleIds.has(option._id) : false}
                      onClick={() => option._id && toggleVehicleFilter(option._id)}
                    />
                  ))
                )}
              </Menu>
            }
          />
          <Button text="Clear filters" mode="ghost" onClick={clearFilters} />
        </Inline>

        {loading ? (
          <Flex align="center" justify="center" padding={5}>
            <Spinner muted />
          </Flex>
        ) : viewMode === 'csv' ? (
          <Card shadow={1} radius={2} padding={4} style={{background: '#111827'}}>
            <Stack space={3}>
              <Text size={1} style={{color: '#e5e7eb'}}>
                Spreadsheet view mirrors the feed columns. Edit directly, drag to fill, or paste
                from Excel. Title stays pinned on the left, and the Sanity ID column remains
                read-only.
              </Text>
              {sheetError && (
                <Card padding={3} radius={2} tone="critical">
                  <Text size={1} style={{whiteSpace: 'pre-wrap'}}>
                    {sheetError}
                  </Text>
                </Card>
              )}
              <div
                style={{
                  overflowX: 'auto',
                  borderRadius: 6,
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                }}
              >
                <table
                  style={{width: '100%', borderCollapse: 'collapse', minWidth: 960}}
                  onPointerLeave={() => clearSelectionDrag()}
                >
                  <thead>
                    <tr>
                      {(sheetRows[0] || activeSpreadsheetColumns.map((column) => column.header)).map(
                        (header, columnIndex) => {
                          const columnDef = activeSpreadsheetColumns[columnIndex]
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
                            <th
                              key={`header-${columnIndex}`}
                              className="px-space-3 py-space-2 text-text-caption font-semibold uppercase tracking-wide whitespace-nowrap"
                              style={{...headerCellStyle, ...stickyStyle}}
                            >
                              {header || activeSpreadsheetColumns[columnIndex]?.header || ''}
                            </th>
                          )
                        },
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {sheetRows.slice(1).map((row, dataIndex) => {
                      const sheetRowIndex = dataIndex + 1
                      const rowKey =
                        (sanityIdColumnIndex >= 0 ? row?.[sanityIdColumnIndex] : undefined) ||
                        row?.[0] ||
                        `row-${sheetRowIndex}`
                      return (
                        <tr key={rowKey}>
                          {row.map((value, columnIndex) => {
                            const sheetColIndex = columnIndex
                            const columnDef = activeSpreadsheetColumns[sheetColIndex]
                            const editable = Boolean(columnDef?.setValue)
                            const selected = isCellSelected(sheetRowIndex, sheetColIndex)
                            const active =
                              activeCell?.row === sheetRowIndex && activeCell?.col === sheetColIndex
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
                              cellStyle.background = active
                                ? '#1d4ed8'
                                : selected
                                  ? '#1e3a8a'
                                  : '#1f2937'
                              cellStyle.color = '#f9fafb'
                            }

                            return (
                              <td
                                key={`${rowKey}-${sheetColIndex}`}
                                className="p-0 align-top"
                                style={cellStyle}
                                onPointerDown={(event) =>
                                  beginSelection(sheetRowIndex, sheetColIndex, event)
                                }
                                onPointerEnter={() => extendSelection(sheetRowIndex, sheetColIndex)}
                              >
                                {editable ? (
                                  <input
                                    value={value}
                                    onChange={(event) =>
                                      handleCellChange(
                                        sheetRowIndex,
                                        sheetColIndex,
                                        event.currentTarget.value,
                                      )
                                    }
                                    onPaste={(event) =>
                                      handleCellPaste(event, sheetRowIndex, sheetColIndex)
                                    }
                                    onFocus={() => handleCellFocus(sheetRowIndex, sheetColIndex)}
                                    className="p-space-2 text-text-meta font-mono"
                                    style={inputStyle}
                                  />
                                ) : (
                                  <span
                                    className="block px-space-3 py-space-2 text-text-meta font-mono"
                                    style={{
                                      color: '#cbd5f5',
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
                <Button
                  text="Refresh view"
                  tone="default"
                  onClick={handleRefreshCsv}
                  disabled={sheetApplying}
                />
                <Button
                  text="Table view"
                  tone="default"
                  mode="ghost"
                  onClick={handleSwitchToTable}
                  disabled={sheetApplying}
                />
              </Inline>
              <Text size={0} style={{color: '#9ca3af'}}>
                Tip: Paste data directly from Numbers, Excel, or Google Sheets. Drag the mouse
                across cells to fill down with the starting value.
              </Text>
            </Stack>
          </Card>
        ) : (
          <Card shadow={1} radius={2} padding={0} style={{overflowX: 'auto'}}>
            <table style={{width: '100%', borderCollapse: 'collapse', minWidth: 960}}>
              <thead>
                <tr style={{background: '#111827'}}>
                  <th className={tableHeaderClassName}>ID / SKU</th>
                  {visibleColumnKeys.has('title') && <th className={tableHeaderClassName}>Title</th>}
                  {visibleColumnKeys.has('status') && <th className={tableHeaderClassName}>Status</th>}
                  {visibleColumnKeys.has('productType') && (
                    <th className={tableHeaderClassName}>Product Type</th>
                  )}
                  {visibleColumnKeys.has('price') && <th className={tableHeaderClassName}>Price</th>}
                  {visibleColumnKeys.has('salePrice') && <th className={tableHeaderClassName}>Sale Price</th>}
                  {visibleColumnKeys.has('onSale') && <th className={tableHeaderClassName}>On Sale?</th>}
                  {visibleColumnKeys.has('discountType') && (
                    <th className={tableHeaderClassName}>Discount Type</th>
                  )}
                  {visibleColumnKeys.has('discountValue') && (
                    <th className={tableHeaderClassName}>Discount Value</th>
                  )}
                  {visibleColumnKeys.has('saleStartDate') && (
                    <th className={tableHeaderClassName}>Sale Start</th>
                  )}
                  {visibleColumnKeys.has('saleEndDate') && (
                    <th className={tableHeaderClassName}>Sale End</th>
                  )}
                  {visibleColumnKeys.has('saleLabel') && <th className={tableHeaderClassName}>Sale Badge</th>}
                  {visibleColumnKeys.has('availability') && (
                    <th className={tableHeaderClassName}>Availability</th>
                  )}
                  {visibleColumnKeys.has('condition') && <th className={tableHeaderClassName}>Condition</th>}
                  {visibleColumnKeys.has('manualInventoryCount') && (
                    <th className={tableHeaderClassName}>Manual Inventory Count</th>
                  )}
                  {visibleColumnKeys.has('brand') && <th className={tableHeaderClassName}>Brand</th>}
                  {visibleColumnKeys.has('mpn') && <th className={tableHeaderClassName}>MPN</th>}
                  {visibleColumnKeys.has('taxBehavior') && (
                    <th className={tableHeaderClassName}>Tax Behavior</th>
                  )}
                  {visibleColumnKeys.has('taxCode') && <th className={tableHeaderClassName}>Tax Code</th>}
                  {visibleColumnKeys.has('shippingWeight') && (
                    <th className={tableHeaderClassName}>Shipping Weight (lb)</th>
                  )}
                  {visibleColumnKeys.has('boxDimensions') && (
                    <th className={tableHeaderClassName}>Box Dimensions</th>
                  )}
                  {visibleColumnKeys.has('shippingClass') && (
                    <th className={tableHeaderClassName}>Shipping Class</th>
                  )}
                  {visibleColumnKeys.has('googleProductCategory') && (
                    <th className={tableHeaderClassName}>Google Product Category</th>
                  )}
                  {visibleColumnKeys.has('categories') && <th className={tableHeaderClassName}>Categories</th>}
                  {visibleColumnKeys.has('compatibleVehicles') && (
                    <th className={tableHeaderClassName}>Vehicles</th>
                  )}
                  {visibleColumnKeys.has('tags') && <th className={tableHeaderClassName}>Internal Tags</th>}
                  {visibleColumnKeys.has('availableForWholesale') && (
                    <th className={tableHeaderClassName}>Wholesale?</th>
                  )}
                  {visibleColumnKeys.has('wholesalePriceStandard') && (
                    <th className={tableHeaderClassName}>Wholesale Std</th>
                  )}
                  {visibleColumnKeys.has('wholesalePricePreferred') && (
                    <th className={tableHeaderClassName}>Wholesale Pref</th>
                  )}
                  {visibleColumnKeys.has('wholesalePricePlatinum') && (
                    <th className={tableHeaderClassName}>Wholesale Plat</th>
                  )}
                  {visibleColumnKeys.has('minimumWholesaleQuantity') && (
                    <th className={tableHeaderClassName}>Min Wholesale Qty</th>
                  )}
                  {visibleColumnKeys.has('manufacturingCost') && (
                    <th className={tableHeaderClassName}>Manufacturing Cost</th>
                  )}
                  <th className={tableHeaderClassName}>Highlights</th>
                  <th className={tableHeaderClassName}>Details</th>
                  <th className={tableHeaderClassName}>Color</th>
                  <th className={tableHeaderClassName}>Size</th>
                  <th className={tableHeaderClassName}>Material</th>
                  <th className={tableHeaderClassName}>Length</th>
                  <th className={tableHeaderClassName}>Width</th>
                  {visibleColumnKeys.has('installOnly') && <th className={tableHeaderClassName}>Install Only</th>}
                  {visibleColumnKeys.has('shippingLabel') && (
                    <th className={tableHeaderClassName}>Shipping Label</th>
                  )}
                  <th className={tableHeaderClassName}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => {
                  const derived = product.derivedFeed
                  const highlightLines = derived?.highlights ?? []
                  const detailLines =
                    derived && derived.details.length > 0 ? detailsToStrings(derived.details) : []
                  const colorDisplay = derived?.color || ''
                  const sizeDisplay =
                    derived && derived.sizes.length > 0 ? derived.sizes.join(', ') : ''
                  const materialDisplay = derived?.material || ''
                  const lengthDisplay = derived?.productLength || ''
                  const widthDisplay = derived?.productWidth || ''

                  return (
                    <tr
                      key={product._key}
                      style={{borderTop: '1px solid rgba(148, 163, 184, 0.1)'}}
                    >
                      <td className="px-space-4 py-space-3 align-top">
                        <Stack space={2}>
                          <Text size={1} style={{color: '#e5e7eb'}}>
                            {product.sku || '—'}
                          </Text>
                          <Text size={1} muted>
                            {product._id}
                          </Text>
                        </Stack>
                      </td>
                      {visibleColumnKeys.has('title') && (
                        <td className="px-space-4 py-space-3 align-top">
                          <TextInput
                            value={product.title || ''}
                            onChange={(event) =>
                              updateProductField(product._id, 'title', event.currentTarget.value)
                            }
                          />
                        </td>
                      )}
                      {visibleColumnKeys.has('status') && (
                        <td className="px-space-4 py-space-3 align-top">
                          <select
                            value={product.status || ''}
                            onChange={(event) =>
                              updateProductField(
                                product._id,
                                'status',
                                (event.currentTarget.value ||
                                  undefined) as EditableProduct['status'],
                              )
                            }
                          >
                            <option value="">Select status</option>
                            {PRODUCT_STATUS_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      )}
                      {visibleColumnKeys.has('productType') && (
                        <td className="px-space-4 py-space-3 align-top">
                          <select
                            value={(product.productType as string) || ''}
                            onChange={(event) =>
                              updateProductField(
                                product._id,
                                'productType',
                                (event.currentTarget.value ||
                                  undefined) as EditableProduct['productType'],
                              )
                            }
                          >
                            <option value="">Select type</option>
                            {PRODUCT_TYPE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      )}
                      {visibleColumnKeys.has('price') && (
                        <td className="px-space-4 py-space-3 align-top">
                          <TextInput
                            value={product.price?.toString() ?? ''}
                            onChange={(event) =>
                              updateProductField(
                                product._id,
                                'price',
                                sanitizeNumber(event.currentTarget.value, product.price),
                              )
                            }
                            inputMode="decimal"
                          />
                        </td>
                      )}
                      {visibleColumnKeys.has('salePrice') && (
                        <td className="px-space-4 py-space-3 align-top">
                          <TextInput
                            value={product.salePrice?.toString() ?? ''}
                            onChange={(event) =>
                              updateProductField(
                                product._id,
                                'salePrice',
                                sanitizeNumber(event.currentTarget.value, product.salePrice),
                              )
                            }
                            inputMode="decimal"
                          />
                        </td>
                      )}
                      {visibleColumnKeys.has('onSale') && (
                        <td
                          className="px-space-4 py-space-3 align-top text-center"
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(product.onSale)}
                            onChange={(event) =>
                              updateProductField(product._id, 'onSale', event.currentTarget.checked)
                            }
                          />
                        </td>
                      )}
                      {visibleColumnKeys.has('discountType') && (
                        <td className="px-space-4 py-space-3 align-top">
                          <select
                            value={(product.discountType as string) || ''}
                            onChange={(event) =>
                              updateProductField(
                                product._id,
                                'discountType',
                                (event.currentTarget.value ||
                                  undefined) as EditableProduct['discountType'],
                              )
                            }
                          >
                            <option value="">Select discount</option>
                            {DISCOUNT_TYPE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      )}
                      {visibleColumnKeys.has('discountValue') && (
                        <td className="px-space-4 py-space-3 align-top">
                          <TextInput
                            value={
                              product.discountValue !== undefined && product.discountValue !== null
                                ? product.discountValue.toString()
                                : ''
                            }
                            onChange={(event) =>
                              updateProductField(
                                product._id,
                                'discountValue',
                                sanitizeNumber(event.currentTarget.value, product.discountValue),
                              )
                            }
                            inputMode="decimal"
                          />
                        </td>
                      )}
                      {visibleColumnKeys.has('saleStartDate') && (
                        <td className="px-space-4 py-space-3 align-top">
                          <input
                            type="datetime-local"
                            value={toDateInputValue(product.saleStartDate)}
                            onChange={(event) => {
                              const result = parseDateValue(event.currentTarget.value)
                              if (!result.ok) return
                              updateProductField(product._id, 'saleStartDate', result.value)
                            }}
                            style={{width: '100%'}}
                          />
                        </td>
                      )}
                      {visibleColumnKeys.has('saleEndDate') && (
                        <td className="px-space-4 py-space-3 align-top">
                          <input
                            type="datetime-local"
                            value={toDateInputValue(product.saleEndDate)}
                            onChange={(event) => {
                              const result = parseDateValue(event.currentTarget.value)
                              if (!result.ok) return
                              updateProductField(product._id, 'saleEndDate', result.value)
                            }}
                            style={{width: '100%'}}
                          />
                        </td>
                      )}
                      {visibleColumnKeys.has('saleLabel') && (
                        <td className="px-space-4 py-space-3 align-top">
                          <select
                            value={(product.saleLabel as string) || ''}
                            onChange={(event) =>
                              updateProductField(
                                product._id,
                                'saleLabel',
                                (event.currentTarget.value ||
                                  undefined) as EditableProduct['saleLabel'],
                              )
                            }
                          >
                            <option value="">Select badge</option>
                            {SALE_LABEL_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      )}
                      {visibleColumnKeys.has('availability') && (
                        <td className="px-space-4 py-space-3 align-top">
                          <select
                            value={product.availability || 'in_stock'}
                            onChange={(event) =>
                              updateProductField(
                                product._id,
                                'availability',
                                event.currentTarget.value as any,
                              )
                            }
                          >
                            <option value="in_stock">In stock</option>
                            <option value="out_of_stock">Out of stock</option>
                            <option value="preorder">Preorder</option>
                            <option value="backorder">Backorder</option>
                          </select>
                        </td>
                      )}
                      {visibleColumnKeys.has('condition') && (
                        <td className="px-space-4 py-space-3 align-top">
                          <select
                            value={product.condition || 'new'}
                            onChange={(event) =>
                              updateProductField(
                                product._id,
                                'condition',
                                event.currentTarget.value as any,
                              )
                            }
                          >
                            <option value="new">New</option>
                            <option value="refurbished">Refurbished</option>
                            <option value="used">Used</option>
                          </select>
                        </td>
                      )}
                      {visibleColumnKeys.has('manualInventoryCount') && (
                        <td className="px-space-4 py-space-3 align-top">
                          <TextInput
                            value={
                              product.manualInventoryCount !== undefined &&
                              product.manualInventoryCount !== null
                                ? product.manualInventoryCount.toString()
                                : ''
                            }
                            onChange={(event) =>
                              updateProductField(
                                product._id,
                                'manualInventoryCount',
                                sanitizeNumber(
                                  event.currentTarget.value,
                                  product.manualInventoryCount,
                                ),
                              )
                            }
                            inputMode="numeric"
                          />
                        </td>
                      )}
                      {visibleColumnKeys.has('brand') && (
                        <td className="px-space-4 py-space-3 align-top">
                          <TextInput
                            value={product.brand || ''}
                            onChange={(event) =>
                              updateProductField(product._id, 'brand', event.currentTarget.value)
                            }
                          />
                        </td>
                      )}
                      {visibleColumnKeys.has('mpn') && (
                        <td className="px-space-4 py-space-3 align-top">
                          <TextInput
                            value={product.mpn || ''}
                            onChange={(event) =>
                              updateProductField(product._id, 'mpn', event.currentTarget.value)
                            }
                          />
                        </td>
                      )}
                      {visibleColumnKeys.has('taxBehavior') && (
                        <td className="px-space-4 py-space-3 align-top">
                          <select
                            value={product.taxBehavior || 'taxable'}
                            onChange={(event) =>
                              updateProductField(
                                product._id,
                                'taxBehavior',
                                event.currentTarget.value as any,
                              )
                            }
                          >
                            <option value="taxable">Taxable</option>
                            <option value="exempt">Tax Exempt</option>
                          </select>
                        </td>
                      )}
                      {visibleColumnKeys.has('taxCode') && (
                        <td className="px-space-4 py-space-3 align-top">
                          <TextInput
                            value={product.taxCode || ''}
                            onChange={(event) =>
                              updateProductField(product._id, 'taxCode', event.currentTarget.value)
                            }
                            disabled={product.taxBehavior === 'exempt'}
                          />
                        </td>
                      )}
                      {visibleColumnKeys.has('shippingWeight') && (
                        <td className="px-space-4 py-space-3 align-top">
                          <TextInput
                            value={product.shippingWeight?.toString() ?? ''}
                            onChange={(event) =>
                              updateProductField(
                                product._id,
                                'shippingWeight',
                                sanitizeNumber(event.currentTarget.value, product.shippingWeight),
                              )
                            }
                            inputMode="decimal"
                          />
                        </td>
                      )}
                      {visibleColumnKeys.has('boxDimensions') && (
                        <td className="px-space-4 py-space-3 align-top">
                          <TextInput
                            value={product.boxDimensions || ''}
                            onChange={(event) =>
                              updateProductField(
                                product._id,
                                'boxDimensions',
                                event.currentTarget.value,
                              )
                            }
                            placeholder="LxWxH"
                          />
                        </td>
                      )}
                      {visibleColumnKeys.has('shippingClass') && (
                        <td className="px-space-4 py-space-3 align-top">
                          <select
                            value={product.shippingClass || ''}
                            onChange={(event) =>
                              updateProductField(
                                product._id,
                                'shippingClass',
                                event.currentTarget.value || undefined,
                              )
                            }
                          >
                            <option value="">Select class</option>
                            {SHIPPING_CLASS_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      )}
                      {visibleColumnKeys.has('googleProductCategory') && (
                        <td className="px-space-4 py-space-3 align-top">
                          <select
                            value={product.googleProductCategory || ''}
                            onChange={(event) =>
                              updateProductField(
                                product._id,
                                'googleProductCategory',
                                event.currentTarget.value,
                              )
                            }
                          >
                            <option value="">Select category</option>
                            {googleProductCategories.map((category) => (
                              <option key={category} value={category}>
                                {category}
                              </option>
                            ))}
                          </select>
                        </td>
                      )}
                      {visibleColumnKeys.has('categories') && (
                        <td className="px-space-4 py-space-3 align-top">
                          <select
                            multiple
                            value={normalizeRefList(product.categories)
                              .map((ref) => ref._id)
                              .filter(Boolean) as string[]}
                            onChange={(event) => {
                              const ids = Array.from(event.currentTarget.selectedOptions)
                                .map((option) => option.value)
                                .filter(Boolean)
                              const nextRefs = ids
                                .map((id) => categoryById.get(id))
                                .filter(Boolean) as NamedRef[]
                              updateProductField(
                                product._id,
                                'categories',
                                normalizeRefList(nextRefs),
                              )
                            }}
                            style={{minWidth: 200, height: 100}}
                          >
                            {categoryOptions.map((option) =>
                              option._id ? (
                                <option key={option._id} value={option._id}>
                                  {option.title || option._id}
                                </option>
                              ) : null,
                            )}
                          </select>
                        </td>
                      )}
                      {visibleColumnKeys.has('compatibleVehicles') && (
                        <td className="px-space-4 py-space-3 align-top">
                          <select
                            multiple
                            value={normalizeRefList(product.compatibleVehicles)
                              .map((ref) => ref._id)
                              .filter(Boolean) as string[]}
                            onChange={(event) => {
                              const ids = Array.from(event.currentTarget.selectedOptions)
                                .map((option) => option.value)
                                .filter(Boolean)
                              const nextRefs = ids
                                .map((id) => vehicleById.get(id))
                                .filter(Boolean) as NamedRef[]
                              updateProductField(
                                product._id,
                                'compatibleVehicles',
                                normalizeRefList(nextRefs),
                              )
                            }}
                            style={{minWidth: 200, height: 100}}
                          >
                            {vehicleOptions.map((option) =>
                              option._id ? (
                                <option key={option._id} value={option._id}>
                                  {option.title || option._id}
                                </option>
                              ) : null,
                            )}
                          </select>
                        </td>
                      )}
                      {visibleColumnKeys.has('tags') && (
                        <td className="px-space-4 py-space-3 align-top">
                          <Stack space={1}>
                            <TextInput
                              value={formatTagsCell(product.tags)}
                              onChange={(event) => {
                                const nextTags = parseTagsInput(event.currentTarget.value)
                                if (areTagsEqual(product.tags, nextTags)) return
                                updateProductField(product._id, 'tags', nextTags)
                              }}
                              placeholder="campaign, remarketing, seasonal"
                            />
                            <Text size={0} style={{color: '#9ca3af'}}>
                              Comma-separated internal labels
                            </Text>
                          </Stack>
                        </td>
                      )}
                      {visibleColumnKeys.has('availableForWholesale') && (
                        <td
                          className="px-space-4 py-space-3 align-top text-center"
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(product.availableForWholesale)}
                            onChange={(event) =>
                              updateProductField(
                                product._id,
                                'availableForWholesale',
                                event.currentTarget.checked,
                              )
                            }
                          />
                        </td>
                      )}
                      {visibleColumnKeys.has('wholesalePriceStandard') && (
                        <td className="px-space-4 py-space-3 align-top">
                          <TextInput
                            value={product.wholesalePriceStandard?.toString() ?? ''}
                            onChange={(event) =>
                              updateProductField(
                                product._id,
                                'wholesalePriceStandard',
                                sanitizeNumber(
                                  event.currentTarget.value,
                                  product.wholesalePriceStandard,
                                ),
                              )
                            }
                            inputMode="decimal"
                          />
                        </td>
                      )}
                      {visibleColumnKeys.has('wholesalePricePreferred') && (
                        <td className="px-space-4 py-space-3 align-top">
                          <TextInput
                            value={product.wholesalePricePreferred?.toString() ?? ''}
                            onChange={(event) =>
                              updateProductField(
                                product._id,
                                'wholesalePricePreferred',
                                sanitizeNumber(
                                  event.currentTarget.value,
                                  product.wholesalePricePreferred,
                                ),
                              )
                            }
                            inputMode="decimal"
                          />
                        </td>
                      )}
                      {visibleColumnKeys.has('wholesalePricePlatinum') && (
                        <td className="px-space-4 py-space-3 align-top">
                          <TextInput
                            value={product.wholesalePricePlatinum?.toString() ?? ''}
                            onChange={(event) =>
                              updateProductField(
                                product._id,
                                'wholesalePricePlatinum',
                                sanitizeNumber(
                                  event.currentTarget.value,
                                  product.wholesalePricePlatinum,
                                ),
                              )
                            }
                            inputMode="decimal"
                          />
                        </td>
                      )}
                      {visibleColumnKeys.has('minimumWholesaleQuantity') && (
                        <td className="px-space-4 py-space-3 align-top">
                          <TextInput
                            value={product.minimumWholesaleQuantity?.toString() ?? ''}
                            onChange={(event) =>
                              updateProductField(
                                product._id,
                                'minimumWholesaleQuantity',
                                sanitizeNumber(
                                  event.currentTarget.value,
                                  product.minimumWholesaleQuantity,
                                ),
                              )
                            }
                            inputMode="numeric"
                          />
                        </td>
                      )}
                      {visibleColumnKeys.has('manufacturingCost') && (
                        <td className="px-space-4 py-space-3 align-top">
                          <TextInput
                            value={product.manufacturingCost?.toString() ?? ''}
                            onChange={(event) =>
                              updateProductField(
                                product._id,
                                'manufacturingCost',
                                sanitizeNumber(
                                  event.currentTarget.value,
                                  product.manufacturingCost,
                                ),
                              )
                            }
                            inputMode="decimal"
                          />
                        </td>
                      )}
                      <td className="px-space-4 py-space-3 align-top">
                        <Stack space={2}>
                          <textarea
                            value={highlightLines.join('\n')}
                            readOnly
                            rows={3}
                            className="w-full p-space-2 text-text-meta"
                            style={{
                              resize: 'vertical',
                              background: 'rgba(15, 23, 42, 0.6)',
                              color: '#e5e7eb',
                              border: '1px solid rgba(148, 163, 184, 0.3)',
                              borderRadius: 4,
                            }}
                          />
                          <Text size={0} style={{color: '#9ca3af'}}>
                            Auto from specifications & attributes
                          </Text>
                        </Stack>
                      </td>
                      <td className="px-space-4 py-space-3 align-top">
                        <Stack space={2}>
                          <textarea
                            value={detailLines.join('\n')}
                            readOnly
                            rows={3}
                            className="w-full p-space-2 text-text-meta"
                            style={{
                              resize: 'vertical',
                              background: 'rgba(15, 23, 42, 0.6)',
                              color: '#e5e7eb',
                              border: '1px solid rgba(148, 163, 184, 0.3)',
                              borderRadius: 4,
                            }}
                            placeholder="section: attribute: value"
                          />
                          <Text size={0} style={{color: '#9ca3af'}}>
                            Auto from specifications & attributes
                          </Text>
                        </Stack>
                      </td>
                      <td className="px-space-4 py-space-3 align-top">
                        <Stack space={1}>
                          <Text size={1} style={{color: '#e5e7eb'}}>
                            {colorDisplay || '—'}
                          </Text>
                          <Text size={0} style={{color: '#9ca3af'}}>
                            Auto from options & attributes
                          </Text>
                        </Stack>
                      </td>
                      <td className="px-space-4 py-space-3 align-top">
                        <Stack space={1}>
                          <Text size={1} style={{color: '#e5e7eb'}}>
                            {sizeDisplay || '—'}
                          </Text>
                          <Text size={0} style={{color: '#9ca3af'}}>
                            Auto from options & attributes
                          </Text>
                        </Stack>
                      </td>
                      <td className="px-space-4 py-space-3 align-top">
                        <Stack space={1}>
                          <Text size={1} style={{color: '#e5e7eb'}}>
                            {materialDisplay || '—'}
                          </Text>
                          <Text size={0} style={{color: '#9ca3af'}}>
                            Auto from specifications & attributes
                          </Text>
                        </Stack>
                      </td>
                      <td className="px-space-4 py-space-3 align-top">
                        <Stack space={1}>
                          <Text size={1} style={{color: '#e5e7eb'}}>
                            {lengthDisplay || '—'}
                          </Text>
                          <Text size={0} style={{color: '#9ca3af'}}>
                            Auto from specifications
                          </Text>
                        </Stack>
                      </td>
                      <td className="px-space-4 py-space-3 align-top">
                        <Stack space={1}>
                          <Text size={1} style={{color: '#e5e7eb'}}>
                            {widthDisplay || '—'}
                          </Text>
                          <Text size={0} style={{color: '#9ca3af'}}>
                            Auto from specifications
                          </Text>
                        </Stack>
                      </td>
                      {visibleColumnKeys.has('installOnly') && (
                        <td
                          className="px-space-4 py-space-3 align-top text-center"
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(product.installOnly)}
                            onChange={(event) =>
                              updateProductField(
                                product._id,
                                'installOnly',
                                event.currentTarget.checked,
                              )
                            }
                          />
                        </td>
                      )}
                      {visibleColumnKeys.has('shippingLabel') && (
                        <td className="px-space-4 py-space-3 align-top">
                          <TextInput
                            value={product.shippingLabel || ''}
                            onChange={(event) =>
                              updateProductField(
                                product._id,
                                'shippingLabel',
                                event.currentTarget.value,
                              )
                            }
                            placeholder="install_only"
                          />
                        </td>
                      )}
                      <td className="px-space-4 py-space-3 align-top">
                        <Stack space={2}>
                          <Button
                            text={product.isSaving ? 'Saving…' : 'Save'}
                            tone="positive"
                            mode="ghost"
                            onClick={() => handleSave(product)}
                            disabled={product.isSaving || !product.dirty}
                          />
                          <Tooltip content={<Text size={1}>View on site</Text>} placement="top">
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
                  )
                })}
              </tbody>
            </table>
          </Card>
        )}
      </Stack>
    </Card>
  )
}
