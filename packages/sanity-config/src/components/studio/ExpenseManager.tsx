import {ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {useClient} from 'sanity'
import type {DocumentStub} from '../../types/sanity'
import {
  Box,
  Button,
  Card,
  Flex,
  Grid,
  Heading,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  TextArea,
  useToast,
} from '@sanity/ui'
import {AddIcon, CheckmarkIcon, DownloadIcon, UploadIcon} from '@sanity/icons'
import {exportExpensesCsv, exportTaxSummaryCsv} from '../../utils/financeExports'
import {generateReferenceCode} from '../../../../../shared/referenceCodes'

const API_VERSION = '2024-10-01'

type VendorOption = {_id: string; companyName?: string | null}
type ExpenseListItem = {
  _id: string
  expenseNumber?: string
  date?: string
  vendorName?: string
  vendor?: {companyName?: string | null}
  category?: string
  amount?: number
  status?: string
  taxDeductible?: boolean
  paymentMethod?: string
  recurring?: boolean
  recurringFrequency?: string
}

const CATEGORY_OPTIONS = [
  {title: 'Materials/Parts', value: 'materials'},
  {title: 'Labor', value: 'labor'},
  {title: 'Rent/Utilities', value: 'rent_utilities'},
  {title: 'Marketing/Advertising', value: 'marketing'},
  {title: 'Equipment', value: 'equipment'},
  {title: 'Insurance', value: 'insurance'},
  {title: 'Shipping/Freight', value: 'shipping'},
  {title: 'Software/Tools', value: 'software'},
  {title: 'Phone/Internet', value: 'communications'},
  {title: 'Vehicle/Fuel', value: 'vehicle'},
  {title: 'Office Supplies', value: 'office'},
  {title: 'Training/Education', value: 'training'},
  {title: 'Legal/Professional', value: 'legal'},
  {title: 'Bank Fees', value: 'bank_fees'},
  {title: 'Other', value: 'other'},
]

const PAYMENT_METHODS = [
  'Cash',
  'Check',
  'Credit Card',
  'Debit Card',
  'Bank Transfer',
  'Other',
]

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  materials: ['part', 'material', 'fabrication', 'component'],
  labor: ['payroll', 'staff', 'contractor', 'labor'],
  software: ['software', 'subscription', 'saas', 'license'],
  marketing: ['ads', 'facebook', 'google', 'campaign', 'promo'],
  shipping: ['freight', 'shipping', 'ups', 'fedex'],
  rent_utilities: ['rent', 'utility', 'electric', 'water'],
  vehicle: ['fuel', 'diesel', 'gas', 'fleet'],
  communications: ['phone', 'internet', 'mobile', 'verizon'],
  equipment: ['machine', 'tool', 'equipment'],
  insurance: ['insurance', 'policy'],
  legal: ['legal', 'attorney', 'law'],
  bank_fees: ['fee', 'bank', 'interest'],
}

const currency = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'})

const suggestCategory = (vendorName: string, description: string) => {
  const haystack = `${vendorName} ${description}`.toLowerCase()
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((keyword) => haystack.includes(keyword))) return category
  }
  return ''
}

const todayString = () => new Date().toISOString().slice(0, 10)

