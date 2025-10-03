import React, { useEffect, useState } from 'react'
import { Card, Heading, Text, Stack, Flex, Spinner, TabList, Tab, Button } from '@sanity/ui'
import { useClient } from 'sanity'
import { useRouter } from 'sanity/router'

const DAY = 24 * 60 * 60 * 1000

const CustomerDashboard = React.forwardRef<HTMLDivElement, Record<string, never>>((_props, ref) => {
    const client = useClient({ apiVersion: '2024-04-10' })
    const router = useRouter()

    const [data, setData] = useState<{
        quoteCount: number
        invoiceCount: number
        customerCount: number
      } | null>(null)
    const [recentCustomers, setRecentCustomers] = useState<any[]>([])
    const [openQuotes, setOpenQuotes] = useState<number | null>(null)
    const [monthlyRevenue, setMonthlyRevenue] = useState<number | null>(null)
    const [recentQuotes, setRecentQuotes] = useState<any[]>([])
    const [recentInvoices, setRecentInvoices] = useState<any[]>([])
    const [sendingQuoteIds, setSendingQuoteIds] = useState<string[]>([])
    const [sendingInvoiceIds, setSendingInvoiceIds] = useState<string[]>([])
    const [sendingCustomerIds, setSendingCustomerIds] = useState<string[]>([])
    // Collapsible cards state and toast message state
    const [expandedCustomerIds, setExpandedCustomerIds] = useState<string[]>([])
    const [toastMsg, setToastMsg] = useState<string | null>(null)

    const [tabIndex, setTabIndex] = useState(0)
    // Customer search state
    const [customerSearch, setCustomerSearch] = useState('')

    useEffect(() => {
        const fetchData = async () => {
            try {
                const customersQuery = `*[_type == "customer"] | order(_createdAt desc)[0...12]{
                  _id,
                  _createdAt,
                  email,
                  phone,
                  notes,
                  address,
                  firstName,
                  lastName,
                  name,
                  lifetimeSpend,
                  orderCount,
                  quoteCount
                }`

                const thirtyDaysAgo = new Date(Date.now() - 30 * DAY).toISOString()

                const [quotes, invoices, customers, recent, openQ, recentInvoiceTotals, recentQuotes, recentInvoices] = await Promise.all([
                    client.fetch('count(*[_type == "quote"])'),
                    client.fetch('count(*[_type == "invoice"])'),
                    client.fetch('count(*[_type == "customer"])'),
                    client.fetch(customersQuery),
                    client.fetch('count(*[_type == "quote" && conversionStatus == "Open"])'),
                    client.fetch(`*[_type == "invoice" && defined(total) && dateTime(_createdAt) >= dateTime($from)]{total}` , { from: thirtyDaysAgo }),
                    client.fetch(`*[_type == "quote"] | order(_createdAt desc)[0...5]{
                      _id,
                      customer->{
                        name,
                        email,
                        firstName,
                        lastName
                      }
                    }`),
                    client.fetch(`*[_type == "invoice"] | order(_createdAt desc)[0...5]{
                      _id,
                      customer->{
                        name,
                        email,
                        firstName,
                        lastName
                      },
                      customerRef->{
                        name,
                        email,
                        firstName,
                        lastName
                      }
                    }`)
                ])

                setData({
                    quoteCount: quotes,
                    invoiceCount: invoices,
                    customerCount: customers
                })

                // Enrich recent customers with order/quote counts and spend
                const customerIds = recent.map((c: any) => c._id)
                const enriched = await Promise.all(customerIds.map(async (id: string) => {
                  const [orderCount, quoteCount, invoiceTotals] = await Promise.all([
                    client.fetch(`count(*[_type == "invoice" && coalesce(customer._ref, customerRef._ref) == $id])`, { id }),
                    client.fetch(`count(*[_type == "quote" && customer._ref == $id])`, { id }),
                    client.fetch(`*[_type == "invoice" && coalesce(customer._ref, customerRef._ref) == $id && defined(total)]{total}`, { id }),
                  ])
                  const c = recent.find((c: any) => c._id === id)
                  const displayName = (c?.name || '').trim() ||
                    [c?.firstName, c?.lastName].filter(Boolean).join(' ').trim() ||
                    c?.email ||
                    'Unnamed Customer'
                  const totalSpend = (Array.isArray(invoiceTotals) ? invoiceTotals : [])
                    .reduce((sum: number, item: any) => sum + Number(item?.total || 0), 0)
                  return { ...c, name: displayName, orderCount, quoteCount, lifetimeSpend: totalSpend }
                }))

                setRecentCustomers(enriched)
                setOpenQuotes(openQ)
                const monthly = (Array.isArray(recentInvoiceTotals) ? recentInvoiceTotals : [])
                  .reduce((sum: number, item: any) => sum + Number(item?.total || 0), 0)
                setMonthlyRevenue(monthly)
                const normalizePerson = (entity: any) => {
                  if (!entity) return { name: 'Unknown', email: 'N/A' }
                  const full = (entity.name || '').trim() ||
                    [entity.firstName, entity.lastName].filter(Boolean).join(' ').trim()
                  return {
                    name: full || entity.email || 'Unknown',
                    email: entity.email || 'N/A'
                  }
                }

                const normalizedQuotes = recentQuotes.map((quote: any) => ({
                  ...quote,
                  customerSummary: normalizePerson(quote.customer)
                }))

                const normalizedInvoices = recentInvoices.map((invoice: any) => {
                  const primary = normalizePerson(invoice.customer)
                  const fallback = normalizePerson(invoice.customerRef)
                  const merged = primary.name === 'Unknown' && fallback.name !== 'Unknown' ? fallback : primary
                  return {
                    ...invoice,
                    customerSummary: merged
                  }
                })

                setRecentQuotes(normalizedQuotes)
                setRecentInvoices(normalizedInvoices)
            } catch (err) {
                console.error('❌ Failed to fetch dashboard data:', err)
            }
        }
        fetchData()
    }, [client])

    return (
      <div ref={ref}>
        {/* Toast message for confirmation */}
        {toastMsg && (
          <Card padding={3} radius={2} shadow={1} tone="positive" style={{ marginBottom: '1rem' }}>
            <Text>{toastMsg}</Text>
          </Card>
        )}
        <div>
          <TabList
            space={2}
            style={{
              display: 'flex',
              gap: '8px',
              paddingBottom: '1rem',
              borderBottom: '1px solid #333',
              marginBottom: '1rem'
            }}
          >
            <Tab
              id="customers"
              selected={tabIndex === 0}
              onClick={() => setTabIndex(0)}
              aria-controls="customers-panel"
              style={{
                backgroundColor: tabIndex === 0 ? '#222' : '#111',
                color: tabIndex === 0 ? '#fff' : '#aaa',
                padding: '10px 16px',
                borderRadius: '8px',
                fontSize: '1rem',
                fontWeight: 600,
                border: 'none',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              Customers
            </Tab>
            <Tab
              id="orders"
              selected={tabIndex === 1}
              onClick={() => setTabIndex(1)}
              aria-controls="orders-panel"
              style={{
                backgroundColor: tabIndex === 1 ? '#222' : '#111',
                color: tabIndex === 1 ? '#fff' : '#aaa',
                padding: '10px 16px',
                borderRadius: '8px',
                fontSize: '1rem',
                fontWeight: 600,
                border: 'none',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              Orders
            </Tab>
            <Tab
              id="invoices"
              selected={tabIndex === 2}
              onClick={() => setTabIndex(2)}
              aria-controls="invoices-panel"
              style={{
                backgroundColor: tabIndex === 2 ? '#222' : '#111',
                color: tabIndex === 2 ? '#fff' : '#aaa',
                padding: '10px 16px',
                borderRadius: '8px',
                fontSize: '1rem',
                fontWeight: 600,
                border: 'none',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              Invoices
            </Tab>
            <Tab
              id="quotes"
              selected={tabIndex === 3}
              onClick={() => setTabIndex(3)}
              aria-controls="quotes-panel"
              style={{
                backgroundColor: tabIndex === 3 ? '#222' : '#111',
                color: tabIndex === 3 ? '#fff' : '#aaa',
                padding: '10px 16px',
                borderRadius: '8px',
                fontSize: '1rem',
                fontWeight: 600,
                border: 'none',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              Quotes
            </Tab>
          </TabList>
          <div>
            {tabIndex === 0 && (
              <div id="customers-panel" aria-labelledby="customers">
                <Stack space={4}>
                  <Heading size={1}>Recent Customers</Heading>
                  <Text size={1} muted>Tap to expand a customer card for details and editing.</Text>
                  {/* Search input for filtering customers */}
                  <input
                    type="text"
                    placeholder="Search by name or email..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    style={{
                      padding: '8px',
                      width: '100%',
                      borderRadius: '6px',
                      border: '1px solid #ccc',
                      marginBottom: '1rem',
                      fontSize: '0.9rem'
                    }}
                  />
                  {recentCustomers.length === 0 ? (
                    <Text muted style={{ marginBottom: '2rem' }}>No recent customers found.</Text>
                  ) : (
                    recentCustomers
                      .filter((cust) =>
                        cust.name?.toLowerCase().includes(customerSearch.toLowerCase()) ||
                        cust.email?.toLowerCase().includes(customerSearch.toLowerCase())
                      )
                      .map((cust, idx) => (
                      <Card
                        key={idx}
                        padding={3}
                        radius={2}
                        shadow={1}
                        tone="default"
                        style={{ backgroundColor: '#ecececff' }}
                      >
                        <Flex justify="space-between" align="center" style={{ cursor: 'pointer' }} onClick={() => {
                          setExpandedCustomerIds((prev) =>
                            prev.includes(cust._id) ? prev.filter(id => id !== cust._id) : [...prev, cust._id]
                          )
                        }}>
                          <Text size={2} weight="bold">👤 {cust.name}</Text>
                          <Text size={1} muted>{expandedCustomerIds.includes(cust._id) ? '▲ Collapse' : '▼ Expand'}</Text>
                        </Flex>
                        {expandedCustomerIds.includes(cust._id) && (
                          <Stack space={2} style={{ marginTop: '1rem' }}>
                            <Text size={1} muted>Joined: {new Date(cust._createdAt).toLocaleDateString()}</Text>
                            {/* Customer summary stats */}
                            <Flex gap={4}>
                              <Text size={1}>🛒 Orders: <b>{cust.orderCount ?? '—'}</b></Text>
                              <Text size={1}>💬 Quotes: <b>{cust.quoteCount ?? '—'}</b></Text>
                              <Text size={1}>💰 Lifetime Spend: <b>{typeof cust.lifetimeSpend === 'number' ? `$${cust.lifetimeSpend.toLocaleString()}` : '—'}</b></Text>
                            </Flex>

                            <Text size={1} weight="semibold">📧 Email</Text>
                            <input
                              defaultValue={cust.email || ''}
                              placeholder="Enter email..."
                              style={{ width: '100%', padding: '6px 8px', fontSize: '0.85rem', borderRadius: '6px', border: '1px solid #ccc' }}
                              onBlur={async (e) => {
                                await client.patch(cust._id).set({ email: e.target.value.trim() }).commit()
                                setToastMsg('✅ Email updated')
                                setTimeout(() => setToastMsg(null), 2000)
                              }}
                            />

                            <Text size={1} weight="semibold">📞 Phone</Text>
                            <input
                              defaultValue={cust.phone || ''}
                              placeholder="Enter phone..."
                              style={{ width: '100%', padding: '6px 8px', fontSize: '0.85rem', borderRadius: '6px', border: '1px solid #ccc' }}
                              onBlur={async (e) => {
                                await client.patch(cust._id).set({ phone: e.target.value.trim() }).commit()
                                setToastMsg('✅ Phone updated')
                                setTimeout(() => setToastMsg(null), 2000)
                              }}
                            />

                            <Text size={1} weight="semibold">📍 Address</Text>
                            <textarea
                              defaultValue={cust.address || ''}
                              placeholder="Enter customer address..."
                              style={{ width: '100%', minHeight: '50px', padding: '8px', fontSize: '0.85rem', borderRadius: '6px', border: '1px solid #ccc' }}
                              onBlur={async (e) => {
                                await client.patch(cust._id).set({ address: e.target.value }).commit()
                                setToastMsg('✅ Address updated')
                                setTimeout(() => setToastMsg(null), 2000)
                              }}
                            />

                            <Text size={1} weight="semibold">🗒 Notes</Text>
                            <textarea
                              defaultValue={cust.notes || ''}
                              placeholder="Enter customer notes..."
                              style={{ width: '100%', minHeight: '60px', padding: '8px', fontSize: '0.85rem', borderRadius: '6px', border: '1px solid #ccc' }}
                              onBlur={async (e) => {
                                await client.patch(cust._id).set({ notes: e.target.value }).commit()
                                setToastMsg('✅ Notes updated')
                                setTimeout(() => setToastMsg(null), 2000)
                              }}
                            />

                            <Flex justify="flex-end" gap={2}>
                              <Button
                                text={sendingCustomerIds.includes(cust._id) ? '📧 Sending...' : '📧 Contact Customer'}
                                tone="positive"
                                padding={2}
                                fontSize={1}
                                disabled={!cust.email || sendingCustomerIds.includes(cust._id)}
                                onClick={async (e) => {
                                  e.stopPropagation && e.stopPropagation()
                                  setSendingCustomerIds((prev) => [...prev, cust._id])
                                  try {
                                    const res = await fetch('/.netlify/functions/sendEmail', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ email: cust.email })
                                    })
                                    if (!res.ok) throw new Error(await res.text())
                                    setToastMsg('✅ Email sent')
                                    setTimeout(() => setToastMsg(null), 2000)
                                  } catch (err) {
                                    alert(`❌ Failed to send email: ${err}`)
                                  } finally {
                                    setSendingCustomerIds((prev) => prev.filter(id => id !== cust._id))
                                  }
                                }}
                              />
                              <Button
                                text="👁️ View Details"
                                tone="primary"
                                padding={2}
                                fontSize={1}
                                onClick={(e) => {
                                  e.stopPropagation && e.stopPropagation()
                                  router.navigateIntent('edit', { id: cust._id, type: 'customer' })
                                }}
                              />
                            </Flex>
                          </Stack>
                        )}
                      </Card>
                    ))
                  )}
                </Stack>
              </div>
            )}
            {tabIndex === 1 && (
              <div id="orders-panel" aria-labelledby="orders">
                <Stack space={4}>
                  <Heading size={1}>Recent Orders</Heading>
                  <Text size={1} muted>Track order fulfillment and payment status below.</Text>
                  {recentInvoices.length === 0 ? (
                    <Text muted style={{ marginBottom: '2rem' }}>No recent orders found.</Text>
                  ) : (
                    recentInvoices.map((inv, idx) => (
                      <Card key={idx} padding={3} radius={2} shadow={1} tone="default">
                        <Stack space={2}>
                          <Text size={2}>Invoice #{inv._id}</Text>
                          <Text size={1} muted>
                            Customer: {inv.customerSummary?.name || 'Unknown'} — {inv.customerSummary?.email || 'N/A'}
                          </Text>
                          <Flex align="center" justify="space-between">
                            <Stack space={1}>
                              <Text size={1}>Status:</Text>
                              <select
                                value={inv.status || 'pending'}
                                onChange={(e) => {
                                  const newStatus = e.target.value
                                  client.patch(inv._id).set({ status: newStatus }).commit()
                                }}
                              >
                                <option value="pending">Pending</option>
                                <option value="paid">Paid</option>
                                <option value="fulfilled">Fulfilled</option>
                                <option value="cancelled">Cancelled</option>
                              </select>
                            </Stack>
                            <Button
                              text="Send Email"
                              tone="positive"
                              padding={2}
                              fontSize={1}
                              style={{ marginTop: '1rem' }}
                              onClick={async () => {
                                setSendingInvoiceIds((prev) => [...prev, inv._id])
                                try {
                                  const res = await fetch('/.netlify/functions/resendInvoiceEmail', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      invoiceId: inv._id,
                                      email: inv.customer?.email
                                    })
                                  })
                                  if (!res.ok) throw new Error(await res.text())
                                  alert('📧 Email sent successfully!')
                                } catch (err) {
                                  alert(`❌ Failed to send email: ${err}`)
                                } finally {
                                  setSendingInvoiceIds((prev) => prev.filter(id => id !== inv._id))
                                }
                              }}
                            />
                          </Flex>
                          <Flex justify="flex-end">
                            <Button
                              text="View Details"
                              tone="primary"
                              padding={2}
                              style={{ fontSize: '0.85rem' }}
                              onClick={() => router.navigateIntent('edit', { id: inv._id, type: 'invoice' })}
                            />
                          </Flex>
                        </Stack>
                      </Card>
                    ))
                  )}
                </Stack>
              </div>
            )}
            {tabIndex === 2 && (
              <div id="invoices-panel" aria-labelledby="invoices">
                <Stack space={4}>
                  <Heading size={1}>Recent Invoices</Heading>
                  <Text size={1} muted>Quick access to invoice records and statuses.</Text>
                  {recentInvoices.length === 0 ? (
                    <Text muted style={{ marginBottom: '2rem' }}>No invoices found.</Text>
                  ) : (
                    recentInvoices.map((inv, idx) => (
                      <Card key={idx} padding={3} radius={2} shadow={1} tone="default">
                        <Stack space={2}>
                          <Text size={2}>Invoice #{inv._id}</Text>
                          <Text size={1} muted>
                            Customer: {inv.customerSummary?.name || 'Unknown'} — {inv.customerSummary?.email || 'N/A'}
                          </Text>
                          <Flex justify="flex-end">
                            <Button
                              text="View Details"
                              tone="primary"
                              padding={2}
                              style={{ fontSize: '0.85rem' }}
                              onClick={() => router.navigateIntent('edit', { id: inv._id, type: 'invoice' })}
                            />
                          </Flex>
                        </Stack>
                      </Card>
                    ))
                  )}
                </Stack>
              </div>
            )}
            {tabIndex === 3 && (
              <div id="quotes-panel" aria-labelledby="quotes">
                {/* existing Quotes tab content */}
                {/* TODO: Add quotes tab content here if needed */}
              </div>
            )}
          </div>
        </div>
      </div>
    )
})

CustomerDashboard.displayName = 'CustomerDashboard'

export default CustomerDashboard
