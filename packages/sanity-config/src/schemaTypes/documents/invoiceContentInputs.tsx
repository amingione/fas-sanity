import {set, useClient, useFormValue} from 'sanity'
import React, {useEffect, useMemo, useState} from 'react'
import {SearchIcon} from '@sanity/icons'
import {Autocomplete, Box, Button, Card, Flex, Stack, Text, TextInput} from '@sanity/ui'

import './invoiceStyles.css'
import {formatInvoiceNumberFromOrder} from '../../utils/orderNumber'

type FormValuePath = (string | number)[]

function useMaybeFormValue<T = unknown>(path: FormValuePath): T | undefined {
  try {
    return useFormValue(path) as T
  } catch (error) {
    if (error instanceof Error && (error.message || '').includes('FormValueProvider')) {
      return undefined
    }
    throw error
  }
}

const DEFAULT_INVOICE_PREFIX = (() => {
  const raw =
    typeof process !== 'undefined'
      ? process.env?.SANITY_STUDIO_INVOICE_PREFIX || process.env?.INVOICE_PREFIX
      : undefined
  const cleaned = (raw || 'INV')
    .toString()
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase()
  return cleaned || 'INV'
})()

// ---- Invoice Number Input (auto-populate, disables if linked to order or not pending)
export function InvoiceNumberInput(props: any) {
  const {value, onChange, elementProps = {}} = props
  const client = useClient({apiVersion: '2024-10-01'})
  const orderRef = useMaybeFormValue<{_ref?: string}>(['orderRef'])
  const orderNumberField = useMaybeFormValue<string>(['orderNumber'])
  const [resolvedOrderNumber, setResolvedOrderNumber] = useState<string | undefined>(
    orderNumberField || undefined,
  )

  useEffect(() => {
    if (orderNumberField && orderNumberField !== resolvedOrderNumber) {
      setResolvedOrderNumber(orderNumberField)
    }
  }, [orderNumberField, resolvedOrderNumber])

  useEffect(() => {
    if (!orderRef?._ref || resolvedOrderNumber) return
    let cancelled = false
    client
      .fetch<string | null>(`*[_type == "order" && _id == $id][0].orderNumber`, {
        id: orderRef._ref,
      })
      .then((orderNumber) => {
        if (!cancelled && orderNumber) {
          setResolvedOrderNumber(orderNumber)
        }
      })
      .catch(() => {
        // Swallow fetch errors; fallback generation will handle missing orderNumber
      })
    return () => {
      cancelled = true
    }
  }, [client, orderRef, resolvedOrderNumber])

  useEffect(() => {
    const derived = formatInvoiceNumberFromOrder(resolvedOrderNumber)
    if (derived) {
      if (value !== derived) {
        onChange(set(derived))
      }
      return
    }
    if (!value) {
      const rand = Math.floor(Math.random() * 1_000_000)
      const generated = `${DEFAULT_INVOICE_PREFIX}-${rand.toString().padStart(6, '0')}`
      onChange(set(generated))
    }
  }, [onChange, resolvedOrderNumber, value])

  return (
    <TextInput
      {...elementProps}
      id={elementProps?.id}
      ref={elementProps?.ref}
      readOnly
      value={value || ''}
    />
  )
}

type CustomerSearchOption = {
  value: string
  label: string
  subtitle?: string
  address?: string
  payload: any
}

