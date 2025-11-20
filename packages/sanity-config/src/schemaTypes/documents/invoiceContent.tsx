import {defineType, defineField, defineArrayMember, set, useClient, useFormValue} from 'sanity'
import {createClient} from '@sanity/client'
import React, {useCallback, useEffect, useMemo, useState} from 'react'
import {DownloadIcon, EllipsisVerticalIcon, EnvelopeIcon, SearchIcon} from '@sanity/icons'
import {
  Autocomplete,
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Heading,
  Menu,
  MenuButton,
  MenuItem,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@sanity/ui'
import {decodeBase64ToArrayBuffer} from '../../utils/base64'
import {resolveNetlifyBase} from '../../utils/netlifyBase'

import './invoiceStyles.css'

// ---- Sanity client for async validation (already used below)
const getSanityClient = () =>
  createClient({
    projectId: 'r4og35qd',
    dataset: 'production',
    apiVersion: '2024-04-10',
    useCdn: false,
  })

// ---- Helpers used by custom components
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

const getFnBase = (): string => resolveNetlifyBase()

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

const LEGACY_PREFIXES = ['FAS']
const INVOICE_PREFIXES = Array.from(new Set([DEFAULT_INVOICE_PREFIX, ...LEGACY_PREFIXES]))

const formatCurrencyDisplay = (value?: number, currency: string = 'USD') => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(value)
  } catch {
    return `$${value.toFixed(2)}`
  }
}

async function postJson(url: string, body: any) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(typeof data === 'string' ? data : JSON.stringify(data))
  }
  return data
}

