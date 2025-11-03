import React, {Suspense, useMemo, useRef, useState} from 'react'
import {
  Box,
  Button,
  Card,
  Flex,
  Heading,
  Menu,
  MenuButton,
  MenuItem,
  Spinner,
  Stack,
  Text,
} from '@sanity/ui'
import {
  EllipsisVerticalIcon,
  SortIcon,
  CheckmarkIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
} from '@sanity/icons'
import {
  SanityApp,
  type DocumentHandle,
  useDocumentProjection,
  usePaginatedDocuments,
} from '@sanity/sdk-react'
import {useClient} from 'sanity'
import {useRouter} from 'sanity/router'

import {formatCurrency, formatDate} from './documentTables/PaginatedDocumentTable'
import {DocumentBadge, formatBadgeLabel, resolveBadgeTone} from './documentTables/DocumentBadge'
import {formatOrderNumber} from '../../utils/orderNumber'
import {deriveOrderDisplay, type OrderV2Snapshot} from '../../utils/orderV2'
import {
  EXPIRED_SESSION_PANEL_TITLE,
  GROQ_FILTER_EXCLUDE_EXPIRED,
  GROQ_FILTER_ONLY_EXPIRED,
} from '../../utils/orderFilters'

const API_VERSION = '2024-10-01'
const PAGE_SIZE = 10
const ORDER_IMAGE_PLACEHOLDER =
  'https://cdn.sanity.io/images/r4og35qd/production/c3623df3c0e45a480c59d12765725f985f6d2fdb-1000x1000.png'

type FilterDefinition = {
  id: string
  title: string
  filter?: string
  description?: string
  skipBaseFilter?: boolean
}

type SortDefinition = {
  id: string
  title: string
  field: string
  direction: 'asc' | 'desc'
}

const BASE_FILTER = GROQ_FILTER_EXCLUDE_EXPIRED

const FILTERS: FilterDefinition[] = [
  {id: 'recent', title: 'Recent', description: 'Newest orders first'},
  {
    id: 'awaiting',
    title: 'Awaiting fulfillment',
    filter: '(coalesce(orderV2.status, status) == "paid" && !defined(fulfilledAt))',
  },
  {id: 'paid', title: 'Paid', filter: 'coalesce(orderV2.status, status) == "paid"'},
  {
    id: 'fulfilled',
    title: 'Fulfilled / Shipped',
    filter: 'coalesce(orderV2.status, status) in ["fulfilled","shipped"]',
  },
  {
    id: 'issues',
    title: 'Payment issues',
    filter:
      'coalesce(orderV2.payment.status, paymentStatus) in ["cancelled","failed","refunded","partially_refunded"]',
  },
  {
    id: 'expired',
    title: EXPIRED_SESSION_PANEL_TITLE,
    filter: GROQ_FILTER_ONLY_EXPIRED,
    description: 'Checkout sessions that expired before payment completed',
    skipBaseFilter: true,
  },
]

const SORT_OPTIONS: SortDefinition[] = [
  {
    id: 'createdDesc',
    title: 'Newest first',
    field: 'coalesce(orderV2.createdAt, createdAt, _createdAt)',
    direction: 'desc',
  },
  {
    id: 'createdAsc',
    title: 'Oldest first',
    field: 'coalesce(orderV2.createdAt, createdAt, _createdAt)',
    direction: 'asc',
  },
  {
    id: 'totalDesc',
    title: 'Order total (high → low)',
    field: 'coalesce(orderV2.orderSummary.total, totalAmount, amountSubtotal, 0)',
    direction: 'desc',
  },
  {
    id: 'totalAsc',
    title: 'Order total (low → high)',
    field: 'coalesce(orderV2.orderSummary.total, totalAmount, amountSubtotal, 0)',
    direction: 'asc',
  },
]

type OrderProjection = {
  orderNumber?: string | null
  customerName?: string | null
  customerEmail?: string | null
  paymentStatus?: string | null
  status?: string | null
  totalAmount?: number | null
  amountRefunded?: number | null
  currency?: string | null
  createdAt?: string | null
  primaryImage?: string | null
  stripeSessionId?: string | null
  orderV2?: OrderV2Snapshot | null
}

const ORDER_PROJECTION = `{
  orderNumber,
  customerName,
  customerEmail,
  paymentStatus,
  status,
  totalAmount,
  amountRefunded,
  currency,
  "createdAt": coalesce(createdAt, _createdAt),
  stripeSessionId,
  orderV2,
  "primaryImage": coalesce(
    cart[0].product.image.asset->url,
    cart[0].product.images[0].asset->url,
    cart[0].productImage.asset->url,
    cart[0].image.asset->url,
    cart[0].productPreview.image.asset->url,
    ${JSON.stringify(ORDER_IMAGE_PLACEHOLDER)}
  )
}`

