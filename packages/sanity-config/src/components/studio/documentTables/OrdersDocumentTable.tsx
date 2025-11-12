// NOTE: orderId is deprecated; prefer orderNumber for identifiers.
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  Flex,
  Inline,
  Menu,
  MenuButton,
  MenuItem,
  Stack,
  Text,
  TextInput,
} from '@sanity/ui'
import {useClient} from 'sanity'
import {decodeBase64ToArrayBuffer} from '../../../utils/base64'
import {getNetlifyFunctionBaseCandidates} from '../../../utils/netlifyBase'
import {PaginatedDocumentTable, formatCurrency, formatDate} from './PaginatedDocumentTable'
import {formatOrderNumber} from '../../../utils/orderNumber'
import {DocumentBadge, formatBadgeLabel, resolveBadgeTone} from './DocumentBadge'
import {GROQ_FILTER_EXCLUDE_EXPIRED} from '../../../utils/orderFilters'

type OrderRowData = {
  orderNumber?: string | null
  invoiceOrderNumber?: string | null
  invoiceNumber?: string | null
  stripeSessionId?: string | null
  status?: string | null
  paymentStatus?: string | null
  customerName?: string | null
  customerEmail?: string | null
  shippingName?: string | null
  totalAmount?: number | null
  amountRefunded?: number | null
  currency?: string | null
  createdAt?: string | null
}

const ORDER_PROJECTION = `{
  orderNumber,
  stripeSessionId,
  "invoiceOrderNumber": invoiceRef->orderNumber,
  "invoiceNumber": invoiceRef->invoiceNumber,
  status,
  paymentStatus,
  customerName,
  customerEmail,
  "shippingName": shippingAddress.name,
  totalAmount,
  amountRefunded,
  currency,
  "createdAt": coalesce(createdAt, _createdAt)
}`

export const NEW_ORDERS_FILTER = `!defined(fulfilledAt) && (${GROQ_FILTER_EXCLUDE_EXPIRED}) && !(status in ["fulfilled","shipped","cancelled","refunded","closed"])`

const DEFAULT_ORDERINGS: Array<{field: string; direction: 'asc' | 'desc'}> = [
  {field: '_createdAt', direction: 'desc'},
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
  const identifiers = [
    data.orderNumber,
    data.invoiceOrderNumber,
    data.invoiceNumber,
    data.stripeSessionId,
  ].filter((candidate): candidate is string => Boolean(candidate && candidate.trim()))
  const candidate = identifiers.find((id) => formatOrderNumber(id))
  if (candidate) {
    const formatted = formatOrderNumber(candidate)
    if (formatted) return formatted
  }

  const fallback = identifiers.find((id) => id && id.trim())
  if (fallback) return fallback

  const sessionFormatted = formatOrderNumber(data.stripeSessionId)
  if (sessionFormatted) return sessionFormatted

  const trimmedId = data._id.replace(/^drafts\./, '')
  const randomFallback = trimmedId.slice(-6).toUpperCase()
  return randomFallback ? `#${randomFallback}` : '—'
}

