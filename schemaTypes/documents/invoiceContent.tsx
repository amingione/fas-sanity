import { defineType, defineField, set, useClient, useFormValue } from 'sanity'
import { createClient } from '@sanity/client'
import React, {useEffect, useMemo, useState} from 'react'
import {TextInput} from '@sanity/ui'

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

function getFnBase(): string {
  // Prefer env (works in Node/CLI). In Studio, you can also store an override in localStorage under 'NLFY_BASE'.
  const envBase = typeof process !== 'undefined' ? process.env?.SANITY_STUDIO_NETLIFY_BASE : undefined
  if (envBase) return envBase
  try {
    if (typeof window !== 'undefined') {
      const ls = window.localStorage?.getItem('NLFY_BASE')
      if (ls) return ls
      // default to current origin in production Studio
      const origin = window.location?.origin
      if (origin && /^https?:\/\//i.test(origin)) return origin
    }
  } catch {}
  return 'https://fassanity.fasmotorsports.com'
}

// ---- Invoice Number Input (auto-populate, disables if linked to order or not pending)
function InvoiceNumberInput(props: any) {
  const {value, onChange} = props
  const orderNumber = (useFormValue(['orderNumber']) as string) || ''
  const status = (useFormValue(['status']) as string) || 'pending'

  useEffect(() => {
    if (value) return
    if (orderNumber) {
      onChange(set(String(orderNumber)))
    } else {
      const rand = Math.floor(Math.random() * 1_000_000)
      onChange(set(`FAS-${rand.toString().padStart(6, '0')}`))
    }
  }, [orderNumber, onChange, value])

  const readOnly = status !== 'pending' || !!orderNumber

  return (
    <TextInput
      readOnly={readOnly}
      value={value || ''}
      onChange={(event) => onChange(set(event.currentTarget.value))}
    />
  )
}

// ---- Collapsible object input (Bill To) with customer search and linking
function BillToInput(props: any) {
  const {renderDefault, value, onChange} = props
  const client = useClient({apiVersion: '2024-10-01'})
  const [open, setOpen] = useState(true)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const documentId = (useFormValue(['_id']) as string) || ''
  const currentShip = (useFormValue(['shipTo']) as any) || {}

  function chooseFirst() {
    if (results.length > 0) {
      applyCustomer(results[0])
    }
  }

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
          {m: `${term}*`}
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
      country_code: (customer?.country_code || '').trim()
    }

    onChange(set(patch))

    if (customer?._id && documentId) {
      const emptyShip =
        !currentShip?.name && !currentShip?.address_line1 && !currentShip?.postal_code
      const operations: Record<string, any> = {
        customerRef: {_type: 'reference', _ref: customer._id}
      }
      if (emptyShip) {
        operations.shipTo = patch
      }
      client.patch(documentId).set(operations).commit({autoGenerateArrayKeys: true}).catch(() => undefined)
    }
  }

  async function createFromBillTo() {
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
      country_code: value?.country_code || ''
    }
    const created = await client.create(payload)
    applyCustomer(created)
  }

  return (
    <div className="invoice-section-card invoice-section-card--contact">
      <div className="invoice-section-card__header">
        <span className="invoice-section-card__title">Bill To (link to Customer)</span>
        <button
          type="button"
          className="invoice-section-card__toggle"
          onClick={() => setOpen((prev) => !prev)}
        >
          {open ? 'Hide' : 'Show'}
        </button>
      </div>
      {open && (
        <div className="invoice-section-card__body">
          <div className="invoice-customer-search">
            <input
              className="invoice-customer-search__input"
              placeholder="Search customers by name, email, or phone…"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  chooseFirst()
                }
                if (event.key === 'ArrowDown' && results.length > 0) {
                  event.preventDefault()
                  chooseFirst()
                }
              }}
            />
            <button
              type="button"
              className="invoice-customer-search__button"
              onClick={createFromBillTo}
            >
              Create Customer from Bill To
            </button>
          </div>
          {results.length > 0 ? (
            <div className="invoice-customer-search__results">
              {results.map((customer: any) => (
                <button
                  key={customer._id}
                  type="button"
                  className="invoice-customer-search__result"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyCustomer(customer)}
                >
                  <span className="invoice-customer-search__result-title">
                    {customer.name || '(No name)'}
                  </span>
                  <span className="invoice-customer-search__result-meta">
                    {[customer.email || '—', customer.phone ? `• ${customer.phone}` : '']
                      .filter(Boolean)
                      .join(' ')}
                  </span>
                  <span className="invoice-customer-search__result-meta">
                    {`${customer.address_line1 || ''}${
                      customer.address_line2 ? `, ${customer.address_line2}` : ''
                    }`}
                  </span>
                  <span className="invoice-customer-search__result-meta">
                    {`${customer.city_locality || ''}${
                      customer.state_province ? `, ${customer.state_province}` : ''
                    } ${customer.postal_code || ''} ${customer.country_code || ''}`.trim()}
                  </span>
                </button>
              ))}
            </div>
          ) : query && !loading ? (
            <p className="invoice-customer-search__empty">
              No matches — fill the form below and click “Create Customer from Bill To”.
            </p>
          ) : null}
          <div className="invoice-section-card__fields">
            {renderDefault ? renderDefault(props) : null}
          </div>
        </div>
      )}
    </div>
  )
}

