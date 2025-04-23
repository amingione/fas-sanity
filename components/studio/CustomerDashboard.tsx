import React, { useEffect, useState } from 'react'
import { Card, Heading, Text, Stack, Flex, Spinner, TabList, Tab, TabPanel, Button } from '@sanity/ui'
import { useClient } from 'sanity'
import { useRouter } from 'sanity/router'

export default function CustomerDashboard() {
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
                const [quotes, invoices, customers, recent, openQ, revenue, recentQuotes, recentInvoices] = await Promise.all([
                    client.fetch('count(*[_type == "quote"])'),
                    client.fetch('count(*[_type == "invoice"])'),
                    client.fetch('count(*[_type == "customer"])'),
                    client.fetch(`*[_type == "customer"] | order(_createdAt desc)[0...5]{_id, name, _createdAt, email, phone, vehicle, notes, address}`),
                    client.fetch('count(*[_type == "quote" && conversionStatus == "Open"])'),
                    client.fetch('sum(*[_type == "invoice" && defined(total) && dateTime(_createdAt) >= dateTime(now()) - 30*24*60*60]{total})'),
                    client.fetch(`*[_type == "quote"] | order(_createdAt desc)[0...5]{_id, customer->{name, email}}`),
                    client.fetch(`*[_type == "invoice"] | order(_createdAt desc)[0...5]{_id, customer->{name, email}}`)
                ])

                setData({
                    quoteCount: quotes,
                    invoiceCount: invoices,
                    customerCount: customers
                })

                // Enrich recent customers with order/quote counts and spend
                const customerIds = recent.map((c: any) => c._id)
                const enriched = await Promise.all(customerIds.map(async (id: string) => {
                  const [orderCount, quoteCount, totalSpend] = await Promise.all([
                    client.fetch(`count(*[_type == "invoice" && customer._ref == $id])`, { id }),
                    client.fetch(`count(*[_type == "quote" && customer._ref == $id])`, { id }),
                    client.fetch(`sum(*[_type == "invoice" && customer._ref == $id && defined(total)]{total})`, { id }),
                  ])
                  const c = recent.find((c: any) => c._id === id)
                  return { ...c, orderCount, quoteCount, lifetimeSpend: totalSpend || 0 }
                }))

                setRecentCustomers(enriched)
                setOpenQuotes(openQ)
                setMonthlyRevenue(revenue || 0)
                setRecentQuotes(recentQuotes)
                setRecentInvoices(recentInvoices)
            } catch (err) {
                console.error('❌ Failed to fetch dashboard data:', err)
            }
        }
        fetchData()
    }, [client])

    return (
      <>
        {/* Toast message for confirmation */}
        {toastMsg && (
          <Card padding={3} radius={2} shadow={1} tone="positive" style={{ marginBottom: '1rem' }}>
            <Text>{toastMsg}</Text>
          </Card>
        )}
        <div>
          <TabList space={2}>
            <Tab
              id="customers"
              selected={tabIndex === 0}
              onClick={() => setTabIndex(0)}
              aria-controls="customers-panel"
            >
              Customers
            </Tab>
            <Tab
              id="orders"
              selected={tabIndex === 1}
              onClick={() => setTabIndex(1)}
              aria-controls="orders-panel"
            >
              Orders
            </Tab>
            <Tab
              id="invoices"
              selected={tabIndex === 2}
              onClick={() => setTabIndex(2)}
              aria-controls="invoices-panel"
            >
              Invoices
            </Tab>
            <Tab
              id="quotes"
              selected={tabIndex === 3}
              onClick={() => setTabIndex(3)}
              aria-controls="quotes-panel"
            >
              Quotes
            </Tab>
          </TabList>
          <div>
            <TabPanel id="customers-panel" aria-labelledby="customers">
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
                  <Text muted>No recent customers found.</Text>
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
                      style={{ backgroundColor: '#111' }}
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
            </TabPanel>
            <TabPanel id="orders-panel" aria-labelledby="orders">
              <Stack space={4}>
                <Heading size={1}>Recent Orders</Heading>
                <Text size={1} muted>Track order fulfillment and payment status below.</Text>
                {recentInvoices.length === 0 ? (
                  <Text muted>No recent orders found.</Text>
                ) : (
                  recentInvoices.map((inv, idx) => (
                    <Card key={idx} padding={3} radius={2} shadow={1} tone="default">
                      <Stack space={2}>
                        <Text size={2}>Invoice #{inv._id}</Text>
                        <Text size={1} muted>Customer: {inv.customer?.name || 'Unknown'} — {inv.customer?.email || 'N/A'}</Text>
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
            </TabPanel>
            <TabPanel id="quotes-panel" aria-labelledby="quotes">
              <Stack space={4}>
                <Heading size={1}>Recent Invoices</Heading>
                <Text size={1} muted>Quick access to invoice records and statuses.</Text>
                {recentInvoices.length === 0 ? (
                  <Text muted>No invoices found.</Text>
                ) : (
                  recentInvoices.map((inv, idx) => (
                    <Card key={idx} padding={3} radius={2} shadow={1} tone="default">
                      <Stack space={2}>
                        <Text size={2}>Invoice #{inv._id}</Text>
                        <Text size={1} muted>Customer: {inv.customer?.name || 'Unknown'} — {inv.customer?.email || 'N/A'}</Text>
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
            </TabPanel>
            {/* REMOVE DUPLICATE QUOTES TABPANEL (Recent Quotes) */}
          </div>
        </div>
      </>
    )
}