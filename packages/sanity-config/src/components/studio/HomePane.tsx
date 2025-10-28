import React, {useEffect, useMemo, useState} from 'react'
import {
  Box,
  Button,
  Card,
  Flex,
  Grid,
  Heading,
  Spinner,
  Stack,
  Text,
} from '@sanity/ui'
import {useClient} from 'sanity'
import {useRouter} from 'sanity/router'

type RecentOrder = {
  _id: string
  orderNumber?: string | null
  customerName?: string | null
  customerEmail?: string | null
  shippingName?: string | null
  totalAmount?: number | null
  _createdAt?: string | null
}

type RecentProduct = {
  _id: string
  title?: string | null
  sku?: string | null
  status?: string | null
  _updatedAt?: string | null
  imageUrl?: string | null
  imageAlt?: string | null
}

type RecentInvoice = {
  _id: string
  invoiceNumber?: string | null
  customerName?: string | null
  total?: number | null
  status?: string | null
  _createdAt?: string | null
}

type HomePaneState = {
  orders: RecentOrder[]
  products: RecentProduct[]
  invoices: RecentInvoice[]
}

const initialState: HomePaneState = {
  orders: [],
  products: [],
  invoices: [],
}

type SectionIntent = {
  name: 'type' | 'create' | 'edit'
  params: Record<string, unknown>
}

type SectionItem = {
  key: string
  primary: string
  secondary: string
  meta: string
  date?: string | null
  intent: SectionIntent
  imageUrl?: string | null
  imageAlt?: string | null
}

type SectionDefinition = {
  id: string
  title: string
  description: string
  items: SectionItem[]
  footer: {
    label: string
    intent: SectionIntent
  }
}

const ORDER_QUERY = `*[_type == "order"] | order(coalesce(createdAt, _createdAt) desc)[0...5]{
  _id,
  orderNumber,
  customerName,
  customerEmail,
  "shippingName": shippingAddress.name,
  totalAmount,
  "_createdAt": coalesce(createdAt, _createdAt)
}`

const PRODUCT_QUERY = `*[_type == "product"] | order(_updatedAt desc)[0...5]{
  _id,
  title,
  sku,
  status,
  _updatedAt,
  "imageUrl": images[0].asset->url,
  "imageAlt": coalesce(images[0].alt, title)
}`

const INVOICE_QUERY = `*[_type == "invoice"] | order(coalesce(issueDate, _createdAt) desc)[0...5]{
  _id,
  invoiceNumber,
  customerName,
  total,
  status,
  "_createdAt": coalesce(issueDate, _createdAt)
}`

const formatDate = (value?: string | null) => {
  if (!value) return '—'
  try {
    const date = new Date(value)
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return value
  }
}

const formatCurrency = (value?: number | null) => {
  if (typeof value !== 'number') return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value)
}

const getOrderCustomerLabel = (order: RecentOrder) => {
  const candidates = [order.customerName, order.shippingName, order.customerEmail]

  for (const value of candidates) {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed) {
        return trimmed
      }
    }
  }

  return 'Unknown customer'
}

