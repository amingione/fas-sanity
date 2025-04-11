import React, { useEffect, useState } from 'react'
import { Card, Heading, Text, Stack, Flex, Spinner } from '@sanity/ui'
import { useClient } from 'sanity'

export default function CustomerDashboard() {
    const client = useClient({ apiVersion: '2024-04-10' })

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

    useEffect(() => {
        const fetchData = async () => {
            const [quotes, invoices, customers, recent, openQ, revenue, recentQuotes, recentInvoices] = await Promise.all([
                client.fetch('count(*[_type == "quote"])'),
                client.fetch('count(*[_type == "invoice"])'),
                client.fetch('count(*[_type == "customer"])'),
                client.fetch(`*[_type == "customer"] | order(_createdAt desc)[0...5]{name, _createdAt}`),
                client.fetch('count(*[_type == "quote" && conversionStatus == "Open"])'),
                client.fetch('sum(*[_type == "invoice" && dateTime(_createdAt) >= dateTime(now()) - 30*24*60*60][]{total})'),
                client.fetch(`*[_type == "quote"] | order(_createdAt desc)[0...5]{_id, customer->{name, email}}`),
                client.fetch(`*[_type == "invoice"] | order(_createdAt desc)[0...5]{_id, customer->{name, email}}`)
            ])

            setData({
                quoteCount: quotes,
                invoiceCount: invoices,
                customerCount: customers
            })
            setRecentCustomers(recent)
            setOpenQuotes(openQ)
            setMonthlyRevenue(revenue || 0)
            setRecentQuotes(recentQuotes)
            setRecentInvoices(recentInvoices)
        }
        fetchData()
    }, [client])

    return (
        <Card padding={4} shadow={1} radius={2}>
            <Heading as="h2" size={2}>
                Customer Dashboard
            </Heading>
            <Text size={1} muted>
                Sales summary &amp; quick insights
            </Text>

            <Stack space={4} marginTop={4}>
                {!data ? (
                    <Flex align="center" justify="center" padding={4}>
                        <Spinner muted />
                    </Flex>
                ) : (
                    <>
                        <Text>
                            🧾 <strong>{data.invoiceCount}</strong> Total Invoices
                        </Text>
                        <Text>
                            📄 <strong>{data.quoteCount}</strong> Total Quotes
                        </Text>
                        <Text>
                            👥 <strong>{data.customerCount}</strong> Registered Customers
                        </Text>
                        {openQuotes !== null && (
                            <Text>
                                🚧 <strong>{openQuotes}</strong> Quotes Pending Conversion
                            </Text>
                        )}
                        {monthlyRevenue !== null && (
                            <Text>
                                💰 <strong>${monthlyRevenue.toFixed(2)}</strong> Revenue This Month
                            </Text>
                        )}
                        {recentCustomers.length > 0 && (
                            <>
                                <Heading as="h3" size={1} style={{ marginTop: '1rem' }}>
                                    👤 Recent Customers
                                </Heading>
                                <Stack space={2}>
                                    {recentCustomers.map((cust, i) => (
                                        <Text key={i}>
                                            {cust.name || 'Unnamed'} &ndash; {new Date(cust._createdAt).toLocaleDateString()}
                                        </Text>
                                    ))}
                                </Stack>
                            </>
                        )}
                        {recentQuotes.length > 0 && (
                          <>
                            <Heading as="h3" size={1} style={{ marginTop: '1rem' }}>
                              ✉️ Recent Quotes
                            </Heading>
                            <Stack space={2}>
                              {recentQuotes.map((quote, i) => (
                                <Flex key={i} justify="space-between" align="center">
                                  <Text>
                                    {quote.customer?.name || 'Unknown'} ({quote.customer?.email || 'No email'})
                                  </Text>
                                  <button
                                    disabled={sendingQuoteIds.includes(quote._id)}
                                    onClick={async () => {
                                      try {
                                        setSendingQuoteIds((prev) => [...prev, quote._id])
                                        const res = await fetch('/.netlify/functions/sendQuoteEmail', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ email: quote.customer?.email, quoteId: quote._id })
                                        })
                                        const result = await res.json()
                                        alert(result.message || 'Quote email sent.')
                                      } catch (err) {
                                        alert('Failed to send quote email.')
                                      } finally {
                                        setSendingQuoteIds((prev) => prev.filter(id => id !== quote._id))
                                      }
                                    }}
                                  >
                                    {sendingQuoteIds.includes(quote._id) ? 'Sending…' : 'Send Quote'}
                                  </button>
                                </Flex>
                              ))}
                            </Stack>
                          </>
                        )}
                        {recentInvoices.length > 0 && (
                          <>
                            <Heading as="h3" size={1} style={{ marginTop: '1rem' }}>
                              🧾 Recent Invoices
                            </Heading>
                            <Stack space={2}>
                              {recentInvoices.map((invoice, i) => (
                                <Flex key={i} justify="space-between" align="center">
                                  <Text>
                                    {invoice.customer?.name || 'Unknown'} ({invoice.customer?.email || 'No email'})
                                  </Text>
                                  <button
                                    disabled={sendingInvoiceIds.includes(invoice._id)}
                                    onClick={async () => {
                                      try {
                                        setSendingInvoiceIds((prev) => [...prev, invoice._id])
                                        const res = await fetch('/.netlify/functions/resendInvoiceEmail', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ email: invoice.customer?.email, invoiceId: invoice._id })
                                        })
                                        const result = await res.json()
                                        alert(result.message || 'Invoice email sent.')
                                      } catch (err) {
                                        alert('Failed to send invoice email.')
                                      } finally {
                                        setSendingInvoiceIds((prev) => prev.filter(id => id !== invoice._id))
                                      }
                                    }}
                                  >
                                    {sendingInvoiceIds.includes(invoice._id) ? 'Sending…' : 'Resend Invoice'}
                                  </button>
                                </Flex>
                              ))}
                            </Stack>
                          </>
                        )}
                    </>
                )}
            </Stack>
        </Card>
    )
}