// NOTE: orderId is deprecated; prefer orderNumber for identifiers.
import React, {useCallback, useEffect, useMemo, useState} from 'react'
import {PDFDocument} from 'pdf-lib'
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  Flex,
  Heading,
  Inline,
  Menu,
  MenuButton,
  MenuItem,
  MenuDivider,
  Stack,
  Text,
  TextInput,
  useToast,
} from '@sanity/ui'
import {EllipsisVerticalIcon, FilterIcon} from '@sanity/icons'
import {useClient} from 'sanity'
import {decodeBase64ToArrayBuffer} from '../../../utils/base64'
import {callNetlifyFunction} from '../../../utils/netlifyHelpers'
import {PaginatedDocumentTable, formatCurrency} from './PaginatedDocumentTable'
import {formatOrderNumber} from '../../../utils/orderNumber'
import {DocumentBadge, buildOrderStatusBadges, formatBadgeLabel} from './DocumentBadge'
import {GROQ_FILTER_EXCLUDE_EXPIRED} from '../../../utils/orderFilters'
import RecoveredCartBadge from './RecoveredCartBadge'

type OrderRowData = {
  orderNumber?: string | null
  invoiceNumber?: string | null
  invoiceId?: string | null
  stripeSessionId?: string | null
  stripePaymentIntentStatus?: string | null
  status?: string | null
  paymentStatus?: string | null
  customerName?: string | null
  customerEmail?: string | null
  shippingName?: string | null
  totalAmount?: number | null
  amountRefunded?: number | null
  currency?: string | null
  createdAt?: string | null
  shippingLabelUrl?: string | null
  labelPurchased?: boolean | null
  shippedAt?: string | null
  deliveredAt?: string | null
  cardBrand?: string | null
  cartSummary?: string | null
}

const ORDER_PROJECTION = `{
  orderNumber,
  stripeSessionId,
  stripePaymentIntentStatus,
  "invoiceNumber": invoiceData.invoiceNumber,
  "invoiceId": invoiceData.invoiceId,
  status,
  paymentStatus,
  customerName,
  customerEmail,
  "shippingName": shippingAddress.name,
  shippingLabelUrl,
  labelPurchased,
  shippedAt,
  deliveredAt,
  totalAmount,
  amountRefunded,
  cardBrand,
  currency,
  "createdAt": coalesce(createdAt, _createdAt)
}`

const CARTS_PROJECTION = `{
  stripeSessionId,
  status,
  customerName,
  customerEmail,
  cartSummary,
  "shippingName": shippingAddress.name,
  "totalAmount": amountTotal,
  currency,
  "createdAt": coalesce(sessionExpiredAt, sessionCreatedAt, _createdAt)
}`

export const NEW_ORDERS_FILTER = `!defined(fulfilledAt) && (${GROQ_FILTER_EXCLUDE_EXPIRED}) && !(status in ["fulfilled","shipped","delivered","canceled","cancelled","refunded","closed"])`

const DEFAULT_ORDERINGS: Array<{field: string; direction: 'asc' | 'desc'}> = [
  {field: '_createdAt', direction: 'desc'},
]

const CLOSED_ORDER_STATUSES = [
  'fulfilled',
  'shipped',
  'delivered',
  'canceled',
  'cancelled',
  'refunded',
  'closed',
]
const ARCHIVED_ORDER_STATUSES = ['fulfilled', 'delivered', 'refunded']

type DocumentType = 'order' | 'abandonedCheckout'

type OrderTabId = 'all' | 'open' | 'closed' | 'carts' | 'archived'
type OrderTabConfig = {
  id: OrderTabId
  label: string
  filter?: string
  documentType?: DocumentType
  orderings?: Array<{field: string; direction: 'asc' | 'desc'}>
}