function sanitizeFilenameSegment(value: string): string {
  return value.replace(/[^a-z0-9_-]/gi, '') || 'order'
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
  const netlifyBases = useMemo(() => getNetlifyFunctionBaseCandidates(), [])
  const lastSuccessfulBase = useRef<string | null>(netlifyBases[0] ?? null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [currentItems, setCurrentItems] = useState<OrderRow[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [trackingDialog, setTrackingDialog] = useState<{open: boolean; targetIds: string[]}>({
    open: false,
    targetIds: [],
  })
  const [trackingNumber, setTrackingNumber] = useState('')
  const [trackingUrl, setTrackingUrl] = useState('')

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
  const filterClauses: string[] = []
  if (excludeCheckoutSessionExpired) {
    filterClauses.push(`(${GROQ_FILTER_EXCLUDE_EXPIRED})`)
  }
  if (filter && filter.trim().length > 0) {
    filterClauses.push(`(${filter.trim()})`)
  }
  const trimmedSearch = searchTerm.trim().replace(/^#/, '')
  if (trimmedSearch.length > 0) {
    const like = `*${trimmedSearch}*`
    filterClauses.push(
      `(
        orderNumber match ${JSON.stringify(like)} ||
        invoiceNumber match ${JSON.stringify(like)} ||
        invoiceRef->orderNumber match ${JSON.stringify(like)} ||
        stripeSessionId match ${JSON.stringify(like)} ||
        customerName match ${JSON.stringify(like)} ||
        customerEmail match ${JSON.stringify(like)} ||
        shippingAddress.name match ${JSON.stringify(like)}
      )`,
    )
  }
  const combinedFilter = filterClauses.join(' && ')

  useEffect(() => {
    // Clear selection when search or filters change
    setSelectedIds(new Set())
  }, [searchTerm, filter, excludeCheckoutSessionExpired])

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

  const fulfillOrders = useCallback(
    async (ids: string[]) => {
      for (const id of ids) {
        try {
          const base = lastSuccessfulBase.current || netlifyBases[0] || ''
          await fetch(`${base}/.netlify/functions/fulfill-order`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({orderId: id}),
          })
        } catch (err) {
          console.error('Fulfill failed for', id, err)
        }
      }
    },
    [netlifyBases],
  )

  const fetchPackingSlip = useCallback(
    async (payload: Record<string, any>) => {
      const attempted = new Set<string>()
      const body = JSON.stringify(payload)
      const bases = Array.from(
        new Set([lastSuccessfulBase.current, ...netlifyBases].filter(Boolean) as string[]),
      )
      let lastErr: any
      for (const base of bases) {
        if (attempted.has(base)) continue
        attempted.add(base)
        try {
          const res = await fetch(`${base}/.netlify/functions/generatePackingSlips`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body,
          })
          if (!res.ok) {
            const message = await res.text().catch(() => '')
            const err = new Error(message || 'Packing slip request failed') as any
            err.status = res.status
            lastErr = err
            if (res.status === 404) continue
            throw err
          }
          lastSuccessfulBase.current = base
          try {
            window.localStorage?.setItem('NLFY_BASE', base)
          } catch {}
          return res
        } catch (err: any) {
          lastErr = err
          const status = err?.status || err?.response?.status
          if (!(err instanceof TypeError) && status !== 404) break
        }
      }
      throw lastErr || new Error('Packing slip request failed')
    },
    [netlifyBases],
  )

  const printPackingSlips = useCallback(
    async (ids: string[]) => {
      const labelLookup = new Map(currentItems.map((row) => [row._id, resolveOrderNumber(row)]))
      for (const id of ids) {
        try {
          const res = await fetchPackingSlip({orderId: id})
          const contentType = (res.headers.get('content-type') || '').toLowerCase()
          let arrayBuffer: ArrayBuffer
          if (contentType.includes('application/pdf')) {
            arrayBuffer = await res.arrayBuffer()
          } else {
            const base64 = (await res.text()).replace(/^"|"$/g, '')
            arrayBuffer = decodeBase64ToArrayBuffer(base64)
          }

          const blob = new Blob([arrayBuffer], {type: 'application/pdf'})
          const labelCandidate = labelLookup.get(id) || id.replace(/^drafts\./, '') || id
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
          const a = document.createElement('a')
          a.href = url
          a.download = filename
          a.click()
          window.URL.revokeObjectURL(url)
        } catch (err) {
          console.error('Packing slip failed for', id, err)
        }
      }
    },
    [client, currentItems, fetchPackingSlip, resolvePatchTargets],
  )

  const headerActions = (
    <Flex align="center" gap={3} wrap="wrap">
      <TextInput
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.currentTarget.value)}
        placeholder="Search by order #, customer, email…"
        style={{width: '280px'}}
      />
      {selectedCount > 0 ? (
        <>
          <MenuButton
            id="orders-bulk-fulfill-menu"
            button={<Button text={`Fulfill (${selectedCount})`} tone="positive" />}
            menu={
              <Menu>
                <MenuItem
                  text="Add tracking…"
                  onClick={() => setTrackingDialog({open: true, targetIds: selectedIdList})}
                />
                <MenuItem text="Create label" onClick={() => fulfillOrders(selectedIdList)} />
                <MenuItem
                  text="Mark as fulfilled"
                  onClick={async () => {
                    for (const id of selectedIdList) {
                      const base = lastSuccessfulBase.current || netlifyBases[0] || ''
                      await fetch(`${base}/.netlify/functions/fulfill-order`, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({orderId: id, markOnly: true}),
                      })
                    }
                  }}
                />
              </Menu>
            }
          />
          <Button
            text={`Print slips (${selectedCount})`}
            tone="primary"
            onClick={(e) => {
              e.preventDefault()
              printPackingSlips(selectedIdList)
            }}
          />
          <Button
            text="Clear selection"
            tone="critical"
            mode="bleed"
            onClick={() => setSelectedIds(new Set())}
          />
        </>
      ) : null}
    </Flex>
  )

  return (
    <>
      <PaginatedDocumentTable<OrderRowData>
        title={title}
        documentType="order"
        projection={ORDER_PROJECTION}
        orderings={orderings}
        pageSize={pageSize}
        filter={combinedFilter || undefined}
        emptyState={emptyState}
        excludeExpired={excludeCheckoutSessionExpired}
        headerActions={headerActions}
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
              <Text size={1} weight="medium">
                {resolveOrderNumber(data)}
              </Text>
            ),
          },
          {
            key: 'customer',
            header: 'Customer',
            render: (data: OrderRow) => <Text size={1}>{getCustomerLabel(data)}</Text>,
          },
          {
            key: 'status',
            header: 'Status',
            render: (data: OrderRow) => {
              const badges: React.ReactNode[] = []
              const paymentLabel = formatBadgeLabel(data.paymentStatus)
              if (paymentLabel) {
                badges.push(
                  <DocumentBadge
                    key="payment-status"
                    label={paymentLabel}
                    tone={resolveBadgeTone(data.paymentStatus)}
                    title={`Payment status: ${paymentLabel}`}
                  />,
                )
              }

              const fulfillmentLabel =
                data.status && data.status !== data.paymentStatus
                  ? formatBadgeLabel(data.status)
                  : null

              if (fulfillmentLabel) {
                badges.push(
                  <DocumentBadge
                    key="fulfillment-status"
                    label={fulfillmentLabel}
                    tone={resolveBadgeTone(data.status)}
                    title={`Order status: ${fulfillmentLabel}`}
                  />,
                )
              }

              if (!badges.length) {
                return <Text size={1}>—</Text>
              }

              return (
                <Inline space={4} style={{flexWrap: 'wrap', rowGap: '12px'}}>
                  {badges}
                </Inline>
              )
            },
          },
          {
            key: 'amount',
            header: 'Total',
            align: 'right',
            render: (data: OrderRow) => (
              <Text size={1}>
                {formatCurrency(data.totalAmount ?? null, data.currency ?? 'USD')}
              </Text>
            ),
          },
          {
            key: 'refunded',
            header: 'Refunded',
            align: 'right',
            render: (data: OrderRow) => {
              const value = data.amountRefunded
              return (
                <Text size={1}>
                  {value && value > 0 ? formatCurrency(value, data.currency ?? 'USD') : '—'}
                </Text>
              )
            },
          },
          {
            key: 'created',
            header: 'Created',
            render: (data: OrderRow) => <Text size={1}>{formatDate(data.createdAt)}</Text>,
          },
          {
            key: 'actions',
            header: 'Actions',
            width: 280,
            render: (data: OrderRow) => (
              <Flex gap={2}>
                <MenuButton
                  id={`order-actions-${data._id}`}
                  button={<Button text="Fulfill" tone="positive" />}
                  menu={
                    <Menu>
                      <MenuItem
                        text="Add tracking…"
                        onClick={(e) => {
                          e.preventDefault()
                          setTrackingDialog({open: true, targetIds: [data._id]})
                        }}
                      />
                      <MenuItem
                        text="Create label"
                        onClick={(e) => {
                          e.preventDefault()
                          fulfillOrders([data._id])
                        }}
                      />
                      <MenuItem
                        text="Mark as fulfilled"
                        onClick={async (e) => {
                          e.preventDefault()
                          const base = lastSuccessfulBase.current || netlifyBases[0] || ''
                          await fetch(`${base}/.netlify/functions/fulfill-order`, {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({orderId: data._id, markOnly: true}),
                          })
                        }}
                      />
                    </Menu>
                  }
                />
                <Button
                  text="Print"
                  tone="primary"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    printPackingSlips([data._id])
                  }}
                />
              </Flex>
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
                        await fetch('/.netlify/functions/manual-fulfill-order', {
                          method: 'POST',
                          headers: {'Content-Type': 'application/json'},
                          body: JSON.stringify({
                            orderId: id,
                            trackingNumber: number,
                            trackingUrl: url,
                          }),
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