async function readPdfBlob(response: Response) {
  const contentType = (response.headers.get('content-type') || '').toLowerCase()
  if (contentType.includes('application/pdf')) {
    try {
      const buffer = await response.arrayBuffer()
      return new Blob([buffer], {type: 'application/pdf'})
    } catch {
      // Fallback to base64 decoding below
    }
  }

  const base64String = (await response.text()).trim()
  if (base64String.startsWith('{')) {
    throw new Error(base64String)
  }
  const clean = base64String.replace(/^"|"$/g, '')
  const buffer = decodeBase64ToArrayBuffer(clean)
  return new Blob([buffer], {type: 'application/pdf'})
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

// ---- Invoice Number Input (auto-populate, disables if linked to order or not pending)
function InvoiceNumberInput(props: any) {
  const {value, onChange, readOnly: readOnlyProp, elementProps = {}} = props
  const client = useClient({apiVersion: '2024-10-01'})
  const documentId = useMaybeFormValue<string>(['_id']) ?? ''
  const orderNumber = useMaybeFormValue<string>(['orderNumber']) ?? ''
  const status = useMaybeFormValue<string>(['status']) ?? 'pending'

  const locked = Boolean(readOnlyProp ?? (status !== 'pending' || !!orderNumber))

  useEffect(() => {
    if (orderNumber) {
      const next = String(orderNumber)
      if (value === next) return
      if (locked && documentId) {
        client
          .patch(documentId)
          .set({invoiceNumber: next})
          .commit({autoGenerateArrayKeys: true})
          .catch(() => undefined)
        return
      }
      if (!locked) {
        onChange(set(next))
      }
      return
    }

    if (value || locked) return

    const rand = Math.floor(Math.random() * 1_000_000)
    const generated = `${DEFAULT_INVOICE_PREFIX}-${rand.toString().padStart(6, '0')}`
    onChange(set(generated))
  }, [client, documentId, locked, onChange, orderNumber, value])

  return (
    <TextInput
      {...elementProps}
      id={elementProps?.id}
      ref={elementProps?.ref}
      readOnly={locked}
      value={value || ''}
      onChange={(event) => {
        if (locked) return
        onChange(set(event.currentTarget.value))
      }}
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

const INVOICE_STATUS_META: Record<
  string,
  {label: string; tone: 'default' | 'positive' | 'critical' | 'caution'}
> = {
  pending: {label: 'Pending', tone: 'caution'},
  paid: {label: 'Paid', tone: 'positive'},
  refunded: {label: 'Refunded', tone: 'caution'},
  cancelled: {label: 'Cancelled', tone: 'critical'},
  overdue: {label: 'Overdue', tone: 'critical'},
  expired: {label: 'Expired', tone: 'default'},
}

type InvoiceActionSet = {
  sendInvoiceEmail: () => Promise<void>
  sendingInvoiceEmail: boolean
  downloadInvoicePdf: () => Promise<void>
  downloadingInvoicePdf: boolean
  createShippingLabel: () => Promise<void>
  creatingShippingLabel: boolean
  sendPaymentLink: () => Promise<void>
  sendingPaymentLink: boolean
}

function useInvoiceActions(): InvoiceActionSet {
  const invoiceId = useMaybeFormValue<string>(['_id']) ?? ''
  const invoiceNumber = useMaybeFormValue<string>(['invoiceNumber']) ?? ''
  const documentValue = useMaybeFormValue<any>([])
  const base = getFnBase()
  const payload = useMemo(
    () => ({invoiceId, invoiceNumber, invoice: documentValue ?? {}}),
    [invoiceId, invoiceNumber, documentValue],
  )

  const [sendingInvoiceEmail, setSendingInvoiceEmail] = useState(false)
  const [downloadingInvoicePdf, setDownloadingInvoicePdf] = useState(false)
  const [creatingShippingLabel, setCreatingShippingLabel] = useState(false)
  const [sendingPaymentLink, setSendingPaymentLink] = useState(false)

  const sendInvoiceEmail = useCallback(async () => {
    if (sendingInvoiceEmail) return
    setSendingInvoiceEmail(true)
    try {
      let checkoutUrl = ''
      try {
        const checkout = await postJson(`${base}/.netlify/functions/createCheckout`, payload)
        checkoutUrl = checkout?.url || ''
      } catch {
        // Optional: checkout link creation may fail independently
      }

      await postJson(`${base}/.netlify/functions/resendInvoiceEmail`, {
        ...payload,
        paymentLinkUrl: checkoutUrl,
      })
      alert('Invoice email queued')
    } catch (error: any) {
      alert(`Email failed: ${error?.message || error}`)
    } finally {
      setSendingInvoiceEmail(false)
    }
  }, [base, payload, sendingInvoiceEmail])

  const downloadInvoicePdf = useCallback(async () => {
    if (downloadingInvoicePdf) return
    setDownloadingInvoicePdf(true)
    try {
      const response = await fetch(`${base}/.netlify/functions/generateInvoicePDF`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        throw new Error(await response.text())
      }
      const blob = await readPdfBlob(response)
      downloadBlob(blob, `invoice-${invoiceNumber || invoiceId}.pdf`)
    } catch (error: any) {
      alert(`PDF failed: ${error?.message || error}`)
    } finally {
      setDownloadingInvoicePdf(false)
    }
  }, [base, payload, downloadingInvoicePdf, invoiceId, invoiceNumber])

  const createShippingLabel = useCallback(async () => {
    if (creatingShippingLabel) return
    setCreatingShippingLabel(true)
    try {
      const weightValue =
        typeof window !== 'undefined' ? (window.prompt('Weight (lb):', '1') || '').trim() : '1'
      const dimensionValue =
        typeof window !== 'undefined'
          ? (window.prompt('Dimensions LxWxH (in):', '10x8x4') || '').trim()
          : '10x8x4'

      const dimensionMatch = dimensionValue.match(
        /(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/,
      )
      if (!dimensionMatch) throw new Error('Invalid dimensions')
      const length = Number(dimensionMatch[1])
      const width = Number(dimensionMatch[2])
      const height = Number(dimensionMatch[3])
      const weight = Number(weightValue)
      if (!Number.isFinite(weight) || weight <= 0) throw new Error('Invalid weight')

      const response = await fetch(`${base}/.netlify/functions/easypostCreateLabel`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          invoiceId,
          package_details: {
            weight: {value: weight, unit: 'pound'},
            dimensions: {unit: 'inch', length, width, height},
          },
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data?.error) {
        throw new Error(data?.error || `HTTP ${response.status}`)
      }
      const labelUrl = data?.labelUrl || data?.trackingUrl
      if (labelUrl) {
        try {
          window.open(labelUrl, '_blank')
        } catch {
          window.location.href = labelUrl
        }
      }
      alert(`EasyPost label created. Tracking: ${data?.trackingNumber || 'n/a'}`)
    } catch (error: any) {
      if (error?.message) alert(`Create label failed: ${error.message}`)
    } finally {
      setCreatingShippingLabel(false)
    }
  }, [base, creatingShippingLabel, invoiceId])

  const sendPaymentLink = useCallback(async () => {
    if (sendingPaymentLink) return
    setSendingPaymentLink(true)
    try {
      const checkout = await postJson(`${base}/.netlify/functions/createCheckout`, payload)
      if (checkout?.url) {
        window.open(checkout.url, '_blank')
      } else {
        alert('No payment link returned')
      }
    } catch (error: any) {
      alert(`Payment link failed: ${error?.message || error}`)
    } finally {
      setSendingPaymentLink(false)
    }
  }, [base, payload, sendingPaymentLink])

  return {
    sendInvoiceEmail,
    sendingInvoiceEmail,
    downloadInvoicePdf,
    downloadingInvoicePdf,
    createShippingLabel,
    creatingShippingLabel,
    sendPaymentLink,
    sendingPaymentLink,
  }
}

function InvoiceHeaderBar() {
  const invoice = useMaybeFormValue<any>([]) || {}
  const customerName =
    invoice?.billTo?.name || invoice?.customerName || invoice?.customerEmail || 'Invoice'
  const invoiceNumber = invoice?.invoiceNumber || 'Draft'
  const status = invoice?.status || 'pending'
  const total = invoice?.total ?? invoice?.subtotal
  const currency = invoice?.currency || 'USD'
  const statusMeta = INVOICE_STATUS_META[status] || {label: status, tone: 'default' as const}

  const {createShippingLabel, creatingShippingLabel, sendPaymentLink, sendingPaymentLink} =
    useInvoiceActions()

  return (
    <Card padding={4} radius={4} shadow={1} tone="default">
      <Flex align={['flex-start', 'center']} justify="space-between" wrap="wrap" gap={3}>
        <Stack space={2} style={{minWidth: 0}}>
          <Heading size={3}>{customerName}</Heading>
          <Text muted size={1} style={{wordBreak: 'break-word'}}>
            Invoice {invoiceNumber}
          </Text>
          <Flex gap={2} wrap="wrap">
            <Badge
              tone={statusMeta.tone}
              mode="outline"
              fontSize={0}
              style={{textTransform: 'uppercase'}}
            >
              {statusMeta.label}
            </Badge>
            <Badge tone="default" mode="outline" fontSize={0}>
              {formatCurrencyDisplay(total, currency)}
            </Badge>
          </Flex>
        </Stack>
        <MenuButton
          id="invoice-actions-menu"
          button={
            <Button text="Quick actions" icon={EllipsisVerticalIcon} mode="ghost" tone="primary" />
          }
          menu={
            <Menu>
              <MenuItem
                text={creatingShippingLabel ? 'Creating shipping label…' : 'Create shipping label'}
                onClick={createShippingLabel}
                disabled={creatingShippingLabel}
              />
              <MenuItem
                text={sendingPaymentLink ? 'Sending payment link…' : 'Send payment link'}
                onClick={sendPaymentLink}
                disabled={sendingPaymentLink}
              />
            </Menu>
          }
        />
      </Flex>
    </Card>
  )
}

// ---- Totals panel (auto-calc subtotal/discount/tax/total)
function TotalsPanel() {
  const rawLineItems = useMaybeFormValue<any[]>(['lineItems'])
  const lineItems = useMemo(() => (Array.isArray(rawLineItems) ? rawLineItems : []), [rawLineItems])
  const discountType = useMaybeFormValue<string>(['discountType']) ?? 'amount'
  const discountValue = Number(useMaybeFormValue<any>(['discountValue'])) || 0
  const taxRate = Number(useMaybeFormValue<any>(['taxRate'])) || 0
  const amountShippingRaw = useMaybeFormValue<any>(['amountShipping'])
  const selectedService = useMaybeFormValue<any>(['selectedService']) ?? {}
  const selectedServiceAmount = Number(
    selectedService?.amount ?? (selectedService?.rateAmount || selectedService?.price || 0),
  )

  const subtotal = useMemo(() => {
    return lineItems.reduce((sum: number, item: any) => {
      const quantity = Number(item?.quantity || 1)
      const unitPrice = Number(item?.unitPrice || 0)
      const manual = item?.lineTotal
      const line = typeof manual === 'number' ? manual : quantity * unitPrice
      return sum + (Number.isNaN(line) ? 0 : line)
    }, 0)
  }, [lineItems])

  const discountAmount = useMemo(() => {
    if (!discountValue) return 0
    if (discountType === 'percent') return subtotal * (discountValue / 100)
    return discountValue
  }, [discountType, discountValue, subtotal])

  const taxableBase = Math.max(0, subtotal - discountAmount)
  const taxAmount = taxableBase * (taxRate / 100)
  const shippingAmount = useMemo(() => {
    const direct =
      typeof amountShippingRaw === 'number' ? amountShippingRaw : Number(amountShippingRaw)
    if (Number.isFinite(direct) && direct !== 0) return direct
    const fallback = Number(selectedServiceAmount)
    return Number.isFinite(fallback) ? fallback : 0
  }, [amountShippingRaw, selectedServiceAmount])
  const total = Math.max(0, taxableBase + taxAmount + shippingAmount)

  return (
    <div className="invoice-totals-card">
      <div className="invoice-totals-card__grid">
        <span className="invoice-totals-card__label">Subtotal</span>
        <span className="invoice-totals-card__value">${fmt(subtotal)}</span>
        <span className="invoice-totals-card__label">Shipping</span>
        <span className="invoice-totals-card__value">${fmt(shippingAmount)}</span>
        <span className="invoice-totals-card__label">Discount</span>
        <span className="invoice-totals-card__value">-${fmt(discountAmount)}</span>
        <span className="invoice-totals-card__label">Tax</span>
        <span className="invoice-totals-card__value">${fmt(taxAmount)}</span>
        <span className="invoice-totals-card__label invoice-totals-card__divider">Total</span>
        <span className="invoice-totals-card__value invoice-totals-card__total">${fmt(total)}</span>
      </div>
      <p className="invoice-totals-card__note">
        All values auto-calculated from line items plus shipping, discount, and tax rate.
      </p>
    </div>
  )
}

// ---- Actions (doc footer)
function InvoiceActions() {
  const {sendInvoiceEmail, sendingInvoiceEmail, downloadInvoicePdf, downloadingInvoicePdf} =
    useInvoiceActions()

  return (
    <Flex gap={3} wrap="wrap">
      <Tooltip
        content={
          <Card padding={2} radius={2} tone="default">
            <Text size={1}>Email PDF to customer</Text>
          </Card>
        }
      >
        <Button
          text={sendingInvoiceEmail ? 'Sending…' : 'Email invoice'}
          tone="primary"
          icon={EnvelopeIcon}
          onClick={sendInvoiceEmail}
          disabled={sendingInvoiceEmail}
        />
      </Tooltip>
      <Tooltip
        content={
          <Card padding={2} radius={2} tone="default">
            <Text size={1}>Download / print invoice PDF</Text>
          </Card>
        }
      >
        <Button
          text={downloadingInvoicePdf ? 'Preparing…' : 'Download / Print'}
          tone="primary"
          mode="ghost"
          icon={DownloadIcon}
          onClick={downloadInvoicePdf}
          disabled={downloadingInvoicePdf}
        />
      </Tooltip>
    </Flex>
  )
}

export default defineType({
  name: 'invoice',
  title: 'Invoice',
  type: 'document',
  fields: [
    defineField({name: 'title', title: 'Title', type: 'string'}),

    defineField({
      name: 'invoiceHeader',
      title: 'Header',
      type: 'string',
      components: {input: InvoiceHeaderBar},
      readOnly: true,
    }),

    defineField({
      name: 'invoiceNumber',
      title: 'Invoice Number',
      type: 'string',
      description: `Auto-fills. If linked to a website order, this matches the order number; otherwise a ${DEFAULT_INVOICE_PREFIX}-###### number is generated while Pending. Must be unique.`,
      components: {input: InvoiceNumberInput},
      readOnly: ({document}: any): boolean =>
        !!document?.orderNumber || (document?.status ? document.status !== 'pending' : false),
      validation: (Rule) =>
        Rule.required()
          .custom((value) => {
            if (!value) return 'Invoice number is required'
            const pattern = new RegExp(`^(${INVOICE_PREFIXES.join('|')})-\\d{6}$`)
            if (!pattern.test(value.toUpperCase())) {
              return `Use format ${DEFAULT_INVOICE_PREFIX}-000123 (6 digits)`
            }
            return true
          })
          .custom(async (value, context) => {
            try {
              if (!value) return true
              const client = getSanityClient()
              const id = (context as any)?.document?._id
              const query = `count(*[ _type == "invoice" && invoiceNumber == $num && _id != $id ])`
              const count = await client.fetch(query, {num: value, id})
              if (count > 0) return 'Invoice number must be unique'
              return true
            } catch {
              return true
            }
          }),
    }),

    defineField({
      name: 'orderNumber',
      title: 'Website Order Number',
      type: 'string',
      description:
        'If present, the invoice number is locked to this order number (coming from fasmotorsports.com).',
      readOnly: true,
    }),

    defineField({
      name: 'customerRef',
      title: 'Linked Customer',
      type: 'reference',
      to: [{type: 'customer'}],
      readOnly: true,
      description: 'Set automatically when you pick or create a customer via Bill To.',
    }),

    defineField({
      name: 'quote',
      title: 'Related Quote',
      type: 'reference',
      to: [{type: 'buildQuote'}],
    }),

    // Link to Order (if created from website checkout)
    defineField({
      name: 'orderRef',
      title: 'Related Order',
      type: 'reference',
      to: [{type: 'order'}],
    }),
    defineField({
      name: 'workOrderRef',
      title: 'Work Order',
      type: 'reference',
      to: [{type: 'workOrder'}],
      readOnly: true,
      description: 'Linked automatically when generated from a work order.',
    }),
    defineField({
      name: 'appointmentRef',
      title: 'Appointment',
      type: 'reference',
      to: [{type: 'appointment'}],
      readOnly: true,
      description: 'Linked automatically when originating from an appointment.',
    }),
    defineField({
      name: 'attribution',
      title: 'Marketing Attribution',
      type: 'object',
      readOnly: true,
      description: 'UTM parameters captured when the checkout was created.',
      options: {collapsible: true, collapsed: true},
      fields: [
        {name: 'source', title: 'Source', type: 'string', readOnly: true},
        {name: 'medium', title: 'Medium', type: 'string', readOnly: true},
        {name: 'campaign', title: 'Campaign', type: 'string', readOnly: true},
        {name: 'content', title: 'Content', type: 'string', readOnly: true},
        {name: 'term', title: 'Term/Keyword', type: 'string', readOnly: true},
        {name: 'landingPage', title: 'Landing Page', type: 'url', readOnly: true},
        {name: 'referrer', title: 'Referrer', type: 'url', readOnly: true},
        {name: 'capturedAt', title: 'Captured At', type: 'datetime', readOnly: true},
        {name: 'device', title: 'Device', type: 'string', readOnly: true},
        {name: 'browser', title: 'Browser', type: 'string', readOnly: true},
        {name: 'os', title: 'Operating System', type: 'string', readOnly: true},
        {name: 'sessionId', title: 'Session ID', type: 'string', readOnly: true},
        {name: 'touchpoints', title: 'Touchpoints', type: 'number', readOnly: true},
        {name: 'firstTouch', title: 'First Touch', type: 'datetime', readOnly: true},
        {name: 'lastTouch', title: 'Last Touch', type: 'datetime', readOnly: true},
      ],
    }),
    // Legacy compatibility (hidden): previously used `order` and `customer` field names
    defineField({
      name: 'order',
      title: 'Order (legacy)',
      type: 'reference',
      to: [{type: 'order'}],
      hidden: true,
      options: {disableNew: true},
    }),
    defineField({
      name: 'customer',
      title: 'Customer (legacy)',
      type: 'reference',
      to: [{type: 'customer'}],
      hidden: true,
      options: {disableNew: true},
    }),

    defineField({
      name: 'billTo',
      title: 'Bill To',
      type: 'billTo',
      components: {input: BillToInput},
    }),

    defineField({
      name: 'shipTo',
      title: 'Ship To',
      type: 'shipTo',
      components: {input: ShipToInput},
    }),
    defineField({
      name: 'weight',
      title: 'Package Weight',
      type: 'shipmentWeight',
      description: 'Auto-calculated from linked order items; adjust if the packed weight differs.',
    }),
    defineField({
      name: 'dimensions',
      title: 'Package Dimensions',
      type: 'packageDimensions',
      description: 'Auto-filled using product defaults; update if the package differs.',
    }),
    defineField({
      name: 'amountShipping',
      title: 'Shipping Amount',
      type: 'number',
      description: 'Shipping charge billed to the customer (adds to the invoice total).',
    }),
    defineField({
      name: 'shippingCarrier',
      title: 'Shipping Carrier',
      type: 'string',
      description: 'Carrier or service provider (e.g., UPS, USPS Priority).',
    }),
    defineField({name: 'trackingNumber', title: 'Tracking Number', type: 'string'}),
    defineField({name: 'trackingUrl', title: 'Tracking URL', type: 'url'}),
    defineField({name: 'shippingLabelUrl', title: 'Shipping Label URL', type: 'url'}),
    defineField({
      name: 'selectedService',
      title: 'Selected Shipping Rate',
      type: 'object',
      readOnly: true,
      options: {columns: 2},
      fields: [
        defineField({name: 'carrierId', title: 'Carrier ID', type: 'string'}),
        defineField({name: 'carrier', title: 'Carrier', type: 'string'}),
        defineField({name: 'service', title: 'Service Name', type: 'string'}),
        defineField({name: 'serviceCode', title: 'Service Code', type: 'string'}),
        defineField({name: 'amount', title: 'Rate Amount', type: 'number'}),
        defineField({name: 'currency', title: 'Currency', type: 'string'}),
        defineField({name: 'deliveryDays', title: 'Est. Delivery (days)', type: 'number'}),
        defineField({name: 'estimatedDeliveryDate', title: 'Est. Delivery Date', type: 'datetime'}),
      ],
    }),
    defineField({
      name: 'shippingLog',
      title: 'Shipping History',
      type: 'array',
      of: [{type: 'shippingLogEntry'}],
      description: 'System-recorded shipping events (labels, updates, notifications).',
    }),

    defineField({
      name: 'attachments',
      title: 'Attachments',
      description: 'Upload supporting PDFs or images (estimates, signed work orders, etc.).',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'file',
          name: 'attachmentFile',
          title: 'File',
          options: {storeOriginalFilename: true, accept: 'application/pdf,image/*'},
          fields: [defineField({name: 'label', title: 'Label', type: 'string'})],
        }),
        defineArrayMember({
          type: 'image',
          name: 'attachmentImage',
          title: 'Image',
          options: {storeOriginalFilename: true},
          fields: [defineField({name: 'label', title: 'Label', type: 'string'})],
        }),
      ],
      options: {layout: 'grid'},
    }),

    // Line Items with product link or custom rows
    defineField({
      name: 'lineItems',
      title: 'Line Items',
      type: 'array',
      of: [{type: 'invoiceLineItem'}],
    }),

    // Discount controls
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
    }),
    defineField({
      name: 'discountValue',
      title: 'Discount Value',
      type: 'number',
      description: 'If percent, enter e.g. 10 for 10%.',
    }),

    // Tax rate
    defineField({
      name: 'taxRate',
      title: 'Tax Rate %',
      type: 'number',
      description: 'Percent (e.g., 7.0 for 7%)',
    }),

    // Calculated totals (read-only; shown via TotalsPanel)
    defineField({name: 'subtotal', title: 'Subtotal (auto)', type: 'number', readOnly: true}),
    // Optional stored total for compatibility with older docs
    defineField({name: 'total', title: 'Total (stored)', type: 'number'}),

    // Notes
    defineField({name: 'customerNotes', title: 'Notes (Visible to Customer)', type: 'text'}),
    defineField({name: 'internalNotes', title: 'Internal Notes (Hidden)', type: 'text'}),

    // Status & dates
    defineField({
      name: 'status',
      title: 'Payment Status',
      type: 'string',
      options: {list: ['pending', 'paid', 'refunded', 'cancelled', 'expired'], layout: 'dropdown'},
      initialValue: 'pending',
    }),
    defineField({
      name: 'invoiceDate',
      title: 'Invoice Date',
      type: 'date',
      initialValue: () => new Date().toISOString().slice(0, 10),
    }),
    defineField({name: 'dueDate', title: 'Due Date', type: 'date'}),
    defineField({
      name: 'paymentTerms',
      title: 'Payment Terms',
      type: 'string',
      description: 'e.g., Due on receipt, Net 30, Net 60.',
    }),
    defineField({
      name: 'serviceRenderedBy',
      title: 'Service Rendered By',
      type: 'string',
      description: 'Who performed the work or provided the service.',
    }),
    defineField({
      name: 'paymentInstructions',
      title: 'Payment Instructions',
      type: 'text',
      description: 'Guidance for the customer on how to pay this invoice.',
    }),
    defineField({
      name: 'depositAmount',
      title: 'Deposit Received',
      type: 'number',
      description: 'Amount already collected that should be applied toward the total.',
    }),

    defineField({name: 'paymentLinkUrl', title: 'Payment Link URL', type: 'url'}),

    // Stripe/payment metadata for compatibility with imported or legacy invoices
    defineField({name: 'currency', title: 'Currency', type: 'string'}),
    defineField({name: 'amountSubtotal', title: 'Amount Subtotal', type: 'number'}),
    defineField({name: 'amountTax', title: 'Amount Tax', type: 'number'}),
    defineField({name: 'stripeSessionId', title: 'Stripe Session ID', type: 'string'}),
    defineField({name: 'receiptUrl', title: 'Receipt URL', type: 'url'}),
    defineField({name: 'customerEmail', title: 'Customer Email', type: 'string'}),
    defineField({
      name: 'stripeInvoiceId',
      title: 'Stripe Invoice ID',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'stripeInvoiceStatus',
      title: 'Stripe Invoice Status',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'paymentFailureCode',
      title: 'Payment Failure Code',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'paymentFailureMessage',
      title: 'Payment Failure Message',
      type: 'text',
      readOnly: true,
    }),
    defineField({
      name: 'stripeHostedInvoiceUrl',
      title: 'Stripe Hosted Invoice URL',
      type: 'url',
      readOnly: true,
    }),
    defineField({
      name: 'stripeInvoicePdf',
      title: 'Stripe Invoice PDF',
      type: 'url',
      readOnly: true,
    }),
    defineField({
      name: 'stripeLastSyncedAt',
      title: 'Stripe Last Synced',
      type: 'datetime',
      readOnly: true,
    }),
    defineField({name: 'stripeSummary', title: 'Stripe Snapshot', type: 'stripeOrderSummary'}),
    defineField({name: 'dateIssued', title: 'Date Issued (legacy)', type: 'datetime'}),

    // Visual totals panel (virtual field)
    defineField({
      name: 'totalsPanel',
      title: 'Totals',
      type: 'string',
      components: {input: TotalsPanel},
      readOnly: true,
    }),

    // Action buttons (virtual field)
    defineField({
      name: 'actions',
      title: 'Actions',
      type: 'string',
      components: {input: InvoiceActions},
      readOnly: true,
    }),
  ],

  initialValue: async () => ({status: 'pending'}),

  preview: {
    select: {
      title: 'title',
      invoiceNumber: 'invoiceNumber',
      orderNumber: 'orderNumber',
      billToName: 'billTo.name',
      total: 'total',
      status: 'status',
    },
    prepare(sel) {
      const {title, invoiceNumber, orderNumber, billToName, total, status} = sel as any
      const name = billToName || title || 'Invoice'
      const reference = orderNumber || invoiceNumber || ''
      const header = reference ? `${name} • ${reference}` : name
      const amount = typeof total === 'number' ? ` – $${fmt(total)}` : ''
      const st = status ? ` • ${status.toUpperCase()}` : ''
      return {title: `${header}${amount}${st}`}
    },
  },
})