function ShipToInput(props: any) {
  const {renderDefault, onChange} = props
  const billTo = useFormValue(['billTo']) as any
  const [open, setOpen] = useState(false)

  function copyFromBillTo() {
    if (!billTo) return
    onChange(set({...billTo}))
  }

  return (
    <div className="invoice-section-card invoice-section-card--shipping">
      <div className="invoice-section-card__header">
        <span className="invoice-section-card__title">Ship To</span>
        <div className="invoice-section-card__actions">
          <button type="button" className="invoice-pill-button" onClick={copyFromBillTo}>
            Use Bill To
          </button>
          <button
            type="button"
            className="invoice-section-card__toggle"
            onClick={() => setOpen((prev) => !prev)}
          >
            {open ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      {open && (
        <div className="invoice-section-card__body invoice-section-card__body--compact">
          {renderDefault ? renderDefault(props) : null}
        </div>
      )}
    </div>
  )
}

// ---- Custom Line Item Input (product-linked or custom)
function LineItemInput(props: any) {
  const {value, onChange} = props
  const client = useClient({apiVersion: '2024-10-01'})
  const [mode, setMode] = useState<'product' | 'custom'>(value?.kind || 'product')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<any[]>([])

  useEffect(() => {
    if (mode !== 'product') {
      setResults([])
      return
    }
    const term = search.trim()
    if (term.length < 2) {
      setResults([])
      return
    }

    const timer = setTimeout(async () => {
      try {
        const matches = await client.fetch(
          `*[_type == "product" && (title match $q || sku match $q)][0...8]{_id, title, sku, price}`,
          {q: `${term}*`}
        )
        setResults(Array.isArray(matches) ? matches : [])
      } catch {
        setResults([])
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [client, mode, search])

  function onPickProduct(product: any) {
    const patch = {
      kind: 'product',
      product: {_type: 'reference', _ref: product._id},
      description: product.title,
      sku: product.sku,
      unitPrice: typeof product.price === 'number' ? product.price : Number(product.price || 0),
      quantity: value?.quantity || 1,
      lineTotal: undefined
    }
    onChange(set(patch))
  }

  const quantity = Number(value?.quantity || 1)
  const unitPrice = Number(value?.unitPrice || 0)
  const computedTotal = quantity * unitPrice
  const resolvedTotal = (value as any)?.lineTotal ?? computedTotal

  return (
    <div className="invoice-line-item">
      <div className="invoice-line-item__mode">
        <label className="invoice-line-item__mode-option">
          <input
            type="radio"
            checked={mode === 'product'}
            onChange={() => {
              setMode('product')
              onChange(set({...(value || {}), kind: 'product'}))
            }}
          />
          <span>Product</span>
        </label>
        <label className="invoice-line-item__mode-option">
          <input
            type="radio"
            checked={mode === 'custom'}
            onChange={() => {
              setMode('custom')
              setSearch('')
              onChange(set({...(value || {}), kind: 'custom', product: undefined}))
            }}
          />
          <span>Custom</span>
        </label>
      </div>

      {mode === 'product' ? (
        <div className="invoice-line-item__product">
          <div className="invoice-line-item__product-search">
            <input
              className="invoice-line-item__field invoice-line-item__field--wide"
              placeholder="Search products by name or SKU…"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
            />
            {results.length > 0 && (
              <div className="invoice-line-item__product-results">
                {results.map((product: any) => (
                  <button
                    key={product._id}
                    type="button"
                    className="invoice-line-item__product-result"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onPickProduct(product)}
                  >
                    {`${product.title} ${product.sku ? `• ${product.sku}` : ''} — $${fmt(product.price)}`}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="invoice-line-item__numeric-group">
            <input
              className="invoice-line-item__field"
              type="number"
              min={1}
              value={quantity}
              onChange={(event) =>
                onChange(set({...(value || {}), quantity: Number(event.currentTarget.value || 1)}))
              }
              placeholder="Qty"
            />
            <input
              className="invoice-line-item__field"
              type="number"
              step="0.01"
              value={unitPrice}
              onChange={(event) =>
                onChange(set({...(value || {}), unitPrice: Number(event.currentTarget.value || 0)}))
              }
              placeholder="Unit $"
            />
          </div>
        </div>
      ) : (
        <div className="invoice-line-item__custom">
          <input
            className="invoice-line-item__field invoice-line-item__field--wide"
            placeholder="Description"
            value={value?.description || ''}
            onChange={(event) =>
              onChange(set({...(value || {}), description: event.currentTarget.value}))
            }
          />
          <input
            className="invoice-line-item__field"
            placeholder="Qty"
            type="number"
            min={1}
            value={quantity}
            onChange={(event) =>
              onChange(set({...(value || {}), quantity: Number(event.currentTarget.value || 1)}))
            }
          />
          <input
            className="invoice-line-item__field"
            placeholder="Unit $"
            type="number"
            step="0.01"
            value={unitPrice}
            onChange={(event) =>
              onChange(set({...(value || {}), unitPrice: Number(event.currentTarget.value || 0)}))
            }
          />
        </div>
      )}

      <div className="invoice-line-item__total">
        <span className="invoice-line-item__total-label">Line total</span>
        <span className="invoice-line-item__total-value">${fmt(resolvedTotal)}</span>
      </div>
    </div>
  )
}

// ---- Totals panel (auto-calc subtotal/discount/tax/total)
function TotalsPanel() {
  const lineItems = (useFormValue(['lineItems']) as any[]) || []
  const discountType = (useFormValue(['discountType']) as string) || 'amount'
  const discountValue = Number(useFormValue(['discountValue']) as any) || 0
  const taxRate = Number(useFormValue(['taxRate']) as any) || 0

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
  const total = Math.max(0, taxableBase + taxAmount)

  return (
    <div className="invoice-totals-card">
      <div className="invoice-totals-card__grid">
        <span className="invoice-totals-card__label">Subtotal</span>
        <span className="invoice-totals-card__value">${fmt(subtotal)}</span>
        <span className="invoice-totals-card__label">Discount</span>
        <span className="invoice-totals-card__value">-${fmt(discountAmount)}</span>
        <span className="invoice-totals-card__label">Tax</span>
        <span className="invoice-totals-card__value">${fmt(taxAmount)}</span>
        <span className="invoice-totals-card__label invoice-totals-card__divider">Total</span>
        <span className="invoice-totals-card__value invoice-totals-card__total">${fmt(total)}</span>
      </div>
      <p className="invoice-totals-card__note">
        All values auto-calculated from line items, discount, and tax rate.
      </p>
    </div>
  )
}

// ---- Actions (Email / PDF / Stripe in-person)
function InvoiceActions() {
  const invoiceId = useFormValue(['_id']) as string
  const invoiceNumber = useFormValue(['invoiceNumber']) as string
  const documentValue = useFormValue([]) as any
  const base = getFnBase()

  async function postJson(url: string, body: any) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body)
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(typeof data === 'string' ? data : JSON.stringify(data))
    }
    return data
  }

  const payload = useMemo(
    () => ({invoiceId, invoiceNumber, invoice: documentValue}),
    [invoiceId, invoiceNumber, documentValue]
  )

  async function readPdfBlob(response: Response) {
    const contentType = (response.headers.get('content-type') || '').toLowerCase()
    if (contentType.includes('application/pdf')) {
      try {
        const buffer = await response.arrayBuffer()
        return new Blob([buffer], {type: 'application/pdf'})
      } catch {
        // Fallback to text handling below
      }
    }

    const base64String = await response.text()
    if (base64String.trim().startsWith('{')) {
      throw new Error(base64String)
    }
    const clean = base64String.replace(/^"|"$/g, '')
    const bytes = atob(clean)
    const buffer = new Uint8Array(bytes.length)
    for (let index = 0; index < bytes.length; index += 1) {
      buffer[index] = bytes.charCodeAt(index)
    }
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

  return (
    <div className="invoice-actions">
      <button
        type="button"
        className="invoice-actions__button invoice-actions__button--primary"
        onClick={async () => {
          try {
            let checkoutUrl = ''
            try {
              const checkout = await postJson(`${base}/.netlify/functions/createCheckout`, payload)
              checkoutUrl = checkout?.url || ''
            } catch {
              // ignore; email can still proceed
            }

            await postJson(`${base}/.netlify/functions/resendInvoiceEmail`, {
              ...payload,
              paymentLinkUrl: checkoutUrl
            })
            alert('Invoice email queued')
          } catch (error: any) {
            alert(`Email failed: ${error?.message || error}`)
          }
        }}
      >
        Email Invoice
      </button>

      <button
        type="button"
        className="invoice-actions__button"
        onClick={async () => {
          try {
            const response = await fetch(`${base}/.netlify/functions/generateInvoicePDF`, {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify(payload)
            })
            if (!response.ok) {
              throw new Error(await response.text())
            }
            const blob = await readPdfBlob(response)
            downloadBlob(blob, `invoice-${invoiceNumber || invoiceId}.pdf`)
          } catch (error: any) {
            alert(`PDF failed: ${error?.message || error}`)
          }
        }}
      >
        Download PDF
      </button>

      <button
        type="button"
        className="invoice-actions__button"
        onClick={async () => {
          try {
            const response = await fetch(`${base}/.netlify/functions/generatePackingSlips`, {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({invoiceId: (invoiceId || '').replace(/^drafts\./, '')})
            })
            if (!response.ok) {
              throw new Error(await response.text())
            }
            const blob = await readPdfBlob(response)
            downloadBlob(blob, `packing-slip-${invoiceNumber || invoiceId}.pdf`)
          } catch (error: any) {
            alert(`Packing slip failed: ${error?.message || error}`)
          }
        }}
      >
        Generate Packing Slip
      </button>

      <button
        type="button"
        className="invoice-actions__button"
        onClick={async () => {
          try {
            const serviceCode =
              typeof window !== 'undefined'
                ? (window.prompt(
                    'Enter ShipEngine service_code (e.g., usps_priority_mail):',
                    'usps_priority_mail'
                  ) || '').trim()
                : ''
            if (!serviceCode) return

            const weightValue =
              typeof window !== 'undefined'
                ? (window.prompt('Weight (lb):', '1') || '').trim()
                : '1'
            const dimensionValue =
              typeof window !== 'undefined'
                ? (window.prompt('Dimensions LxWxH (in):', '10x8x4') || '').trim()
                : '10x8x4'

            const dimensionMatch = dimensionValue.match(/(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/)
            if (!dimensionMatch) throw new Error('Invalid dimensions')
            const length = Number(dimensionMatch[1])
            const width = Number(dimensionMatch[2])
            const height = Number(dimensionMatch[3])
            const weight = Number(weightValue)
            if (!Number.isFinite(weight) || weight <= 0) throw new Error('Invalid weight')

            const response = await fetch(`${base}/.netlify/functions/createShippingLabel`, {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({
                invoiceId,
                service_code: serviceCode,
                package_details: {
                  weight: {value: weight, unit: 'pound'},
                  dimensions: {unit: 'inch', length, width, height}
                }
              })
            })
            const data = await response.json().catch(() => ({}))
            if (!response.ok || data?.error) {
              throw new Error(data?.error || `HTTP ${response.status}`)
            }
            const labelUrl = data?.labelUrl
            if (labelUrl) {
              try {
                window.open(labelUrl, '_blank')
              } catch {
                // ignore opener issues
              }
              alert(`Label created. Tracking: ${data?.trackingNumber || 'n/a'}`)
            } else {
              alert('Label created, but URL missing. Check Shipping Label doc or Order shipping log.')
            }
          } catch (error: any) {
            alert(`Create label failed: ${error?.message || error}`)
          }
        }}
      >
        Create Shipping Label
      </button>

      <button
        type="button"
        className="invoice-actions__button"
        onClick={async () => {
          try {
            const checkout = await postJson(`${base}/.netlify/functions/createCheckout`, payload)
            if (checkout?.url) {
              window.open(checkout.url, '_blank')
            } else {
              alert('No checkout URL returned')
            }
          } catch (error: any) {
            alert(`Checkout failed: ${error?.message || error}`)
          }
        }}
      >
        Stripe In‑Person
      </button>
    </div>
  )
}

export default defineType({
  name: 'invoice',
  title: 'Invoice',
  type: 'document',
  fields: [
    defineField({ name: 'title', title: 'Title', type: 'string' }),

    defineField({
      name: 'invoiceNumber',
      title: 'Invoice Number',
      type: 'string',
      description:
        'Auto-fills. If linked to a website order, this matches the order number; otherwise a FAS-###### number is generated while Pending. Must be unique.',
      components: { input: InvoiceNumberInput },
      readOnly: ({ document }: any): boolean =>
        !!document?.orderNumber || (document?.status ? document.status !== 'pending' : false),
      validation: (Rule) =>
        Rule.required()
          .custom((value) => {
            if (!value) return 'Invoice number is required'
            const re = /^FAS-\d{6}$/
            if (!re.test(value)) return 'Use format FAS-000123 (6 digits)'
            return true
          })
          .custom(async (value, context) => {
            try {
              if (!value) return true
              const client = getSanityClient()
              const id = (context as any)?.document?._id
              const query = `count(*[ _type == "invoice" && invoiceNumber == $num && _id != $id ])`
              const count = await client.fetch(query, { num: value, id })
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
      to: [{ type: 'customer' }],
      readOnly: true,
      description: 'Set automatically when you pick or create a customer via Bill To.',
    }),

    defineField({ name: 'quote', title: 'Related Quote', type: 'reference', to: [{ type: 'buildQuote' }] }),

    // Link to Order (if created from website checkout)
    defineField({ name: 'orderRef', title: 'Related Order', type: 'reference', to: [{ type: 'order' }] }),
    // Legacy compatibility (hidden): previously used `order` and `customer` field names
    defineField({ name: 'order', title: 'Order (legacy)', type: 'reference', to: [{ type: 'order' }], hidden: true, options: { disableNew: true } }),
    defineField({ name: 'customer', title: 'Customer (legacy)', type: 'reference', to: [{ type: 'customer' }], hidden: true, options: { disableNew: true } }),

    defineField({ name: 'billTo', title: 'Bill To', type: 'billTo', components: { input: BillToInput } }),

    defineField({ name: 'shipTo', title: 'Ship To', type: 'shipTo', components: { input: ShipToInput } }),

    // Line Items with product link or custom rows
    defineField({ name: 'lineItems', title: 'Line Items', type: 'array', of: [ { type: 'invoiceLineItem' } ] }),

    // Discount controls
    defineField({ name: 'discountType', title: 'Discount Type', type: 'string', options: { list: [ {title:'Amount ($)', value:'amount'}, {title:'Percent (%)', value:'percent'} ], layout:'radio' }, initialValue: 'amount' }),
    defineField({ name: 'discountValue', title: 'Discount Value', type: 'number', description: 'If percent, enter e.g. 10 for 10%.' }),

    // Tax rate
    defineField({ name: 'taxRate', title: 'Tax Rate %', type: 'number', description: 'Percent (e.g., 7.0 for 7%)' }),

    // Calculated totals (read-only; shown via TotalsPanel)
    defineField({ name: 'subtotal', title: 'Subtotal (auto)', type: 'number', readOnly: true }),
    // Optional stored total for compatibility with older docs
    defineField({ name: 'total', title: 'Total (stored)', type: 'number' }),

    // Notes
    defineField({ name: 'customerNotes', title: 'Notes (Visible to Customer)', type: 'text' }),
    defineField({ name: 'internalNotes', title: 'Internal Notes (Hidden)', type: 'text' }),

    // Status & dates
    defineField({
      name: 'status',
      title: 'Payment Status',
      type: 'string',
      options: { list: ['pending', 'paid', 'refunded', 'cancelled'], layout: 'dropdown' },
      initialValue: 'pending',
    }),
    defineField({ name: 'invoiceDate', title: 'Invoice Date', type: 'date', initialValue: () => new Date().toISOString().slice(0,10) }),
    defineField({ name: 'dueDate', title: 'Due Date', type: 'date' }),

    defineField({ name: 'paymentLinkUrl', title: 'Payment Link URL', type: 'url' }),

    // Stripe/payment metadata for compatibility with imported or legacy invoices
    defineField({ name: 'currency', title: 'Currency', type: 'string' }),
    defineField({ name: 'amountSubtotal', title: 'Amount Subtotal', type: 'number' }),
    defineField({ name: 'amountTax', title: 'Amount Tax', type: 'number' }),
    defineField({ name: 'stripeSessionId', title: 'Stripe Session ID', type: 'string' }),
    defineField({ name: 'paymentIntentId', title: 'Payment Intent ID', type: 'string' }),
    defineField({ name: 'receiptUrl', title: 'Receipt URL', type: 'url' }),
    defineField({ name: 'customerEmail', title: 'Customer Email', type: 'string' }),
    defineField({ name: 'stripeInvoiceId', title: 'Stripe Invoice ID', type: 'string', readOnly: true }),
    defineField({ name: 'stripeInvoiceStatus', title: 'Stripe Invoice Status', type: 'string', readOnly: true }),
    defineField({ name: 'stripeHostedInvoiceUrl', title: 'Stripe Hosted Invoice URL', type: 'url', readOnly: true }),
    defineField({ name: 'stripeInvoicePdf', title: 'Stripe Invoice PDF', type: 'url', readOnly: true }),
    defineField({ name: 'stripeLastSyncedAt', title: 'Stripe Last Synced', type: 'datetime', readOnly: true }),
    defineField({
      name: 'userId',
      title: 'User ID (Portal)',
      type: 'string',
      description: 'Legacy external id for the billed customer. FAS Auth uses the document _id going forward.',
    }),
    defineField({ name: 'dateIssued', title: 'Date Issued (legacy)', type: 'datetime' }),

    // Visual totals panel (virtual field)
    defineField({ name: 'totalsPanel', title: 'Totals', type: 'string', components: { input: TotalsPanel }, readOnly: true }),

    // Action buttons (virtual field)
    defineField({ name: 'actions', title: 'Actions', type: 'string', components: { input: InvoiceActions }, readOnly: true }),
  ],

  initialValue: async () => ({ status: 'pending' }),

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
      const { title, invoiceNumber, orderNumber, billToName, total, status } = sel as any
      const name = billToName || title || 'Invoice'
      const reference = orderNumber || invoiceNumber || ''
      const header = reference ? `${name} • ${reference}` : name
      const amount = typeof total === 'number' ? ` – $${fmt(total)}` : ''
      const st = status ? ` • ${status.toUpperCase()}` : ''
      return { title: `${header}${amount}${st}` }
    },
  },
})
