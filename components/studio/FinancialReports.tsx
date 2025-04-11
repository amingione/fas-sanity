import React, { useEffect, useState } from 'react'
import { useClient } from 'sanity'
import { Button, Card, Heading, Stack, Text, Select, Flex } from '@sanity/ui'
import jsPDF from 'jspdf'

export default function FinancialReports() {
  const client = useClient({ apiVersion: '2024-04-10' })
  const [reportType, setReportType] = useState('orders')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [status, setStatus] = useState('')
  const [product, setProduct] = useState('')
  const [category, setCategory] = useState('')
  const [format, setFormat] = useState<'csv' | 'pdf'>('csv')

  const handleExport = async () => {
    let filter = `dateTime(_createdAt) >= dateTime("${from}") && dateTime(_createdAt) <= dateTime("${to}")`
    if (status) filter += ` && status == "${status}"`
    if (product) filter += ` && "${product}" in quote.products[]->title`
    if (category) filter += ` && "${category}" in quote.products[]->categories[]->title`
    const query = `*[_type == "invoice" && ${filter}]{
      _createdAt,
      amount,
      status,
      orderId,
      quote->{ customer->{ fullName } }
    }`
    const results = await client.fetch(query)

    const csv = [
      ['Date', 'Order ID', 'Customer', 'Amount', 'Status'],
      ...results.map((i: any) => [
        new Date(i._createdAt).toLocaleDateString(),
        i.orderId,
        i.quote?.customer?.fullName || 'Unknown',
        i.amount,
        i.status
      ])
    ]
      .map(row => row.join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `financial-report-${reportType}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const handleExportPDF = async () => {
    let filter = `dateTime(_createdAt) >= dateTime("${from}") && dateTime(_createdAt) <= dateTime("${to}")`
    if (status) filter += ` && status == "${status}"`
    if (product) filter += ` && "${product}" in quote.products[]->title`
    if (category) filter += ` && "${category}" in quote.products[]->categories[]->title`
    const query = `*[_type == "invoice" && ${filter}]{
      _createdAt,
      amount,
      status,
      orderId,
      quote->{ customer->{ fullName } }
    }`
    const results = await client.fetch(query)

    const doc = new jsPDF()
    doc.setFontSize(12)
    doc.text('Financial Report', 14, 20)

    const headers = ['Date', 'Order ID', 'Customer', 'Amount', 'Status']
    const rows: (string | number)[][] = results.map((i: any) => [
      new Date(i._createdAt).toLocaleDateString(),
      i.orderId,
      i.quote?.customer?.fullName || 'Unknown',
      `$${i.amount?.toFixed(2)}`,
      i.status
    ])

    headers.forEach((h, i) => {
      doc.text(h, 14 + i * 35, 30)
    })

    rows.forEach((row: (string | number)[], r) => {
      row.forEach((text, c) => {
        doc.text(String(text), 14 + c * 35, 40 + r * 10)
      })
    })

    doc.save(`financial-report-${reportType}.pdf`)
  }

  return (
    <Card padding={4}>
      <Heading size={2}>📥 Download Financial Reports</Heading>
      <Stack space={4} marginTop={4}>
        <Flex gap={3} wrap="wrap">
          <label>
            <Text size={1}>Report Type</Text>
            <Select value={reportType} onChange={e => setReportType((e.target as HTMLSelectElement).value)}>
              <option value="orders">Orders</option>
              <option value="revenue">Revenue</option>
              <option value="aov">Average Order Value</option>
            </Select>
          </label>
          <label>
            <Text size={1}>From Date</Text>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </label>
          <label>
            <Text size={1}>To Date</Text>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </label>
          <label>
            <Text size={1}>Status</Text>
            <Select value={status} onChange={e => setStatus((e.target as HTMLSelectElement).value)}>
              <option value="">All</option>
              <option value="Paid">Paid</option>
              <option value="Pending">Pending</option>
              <option value="Cancelled">Cancelled</option>
              <option value="Refunded">Refunded</option>
            </Select>
          </label>
          <label>
            <Text size={1}>Product</Text>
            <input type="text" value={product} onChange={e => setProduct(e.target.value)} placeholder="Product name" />
          </label>
          <label>
            <Text size={1}>Category</Text>
            <input type="text" value={category} onChange={e => setCategory(e.target.value)} placeholder="Category name" />
          </label>
        </Flex>
        <label>
          <Text size={1}>Format</Text>
          <Select value={format} onChange={e => setFormat((e.target as HTMLSelectElement).value as 'csv' | 'pdf')}>
            <option value="csv">CSV</option>
            <option value="pdf">PDF</option>
          </Select>
        </label>
        {format === 'csv' ? (
          <Button text="⬇️ Download CSV" tone="primary" onClick={handleExport} disabled={!from || !to} />
        ) : (
          <Button text="⬇️ Download PDF" tone="primary" onClick={handleExportPDF} disabled={!from || !to} />
        )}
        <Text size={1} muted>Filter by date range and download matching results as a CSV or PDF file.</Text>
      </Stack>
    </Card>
  )
}
