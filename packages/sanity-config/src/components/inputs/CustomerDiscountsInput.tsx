import React, {useMemo, useState} from 'react'
import {TagsArrayInputProps, useFormValue} from 'sanity'
import {Box, Button, Dialog, Flex, Stack, Text, TextInput, Select, useToast} from '@sanity/ui'
import {getNetlifyFnBase} from '../../schemaTypes/documentActions/netlifyFnBase'

type DiscountMode = 'percent' | 'amount'
type DiscountDuration = 'once' | 'repeating' | 'forever'

function sanitizeDocId(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.toString().trim()
  if (!trimmed) return undefined
  return trimmed.replace(/^drafts\./, '')
}

type Props = TagsArrayInputProps

const CustomerDiscountsInput: React.FC<Props> = (props) => {
  const {renderDefault} = props
  const toast = useToast()

  const stripeCustomerId = useFormValue(['stripeCustomerId']) as string | undefined
  const documentIdRaw = useFormValue(['_id']) as string | undefined
  const documentId = useMemo(() => sanitizeDocId(documentIdRaw), [documentIdRaw])

  const [isDialogOpen, setDialogOpen] = useState(false)
  const [mode, setMode] = useState<DiscountMode>('percent')
  const [duration, setDuration] = useState<DiscountDuration>('once')
  const [value, setValue] = useState('')
  const [name, setName] = useState('')
  const [durationMonths, setDurationMonths] = useState('')
  const [currency, setCurrency] = useState('usd')
  const [isSubmitting, setSubmitting] = useState(false)

  // The `discounts` field itself is marked as read-only in the schema so the
  // array can't be edited manually, but we still want editors to be able to
  // create new Stripe discounts from this input. Respect the presence of a
  // Stripe customer ID but ignore the read-only flag for the button so the
  // dialog remains accessible when the field is intentionally read-only.
  const disabled = !stripeCustomerId

  async function handleSubmit() {
    if (!stripeCustomerId) {
      toast.push({
        status: 'warning',
        title: 'Connect to Stripe',
        description: 'Add a Stripe Customer ID before creating discounts.',
      })
      return
    }

    const parsedValue = Number(value)
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      toast.push({
        status: 'warning',
        title: 'Enter a value',
        description: 'Discount value must be a positive number.',
      })
      return
    }

    if (mode === 'percent' && parsedValue > 100) {
      toast.push({
        status: 'warning',
        title: 'Percent too high',
        description: 'Percent-off discounts must be 100 or less.',
      })
      return
    }

    let currencyCode = currency.trim().toLowerCase()
    if (mode === 'amount') {
      if (!currencyCode) {
        toast.push({
          status: 'warning',
          title: 'Choose currency',
          description: 'Select a currency for amount-based discounts.',
        })
        return
      }
      if (currencyCode.length !== 3) {
        toast.push({
          status: 'warning',
          title: 'Invalid currency',
          description: 'Currency codes should be three letters (e.g. USD).',
        })
        return
      }
    } else {
      currencyCode = ''
    }

    let durationMonthsValue: number | undefined
    if (duration === 'repeating') {
      durationMonthsValue = Number(durationMonths)
      if (!Number.isFinite(durationMonthsValue) || durationMonthsValue <= 0) {
        toast.push({
          status: 'warning',
          title: 'Set duration months',
          description: 'Enter how many months the discount repeats.',
        })
        return
      }
    }

    setSubmitting(true)
    try {
      const baseUrl = getNetlifyFnBase().replace(/\/$/, '')
      const res = await fetch(`${baseUrl}/.netlify/functions/createCustomerDiscount`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          customerId: documentId,
          stripeCustomerId,
          mode,
          value: parsedValue,
          currency: currencyCode || undefined,
          duration,
          durationInMonths: durationMonthsValue,
          name: name.trim() || undefined,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.error) {
        throw new Error(data?.error || `Request failed (${res.status})`)
      }

      toast.push({
        status: 'success',
        title: 'Discount created',
        description:
          'Stripe is updating this customer. Refresh in a moment to see the new discount.',
      })
      setDialogOpen(false)
      setValue('')
      setName('')
      setDurationMonths('')
      setDuration('once')
      setMode('percent')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      toast.push({status: 'error', title: 'Failed to create discount', description: message})
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Stack space={4}>
      <Flex align="center" justify="space-between">
        <Text size={1} muted>
          Discounts sync automatically from Stripe. Use the button to create a coupon for this
          customer.
        </Text>
        <Button
          text="Create discount"
          tone="primary"
          onClick={() => setDialogOpen(true)}
          disabled={disabled}
        />
      </Flex>
      {!stripeCustomerId ? (
        <Box paddingY={2}>
          <Text size={1} muted>
            Add a Stripe Customer ID to enable discount creation.
          </Text>
        </Box>
      ) : null}
      {renderDefault(props as any)}
      {isDialogOpen ? (
        <Dialog
          id="customer-discount-dialog"
          header="Create customer discount"
          onClose={() => {
            if (!isSubmitting) setDialogOpen(false)
          }}
          width={1}
        >
          <Box padding={4}>
            <Stack space={4}>
              <Stack space={2}>
                <Text size={1} weight="semibold">
                  Discount name (optional)
                </Text>
                <TextInput
                  value={name}
                  onChange={(event) => setName(event.currentTarget.value)}
                  disabled={isSubmitting}
                  placeholder="Customer appreciation"
                />
              </Stack>

              <Stack space={2}>
                <Text size={1} weight="semibold">
                  Discount type
                </Text>
                <Select
                  value={mode}
                  onChange={(event) => setMode(event.currentTarget.value as DiscountMode)}
                  disabled={isSubmitting}
                >
                  <option value="percent">Percent off</option>
                  <option value="amount">Fixed amount</option>
                </Select>
              </Stack>

              <Stack space={2}>
                <Text size={1} weight="semibold">
                  Discount value
                </Text>
                <TextInput
                  value={value}
                  type="number"
                  onChange={(event) => setValue(event.currentTarget.value)}
                  disabled={isSubmitting}
                  placeholder={mode === 'percent' ? '10 for 10% off' : '25 for $25 off'}
                />
              </Stack>

              {mode === 'amount' ? (
                <Stack space={2}>
                  <Text size={1} weight="semibold">
                    Currency
                  </Text>
                  <TextInput
                    value={currency}
                    onChange={(event) => setCurrency(event.currentTarget.value)}
                    disabled={isSubmitting}
                    placeholder="usd"
                    maxLength={3}
                  />
                </Stack>
              ) : null}

              <Stack space={2}>
                <Text size={1} weight="semibold">
                  Duration
                </Text>
                <Select
                  value={duration}
                  onChange={(event) => setDuration(event.currentTarget.value as DiscountDuration)}
                  disabled={isSubmitting}
                >
                  <option value="once">One-time</option>
                  <option value="repeating">Repeating</option>
                  <option value="forever">Forever</option>
                </Select>
              </Stack>

              {duration === 'repeating' ? (
                <Stack space={2}>
                  <Text size={1} weight="semibold">
                    Duration in months
                  </Text>
                  <TextInput
                    value={durationMonths}
                    onChange={(event) => setDurationMonths(event.currentTarget.value)}
                    disabled={isSubmitting}
                    placeholder="3"
                    type="number"
                  />
                </Stack>
              ) : null}

              <Flex justify="flex-end" gap={3}>
                <Button
                  mode="ghost"
                  text="Cancel"
                  onClick={() => setDialogOpen(false)}
                  disabled={isSubmitting}
                />
                <Button
                  tone="primary"
                  text="Create discount"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  loading={isSubmitting}
                />
              </Flex>
            </Stack>
          </Box>
        </Dialog>
      ) : null}
    </Stack>
  )
}

CustomerDiscountsInput.displayName = 'CustomerDiscountsInput'

export default CustomerDiscountsInput