const LOADING_ROW = (
  <tr>
    <td colSpan={7} style={{padding: '16px'}}>
      <Flex align="center" gap={2}>
        <Spinner muted />
        <Text size={1} muted>
          Loading…
        </Text>
      </Flex>
    </td>
  </tr>
)

function statusBadge(value?: string | null) {
  const label = formatBadgeLabel(value)
  if (!label) return null
  return <DocumentBadge label={label} tone={resolveBadgeTone(value)} />
}

function OrderTableRow({document}: {document: DocumentHandle}) {
  const router = useRouter()
  const ref = useRef<HTMLTableRowElement | null>(null)

  const {data} = useDocumentProjection<OrderProjection>({
    ...document,
    ref,
    projection: ORDER_PROJECTION,
  })

  const handleOpen = () => {
    if (typeof router.navigateIntent === 'function') {
      router.navigateIntent('edit', {id: document.documentId, type: document.documentType})
    }
  }

  if (!data) {
    return (
      <tr ref={ref}>
        <td colSpan={7} style={{padding: '16px'}}>
          <Flex align="center" gap={2}>
            <Spinner muted />
            <Text size={1} muted>
              Loading order…
            </Text>
          </Flex>
        </td>
      </tr>
    )
  }

  const display = deriveOrderDisplay({...data, _id: document.documentId})
  const imageSrc = data.primaryImage || ORDER_IMAGE_PLACEHOLDER
  const orderIdentifier = display.identifiers.find((id) => formatOrderNumber(id))
  const fallbackIdentifier = display.identifiers.find((id) => id && id.trim())
  const displayOrderNumber =
    formatOrderNumber(orderIdentifier ?? fallbackIdentifier) || fallbackIdentifier || '—'
  const paymentBadge = statusBadge(display.paymentStatus)
  const fulfillmentBadge =
    display.status && display.status !== display.paymentStatus
      ? statusBadge(display.status)
      : null
  const customerLabel = display.customerName || display.customerEmail || '—'

  return (
    <tr
      ref={ref}
      onClick={handleOpen}
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
      <td style={{padding: '12px', width: 60}}>
        <Box
          style={{
            width: 44,
            height: 44,
            borderRadius: 8,
            overflow: 'hidden',
            backgroundColor: 'var(--card-muted-fg-color)',
          }}
        >
          <img
            src={imageSrc}
            alt={
              displayOrderNumber
                ? `Preview for ${displayOrderNumber}`
                : data.orderNumber
                  ? `Preview for ${data.orderNumber}`
                  : 'Order preview'
            }
            style={{width: '100%', height: '100%', objectFit: 'cover'}}
          />
        </Box>
      </td>
      <td style={{padding: '12px'}}>
        <Text size={1} weight="medium">
          {displayOrderNumber}
        </Text>
      </td>
      <td style={{padding: '12px'}}>
        <Text size={1}>{customerLabel}</Text>
        {display.customerEmail && display.customerEmail !== customerLabel ? (
          <Text size={0} muted>
            {display.customerEmail}
          </Text>
        ) : null}
      </td>
      <td style={{padding: '12px'}}>
        <Flex gap={2} wrap="wrap">
          {paymentBadge}
          {fulfillmentBadge}
        </Flex>
      </td>
      <td style={{padding: '12px', textAlign: 'right'}}>
        <Text size={1} weight="medium">
          {formatCurrency(display.totalAmount ?? null, display.currency ?? 'USD')}
        </Text>
      </td>
      <td style={{padding: '12px', textAlign: 'right'}}>
        <Text size={1}>
          {display.amountRefunded && display.amountRefunded > 0
            ? formatCurrency(display.amountRefunded, display.currency ?? 'USD')
            : '—'}
        </Text>
      </td>
      <td style={{padding: '12px'}}>
        <Text size={1}>{formatDate(display.createdAt)}</Text>
      </td>
    </tr>
  )
}