const ORDER_TABS: OrderTabConfig[] = [
  {id: 'all', label: 'All'},
  {
    id: 'open',
    label: 'Open',
    filter: `!(status in ${JSON.stringify(CLOSED_ORDER_STATUSES)})`,
  },
  {
    id: 'closed',
    label: 'Closed',
    filter: `(status in ${JSON.stringify(CLOSED_ORDER_STATUSES)})`,
  },
  {
    id: 'carts',
    label: 'Carts',
    documentType: 'abandonedCheckout',
    filter: `(status in ["abandoned", "expired", "recovered"])`,
    orderings: [{field: 'sessionExpiredAt', direction: 'desc'}],
  },
  {
    id: 'archived',
    label: 'Archived',
    filter: `(status in ${JSON.stringify(ARCHIVED_ORDER_STATUSES)})`,
  },
]

const ORDER_TYPE_OPTIONS: Array<{label: string; value: string | null}> = [
  {label: 'All Types', value: null},
  {label: 'Online Orders', value: 'online'},
  {label: 'In-Store Orders', value: 'in-store'},
  {label: 'Wholesale Orders', value: 'wholesale'},
]

type OrdersDocumentTableProps = {
  title?: string
  filter?: string
  emptyState?: string
  orderings?: Array<{field: string; direction: 'asc' | 'desc'}>
  pageSize?: number
  excludeCheckoutSessionExpired?: boolean
}

function resolveOrderNumber(data: OrderRowData & {_id: string}) {
  const identifiers = [data.orderNumber, data.invoiceNumber, data.stripeSessionId].filter(
    (candidate): candidate is string => Boolean(candidate && candidate.trim()),
  )
  const candidate = identifiers.find((id) => formatOrderNumber(id))
  if (candidate) {
    const formatted = formatOrderNumber(candidate)
    if (formatted) return formatted
  }

  const fallback = identifiers.find((id) => id && id.trim())
  if (fallback) return fallback

  const sessionFormatted = formatOrderNumber(data.stripeSessionId)
  if (sessionFormatted) return sessionFormatted

  return '—'
}

function sanitizeFilenameSegment(value: string): string {
  return value.replace(/[^a-z0-9_-]/gi, '') || 'order'
}

