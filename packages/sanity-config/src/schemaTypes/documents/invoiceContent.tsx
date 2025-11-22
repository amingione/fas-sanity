import {defineType, defineField, defineArrayMember, set, useClient, useFormValue} from 'sanity'
import React, {useEffect, useMemo, useState} from 'react'
import {SearchIcon} from '@sanity/icons'
import {
  Autocomplete,
  Box,
  Button,
  Card,
  Flex,
  Stack,
  Text,
  TextInput,
} from '@sanity/ui'

import './invoiceStyles.css'

function fmt(n?: number) {
  return typeof n === 'number' && !isNaN(n) ? Number(n).toFixed(2) : '0.00'
}

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
function InvoiceNumberInput(props: any) {
  const {value, onChange, elementProps = {}} = props

  useEffect(() => {
    if (value) return
    const rand = Math.floor(Math.random() * 1_000_000)
    const generated = `${DEFAULT_INVOICE_PREFIX}-${rand.toString().padStart(6, '0')}`
    onChange(set(generated))
  }, [onChange, value])

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
function BillToInput(props: any) {
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
                      No matches — fill the form below and click “Create Customer from Bill To”.
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

function ShipToInput(props: any) {
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

export default defineType({
  name: 'invoice',
  title: 'Invoice',
  type: 'document',
  fieldsets: [
    {name: 'basicInfo', title: 'Basic Info'},
    {name: 'customerBilling', title: 'Customer & Billing'},
    {name: 'lineItems', title: 'Line Items'},
    {name: 'pricing', title: 'Pricing'},
    {name: 'relatedDocs', title: 'Related Documents'},
    {name: 'notesAttachments', title: 'Notes & Attachments'},
    {
      name: 'stripeIntegration',
      title: 'Stripe Integration',
      options: {collapsible: true, collapsed: true},
    },
  ],
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
      fieldset: 'basicInfo',
    }),

    defineField({
      name: 'invoiceNumber',
      title: 'Invoice Number',
      type: 'string',
      description: 'Auto-generated: INV-###### or matches order number',
      components: {input: InvoiceNumberInput},
      readOnly: true,
      validation: (Rule) => Rule.required(),
      fieldset: 'basicInfo',
    }),

    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'Pending', value: 'pending'},
          {title: 'Paid', value: 'paid'},
          {title: 'Refunded', value: 'refunded'},
          {title: 'Cancelled', value: 'cancelled'},
        ],
      },
      initialValue: 'pending',
      validation: (Rule) => Rule.required(),
      fieldset: 'basicInfo',
    }),
    defineField({
      name: 'invoiceDate',
      title: 'Invoice Date',
      type: 'date',
      initialValue: () => new Date().toISOString().slice(0, 10),
      validation: (Rule) => Rule.required(),
      fieldset: 'basicInfo',
    }),
    defineField({name: 'dueDate', title: 'Due Date', type: 'date', fieldset: 'basicInfo'}),
    defineField({
      name: 'paymentTerms',
      title: 'Payment Terms',
      type: 'string',
      options: {list: ['Due on receipt', 'Net 15', 'Net 30', 'Net 60', 'Net 90']},
      initialValue: 'Due on receipt',
      fieldset: 'basicInfo',
    }),

    defineField({
      name: 'customerRef',
      title: 'Customer',
      type: 'reference',
      to: [{type: 'customer'}],
      validation: (Rule) => Rule.required(),
      fieldset: 'customerBilling',
    }),

    defineField({
      name: 'billTo',
      title: 'Bill To',
      type: 'billTo',
      components: {input: BillToInput},
      fieldset: 'customerBilling',
    }),

    defineField({
      name: 'shipTo',
      title: 'Ship To (if different)',
      type: 'shipTo',
      options: {collapsible: true, collapsed: true},
      components: {input: ShipToInput},
      fieldset: 'customerBilling',
    }),

    defineField({
      name: 'lineItems',
      title: 'Line Items',
      type: 'array',
      of: [defineArrayMember({type: 'invoiceLineItem'})],
      validation: (Rule) => Rule.required().min(1),
      fieldset: 'lineItems',
    }),

    defineField({
      name: 'subtotal',
      title: 'Subtotal',
      type: 'number',
      readOnly: true,
      fieldset: 'pricing',
    }),
    defineField({
      name: 'discountType',
      title: 'Discount Type',
      type: 'string',
      options: {
        list: [
          {title: 'Amount ($)', value: 'amount'},
          {title: 'Percent (%)', value: 'percent'},
        ],
        layout: 'radio',
      },
      initialValue: 'amount',
      fieldset: 'pricing',
    }),
    defineField({
      name: 'discountValue',
      title: 'Discount Value',
      type: 'number',
      description: 'Dollar amount or percentage',
      fieldset: 'pricing',
    }),
    defineField({
      name: 'taxRate',
      title: 'Tax Rate %',
      type: 'number',
      description: 'e.g., 7.0 for 7%',
      fieldset: 'pricing',
    }),
    defineField({
      name: 'total',
      title: 'Total',
      type: 'number',
      validation: (Rule) => Rule.required().min(0),
      fieldset: 'pricing',
    }),

    defineField({
      name: 'orderRef',
      title: 'Related Order',
      type: 'reference',
      to: [{type: 'order'}],
      fieldset: 'relatedDocs',
    }),
    defineField({
      name: 'workOrderRef',
      title: 'Work Order',
      type: 'reference',
      to: [{type: 'workOrder'}],
      fieldset: 'relatedDocs',
    }),
    defineField({
      name: 'quote',
      title: 'Related Quote',
      type: 'reference',
      to: [{type: 'buildQuote'}],
      fieldset: 'relatedDocs',
    }),

    defineField({
      name: 'customerNotes',
      title: 'Notes (Visible to Customer)',
      type: 'text',
      rows: 3,
      fieldset: 'notesAttachments',
    }),
    defineField({
      name: 'internalNotes',
      title: 'Internal Notes (Hidden)',
      type: 'text',
      rows: 3,
      fieldset: 'notesAttachments',
    }),

    defineField({
      name: 'attachments',
      title: 'Attachments',
      description: 'Upload PDFs, images, or signed documents',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'file',
          options: {accept: 'application/pdf,image/*', storeOriginalFilename: true},
          fields: [defineField({name: 'label', title: 'File Label', type: 'string'})],
        }),
      ],
      fieldset: 'notesAttachments',
    }),

    defineField({
      name: 'stripeInvoiceId',
      title: 'Stripe Invoice ID',
      type: 'string',
      readOnly: true,
      hidden: ({document}) => !document?.stripeInvoiceId,
      fieldset: 'stripeIntegration',
    }),
    defineField({
      name: 'stripeInvoiceStatus',
      title: 'Stripe Status',
      type: 'string',
      readOnly: true,
      hidden: ({document}) => !document?.stripeInvoiceId,
      fieldset: 'stripeIntegration',
    }),
    defineField({
      name: 'stripeLastSyncedAt',
      title: 'Last Synced',
      type: 'datetime',
      readOnly: true,
      hidden: ({document}) => !document?.stripeInvoiceId,
      fieldset: 'stripeIntegration',
    }),
  ],

  initialValue: async () => ({status: 'pending'}),

  preview: {
    select: {
      title: 'title',
      invoiceNumber: 'invoiceNumber',
      billToName: 'billTo.name',
      total: 'total',
      status: 'status',
    },
    prepare(sel) {
      const {title, invoiceNumber, billToName, total, status} = sel as any
      const name = billToName || title || 'Invoice'
      const reference = invoiceNumber || ''
      const header = reference ? `${name} • ${reference}` : name
      const amount = typeof total === 'number' ? ` – $${fmt(total)}` : ''
      const st = status ? ` • ${status.toUpperCase()}` : ''
      return {title: `${header}${amount}${st}`}
    },
  },
})
