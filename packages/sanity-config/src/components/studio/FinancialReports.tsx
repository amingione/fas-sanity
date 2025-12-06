// NOTE: orderId is deprecated; prefer orderNumber for identifiers.
import React, {useEffect, useState} from 'react'
import {useClient} from 'sanity'
import {Button, Heading, Text, Select, Flex, Box} from '@sanity/ui'
import jsPDF from 'jspdf'

const FinancialReports = React.forwardRef<HTMLDivElement, Record<string, unknown>>((_props, ref) => {
  const client = useClient({apiVersion: '2024-04-10'})
  const [reportType, setReportType] = useState('orders')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [status, setStatus] = useState('')
  const [product, setProduct] = useState('')
  const [category, setCategory] = useState('')
  const [format, setFormat] = useState<'csv' | 'pdf'>('csv')
  const [productList, setProductList] = useState<string[]>([])
  const [categoryList, setCategoryList] = useState<string[]>([])

  useEffect(() => {
    async function fetchDropdowns() {
      try {
        const prods = await client.fetch(`*[_type == "product"].title`)
        const cats = await client.fetch(`*[_type == "category"].title`)
        setProductList(prods)
        setCategoryList(cats)
      } catch (err) {
        console.error('Dropdown fetch failed', err)
      }
    }
    fetchDropdowns()
  }, [client])

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
        i.status,
      ]),
    ]
      .map((row) => row.join(','))
      .join('\n')

    const blob = new Blob([csv], {type: 'text/csv'})
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
      _createdAt, amount, status, orderId, quote->{ customer->{ fullName } }
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
      i.status,
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
    <Box ref={ref} marginTop={6} padding={4}>
      <Box paddingBottom={6} style={{textAlign: 'center'}}>
        <Heading as="h2" size={2}>
          📩 Download Financial Reports
        </Heading>
      </Box>

      {/* Row 1 */}
      <Flex gap={4} marginBottom={4} style={{flexWrap: 'wrap'}}>
        <Box flex={1}>
          <Box marginBottom={2}>
            <Text size={1}>Report Type</Text>
          </Box>
          <Select
            value={reportType}
            onChange={(e) => setReportType((e.target as HTMLSelectElement).value)}
          >
            <option value="orders">Orders</option>
            <option value="revenue">Revenue</option>
            <option value="aov">Average Order Value</option>
          </Select>
        </Box>
        <Box flex={1}>
          <Box marginBottom={2}>
            <Text size={1}>From Date</Text>
          </Box>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            style={{width: '100%'}}
          />
        </Box>
        <Box flex={1}>
          <Box marginBottom={2}>
            <Text size={1}>To Date</Text>
          </Box>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            style={{width: '100%'}}
          />
        </Box>
      </Flex>

      {/* Row 2 */}
      <Flex gap={4} marginBottom={4} style={{flexWrap: 'wrap'}}>
        <Box flex={1}>
          <Box marginBottom={2}>
            <Text size={1}>Status</Text>
          </Box>
          <Select value={status} onChange={(e) => setStatus((e.target as HTMLSelectElement).value)}>
            <option value="">All</option>
            <option value="Paid">Paid</option>
            <option value="Pending">Pending</option>
            <option value="Cancelled">Cancelled</option>
            <option value="Refunded">Refunded</option>
          </Select>
        </Box>
        <Box flex={1}>
          <Box marginBottom={2}>
            <Text size={1}>Product</Text>
          </Box>
          <input
            type="text"
            list="product-list"
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            placeholder="Search product"
            style={{width: '100%'}}
          />
          <datalist id="product-list">
            {productList.map((p, i) => (
              <option key={i} value={p} />
            ))}
          </datalist>
        </Box>
        <Box flex={1}>
          <Box marginBottom={2}>
            <Text size={1}>Category</Text>
          </Box>
          <input
            type="text"
            list="category-list"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Search category"
            style={{width: '100%'}}
          />
          <datalist id="category-list">
            {categoryList.map((c, i) => (
              <option key={i} value={c} />
            ))}
          </datalist>
        </Box>
      </Flex>

      {/* Divider */}
      <Box paddingY={4} style={{borderTop: '1px solid #444'}} />

      {/* Row 3 */}
      <Box marginBottom={4}>
        <Box marginBottom={2}>
          <Text size={1}>Format</Text>
        </Box>
        <Select
          value={format}
          onChange={(e) => setFormat((e.target as HTMLSelectElement).value as 'csv' | 'pdf')}
        >
          <option value="csv">CSV</option>
          <option value="pdf">PDF</option>
        </Select>
      </Box>

      {/* Row 4 */}
      <Box paddingTop={4} style={{display: 'flex', justifyContent: 'center'}}>
        <Button
          text={format === 'csv' ? '⬇️ Download CSV' : '⬇️ Download PDF'}
          tone="primary"
          onClick={format === 'csv' ? handleExport : handleExportPDF}
          disabled={!from || !to}
        />
      </Box>

      <Box paddingTop={5}>
        <Text size={1} muted style={{textAlign: 'center'}}>
          Filter by date range and download matching results as a CSV or PDF file.
        </Text>
      </Box>
    </Box>
  )
})

FinancialReports.displayName = 'FinancialReports'

export default FinancialReports
