import {forwardRef, useCallback, useEffect, useMemo, useState} from 'react'
import {useClient} from 'sanity'
import {
  Box,
  Button,
  Card,
  Flex,
  Heading,
  Spinner,
  Stack,
  Text,
} from '@sanity/ui'
import {DownloadIcon, RefreshIcon} from '@sanity/icons'

const API_VERSION = '2024-10-01'

type InvoiceRow = {
  _id: string
  invoiceNumber?: string
  status?: string
  total?: number
  amountSubtotal?: number
  amountTax?: number
  amountShipping?: number
  invoiceDate?: string
  dueDate?: string
  paymentTerms?: string
  orderRef?: {
    _id: string
    orderNumber?: string
    customerName?: string
    _createdAt?: string
    paymentTerms?: string
    customerRef?: {
      companyName?: string
      firstName?: string
      lastName?: string
    }
  }
  customerRef?: {
    firstName?: string
    lastName?: string
    email?: string
  }
}

const ACCOUNTS_RECEIVABLE_QUERY = `
*[_type == "invoice" && defined(orderRef->_id) && orderRef->orderType == "wholesale"]{
  _id,
  invoiceNumber,
  status,
  total,
  amountSubtotal,
  amountTax,
  amountShipping,
  invoiceDate,
  dueDate,
  paymentTerms,
  orderRef->{
    _id,
    orderNumber,
    customerName,
    _createdAt,
    paymentTerms,
    customerRef->{companyName, firstName, lastName}
  },
  customerRef->{firstName, lastName, email}
} | order(coalesce(dueDate, invoiceDate) asc)
`

const PAYMENT_TERM_DAYS: Record<string, number> = {
  due_on_receipt: 0,
  net_15: 15,
  net_30: 30,
  net_45: 45,
  net_60: 60,
  net_90: 90,
}

const currency = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'})

type StatusTab = 'all' | 'current' | 'overdue' | 'paid'

