import React, {useCallback, useEffect, useMemo, useState} from 'react'
import {useClient} from 'sanity'
import {Box, Button, Card, Flex, Grid, Stack, Text, TextArea, TextInput, useToast} from '@sanity/ui'

type BankAccountOption = {
  _id: string
  title?: string
  institutionName?: string
  accountLast4?: string
  defaultForChecks?: boolean
}

type LineItem = {
  category: string
  description: string
  amount: string
}

const emptyLineItem = (): LineItem => ({
  category: '',
  description: '',
  amount: '',
})

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(value || 0)

const CheckComposer = React.forwardRef<HTMLDivElement, Record<string, never>>((_props, ref) => {
  const client = useClient({apiVersion: '2024-10-01'})
  const toast = useToast()

  const [bankAccounts, setBankAccounts] = useState<BankAccountOption[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [saving, setSaving] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [checkId, setCheckId] = useState<string | null>(null)

  const [form, setForm] = useState({
    payee: '',
    mailingAddress: '',
    bankAccountId: '',
    amount: '',
    memo: '',
    checkNumber: '',
    paymentDate: new Date().toISOString().slice(0, 10),
  })
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLineItem()])

  const fetchBankAccounts = useCallback(async () => {
    setLoadingAccounts(true)
    try {
      const result: BankAccountOption[] = await client.fetch(
        `*[_type == "bankAccount" && status != "disconnected"] | order(defaultForChecks desc, _createdAt desc){
          _id,
          title,
          institutionName,
          accountLast4,
          defaultForChecks
        }`,
      )
      setBankAccounts(result)
      const defaultAccount = result.find((item) => item.defaultForChecks) || result[0]
      if (defaultAccount) {
        setForm((prev) => ({...prev, bankAccountId: defaultAccount._id}))
      }
    } catch (err: any) {
      console.error('CheckComposer fetch bank accounts error', err)
      toast.push({
        status: 'error',
        title: 'Unable to load bank accounts',
        description: err?.message || 'Check console for details.',
      })
    } finally {
      setLoadingAccounts(false)
    }
  }, [client, toast])

  useEffect(() => {
    fetchBankAccounts()
  }, [fetchBankAccounts])

  const totalAmountFromItems = useMemo(() => {
    return lineItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
  }, [lineItems])

  const handleInputChange = (event: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const target = event.currentTarget
    const {name, value} = target
    setForm((prev) => ({...prev, [name]: value}))
  }

  const handleBankAccountChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const {value} = event.currentTarget
    setForm((prev) => ({...prev, bankAccountId: value}))
  }

  const handleLineItemChange = (index: number, key: keyof LineItem, value: string) => {
    setLineItems((prev) => {
      const next = [...prev]
      next[index] = {...next[index], [key]: value}
      return next
    })
  }

  const addLineItem = () => setLineItems((prev) => [...prev, emptyLineItem()])

  const removeLineItem = (index: number) =>
    setLineItems((prev) => prev.filter((_, idx) => idx !== index))

  const validateForm = useCallback((): string | null => {
    if (!form.payee.trim()) return 'Payee is required.'
    if (!form.bankAccountId) return 'Please select a bank account.'
    if (!form.amount || Number(form.amount) <= 0) return 'Amount must be greater than zero.'
    if (!form.checkNumber) return 'Check number is required.'
    return null
  }, [form])

  const persistCheck = useCallback(
    async (overrideId?: string) => {
      const error = validateForm()
      if (error) {
        toast.push({status: 'warning', title: error})
        return null
      }

      setSaving(true)
      try {
        const id = overrideId || checkId || `check.${crypto.randomUUID()}`
        const cleanLineItems = lineItems
          .filter((item) => item.description || item.amount)
          .map((item) => ({
            category: item.category,
            description: item.description,
            amount: Number(item.amount) || 0,
          }))

        const amountNumber = Number(form.amount)

        await client.createOrReplace({
          _id: id,
          _type: 'check',
          payee: form.payee.trim(),
          mailingAddress: form.mailingAddress.trim(),
          bankAccount: {
            _type: 'reference',
            _ref: form.bankAccountId,
          },
          amount: amountNumber,
          memo: form.memo.trim(),
          checkNumber: Number(form.checkNumber),
          paymentDate: form.paymentDate,
          status: 'ready',
          lineItems: cleanLineItems,
        })

        setCheckId(id)
        toast.push({status: 'success', title: 'Check saved'})
        return id
      } catch (err: any) {
        console.error('CheckComposer save error', err)
        toast.push({
          status: 'error',
          title: 'Failed to save check',
          description: err?.message || 'Check console for details.',
        })
        return null
      } finally {
        setSaving(false)
      }
    },
    [client, form, lineItems, checkId, toast, validateForm],
  )

  const handleSaveDraft = async () => {
    await persistCheck()
  }

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handlePrint = async () => {
    setPrinting(true)
    try {
      const id = await persistCheck()
      if (!id) return

      const response = await fetch('/.netlify/functions/generateCheckPDF', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({checkId: id}),
      })

      if (!response.ok) {
        const detail = await response.text()
        throw new Error(detail || 'Failed to generate PDF')
      }

      const blob = await response.blob()
      triggerDownload(blob, `check-${form.checkNumber || id}.pdf`)

      await client.patch(id).set({status: 'printed'}).commit({autoGenerateArrayKeys: true})
      toast.push({status: 'success', title: 'Check ready to print'})
    } catch (err: any) {
      console.error('CheckComposer print error', err)
      toast.push({
        status: 'error',
        title: 'Printing failed',
        description: err?.message || 'Check console for details.',
      })
    } finally {
      setPrinting(false)
    }
  }

  const totalFromForm = Number(form.amount) || 0
  const showLineItemsWarning =
    totalFromForm && Math.abs(totalFromForm - totalAmountFromItems) > 0.01

  return (
    <Box ref={ref} padding={4}>
      <Stack space={4}>
        <Stack space={2}>
          <Text size={2} weight="semibold">
            Write &amp; Print Check
          </Text>
          <Text size={1} muted>
            Enter the details below to create a printable check that fits your QuickBooks-compatible
            stock.
          </Text>
        </Stack>

        <Card padding={4} radius={4} shadow={1}>
          <Stack space={4}>
            <Grid columns={[1, 2]} gap={4}>
              <Stack space={2}>
                <Text size={1} weight="semibold">
                  Payee
                </Text>
                <TextInput
                  name="payee"
                  value={form.payee}
                  onChange={handleInputChange}
                  placeholder="Payee name"
                />
              </Stack>
              <Stack space={2}>
                <Text size={1} weight="semibold">
                  Payment date
                </Text>
                <TextInput
                  name="paymentDate"
                  type="date"
                  value={form.paymentDate}
                  onChange={handleInputChange}
                />
              </Stack>
              <Stack space={2}>
                <Text size={1} weight="semibold">
                  Amount (USD)
                </Text>
                <TextInput
                  name="amount"
                  type="number"
                  value={form.amount}
                  onChange={handleInputChange}
                  min="0"
                  step="0.01"
                />
              </Stack>
              <Stack space={2}>
                <Text size={1} weight="semibold">
                  Check number
                </Text>
                <TextInput
                  name="checkNumber"
                  type="number"
                  value={form.checkNumber}
                  onChange={handleInputChange}
                />
              </Stack>
            </Grid>

            <Stack space={2}>
              <Text size={1} weight="semibold">
                Mailing address
              </Text>
              <TextArea
                name="mailingAddress"
                value={form.mailingAddress}
                onChange={handleInputChange}
                rows={3}
                placeholder="Street address&#10;City, State ZIP"
              />
            </Stack>

            <Stack space={2}>
              <Text size={1} weight="semibold">
                Memo
              </Text>
              <TextInput
                name="memo"
                value={form.memo}
                onChange={handleInputChange}
                placeholder="Memo"
              />
            </Stack>

            <Stack space={2}>
              <Text size={1} weight="semibold">
                Bank account
              </Text>
              {loadingAccounts ? (
                <Flex align="center" gap={2}>
                  <Text size={1}>Loading accounts…</Text>
                </Flex>
              ) : bankAccounts.length === 0 ? (
                <Text size={1} muted>
                  No bank accounts connected yet. Connect one from the Bank Accounts tool.
                </Text>
              ) : (
                <select
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  name="bankAccountId"
                  value={form.bankAccountId}
                  onChange={handleBankAccountChange}
                >
                  {bankAccounts.map((account) => (
                    <option key={account._id} value={account._id}>
                      {account.title || account.institutionName || 'Connected Account'} ••••
                      {account.accountLast4 || '----'}
                      {account.defaultForChecks ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </Stack>
          </Stack>
        </Card>

        <Card padding={4} radius={4} shadow={1}>
          <Stack space={3}>
            <Flex justify="space-between" align="center">
              <Text size={1} weight="semibold">
                Line items
              </Text>
              <Button text="Add line" mode="ghost" onClick={addLineItem} />
            </Flex>
            {lineItems.map((item, index) => (
              <Grid key={index} columns={[1, 1, 3]} gap={3}>
                <TextInput
                  name={`lineItems.${index}.category`}
                  value={item.category}
                  onChange={(event) =>
                    handleLineItemChange(index, 'category', event.currentTarget.value)
                  }
                  placeholder="Category"
                />
                <TextInput
                  name={`lineItems.${index}.description`}
                  value={item.description}
                  onChange={(event) =>
                    handleLineItemChange(index, 'description', event.currentTarget.value)
                  }
                  placeholder="Description"
                />
                <Flex gap={2}>
                  <TextInput
                    name={`lineItems.${index}.amount`}
                    value={item.amount}
                    onChange={(event) =>
                      handleLineItemChange(index, 'amount', event.currentTarget.value)
                    }
                    placeholder="Amount"
                    type="number"
                    min="0"
                    step="0.01"
                    style={{flex: 1}}
                  />
                  {lineItems.length > 1 ? (
                    <Button
                      tone="critical"
                      text="Remove"
                      mode="ghost"
                      onClick={() => removeLineItem(index)}
                    />
                  ) : null}
                </Flex>
              </Grid>
            ))}
            <Flex justify="flex-end">
              <Text size={1} muted>
                Total from line items: {formatCurrency(totalAmountFromItems)}
              </Text>
            </Flex>
            {showLineItemsWarning ? (
              <Text size={1} style={{color: '#b45309'}}>
                Warning: Line item total does not match the check amount.
              </Text>
            ) : null}
          </Stack>
        </Card>

        <Flex gap={3}>
          <Button
            text="Save draft"
            tone="default"
            onClick={handleSaveDraft}
            disabled={saving || printing}
            loading={saving}
          />
          <Button
            text="Print check"
            tone="primary"
            onClick={handlePrint}
            disabled={printing || saving}
            loading={printing}
          />
        </Flex>

        <Card padding={4} radius={4} shadow={1} tone="transparent">
          <Stack space={2}>
            <Text size={1} weight="semibold">
              Printing tips
            </Text>
            <Text size={1} muted>
              Use 8.5&quot; × 11&quot; check-on-top stock. Print at 100% scaling (no “fit to page”).
              The generated PDF uses a MICR font for the routing/account numbers—confirm your
              printer supports magnetic ink or toner before issuing real checks.
            </Text>
          </Stack>
        </Card>
      </Stack>
    </Box>
  )
})

CheckComposer.displayName = 'CheckComposer'

export default CheckComposer