// ---- Collapsible object input (Bill To) with customer search and linking
export function BillToInput(props: any) {
  const {renderDefault, value, onChange} = props
  const client = useClient({apiVersion: '2024-10-01'})
  const [open, setOpen] = useState(true)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const documentId = useMaybeFormValue<string>(['_id']) ?? ''
  const currentShip = useMaybeFormValue<any>(['shipTo']) ?? {}

  useEffect(() => {
    const term = query.trim()
    if (term.length < 2) {
      setResults([])
      return
    }

    const timer = setTimeout(async () => {
      try {
        setLoading(true)
        const matches = await client.fetch(
          `*[_type == "customer" && (name match $m || email match $m || phone match $m)][0...10]{
            _id, name, email, phone,
            address_line1, address_line2, city_locality, state_province, postal_code, country_code
          }`,
          {m: `${term}*`},
        )
        setResults(Array.isArray(matches) ? matches : [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [client, query])

  function applyCustomer(customer: any) {
    const patch = {
      name: (customer?.name || '').trim(),
      email: (customer?.email || '').trim(),
      phone: (customer?.phone || '').trim(),
      address_line1: (customer?.address_line1 || '').trim(),
      address_line2: (customer?.address_line2 || '').trim(),
      city_locality: (customer?.city_locality || '').trim(),
      state_province: (customer?.state_province || '').trim(),
      postal_code: (customer?.postal_code || '').trim(),
      country_code: (customer?.country_code || '').trim(),
    }

    onChange(set(patch))

    if (customer?._id && documentId) {
      const emptyShip =
        !currentShip?.name && !currentShip?.address_line1 && !currentShip?.postal_code
      const operations: Record<string, any> = {
        customerRef: {_type: 'reference', _ref: customer._id},
      }
      if (emptyShip) {
        operations.shipTo = patch
      }
      client
        .patch(documentId)
        .set(operations)
        .commit({autoGenerateArrayKeys: true})
        .catch(() => undefined)
    }
  }

  const customerOptions = useMemo<CustomerSearchOption[]>(() => {
    return results.map((customer: any, index: number) => {
      const addressParts = [
        [customer.address_line1, customer.address_line2].filter(Boolean).join(', '),
        [customer.city_locality, customer.state_province].filter(Boolean).join(', '),
        [customer.postal_code, customer.country_code].filter(Boolean).join(' '),
      ]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(' • ')

      return {
        value: customer._id || customer.email || `customer-${index}`,
        label: customer.name || customer.email || 'Unnamed customer',
        subtitle: [customer.email, customer.phone].filter(Boolean).join(' • ') || undefined,
        address: addressParts || undefined,
        payload: customer,
      }
    })
  }, [results])

  async function createFromBillTo() {
    try {
      const payload = {
        _type: 'customer',
        name: value?.name || '',
        email: value?.email || '',
        phone: value?.phone || '',
        address_line1: value?.address_line1 || '',
        address_line2: value?.address_line2 || '',
        city_locality: value?.city_locality || '',
        state_province: value?.state_province || '',
        postal_code: value?.postal_code || '',
        country_code: value?.country_code || '',
      }
      const created = await client.create(payload)
      applyCustomer(created)
    } catch (err) {
      console.warn('BillToInput: failed to create customer', err)
    }
  }

  const noMatches = query.trim().length >= 2 && !loading && customerOptions.length === 0

  return (
    <Card padding={4} radius={3} shadow={1} tone="default" border>
      <Stack space={4}>
        <Flex align="center" justify="space-between">
          <Stack space={2}>
            <Text size={2} weight="semibold">
              Bill To
            </Text>
            <Text muted size={1}>
              Link an existing customer or capture billing details manually.
            </Text>
          </Stack>
          <Button
            mode="bleed"
            text={open ? 'Hide' : 'Show'}
            onClick={() => setOpen((prev) => !prev)}
          />
        </Flex>
        {open && (
          <Stack space={4}>
            <Flex gap={3} wrap="wrap" align="flex-start">
              <Box style={{flex: 1, minWidth: 280}}>
                <Autocomplete<CustomerSearchOption>
                  id="invoice-bill-to-search"
                  openButton
                  icon={SearchIcon}
                  loading={loading}
                  options={customerOptions}
                  onQueryChange={(next) => setQuery(next || '')}
                  placeholder="Search customers by name, email, or phone…"
                  renderOption={(option) => (
                    <Box padding={3}>
                      <Stack space={2}>
                        <Text weight="semibold">{option.label}</Text>
                        {option.subtitle && (
                          <Text muted size={1}>
                            {option.subtitle}
                          </Text>
                        )}
                        {option.address && (
                          <Text muted size={1}>
                            {option.address}
                          </Text>
                        )}
                      </Stack>
                    </Box>
                  )}
                  renderValue={(value, option) => option?.label || value}
                  onSelect={(selectedValue) => {
                    const match = customerOptions.find((opt) => opt.value === selectedValue)
                    if (match?.payload) {
                      applyCustomer(match.payload)
                    }
                  }}
                />
                {noMatches && (
                  <Box marginTop={3}>
                    <Text muted size={1}>
                      No matches — fill the form below and click &quot;Create Customer from Bill
                      To&quot;.
                    </Text>
                  </Box>
                )}
              </Box>
              <Button
                text="Create Customer from Bill To"
                tone="primary"
                onClick={createFromBillTo}
                disabled={
                  !value ||
                  (!value.name &&
                    !value.email &&
                    !value.phone &&
                    !value.address_line1 &&
                    !value.postal_code)
                }
              />
            </Flex>
            <Card padding={3} radius={2} tone="default" border>
              {renderDefault ? renderDefault(props) : null}
            </Card>
          </Stack>
        )}
      </Stack>
    </Card>
  )
}

export function ShipToInput(props: any) {
  const {renderDefault, onChange} = props
  const billTo = useMaybeFormValue<any>(['billTo'])
  const [open, setOpen] = useState(false)

  function copyFromBillTo() {
    if (!billTo) return
    onChange(set({...billTo}))
  }

  return (
    <Card padding={4} radius={3} shadow={1} tone="default" border>
      <Stack space={4}>
        <Flex align="center" justify="space-between" gap={3}>
          <Text size={2} weight="semibold">
            Ship To
          </Text>
          <Flex gap={2}>
            <Button
              mode="ghost"
              tone="primary"
              text="Use Bill To"
              onClick={copyFromBillTo}
              disabled={!billTo}
            />
            <Button
              mode="bleed"
              text={open ? 'Hide' : 'Show'}
              onClick={() => setOpen((prev) => !prev)}
            />
          </Flex>
        </Flex>
        {open && (
          <Card padding={3} radius={2} tone="default" border>
            {renderDefault ? renderDefault(props) : null}
          </Card>
        )}
      </Stack>
    </Card>
  )
}