function formatOrderTimestamp(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function getCustomerLabel(data: OrderRowData) {
  const candidates = [data.customerName, data.shippingName, data.customerEmail]
  for (const value of candidates) {
    if (value && value.trim()) return value
  }
  return '—'
}

export default function OrdersDocumentTable({
  title = 'Orders',
  filter,
  emptyState = 'No orders found',
  orderings = DEFAULT_ORDERINGS,
  pageSize = 8,
  excludeCheckoutSessionExpired = true,
}: OrdersDocumentTableProps = {}) {
  type OrderRow = OrderRowData & {_id: string; _type: string}

  // Selection + page tracking
  const client = useClient({apiVersion: '2024-10-01'})
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [currentItems, setCurrentItems] = useState<OrderRow[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [trackingDialog, setTrackingDialog] = useState<{open: boolean; targetIds: string[]}>({
    open: false,
    targetIds: [],
  })
  const toast = useToast()
  const [trackingNumber, setTrackingNumber] = useState('')
  const [trackingUrl, setTrackingUrl] = useState('')
  const [activeTab, setActiveTab] = useState<OrderTabId>('all')
  const [openCount, setOpenCount] = useState<number | null>(null)
  const [orderTypeFilter, setOrderTypeFilter] = useState<string | null>(null)

  const handlePageItemsChange = useCallback((rows: OrderRow[]) => {
    setCurrentItems(rows)
  }, [])

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAllOnPage = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const allSelected = currentItems.length > 0 && currentItems.every((i) => next.has(i._id))
      if (allSelected) currentItems.forEach((i) => next.delete(i._id))
      else currentItems.forEach((i) => next.add(i._id))
      return next
    })
  }, [currentItems])

  const selectionMeta = useMemo(() => {
    const selectedOnPage = currentItems.filter((i) => selectedIds.has(i._id))
    const allSelected = currentItems.length > 0 && selectedOnPage.length === currentItems.length
    const someSelected = selectedOnPage.length > 0 && !allSelected
    return {allSelected, someSelected}
  }, [currentItems, selectedIds])

  // Filter + search
  const activeTabConfig = ORDER_TABS.find((tab) => tab.id === activeTab) ?? ORDER_TABS[0]
  const documentType: DocumentType = activeTabConfig.documentType ?? 'order'
  const filterClauses: string[] = []
  if (filter && filter.trim().length > 0) {
    filterClauses.push(`(${filter.trim()})`)
  }
  if (activeTabConfig?.filter) {
    filterClauses.push(`(${activeTabConfig.filter})`)
  }
  const trimmedSearch = searchTerm.trim().replace(/^#/, '')
  if (trimmedSearch.length > 0) {
    const like = `*${trimmedSearch}*`
    const searchFields =
      documentType === 'abandonedCheckout'
        ? [
            'stripeSessionId',
            'customerName',
            'customerEmail',
            'cartSummary',
            'shippingAddress.name',
          ]
        : [
            'orderNumber',
            'invoiceNumber',
            'invoiceData.invoiceNumber',
            'invoiceData.invoiceId',
            'stripeSessionId',
            'customerName',
            'customerEmail',
            'shippingAddress.name',
          ]
    filterClauses.push(
      `(${searchFields
        .map((field) => `${field} match ${JSON.stringify(like)}`)
        .join(' || ')})`,
    )
  }
  if (documentType === 'order' && orderTypeFilter) {
    filterClauses.push(`(orderType == ${JSON.stringify(orderTypeFilter)})`)
  }
  const combinedFilter = filterClauses.join(' && ')

  useEffect(() => {
    if (documentType !== 'order' && orderTypeFilter !== null) {
      setOrderTypeFilter(null)
    }
  }, [documentType, orderTypeFilter])

  useEffect(() => {
    let cancelled = false
    const openTab = ORDER_TABS.find((tab) => tab.id === 'open')
    if (!openTab?.filter) return
    const baseClauses: string[] = []
    if (excludeCheckoutSessionExpired) baseClauses.push(`(${GROQ_FILTER_EXCLUDE_EXPIRED})`)
    if (filter && filter.trim().length > 0) baseClauses.push(`(${filter.trim()})`)
    if (orderTypeFilter) baseClauses.push(`(orderType == ${JSON.stringify(orderTypeFilter)})`)
    const queryFilter = ['_type == "order"', ...baseClauses, `(${openTab.filter})`].join(' && ')
    const query = `count(*[${queryFilter}])`
    client
      .fetch<number>(query)
      .then((count) => {
        if (!cancelled) setOpenCount(count)
      })
      .catch((err) => console.error('Failed to load open order count', err))
    return () => {
      cancelled = true
    }
  }, [client, excludeCheckoutSessionExpired, filter, orderTypeFilter])

  useEffect(() => {
    // Clear selection when search or filters change
    setSelectedIds(new Set())
  }, [searchTerm, filter, excludeCheckoutSessionExpired, activeTab, orderTypeFilter])

  const selectedIdList = useMemo(() => Array.from(selectedIds), [selectedIds])
  const selectedCount = selectedIdList.length

  // Actions
  const resolvePatchTargets = useCallback((rawId?: string | null): string[] => {
    if (!rawId) return []
    const id = String(rawId).trim()
    if (!id) return []
    const published = id.replace(/^drafts\./, '')
    const set = new Set<string>([id])
    if (published && published !== id) set.add(published)
    return Array.from(set)
  }, [])

  const deleteOrders = useCallback(
    async (ids: string[]) => {
      const targets = Array.from(new Set(ids.flatMap((id) => resolvePatchTargets(id))))
      if (!targets.length) return
      const confirmed = window.confirm(
        `Delete ${targets.length} order${targets.length === 1 ? '' : 's'}? This cannot be undone.`,
      )
      if (!confirmed) return
      setBulkBusy(true)
      try {
        const tx = client.transaction()
        targets.forEach((id) => tx.delete(id))
        await tx.commit({autoGenerateArrayKeys: true})
        setSelectedIds(new Set())
        setRefreshKey((key) => key + 1)
      } catch (err) {
        console.error('Failed to delete orders', err)
        window.alert('Unable to delete selected orders. Please try again.')
      } finally {
        setBulkBusy(false)
      }
    },
    [client, resolvePatchTargets],
  )

  const duplicateOrders = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return
      const confirmed = window.confirm(
        `Duplicate ${ids.length} order${ids.length === 1 ? '' : 's'}?`,
      )
      if (!confirmed) return
      setBulkBusy(true)
      try {
        const publishedIds = Array.from(new Set(ids.map((id) => id.replace(/^drafts\./, ''))))
        const docs = await client.fetch<Array<Record<string, any>>>('*[_id in $ids]', {
          ids: publishedIds,
        })
        const tx = client.transaction()
        docs.forEach((doc) => {
          if (!doc?._id || !doc._type) return
          const {_id, _rev, _createdAt, _updatedAt, _seqNo, _version, ...rest} = doc as any
          tx.create({
            ...rest,
            _type: 'order',
          })
        })
        await tx.commit({autoGenerateArrayKeys: true})
        setRefreshKey((key) => key + 1)
        window.alert('Orders duplicated.')
      } catch (err) {
        console.error('Failed to duplicate orders', err)
        window.alert('Unable to duplicate selected orders. Please try again.')
      } finally {
        setBulkBusy(false)
      }
    },
    [client],
  )

  const fulfillOrders = useCallback(
    async (ids: string[]) => {
      const failures: string[] = []
      for (const id of ids) {
        try {
          await callNetlifyFunction('fulfillOrder', {orderId: id})
        } catch (err) {
          console.error('Fulfill failed for', id, err)
          failures.push(id)
        }
      }
      return failures
    },
    [],
  )

  const cancelOrders = useCallback(
    async (ids: string[], reason?: string) => {
      const failures: string[] = []
      const normalizedReason = reason?.trim() || undefined
      for (const id of ids) {
        try {
          await callNetlifyFunction('cancelOrder', {
            orderId: id,
            reason: normalizedReason,
          })
        } catch (err) {
          console.error('Cancel failed for', id, err)
          failures.push(id)
        }
      }
      return failures
    },
    [],
  )

  const printPackingSlips = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return
      toast.push({status: 'info', title: 'Generating packing slips…', duration: 5000})
      const labelLookup = new Map(currentItems.map((row) => [row._id, resolveOrderNumber(row)]))
      const buffers: Array<{id: string; arrayBuffer: ArrayBuffer}> = []
      for (const id of ids) {
        try {
          const res = await callNetlifyFunction('generatePackingSlips', {orderId: id})
          const contentType = (res.headers.get('content-type') || '').toLowerCase()
          let arrayBuffer: ArrayBuffer
          if (contentType.includes('application/pdf')) {
            arrayBuffer = await res.arrayBuffer()
          } else {
            const base64 = (await res.text()).replace(/^"|"$/g, '')
            arrayBuffer = decodeBase64ToArrayBuffer(base64)
          }

          const blob = new Blob([arrayBuffer], {type: 'application/pdf'})
          buffers.push({id, arrayBuffer})
          const labelCandidate = labelLookup.get(id) || 'order'
          const filenameSegment = sanitizeFilenameSegment(labelCandidate)
          const filename = `packing-slip-${filenameSegment}.pdf`

          try {
            const asset = await client.assets.upload('file', blob, {
              filename,
              contentType: 'application/pdf',
            })
            const url = (asset as any)?.url
            if (url) {
              for (const targetId of resolvePatchTargets(id)) {
                try {
                  await client.patch(targetId).set({packingSlipUrl: url}).commit({
                    autoGenerateArrayKeys: true,
                  })
                } catch (patchErr: any) {
                  const statusCode = patchErr?.statusCode || patchErr?.response?.statusCode
                  if (statusCode !== 404) throw patchErr
                }
              }
            }
          } catch (uploadErr) {
            console.warn('Packing slip upload failed; proceeding with direct download', uploadErr)
          }

          const url = window.URL.createObjectURL(blob)
          // Do not auto-download per-order; we'll merge below. Revoke immediately.
          window.URL.revokeObjectURL(url)
        } catch (err) {
          console.error('Packing slip failed for', id, err)
        }
      }

      if (buffers.length) {
        try {
          const merged = await PDFDocument.create()
          for (const {arrayBuffer} of buffers) {
            const doc = await PDFDocument.load(arrayBuffer)
            const pages = await merged.copyPages(doc, doc.getPageIndices())
            pages.forEach((p) => merged.addPage(p))
          }
          const mergedBytes = await merged.save()
          const blob = new Blob([new Uint8Array(mergedBytes)], {type: 'application/pdf'})
          const filename = `packing-slips-${buffers.length}.pdf`
          const url = window.URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = filename
          a.click()
          window.URL.revokeObjectURL(url)
          toast.push({
            status: 'success',
            title: `Packing slips ready (${buffers.length})`,
            duration: 5000,
          })
        } catch (mergeErr) {
          console.error('Failed to merge packing slips', mergeErr)
          toast.push({
            status: 'error',
            title: 'Unable to merge packing slips',
            description: 'See console/logs for details.',
            duration: 7000,
          })
        }
      }
    },
    [client, currentItems, resolvePatchTargets, toast],
  )

  const mergePdfBuffers = useCallback(async (buffers: ArrayBuffer[]): Promise<Blob> => {
    const merged = await PDFDocument.create()
    for (const buf of buffers) {
      const doc = await PDFDocument.load(buf)
      const pages = await merged.copyPages(doc, doc.getPageIndices())
      pages.forEach((p) => merged.addPage(p))
    }
    const mergedBytes = await merged.save()
    return new Blob([new Uint8Array(mergedBytes)], {type: 'application/pdf'})
  }, [])

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const convertImageToPdfBuffer = useCallback(async (buf: ArrayBuffer, mime: string) => {
    const doc = await PDFDocument.create()
    if (mime.includes('png')) {
      const png = await doc.embedPng(buf)
      const page = doc.addPage([png.width, png.height])
      page.drawImage(png, {x: 0, y: 0, width: png.width, height: png.height})
    } else if (mime.includes('jpg') || mime.includes('jpeg')) {
      const jpg = await doc.embedJpg(buf)
      const page = doc.addPage([jpg.width, jpg.height])
      page.drawImage(jpg, {x: 0, y: 0, width: jpg.width, height: jpg.height})
    }
    return doc.save()
  }, [])

  const fetchLabelPdf = useCallback(
    async (url: string): Promise<ArrayBuffer | null> => {
      try {
        const res = await fetch(url, {mode: 'cors'})
        if (!res.ok) return null
        const contentType = (res.headers.get('content-type') || '').toLowerCase()
        const buf = await res.arrayBuffer()
        if (contentType.includes('application/pdf')) {
          return buf
        }
        if (contentType.includes('image/png') || contentType.includes('image/jpeg')) {
          try {
            const uint8Array = await convertImageToPdfBuffer(buf, contentType)
            return uint8Array.buffer as ArrayBuffer
          } catch (imgErr) {
            console.warn('Label image to PDF conversion failed', url, imgErr)
            return null
          }
        }
        return null
      } catch (err) {
        console.warn('Label fetch failed', url, err)
        return null
      }
    },
    [convertImageToPdfBuffer],
  )

  const printShippingLabels = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return
      toast.push({status: 'info', title: 'Preparing shipping labels…', duration: 5000})
      const labelUrls = currentItems
        .filter((row) => ids.includes(row._id))
        .map((row) => row.shippingLabelUrl?.trim())
        .filter((url): url is string => Boolean(url))

      if (!labelUrls.length) {
        toast.push({
          status: 'warning',
          title: 'No labels found',
          description: 'Selected orders do not have shipping labels.',
          duration: 5000,
        })
        return
      }

      const buffers: ArrayBuffer[] = []
      for (const url of labelUrls) {
        const buf = await fetchLabelPdf(url)
        if (buf) buffers.push(buf)
      }

      if (!buffers.length) {
        toast.push({
          status: 'error',
          title: 'Unable to download labels',
          description: 'Check label URLs or connectivity.',
          duration: 7000,
        })
        return
      }

      if (buffers.length === 1) {
        downloadBlob(new Blob([buffers[0]], {type: 'application/pdf'}), 'shipping-label.pdf')
        toast.push({status: 'success', title: 'Shipping label ready', duration: 4000})
        return
      }

      try {
        const mergedBlob = await mergePdfBuffers(buffers)
        downloadBlob(mergedBlob, `shipping-labels-${buffers.length}.pdf`)
        toast.push({
          status: 'success',
          title: `Shipping labels ready (${buffers.length})`,
          duration: 5000,
        })
      } catch (err) {
        console.error('Failed to merge shipping labels', err)
        toast.push({
          status: 'error',
          title: 'Unable to merge labels',
          description: 'See console/logs for details.',
          duration: 7000,
        })
      }
    },
    [currentItems, fetchLabelPdf, mergePdfBuffers, toast],
  )

  const handleBulkFulfill = useCallback(async () => {
    if (!selectedCount) return
    setBulkBusy(true)
    try {
      const failed = await fulfillOrders(selectedIdList)
      setRefreshKey((key) => key + 1)
      setSelectedIds(new Set())
      if (failed.length) {
        window.alert(`Fulfillment failed for ${failed.length} order(s). Check logs for details.`)
      }
    } finally {
      setBulkBusy(false)
    }
  }, [fulfillOrders, selectedCount, selectedIdList])

  const handleBulkPrint = useCallback(async () => {
    if (!selectedCount) return
    setBulkBusy(true)
    try {
      await printPackingSlips(selectedIdList)
      setSelectedIds(new Set())
      setRefreshKey((key) => key + 1)
    } finally {
      setBulkBusy(false)
    }
  }, [printPackingSlips, selectedCount, selectedIdList])

  const handleBulkCancel = useCallback(async () => {
    if (!selectedCount) return
    const confirmed = window.confirm(
      `Cancel ${selectedCount} order${selectedCount === 1 ? '' : 's'}? This cannot be undone.`,
    )
    if (!confirmed) return
    const reason = window.prompt('Reason for cancellation (optional):') || undefined
    setBulkBusy(true)
    try {
      const failed = await cancelOrders(selectedIdList, reason || undefined)
      setRefreshKey((key) => key + 1)
      setSelectedIds(new Set())
      if (failed.length) {
        window.alert(`Unable to cancel ${failed.length} order(s). Check logs for details.`)
      } else {
        window.alert('Orders cancelled.')
      }
    } finally {
      setBulkBusy(false)
    }
  }, [cancelOrders, selectedCount, selectedIdList])

  const handleBulkTracking = useCallback(() => {
    if (!selectedCount) return
    setTrackingDialog({open: true, targetIds: selectedIdList})
  }, [selectedCount, selectedIdList])

  const headerContent = (
    <Stack space={3}>
      <Flex align="center" justify="space-between" wrap="wrap" gap={3}>
        <Heading as="h2" size={3}>
          {title}
        </Heading>
        {selectedCount > 0 ? (
          <Text size={1} weight="medium">
            {selectedCount} selected
          </Text>
        ) : null}
      </Flex>
      <Flex align="center" gap={1} wrap="wrap">
        {ORDER_TABS.map((tab) => {
          const isActive = tab.id === activeTab
          const tabLabel =
            tab.id === 'open' && openCount !== null ? `Open (${openCount})` : tab.label
          return (
            <Button
              key={tab.id}
              text={tabLabel}
              mode={isActive ? 'default' : 'bleed'}
              tone={isActive ? 'primary' : 'default'}
              padding={3}
              onClick={() => setActiveTab(tab.id)}
              disabled={isActive}
            />
          )
        })}
      </Flex>
      <Flex align="center" gap={3} wrap="wrap">
        <TextInput
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.currentTarget.value)}
          placeholder="Search orders…"
          style={{flex: 1, minWidth: '220px', maxWidth: '360px'}}
        />
        {documentType === 'order' ? (
          <MenuButton
            id="order-type-filter"
            button={
              <Button
                icon={FilterIcon}
                mode="ghost"
                aria-label="Filter by order type"
                tone={orderTypeFilter ? 'primary' : 'default'}
              />
            }
            menu={
              <Menu>
                {ORDER_TYPE_OPTIONS.map((option) => (
                  <MenuItem
                    key={option.value ?? 'all'}
                    text={option.label}
                    selected={orderTypeFilter === option.value}
                    onClick={() => setOrderTypeFilter(option.value)}
                  />
                ))}
              </Menu>
            }
          />
        ) : (
          <Button
            icon={FilterIcon}
            mode="ghost"
            aria-label="Order type filter available for orders"
            disabled
          />
        )}
        <MenuButton
          id="orders-bulk-actions"
          button={
            <Button
              icon={EllipsisVerticalIcon}
              mode="ghost"
              text="Actions"
              disabled={bulkBusy}
              aria-label="Order actions"
            />
          }
          menu={
            <Menu>
              <MenuItem
                text="Fulfill orders"
                tone="positive"
                disabled={selectedCount === 0 || bulkBusy}
                onClick={handleBulkFulfill}
              />
              <MenuItem
                text="Print packing slips"
                tone="primary"
                disabled={selectedCount === 0 || bulkBusy}
                onClick={handleBulkPrint}
              />
              <MenuItem
                text="Print shipping labels"
                disabled={selectedCount === 0 || bulkBusy}
                onClick={() => printShippingLabels(selectedIdList)}
              />
              <MenuItem
                text="Add tracking"
                disabled={selectedCount === 0 || bulkBusy}
                onClick={handleBulkTracking}
              />
              <MenuItem
                text="Cancel orders"
                tone="critical"
                disabled={selectedCount === 0 || bulkBusy}
                onClick={handleBulkCancel}
              />
              <MenuDivider />
              <MenuItem
                text="Duplicate orders"
                disabled={selectedCount === 0 || bulkBusy}
                onClick={() => duplicateOrders(selectedIdList)}
              />
              <MenuItem
                text="Delete orders"
                tone="critical"
                disabled={selectedCount === 0 || bulkBusy}
                onClick={() => deleteOrders(selectedIdList)}
              />
              {selectedCount > 0 ? (
                <>
                  <MenuDivider />
                  <MenuItem
                    text="Clear selection"
                    disabled={bulkBusy}
                    onClick={() => setSelectedIds(new Set())}
                  />
                </>
              ) : null}
            </Menu>
          }
        />
      </Flex>
    </Stack>
  )

  return (
    <>
      <PaginatedDocumentTable<OrderRowData>
        key={refreshKey}
        title={title}
        documentType={documentType}
        projection={documentType === 'abandonedCheckout' ? CARTS_PROJECTION : ORDER_PROJECTION}
        orderings={activeTabConfig?.orderings ?? orderings}
        pageSize={pageSize}
        filter={combinedFilter || undefined}
        emptyState={emptyState}
        excludeExpired={documentType === 'order' ? excludeCheckoutSessionExpired : false}
        headerContent={headerContent}
        onPageItemsChange={handlePageItemsChange}
        columns={[
          {
            key: 'select',
            header: (
              <Checkbox
                aria-label="Select all orders on this page"
                checked={selectionMeta.allSelected}
                indeterminate={selectionMeta.someSelected}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation()
                  toggleAllOnPage()
                }}
              />
            ),
            width: 48,
            align: 'center',
            render: (data: OrderRow) => (
              <Checkbox
                aria-label={`Select ${resolveOrderNumber(data)}`}
                checked={selectedIds.has(data._id)}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation()
                  toggleSelection(data._id)
                }}
              />
            ),
          },
          {
            key: 'order',
            header: 'Order',
            render: (data: OrderRow) => (
              <Stack space={1}>
                <Text size={1} weight="medium">
                  {resolveOrderNumber(data)}
                </Text>
                <Text size={0} muted>
                  {formatOrderTimestamp(data.createdAt)}
                </Text>
              </Stack>
            ),
          },
          {
            key: 'customer',
            header: 'Customer',
            render: (data: OrderRow) => (
              <Stack space={1}>
                <Text size={1}>{getCustomerLabel(data)}</Text>
                {data.customerEmail ? (
                  <Text size={0} muted>
                    {data.customerEmail}
                  </Text>
                ) : null}
                {data._type === 'abandonedCheckout' && data.cartSummary ? (
                  <Text size={0} muted>
                    {data.cartSummary}
                  </Text>
                ) : null}
              </Stack>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            render: (data: OrderRow) => {
              if (data._type === 'abandonedCheckout') {
                const cartStatusLabel = formatBadgeLabel(data.status) || 'Abandoned'
                return (
                  <Stack space={2}>
                    <Text size={1}>{cartStatusLabel}</Text>
                    <RecoveredCartBadge status={data.status ?? undefined} />
                  </Stack>
                )
              }

              const badges = buildOrderStatusBadges({
                paymentStatus: data.paymentStatus,
                orderStatus: data.status,
                labelPurchased: data.labelPurchased,
                shippedAt: data.shippedAt,
                deliveredAt: data.deliveredAt,
              })
              if (!badges.length) {
                return <Text size={1}>—</Text>
              }

              return (
                <Inline space={4} style={{flexWrap: 'wrap', rowGap: '12px'}}>
                  {badges.map((badge) => (
                    <DocumentBadge
                      key={badge.key}
                      label={badge.label}
                      tone={badge.tone}
                      title={badge.title}
                    />
                  ))}
                </Inline>
              )
            },
          },
          {
            key: 'amount',
            header: 'Total',
            align: 'right',
            render: (data: OrderRow) => (
              <Stack space={1} style={{alignItems: 'flex-end'}}>
                <Text size={1}>
                  {formatCurrency(data.totalAmount ?? null, data.currency ?? 'USD')}
                </Text>
                <Text size={0} muted>
                  {data.cardBrand || '—'}
                </Text>
              </Stack>
            ),
          },
        ]}
      />
      {trackingDialog.open ? (
        <Dialog
          id="orders-add-tracking"
          header={`Add tracking (${trackingDialog.targetIds.length})`}
          onClose={() => setTrackingDialog({open: false, targetIds: []})}
          width={1}
        >
          <Box padding={4}>
            <Stack space={3}>
              <Text size={1}>Tracking number</Text>
              <TextInput
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.currentTarget.value)}
                placeholder="1Z… / JJD… / etc."
              />
              <Text size={1}>Tracking URL (optional)</Text>
              <TextInput
                value={trackingUrl}
                onChange={(e) => setTrackingUrl(e.currentTarget.value)}
                placeholder="https://carrier.example/track/…"
              />
              <Flex gap={2} marginTop={3}>
                <Button
                  text="Save + notify"
                  tone="positive"
                  disabled={!trackingNumber.trim()}
                  onClick={async () => {
                    const number = trackingNumber.trim()
                    const url = trackingUrl.trim() || undefined
                    for (const id of trackingDialog.targetIds) {
                      try {
                        await callNetlifyFunction('manual-fulfill-order', {
                          orderId: id,
                          trackingNumber: number,
                          trackingUrl: url,
                        })
                      } catch (err) {
                        console.error('Manual fulfill failed for', id, err)
                      }
                    }
                    setTrackingDialog({open: false, targetIds: []})
                    setTrackingNumber('')
                    setTrackingUrl('')
                  }}
                />
                <Button
                  text="Cancel"
                  mode="bleed"
                  onClick={() => setTrackingDialog({open: false, targetIds: []})}
                />
              </Flex>
            </Stack>
          </Box>
        </Dialog>
      ) : null}
    </>
  )
}