const HomePane = React.forwardRef<HTMLDivElement, Record<string, never>>((_props, ref) => {
  const client = useClient({apiVersion: '2024-10-01'})
  const router = useRouter()

  const [state, setState] = useState<HomePaneState>(initialState)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const fetchAll = async () => {
      try {
        const [orders, products, invoices] = await Promise.all([
          client.fetch<RecentOrder[]>(ORDER_QUERY),
          client.fetch<RecentProduct[]>(PRODUCT_QUERY),
          client.fetch<RecentInvoice[]>(INVOICE_QUERY),
        ])

        if (!cancelled) {
          setState({
            orders: orders || [],
            products: products || [],
            invoices: invoices || [],
          })
        }
      } catch (err: any) {
        console.error('HomePane: failed to load dashboard data', err)
        if (!cancelled) {
          setError('Unable to load recent activity. Try refreshing the Studio.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchAll()

    return () => {
      cancelled = true
    }
  }, [client])

  const sections = useMemo<SectionDefinition[]>(
    () => [
      {
        id: 'orders',
        title: 'Recent orders',
        description: 'Latest customer orders across the store.',
        items: state.orders.map((order) => ({
          key: order._id,
          primary: order.orderNumber ? `Order #${order.orderNumber}` : 'Order',
          secondary: getOrderCustomerLabel(order),
          meta: formatCurrency(order.totalAmount),
          date: order._createdAt,
          intent: {name: 'edit' as const, params: {id: order._id, type: 'order'}},
        })),
        footer: {
          label: 'View all orders',
          intent: {name: 'type' as const, params: {type: 'order'}},
        },
      },
      {
        id: 'products',
        title: 'Recently updated products',
        description: 'Products edited most recently.',
        items: state.products.map((product) => ({
          key: product._id,
          primary: product.title || 'Untitled product',
          secondary: product.sku || 'No SKU',
          meta: product.status ? product.status.replace(/^\w/, (l) => l.toUpperCase()) : '—',
          date: product._updatedAt,
          intent: {name: 'edit' as const, params: {id: product._id, type: 'product'}},
          imageUrl: product.imageUrl,
          imageAlt: product.imageAlt || product.title || 'Product image',
        })),
        footer: {
          label: 'Browse products',
          intent: {name: 'type' as const, params: {type: 'product'}},
        },
      },
      {
        id: 'invoices',
        title: 'Recent invoices',
        description: 'Invoices created or updated lately.',
        items: state.invoices.map((invoice) => ({
          key: invoice._id,
          primary: invoice.invoiceNumber ? `Invoice ${invoice.invoiceNumber}` : 'Invoice',
          secondary: invoice.customerName || 'No customer on file',
          meta: formatCurrency(invoice.total),
          date: invoice._createdAt,
          intent: {name: 'edit' as const, params: {id: invoice._id, type: 'invoice'}},
        })),
        footer: {
          label: 'View invoices',
          intent: {name: 'type' as const, params: {type: 'invoice'}},
        },
      },
    ],
    [state],
  )

  const handleIntent = (intent: 'type' | 'create' | 'edit', params: Record<string, unknown>) => {
    router.navigateIntent(intent, params as any)
  }

  return (
    <Box ref={ref} padding={[4, 5, 6]}>
      <Stack space={5}>
        <Stack space={2}>
          <Heading size={4}>Welcome back</Heading>
          <Text muted size={2}>
            Quick snapshot of what’s happening across F.A.S. Motorsports. Use the shortcuts below to dive
            deeper into orders, products, and finance.
          </Text>
        </Stack>

        {loading ? (
          <Flex align="center" justify="center" style={{minHeight: 200}}>
            <Spinner muted size={4} />
          </Flex>
        ) : error ? (
          <Card padding={4} radius={3} shadow={1} tone="critical">
            <Stack space={3}>
              <Text weight="semibold">{error}</Text>
              <Button text="Retry" onClick={() => window.location.reload()} tone="critical" />
            </Stack>
          </Card>
        ) : (
          <Grid columns={[1, 1, 2]} gap={[3, 4, 5]}>
            {sections.map((section) => (
              <Card key={section.id} padding={4} radius={3} shadow={1} tone="transparent">
                <Stack space={4}>
                  <Stack space={2}>
                    <Text size={3} weight="semibold">
                      {section.title}
                    </Text>
                    <Text muted size={1}>
                      {section.description}
                    </Text>
                  </Stack>

                  <Stack space={2}>
                    {section.items.length === 0 ? (
                      <Card padding={3} radius={2} tone="transparent" border>
                        <Text size={1} muted>
                          Nothing to show yet. Create something new to see it appear here.
                        </Text>
                      </Card>
                    ) : (
                      section.items.map((item) => (
                        <Card
                          key={item.key}
                          padding={3}
                          radius={2}
                          tone="transparent"
                          border
                          style={{cursor: 'pointer'}}
                          onClick={() => handleIntent(item.intent.name, item.intent.params)}
                        >
                          <Flex gap={3} align="flex-start">
                            {item.imageUrl ? (
                              <Card
                                padding={0}
                                radius={2}
                                shadow={1}
                                tone="transparent"
                                style={{
                                  width: 56,
                                  height: 56,
                                  overflow: 'hidden',
                                  flexShrink: 0,
                                }}
                              >
                                <img
                                  src={`${item.imageUrl}?w=160&h=160&fit=crop&auto=format`}
                                  alt={item.imageAlt || item.primary}
                                  style={{width: '100%', height: '100%', objectFit: 'cover'}}
                                />
                              </Card>
                            ) : null}

                            <Stack space={1} style={{flex: 1, minWidth: 0}}>
                              <Flex align="center" justify="space-between" gap={3}>
                                <Text size={2} weight="semibold" style={{flex: 1, minWidth: 0}}>
                                  {item.primary}
                                </Text>
                                <Text size={1} muted>
                                  {item.meta}
                                </Text>
                              </Flex>
                              <Flex align="center" justify="space-between" gap={3}>
                                <Text size={1} muted style={{flex: 1, minWidth: 0}}>
                                  {item.secondary}
                                </Text>
                                <Text size={1} muted>
                                  {formatDate(item.date)}
                                </Text>
                              </Flex>
                            </Stack>
                          </Flex>
                        </Card>
                      ))
                    )}
                  </Stack>

                  <Button
                    mode="ghost"
                    text={section.footer.label}
                    onClick={() => handleIntent(section.footer.intent.name, section.footer.intent.params)}
                  />
                </Stack>
              </Card>
            ))}
          </Grid>
        )}
      </Stack>
    </Box>
  )
})

HomePane.displayName = 'HomePane'

export default HomePane