const ExpenseManager = () => {
  const client = useClient({apiVersion: API_VERSION})
  const toast = useToast()
  const [vendors, setVendors] = useState<VendorOption[]>([])
  const [recentExpenses, setRecentExpenses] = useState<ExpenseListItem[]>([])
  const [receiptAssetId, setReceiptAssetId] = useState<string | null>(null)
  const [uploadingReceipt, setUploadingReceipt] = useState(false)
  const [suggestedCategory, setSuggestedCategory] = useState<string | null>(null)
  const [categoryLocked, setCategoryLocked] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [form, setForm] = useState({
    date: todayString(),
    vendorName: '',
    vendorId: '',
    amount: '',
    category: '',
    status: 'pending',
    paymentMethod: '',
    taxDeductible: true,
    recurring: false,
    recurringFrequency: 'Monthly',
    description: '',
  })

  const [submitting, setSubmitting] = useState(false)

  const loadVendors = useCallback(async () => {
    const data = await client.fetch<VendorOption[]>(
      `*[_type == "vendor"] | order(companyName asc)[0...100]{_id, companyName}`,
    )
    setVendors(data)
  }, [client])

  const loadExpenses = useCallback(async () => {
    const data = await client.fetch<ExpenseListItem[]>(
      `*[_type == "expense"] | order(date desc)[0...25]{
        _id,
        expenseNumber,
        date,
        vendorName,
        vendor->{companyName},
        category,
        amount,
        status,
        paymentMethod,
        taxDeductible,
        recurring,
        recurringFrequency
      }`,
    )
    setRecentExpenses(data)
  }, [client])

  useEffect(() => {
    loadVendors().catch(() => null)
    loadExpenses().catch(() => null)
  }, [loadVendors, loadExpenses])

  useEffect(() => {
    const suggestion = suggestCategory(form.vendorName, form.description)
    setSuggestedCategory(suggestion || null)
    if (suggestion && !categoryLocked) {
      setForm((prev) => ({...prev, category: suggestion}))
    }
  }, [form.vendorName, form.description, categoryLocked])

  const handleInput =
    (field: keyof typeof form) =>
    (event: FormEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const value = event.currentTarget.value
      if (field === 'category') setCategoryLocked(true)
      setForm((prev) => ({...prev, [field]: value}))
    }

  const handleToggle =
    (field: 'taxDeductible' | 'recurring') => (event: ChangeEvent<HTMLInputElement>) => {
      const checked = event.currentTarget.checked
      setForm((prev) => ({...prev, [field]: checked}))
    }

  const resetForm = () => {
    setForm({
      date: todayString(),
      vendorName: '',
      vendorId: '',
      amount: '',
      category: '',
      status: 'pending',
      paymentMethod: '',
      taxDeductible: true,
      recurring: false,
      recurringFrequency: 'Monthly',
      description: '',
    })
    setReceiptAssetId(null)
    setCategoryLocked(false)
  }

  const handleReceiptUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setUploadingReceipt(true)
    try {
      const asset = await client.assets.upload('file', file, {filename: file.name})
      setReceiptAssetId(asset._id)
      toast.push({status: 'success', title: 'Receipt uploaded'})
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      toast.push({status: 'error', title: 'Upload failed', description: message})
    } finally {
      setUploadingReceipt(false)
    }
  }

  const handleCreateExpense = async () => {
    if (!form.amount || !form.date) {
      toast.push({status: 'warning', title: 'Enter amount and date'})
      return
    }
    const amountValue = Number(form.amount)
    if (!Number.isFinite(amountValue) || amountValue < 0) {
      toast.push({status: 'warning', title: 'Amount must be a positive number'})
      return
    }

    setSubmitting(true)
    try {
      const expenseNumber = await generateReferenceCode(client, {
        prefix: 'EXP-',
        typeName: 'expense',
        fieldName: 'expenseNumber',
      })
      const doc: DocumentStub<Record<string, unknown>> = {
        _type: 'expense',
        expenseNumber,
        date: form.date,
        vendorName: form.vendorId ? undefined : form.vendorName || undefined,
        amount: amountValue,
        category: form.category || 'other',
        status: form.status,
        taxDeductible: form.taxDeductible,
        paymentMethod: form.paymentMethod || undefined,
        description: form.description || undefined,
        recurring: form.recurring,
        recurringFrequency: form.recurring ? form.recurringFrequency : undefined,
      }
      if (form.vendorId) {
        doc.vendor = {_type: 'reference', _ref: form.vendorId}
      }
      if (receiptAssetId) {
        doc.receipt = {_type: 'file', asset: {_type: 'reference', _ref: receiptAssetId}}
      }

      await client.create(doc)
      toast.push({status: 'success', title: 'Expense added'})
      resetForm()
      loadExpenses()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      toast.push({status: 'error', title: 'Create failed', description: message})
    } finally {
      setSubmitting(false)
    }
  }

  const handleMarkPaid = async (expense: ExpenseListItem) => {
    if (expense.status === 'paid') return
    try {
      await client.patch(expense._id).set({status: 'paid', paidDate: todayString()}).commit()
      toast.push({status: 'success', title: 'Marked as paid'})
      loadExpenses()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      toast.push({status: 'error', title: 'Update failed', description: message})
    }
  }

  const normalizedExpenses = useMemo(
    () =>
      recentExpenses.map((expense) => ({
        ...expense,
        vendorName: expense.vendorName || expense.vendor?.companyName || '',
      })),
    [recentExpenses],
  )

  const exportExpenses = () => exportExpensesCsv(normalizedExpenses)
  const exportTaxSummary = () => exportTaxSummaryCsv(normalizedExpenses)

  const suggestedLabel = useMemo(() => {
    if (!suggestedCategory) return ''
    const option = CATEGORY_OPTIONS.find((opt) => opt.value === suggestedCategory)
    return option?.title
  }, [suggestedCategory])

  return (
    <Stack space={4} padding={4}>
      <Flex align="center" justify="space-between">
        <Heading size={3}>💸 Expense Manager</Heading>
        <Flex gap={2}>
          <Button
            icon={DownloadIcon}
            mode="ghost"
            text="Export CSV"
            onClick={exportExpenses}
            disabled={!recentExpenses.length}
          />
          <Button
            icon={DownloadIcon}
            text="Tax Summary"
            tone="primary"
            onClick={exportTaxSummary}
            disabled={!recentExpenses.length}
          />
        </Flex>
      </Flex>

      <Card padding={4} radius={3} shadow={1}>
        <Box marginBottom={3}>
          <Heading size={2}>Quick Add Expense</Heading>
        </Box>
        <Grid columns={[1, 2]} gap={4}>
          <Stack space={3}>
            <Text size={1} muted>
              Vendor
            </Text>
            <Select
              value={form.vendorId}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  vendorId: event.currentTarget.value,
                  vendorName: event.currentTarget.value ? '' : prev.vendorName,
                }))
              }
            >
              <option value="">Select vendor…</option>
              {vendors.map((vendor) => (
                <option key={vendor._id} value={vendor._id}>
                  {vendor.companyName || vendor._id}
                </option>
              ))}
            </Select>
            {!form.vendorId && (
              <TextInput
                placeholder="Vendor name"
                value={form.vendorName}
                onChange={handleInput('vendorName')}
              />
            )}
            <TextInput
              type="date"
              value={form.date}
              onChange={handleInput('date')}
              data-testid="expense-date-input"
            />
            <TextInput
              type="number"
              placeholder="Amount"
              value={form.amount}
              onChange={handleInput('amount')}
            />
            <Select value={form.category} onChange={handleInput('category')}>
              <option value="">Category</option>
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.title}
                </option>
              ))}
            </Select>
            {suggestedLabel && !categoryLocked && (
              <Text size={1} muted>
                AI Suggestion: {suggestedLabel}
              </Text>
            )}
          </Stack>
          <Stack space={3}>
            <TextArea
              rows={3}
              placeholder="Description"
              value={form.description}
              onChange={handleInput('description')}
            />
            <Select value={form.paymentMethod} onChange={handleInput('paymentMethod')}>
              <option value="">Payment Method</option>
              {PAYMENT_METHODS.map((method) => (
                <option key={method}>{method}</option>
              ))}
            </Select>
            <Select value={form.status} onChange={handleInput('status')}>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="scheduled">Scheduled</option>
              <option value="cancelled">Cancelled</option>
            </Select>
            <Flex align="center" gap={2}>
              <Switch
                id="taxDeductible"
                checked={form.taxDeductible}
                onChange={handleToggle('taxDeductible')}
              />
              <label htmlFor="taxDeductible">
                <Text size={1}>Tax Deductible</Text>
              </label>
            </Flex>
            <Flex align="center" gap={2}>
              <Switch
                id="recurring"
                checked={form.recurring}
                onChange={handleToggle('recurring')}
              />
              <label htmlFor="recurring">
                <Text size={1}>Recurring</Text>
              </label>
            </Flex>
            {form.recurring && (
              <Select value={form.recurringFrequency} onChange={handleInput('recurringFrequency')}>
                <option value="Weekly">Weekly</option>
                <option value="Monthly">Monthly</option>
                <option value="Quarterly">Quarterly</option>
                <option value="Annually">Annually</option>
              </Select>
            )}
            <Flex gap={2} align="center">
              <Button
                icon={UploadIcon}
                text={receiptAssetId ? 'Receipt Uploaded' : 'Upload Receipt'}
                mode="ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingReceipt}
              />
              <input
                type="file"
                accept="application/pdf,image/*"
                style={{display: 'none'}}
                ref={fileInputRef}
                onChange={handleReceiptUpload}
              />
              {uploadingReceipt && (
                <Text size={1} muted>
                  Uploading…
                </Text>
              )}
            </Flex>
          </Stack>
        </Grid>
        <Flex justify="flex-end" marginTop={4}>
          <Button
            icon={AddIcon}
            text="Add Expense"
            tone="primary"
            onClick={handleCreateExpense}
            loading={submitting}
          />
        </Flex>
      </Card>

      <Card padding={4} radius={3} shadow={1}>
        <Box marginBottom={3}>
          <Heading size={2}>Recent Expenses</Heading>
        </Box>
        <Stack space={2}>
          {recentExpenses.map((expense) => (
            <Flex
              key={expense._id}
              align="center"
              justify="space-between"
              paddingY={2}
              style={{borderBottom: '1px solid var(--card-border-color)'}}
            >
              <Flex direction="column">
                <Text weight="semibold">
                  {expense.expenseNumber || expense.vendorName || 'Expense'} ·{' '}
                  {currency.format(expense.amount || 0)}
                </Text>
                <Text size={1} muted>
                  {expense.date || 'No date'} · {expense.category || 'Uncategorized'}
                </Text>
              </Flex>
              <Flex gap={2} align="center">
                <Text size={1} muted>
                  {expense.status || 'pending'}
                </Text>
                <Button
                  icon={CheckmarkIcon}
                  text="Mark Paid"
                  mode="bleed"
                  tone="positive"
                  disabled={expense.status === 'paid'}
                  onClick={() => handleMarkPaid(expense)}
                />
              </Flex>
            </Flex>
          ))}
          {!recentExpenses.length && (
            <Text size={1} muted>
              No expenses yet.
            </Text>
          )}
        </Stack>
      </Card>
    </Stack>
  )
}

export default ExpenseManager