const AccountsReceivable = forwardRef<HTMLDivElement, Record<string, unknown>>((_props, ref) => {
  const client = useClient({apiVersion: API_VERSION})
  const [rows, setRows] = useState<InvoiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<StatusTab>('current')

  const fetchReceivables = useCallback(async () => {
    setLoading(true)
    try {
      const data = await client.fetch<InvoiceRow[]>(ACCOUNTS_RECEIVABLE_QUERY)
      setRows(data || [])
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    fetchReceivables()
  }, [fetchReceivables])

  const enhancedRows = useMemo(() => rows.map(enrichRow), [rows])

  const filteredRows = useMemo(() => {
    if (tab === 'all') return enhancedRows
    return enhancedRows.filter((row) => row.derivedStatus === tab)
  }, [enhancedRows, tab])

  const totals = useMemo(() => {
    const sum = enhancedRows.reduce(
      (acc, row) => {
        acc.all += row.amount
        if (row.derivedStatus === 'overdue') acc.overdue += row.amount
        if (row.derivedStatus === 'current') acc.current += row.amount
        return acc
      },
      {all: 0, overdue: 0, current: 0},
    )
    return sum
  }, [enhancedRows])

  const exportCsv = () => {
    if (!enhancedRows.length) return
    const header = [
      'Invoice #',
      'Order #',
      'Customer',
      'Invoice Date',
      'Due Date',
      'Amount',
      'Status',
      'Days Overdue',
    ]
    const rowsCsv = enhancedRows.map((row) => [
      row.invoiceNumber || '',
      row.orderRef?.orderNumber || '',
      row.customerLabel,
      row.invoiceDate || '',
      row.dueDate || '',
      row.amount.toFixed(2),
      row.derivedStatus,
      row.daysOverdue,
    ])
    const csv = [header, ...rowsCsv].map((line) => line.join(',')).join('\n')
    const blob = new Blob([csv], {type: 'text/csv;charset=utf-8'})
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'accounts-receivable.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Stack ref={ref} space={4} padding={4}>
      <Flex align="center" justify="space-between">
        <Heading size={3}>🏦 Accounts Receivable</Heading>
        <Flex gap={2}>
          <Button icon={RefreshIcon} mode="ghost" text="Refresh" onClick={fetchReceivables} disabled={loading} />
          <Button icon={DownloadIcon} text="Export CSV" onClick={exportCsv} disabled={!enhancedRows.length} />
        </Flex>
      </Flex>

      <Flex gap={3} wrap="wrap">
        <StatusCard
          label="Current"
          amount={totals.current}
          active={tab === 'current'}
          onClick={() => setTab('current')}
        />
        <StatusCard
          label="Overdue"
          amount={totals.overdue}
          active={tab === 'overdue'}
          onClick={() => setTab('overdue')}
          tone="critical"
        />
        <StatusCard
          label="All Open"
          amount={totals.all}
          active={tab === 'all'}
          onClick={() => setTab('all')}
        />
        <StatusCard
          label="Paid"
          amount={enhancedRows
            .filter((row) => row.derivedStatus === 'paid')
            .reduce((sum, row) => sum + row.amount, 0)}
          active={tab === 'paid'}
          onClick={() => setTab('paid')}
        />
      </Flex>

      <Card radius={3} shadow={1} padding={0}>
        {loading ? (
          <Flex align="center" justify="center" padding={4}>
            <Spinner />
          </Flex>
        ) : (
          <Stack>
            {filteredRows.map((row) => (
              <Flex
                key={row._id}
                padding={4}
                gap={4}
                direction={['column', 'row']}
                style={{borderBottom: '1px solid var(--card-border-color)'}}
              >
                <Stack flex={2}>
                  <Text weight="semibold">
                    {row.customerLabel}
                    <Text size={1} muted>
                      {' '}
                      #{row.orderRef?.orderNumber || 'n/a'}
                    </Text>
                  </Text>
                  <Text size={1} muted>
                    Invoice {row.invoiceNumber || row._id}
                  </Text>
                </Stack>
                <Stack flex={1}>
                  <Text>Invoice Date: {row.invoiceDate || 'n/a'}</Text>
                  <Text>Due: {row.dueDate || 'n/a'}</Text>
                </Stack>
                <Stack flex={1} style={{textAlign: 'right', justifyItems: 'end'}}>
                  <Text weight="semibold">{currency.format(row.amount)}</Text>
                  <Text
                    size={1}
                    style={
                      row.derivedStatus === 'overdue'
                        ? {color: 'var(--card-critical-fg-color)'}
                        : undefined
                    }
                  >
                    {row.derivedStatus === 'overdue'
                      ? `${row.daysOverdue} days overdue`
                      : row.derivedStatus}
                  </Text>
                </Stack>
              </Flex>
            ))}
            {!filteredRows.length && (
              <Box padding={4}>
                <Text size={1} muted>
                  No invoices found for this filter.
                </Text>
              </Box>
            )}
          </Stack>
        )}
      </Card>
    </Stack>
  )
})

AccountsReceivable.displayName = 'AccountsReceivable'

const StatusCard = ({
  label,
  amount,
  active,
  tone = 'default',
  onClick,
}: {
  label: string
  amount: number
  active: boolean
  tone?: 'default' | 'critical'
  onClick: () => void
}) => (
  <Card
    padding={3}
    radius={3}
    shadow={active ? 2 : 0}
    tone={tone === 'critical' ? 'critical' : 'transparent'}
    style={{cursor: 'pointer'}}
    onClick={onClick}
  >
    <Stack space={1}>
      <Text size={1} muted>
        {label}
      </Text>
      <Text size={2} weight="semibold">
        {currency.format(amount || 0)}
      </Text>
    </Stack>
  </Card>
)

const enrichRow = (row: InvoiceRow) => {
  const amount =
    Number(row.total) ||
    Number(row.amountSubtotal || 0) + Number(row.amountTax || 0) + Number(row.amountShipping || 0)
  const dueDate = resolveDueDate(row)
  const invoiceDate = row.invoiceDate || formatDate(row.orderRef?._createdAt)
  const daysOverdue = dueDate ? Math.max(0, differenceInDays(new Date(), new Date(dueDate))) : 0
  const derivedStatus =
    row.status === 'paid'
      ? 'paid'
      : dueDate && new Date() > new Date(dueDate)
      ? 'overdue'
      : 'current'
  const customerLabel =
    row.orderRef?.customerRef?.companyName ||
    row.orderRef?.customerName ||
    [row.customerRef?.firstName, row.customerRef?.lastName].filter(Boolean).join(' ') ||
    'Unknown'
  return {
    ...row,
    amount,
    dueDate,
    invoiceDate,
    customerLabel,
    daysOverdue,
    derivedStatus,
  }
}

const resolveDueDate = (row: InvoiceRow): string | undefined => {
  if (row.dueDate) return row.dueDate
  const base = row.invoiceDate || row.orderRef?._createdAt
  if (!base) return undefined
  const paymentTerms = row.paymentTerms || row.orderRef?.paymentTerms
  const days = paymentTerms ? PAYMENT_TERM_DAYS[paymentTerms] ?? 30 : 30
  const date = new Date(base)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const differenceInDays = (a: Date, b: Date) =>
  Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24))

const formatDate = (input?: string) => (input ? input.slice(0, 10) : undefined)

export default AccountsReceivable