function OrdersTableContent() {
  const [filterId, setFilterId] = useState<string>(FILTERS[0].id)
  const [sortId, setSortId] = useState<string>(SORT_OPTIONS[0].id)

  const activeFilter = useMemo(
    () => FILTERS.find((item) => item.id === filterId) ?? FILTERS[0],
    [filterId],
  )

  const activeSort = useMemo(
    () => SORT_OPTIONS.find((item) => item.id === sortId) ?? SORT_OPTIONS[0],
    [sortId],
  )

  const combinedFilter = useMemo(() => {
    const filterExpression = activeFilter.filter?.trim()
    if (activeFilter.skipBaseFilter) {
      return filterExpression && filterExpression.length > 0 ? filterExpression : undefined
    }
    if (filterExpression && filterExpression.length > 0) {
      return `(${BASE_FILTER}) && (${filterExpression})`
    }
    return BASE_FILTER
  }, [activeFilter.filter, activeFilter.skipBaseFilter])

  const {
    data,
    isPending,
    currentPage,
    totalPages,
    hasNextPage,
    hasPreviousPage,
    nextPage,
    previousPage,
    count,
  } = usePaginatedDocuments({
    documentType: 'order',
    pageSize: PAGE_SIZE,
    filter: combinedFilter,
    orderings: [{field: activeSort.field, direction: activeSort.direction}],
  })

  return (
    <Stack space={4}>
      <Flex align="center" justify="space-between">
        <Stack space={2}>
          <Heading size={4}>Orders</Heading>
          <Text size={1} muted>
            {count === 1 ? '1 order' : `${count} orders`}
          </Text>
        </Stack>
        <Flex gap={2}>
          <MenuButton
            id="orders-filter-menu"
            button={<Button icon={EllipsisVerticalIcon} text={activeFilter.title} mode="ghost" />}
            menu={
              <Menu>
                {FILTERS.map((item) => (
                  <MenuItem
                    key={item.id}
                    pressed={item.id === activeFilter.id}
                    icon={item.id === activeFilter.id ? CheckmarkIcon : undefined}
                    text={item.title}
                    onClick={() => setFilterId(item.id)}
                  />
                ))}
              </Menu>
            }
          />
          <MenuButton
            id="orders-sort-menu"
            button={<Button icon={SortIcon} text={activeSort.title} mode="ghost" />}
            menu={
              <Menu>
                {SORT_OPTIONS.map((item) => (
                  <MenuItem
                    key={item.id}
                    pressed={item.id === activeSort.id}
                    icon={item.id === activeSort.id ? CheckmarkIcon : undefined}
                    text={item.title}
                    onClick={() => setSortId(item.id)}
                  />
                ))}
              </Menu>
            }
          />
        </Flex>
      </Flex>

      <Card radius={3} shadow={1} tone="transparent" padding={0}>
        <div style={{overflowX: 'auto'}}>
          <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '14px'}}>
            <thead>
              <tr>
                {['', 'Order', 'Customer', 'Status', 'Total', 'Refunded', 'Created'].map(
                  (header) => (
                    <th
                      key={header}
                      style={{
                        textAlign: header === 'Total' || header === 'Refunded' ? 'right' : 'left',
                        padding: '12px',
                        fontSize: '12px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        color: 'var(--card-muted-fg-color)',
                        fontWeight: 600,
                        borderBottom: '1px solid var(--card-border-color)',
                      }}
                    >
                      {header}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {data.length === 0 && !isPending ? (
                <tr>
                  <td colSpan={7} style={{padding: '16px'}}>
                    <Text size={1} muted>
                      No orders match the selected filter.
                    </Text>
                  </td>
                </tr>
              ) : null}

              {data.map((document) => (
                <Suspense fallback={LOADING_ROW} key={document.documentId}>
                  <OrderTableRow document={document} />
                </Suspense>
              ))}

              {isPending ? LOADING_ROW : null}
            </tbody>
          </table>
        </div>
      </Card>

      <Flex align="center" justify="space-between">
        <Button
          mode="ghost"
          icon={ArrowLeftIcon}
          text="Previous"
          disabled={!hasPreviousPage}
          onClick={previousPage}
        />
        <Text size={1} weight="medium">
          Page {totalPages === 0 ? 0 : currentPage} of {totalPages}
        </Text>
        <Button
          mode="ghost"
          iconRight={ArrowRightIcon}
          text="Next"
          disabled={!hasNextPage}
          onClick={nextPage}
        />
      </Flex>
    </Stack>
  )
}

const OrderListPane = React.forwardRef<HTMLDivElement, Record<string, never>>((_props, ref) => {
  const sourceClient = useClient({apiVersion: API_VERSION})
  const client = useMemo(
    () => sourceClient.withConfig({perspective: 'previewDrafts' as const}),
    [sourceClient],
  )

  const sdkConfig = useMemo(() => {
    const {projectId, dataset} = client.config()
    return {
      projectId,
      dataset,
      apiVersion: API_VERSION,
      useCdn: false,
      studioMode: {enabled: true},
      perspective: 'previewDrafts' as const,
    }
  }, [client])

  return (
    <Box ref={ref} padding={4}>
      <SanityApp
        config={sdkConfig}
        fallback={
          <Card padding={4}>
            <Flex align="center" justify="center">
              <Spinner muted />
            </Flex>
          </Card>
        }
      >
        <OrdersTableContent />
      </SanityApp>
    </Box>
  )
})

OrderListPane.displayName = 'OrderListPane'

export default OrderListPane
