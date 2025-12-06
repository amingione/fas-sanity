import {useEffect, useRef, useState} from 'react'
import {Box, Button, Card, Flex, Grid, Heading, Stack, Text, useToast} from '@sanity/ui'
import {useClient} from 'sanity'
import type {ComponentType} from 'react'

const DASHBOARD_QUERY = `{
  "orders": *[_type == "order" && orderType == "wholesale" && wholesaleDetails.vendor._ref == $vendorId] | order(_createdAt desc)[0...5]{
    _id,
    orderNumber,
    status,
    totalAmount,
    _createdAt
  },
  "invoices": *[_type == "invoice" && orderRef->wholesaleDetails.vendor._ref == $vendorId] | order(_createdAt desc)[0...5]{
    _id,
    invoiceNumber,
    status,
    total,
    _createdAt
  }
}`

const formatCurrency = (value?: number | null) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '$0.00'
  return new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(value)
}

const formatDate = (value?: string | null) => {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})
  } catch {
    return value
  }
}

type VendorDashboardProps = {
  documentId?: string
  document?: {displayed?: Record<string, any>}
  schemaType?: {name?: string}
  onFocusPath?: (path: any[]) => void
  router?: {navigateIntent: (intent: string, params?: Record<string, any>) => void}
}

const VendorDashboard: ComponentType<VendorDashboardProps> = (props) => {
  const vendor = (props.document?.displayed || {}) as any
  const vendorId = (props.documentId || '').replace(/^drafts\./, '')
  const client = useClient({apiVersion: '2024-10-01'})
  const toast = useToast()
  const [data, setData] = useState<{orders: any[]; invoices: any[]}>({orders: [], invoices: []})
  const ordersRef = useRef<HTMLDivElement | null>(null)
  const invoicesRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!vendorId) return
    let cancelled = false
    client
      .fetch(DASHBOARD_QUERY, {vendorId})
      .then((result) => {
        if (!cancelled) {
          setData({orders: result?.orders || [], invoices: result?.invoices || []})
        }
      })
      .catch((error) => {
        console.warn('Failed to load vendor dashboard data', error)
        if (!cancelled) {
          toast.push({status: 'error', title: 'Unable to load vendor insights'})
        }
      })
    return () => {
      cancelled = true
    }
  }, [client, toast, vendorId])

  const creditLimit = typeof vendor?.creditLimit === 'number' ? vendor.creditLimit : 0
  const currentBalance = typeof vendor?.currentBalance === 'number' ? vendor.currentBalance : 0
  const balanceRatio = creditLimit > 0 ? Math.min(currentBalance / creditLimit, 1) : 0

  const handleAction = (action: 'quote' | 'orders' | 'invoices' | 'edit') => {
    if (action === 'quote') {
      props.router?.navigateIntent?.('create', {
        type: 'vendorQuote',
        templateParams: {vendorId},
      })
      return
    }
    if (action === 'edit') {
      props.router?.navigateIntent?.('edit', {
        id: vendorId,
        type: 'vendor',
      })
      return
    }
    const targetRef = action === 'orders' ? ordersRef.current : invoicesRef.current
    if (targetRef) {
      targetRef.scrollIntoView({behavior: 'smooth', block: 'start'})
    }
  }

  return (
    <Box padding={4} style={{minHeight: '100%', overflowY: 'auto'}}>
      <Stack space={4}>
        <Flex justify="space-between" align="center" wrap="wrap" gap={3}>
          <div>
            <Heading as="h2" size={3}>
              {vendor?.companyName || 'Vendor Dashboard'}
            </Heading>
            <Text size={1} muted>
              {vendor?.pricingTier ? `${vendor.pricingTier.toUpperCase()} tier` : 'Tier not set'} •{' '}
              {vendor?.paymentTerms || 'Net 30'}
            </Text>
          </div>
          <Flex gap={2} wrap="wrap">
            <Button text="Create Quote" tone="primary" onClick={() => handleAction('quote')} />
            <Button text="View Orders" mode="bleed" onClick={() => handleAction('orders')} />
            <Button text="View Invoices" mode="bleed" onClick={() => handleAction('invoices')} />
            <Button text="Edit Vendor" onClick={() => handleAction('edit')} />
          </Flex>
        </Flex>

        <Grid columns={[1, 1, 2]} gap={4}>
          <Card padding={4} radius={3} border>
            <Stack space={3}>
              <Text weight="medium">Financial Snapshot</Text>
              <Stack space={1}>
                <Text size={1} muted>
                  Credit limit
                </Text>
                <Text weight="semibold">{formatCurrency(creditLimit)}</Text>
                <Box paddingY={2}>
                  <Box style={{height: 10, background: '#e2e8f0', borderRadius: 999}}>
                    <Box
                      style={{
                        width: `${Math.min(balanceRatio * 100, 100)}%`,
                        background: balanceRatio < 0.85 ? '#10b981' : '#f97316',
                        height: '100%',
                        borderRadius: 999,
                      }}
                    ></Box>
                  </Box>
                  <Text size={1} muted>
                    {formatCurrency(currentBalance)} outstanding
                  </Text>
                </Box>
              </Stack>
              <Stack space={1}>
                <Text size={1} muted>Total orders</Text>
                <Text weight="semibold">{vendor?.totalOrders ?? 0}</Text>
              </Stack>
              <Stack space={1}>
                <Text size={1} muted>Total revenue</Text>
                <Text weight="semibold">{formatCurrency(vendor?.totalRevenue)}</Text>
              </Stack>
              <Stack space={1}>
                <Text size={1} muted>Last order</Text>
                <Text weight="semibold">{formatDate(vendor?.lastOrderDate)}</Text>
              </Stack>
            </Stack>
          </Card>

          <Card padding={4} radius={3} border>
            <Stack space={2}>
              <Text weight="medium">Account Details</Text>
              <Text size={1}>
                Status: <strong>{vendor?.status || 'N/A'}</strong>
              </Text>
              <Text size={1}>
                Account manager: <strong>{vendor?.accountManager || 'Unassigned'}</strong>
              </Text>
              <Text size={1}>
                Minimum order: <strong>{formatCurrency(vendor?.minimumOrderAmount)}</strong>
              </Text>
              <Text size={1}>
                Portal access: <strong>{vendor?.portalEnabled ? 'Enabled' : 'Disabled'}</strong>
              </Text>
            </Stack>
          </Card>
        </Grid>

        <Card padding={4} radius={3} border ref={ordersRef}>
          <Stack space={3}>
            <Heading as="h3" size={2}>
              Recent Orders
            </Heading>
            {!data.orders.length ? (
              <Text size={1} muted>
                No wholesale orders yet.
              </Text>
            ) : (
              <Stack space={2}>
                {data.orders.map((order) => (
                  <Flex key={order._id} justify="space-between" align="center">
                    <Stack space={1}>
                      <Text weight="medium">{order.orderNumber || order._id}</Text>
                      <Text size={1} muted>
                        {formatDate(order._createdAt)} • {order.status || 'pending'}
                      </Text>
                    </Stack>
                    <Text weight="semibold">{formatCurrency(order.totalAmount)}</Text>
                  </Flex>
                ))}
              </Stack>
            )}
          </Stack>
        </Card>

        <Card padding={4} radius={3} border ref={invoicesRef}>
          <Stack space={3}>
            <Heading as="h3" size={2}>
              Recent Invoices
            </Heading>
            {!data.invoices.length ? (
              <Text size={1} muted>No invoices generated yet.</Text>
            ) : (
              <Stack space={2}>
                {data.invoices.map((invoice) => (
                  <Flex key={invoice._id} justify="space-between" align="center">
                    <Stack space={1}>
                      <Text weight="medium">{invoice.invoiceNumber || invoice._id}</Text>
                      <Text size={1} muted>
                        {invoice.status || 'pending'} • {formatDate(invoice._createdAt)}
                      </Text>
                    </Stack>
                    <Text weight="semibold">{formatCurrency(invoice.total)}</Text>
                  </Flex>
                ))}
              </Stack>
            )}
          </Stack>
        </Card>
      </Stack>
    </Box>
  )
}

export default VendorDashboard
