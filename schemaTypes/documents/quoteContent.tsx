import {createClient} from '@sanity/client'
import React, {useEffect, useMemo, useRef, useState} from 'react'
import {TextInput} from '@sanity/ui'
import {
  PatchEvent,
  defineField,
  defineType,
  set,
  unset,
  useClient,
  useFormValue
} from 'sanity'

import ConvertToInvoiceButton from '../../components/studio/ConvertToInvoiceButton'
import QuoteStatusWithTimeline from '../../components/inputs/QuoteStatusWithTimeline'

import './quoteStyles.css'

const getSanityClient = () =>
  createClient({
    projectId: 'r4og35qd',
    dataset: 'production',
    apiVersion: '2024-04-10',
    useCdn: false
  })

function fmt(value?: number) {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return number.toFixed(2)
}

function getFnBase(): string {
  const envBase = typeof process !== 'undefined' ? process.env?.SANITY_STUDIO_NETLIFY_BASE : undefined
  if (envBase) return envBase
  try {
    if (typeof window !== 'undefined') {
      const ls = window.localStorage?.getItem('NLFY_BASE')
      if (ls) return ls
      const origin = window.location?.origin
      if (origin && /^https?:\/\//i.test(origin)) return origin
    }
  } catch {}
  return 'https://fassanity.fasmotorsports.com'
}

function QuoteNumberInput(props: any) {
  const {value, onChange, readOnly} = props

  useEffect(() => {
    if (value) return
    const random = Math.floor(Math.random() * 1_000_000)
    onChange(set(`QT-${random.toString().padStart(6, '0')}`))
  }, [onChange, value])

  return (
    <div className="quote-header-card">
      <div className="quote-header-card__badge">Quote</div>
      <div className="quote-header-card__meta">
        <span className="quote-header-card__label">Quote Number</span>
        <TextInput
          value={value || ''}
          readOnly={readOnly}
          onChange={(event) => onChange(set(event.currentTarget.value))}
          className="quote-header-card__input"
          placeholder="QT-000000"
        />
      </div>
    </div>
  )
}

function QuoteDateInput(props: any) {
  const {value, onChange, schemaType} = props
  const safeValue = value ? String(value).slice(0, 10) : ''

  return (
    <div className="quote-meta-field">
      <label className="quote-meta-field__label">{schemaType.title}</label>
      <input
        type="date"
        className="quote-meta-field__control"
        value={safeValue}
        onChange={(event) => {
          const next = event.currentTarget.value
          if (!next) {
            onChange(unset())
            return
          }
          onChange(set(next))
        }}
      />
    </div>
  )
}

function QuoteTextMetaInput(props: any) {
  const {value, onChange, schemaType} = props

  return (
    <div className="quote-meta-field">
      <label className="quote-meta-field__label">{schemaType.title}</label>
      <TextInput
        value={value || ''}
        onChange={(event) => {
          const next = event.currentTarget.value
          if (!next) {
            onChange(unset())
            return
          }
          onChange(set(next))
        }}
        className="quote-meta-field__control"
      />
    </div>
  )
}

function QuoteBillToInput(props: any) {
  const {renderDefault, value, onChange} = props
  const client = useClient({apiVersion: '2024-10-01'})
  const [open, setOpen] = useState(true)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const documentId = (useFormValue(['_id']) as string) || ''
  const currentShip = (useFormValue(['shipTo']) as any) || {}

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
      const emptyShip = !currentShip?.name && !currentShip?.address_line1 && !currentShip?.postal_code
      const operations: Record<string, any> = {
        customer: {_type: 'reference', _ref: customer._id}
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

  function chooseFirst() {
    if (results.length > 0) applyCustomer(results[0])
  }

  return (
    <div className="quote-section-card quote-section-card--contact">
      <div className="quote-section-card__header">
        <span className="quote-section-card__title">Bill To</span>
        <div className="quote-section-card__actions">
          <button type="button" className="quote-pill-button" onClick={() => setOpen((prev) => !prev)}>
            {open ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      {open && (
        <div className="quote-section-card__body">
          <div className="quote-customer-search">
            <input
              className="quote-customer-search__input"
              placeholder="Search customers by name, email, or phone…"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  chooseFirst()
                }
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  chooseFirst()
                }
              }}
            />
            <button type="button" className="quote-customer-search__button" onClick={createFromBillTo}>
              Create Customer from Bill To
            </button>
          </div>
          {results.length > 0 ? (
            <div className="quote-customer-search__results">
              {results.map((customer: any) => (
                <button
                  key={customer._id}
                  type="button"
                  className="quote-customer-search__result"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyCustomer(customer)}
                >
                  <span className="quote-customer-search__result-title">{customer.name || '(No name)'}</span>
                  <span className="quote-customer-search__result-meta">
                    {[customer.email || '—', customer.phone ? `• ${customer.phone}` : ''].filter(Boolean).join(' ')}
                  </span>
                  <span className="quote-customer-search__result-meta">
                    {[customer.address_line1, customer.address_line2].filter(Boolean).join(', ')}
                  </span>
                  <span className="quote-customer-search__result-meta">
                    {[customer.city_locality, customer.state_province, customer.postal_code, customer.country_code]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                </button>
              ))}
            </div>
          ) : query && !loading ? (
            <p className="quote-customer-search__empty">No matches — fill the form below and click “Create Customer”.</p>
          ) : null}
          <div className="quote-section-card__fields">{renderDefault ? renderDefault(props) : null}</div>
        </div>
      )}
    </div>
  )
}

function QuoteShipToInput(props: any) {
  const {renderDefault, onChange} = props
  const billTo = useFormValue(['billTo']) as any
  const [open, setOpen] = useState(false)

  function copyFromBillTo() {
    if (!billTo) return
    onChange(set({...billTo}))
  }

  return (
    <div className="quote-section-card quote-section-card--shipping">
      <div className="quote-section-card__header">
        <span className="quote-section-card__title">Ship To</span>
        <div className="quote-section-card__actions">
          <button type="button" className="quote-pill-button" onClick={copyFromBillTo}>
            Use Bill To
          </button>
          <button type="button" className="quote-pill-button" onClick={() => setOpen((prev) => !prev)}>
            {open ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      {open && <div className="quote-section-card__body">{renderDefault ? renderDefault(props) : null}</div>}
    </div>
  )
}


function QuoteTotalsPanel(props: any) {
  const {onChange} = props
  const lineItems = (useFormValue(['lineItems']) as any[]) || []
  const discountType = (useFormValue(['discountType']) as string) || 'none'
  const discountValue = Number(useFormValue(['discountValue']) as any) || 0
  const taxRate = Number(useFormValue(['taxRate']) as any) || 0
  const lastSynced = useRef({subtotal: 0, taxAmount: 0, total: 0})

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
    if (discountType === 'amount') return discountValue
    return 0
  }, [discountType, discountValue, subtotal])

  const taxableBase = Math.max(0, subtotal - discountAmount)
  const taxAmount = taxableBase * (taxRate / 100)
  const total = Math.max(0, taxableBase + taxAmount)

  useEffect(() => {
    const rounded = {
      subtotal: Number(fmt(subtotal)),
      taxAmount: Number(fmt(taxAmount)),
      total: Number(fmt(total))
    }
    const prev = lastSynced.current
    if (
      prev.subtotal === rounded.subtotal &&
      prev.taxAmount === rounded.taxAmount &&
      prev.total === rounded.total
    ) {
      return
    }
    lastSynced.current = rounded
    if (typeof onChange === 'function') {
      onChange(
        PatchEvent.from([
          set(rounded.subtotal, ['subtotal']),
          set(rounded.taxAmount, ['taxAmount']),
          set(rounded.total, ['total']),
        ])
      )
    }
  }, [onChange, subtotal, taxAmount, total])

  return (
    <div className="quote-totals-card">
      <div className="quote-totals-card__grid">
        <span className="quote-totals-card__label">Subtotal</span>
        <span className="quote-totals-card__value">${fmt(subtotal)}</span>
        <span className="quote-totals-card__label">Discount</span>
        <span className="quote-totals-card__value">-${fmt(discountAmount)}</span>
        <span className="quote-totals-card__label">Tax</span>
        <span className="quote-totals-card__value">${fmt(taxAmount)}</span>
        <span className="quote-totals-card__label quote-totals-card__label--total">Total</span>
        <span className="quote-totals-card__value quote-totals-card__value--total">${fmt(total)}</span>
      </div>
      <p className="quote-totals-card__note">Values auto-calculated from line items, discount, and tax rate.</p>
    </div>
  )
}

function QuoteActions() {
  const quoteId = useFormValue(['_id']) as string
  const quoteNumber = useFormValue(['quoteNumber']) as string
  const documentValue = useFormValue([]) as any
  const base = getFnBase()
  const busyRef = useRef(false)

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

  async function readPdfBlob(response: Response) {
    const contentType = (response.headers.get('content-type') || '').toLowerCase()
    if (contentType.includes('application/pdf')) {
      try {
        const buffer = await response.arrayBuffer()
        return new Blob([buffer], {type: 'application/pdf'})
      } catch {}
    }

    const base64 = await response.text()
    if (base64.trim().startsWith('{')) {
      throw new Error(base64)
    }
    const clean = base64.replace(/^"|"$/g, '')
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
    <div className="quote-actions">
      <button
        type="button"
        className="quote-actions__button quote-actions__button--primary"
        onClick={async () => {
          if (busyRef.current) return
          busyRef.current = true
          try {
            await postJson(`${base}/.netlify/functions/sendQuoteEmail`, {
              quoteId: (quoteId || '').replace(/^drafts\./, ''),
              quoteNumber,
              quote: documentValue
            })
            alert('Quote email queued')
          } catch (error: any) {
            alert(`Email failed: ${error?.message || error}`)
          } finally {
            busyRef.current = false
          }
        }}
      >
        Email Quote
      </button>
      <button
        type="button"
        className="quote-actions__button"
        onClick={async () => {
          if (busyRef.current) return
          busyRef.current = true
          try {
            const response = await fetch(`${base}/.netlify/functions/generateQuotePDF`, {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({quoteId: (quoteId || '').replace(/^drafts\./, '')})
            })
            if (!response.ok) {
              throw new Error(await response.text())
            }
            const blob = await readPdfBlob(response)
            downloadBlob(blob, `quote-${quoteNumber || quoteId}.pdf`)
          } catch (error: any) {
            alert(`PDF failed: ${error?.message || error}`)
          } finally {
            busyRef.current = false
          }
        }}
      >
        Download PDF
      </button>
    </div>
  )
}

export default defineType({
  name: 'quote',
  title: 'Quote',
  type: 'document',
  fields: [
    defineField({
      name: 'quoteNumber',
      title: 'Quote Number',
      type: 'string',
      description: 'Human-friendly quote number. Auto-generates if empty.',
      components: {input: QuoteNumberInput},
      validation: (Rule) =>
        Rule.required()
          .regex(/^QT-\d{6}$/i, 'Formatted quote number')
          .error('Use format QT-000000')
          .custom(async (value, context) => {
            if (!value) return true
            try {
              const client = getSanityClient()
              const docId = (context as any)?.document?._id
              const query = `count(*[ _type == "quote" && quoteNumber == $num && _id != $id ])`
              const matches = await client.fetch(query, {num: value, id: docId})
              if (matches > 0) return 'Quote number must be unique'
              return true
            } catch {
              return true
            }
          })
    }),
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      initialValue: 'Untitled Quote',
      description: 'Internal label. Customers see the quote number.'
    }),
    defineField({
      name: 'quoteDate',
      title: 'Quote Date',
      type: 'date',
      initialValue: () => new Date().toISOString().slice(0, 10),
      components: {input: QuoteDateInput}
    }),
    defineField({
      name: 'expirationDate',
      title: 'Expiration Date',
      type: 'date',
      components: {input: QuoteDateInput}
    }),
    defineField({
      name: 'acceptedDate',
      title: 'Accepted Date',
      type: 'date',
      components: {input: QuoteDateInput}
    }),
    defineField({
      name: 'acceptedBy',
      title: 'Accepted By',
      type: 'string',
      components: {input: QuoteTextMetaInput}
    }),
    defineField({
      name: 'customer',
      title: 'Linked Customer',
      type: 'reference',
      to: [{type: 'customer'}],
      readOnly: true,
      description: 'Set automatically when you select a customer via Bill To.'
    }),
    defineField({
      name: 'billTo',
      title: 'Bill To',
      type: 'billTo',
      components: {input: QuoteBillToInput}
    }),
    defineField({
      name: 'shipTo',
      title: 'Ship To',
      type: 'shipTo',
      components: {input: QuoteShipToInput}
    }),
    defineField({
      name: 'lineItems',
      title: 'Line Items',
      type: 'array',
      of: [{type: 'quoteLineItem'}]
    }),
    defineField({
      name: 'discountType',
      title: 'Discount Type',
      type: 'string',
      options: {
        list: [
          {title: 'None', value: 'none'},
          {title: 'Amount ($)', value: 'amount'},
          {title: 'Percent (%)', value: 'percent'}
        ],
        layout: 'radio'
      },
      initialValue: 'none'
    }),
    defineField({
      name: 'discountValue',
      title: 'Discount Value',
      type: 'number',
      description: 'If percent, enter 10 for 10%.'
    }),
    defineField({
      name: 'taxRate',
      title: 'Tax Rate %',
      type: 'number',
      description: 'Percent value (e.g., 7.0 for 7%)'
    }),
    defineField({name: 'subtotal', title: 'Subtotal (auto)', type: 'number', readOnly: true}),
    defineField({name: 'taxAmount', title: 'Tax (auto)', type: 'number', readOnly: true}),
    defineField({name: 'total', title: 'Total (auto)', type: 'number', readOnly: true}),
    defineField({
      name: 'quoteTotals',
      title: 'Totals',
      type: 'string',
      components: {input: QuoteTotalsPanel},
      readOnly: true
    }),
    defineField({
      name: 'customerMessage',
      title: 'Note to Customer',
      type: 'text'
    }),
    defineField({
      name: 'paymentInstructions',
      title: 'Payment Instructions',
      type: 'text'
    }),
    defineField({
      name: 'internalMemo',
      title: 'Internal Memo (Hidden)',
      type: 'text'
    }),
    defineField({
      name: 'attachments',
      title: 'Attachments',
      type: 'array',
      of: [{type: 'file'}]
    }),
    defineField({
      name: 'quoteActions',
      title: 'Quote Actions',
      type: 'string',
      components: {input: QuoteActions},
      readOnly: true
    }),
    defineField({
      name: 'status',
      title: 'Quote Status',
      type: 'string',
      components: {input: QuoteStatusWithTimeline}
    }),
    defineField({
      name: 'timeline',
      title: 'Quote Timeline',
      type: 'array',
      of: [{type: 'quoteTimelineEvent'}]
    }),
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
      readOnly: true
    }),
    defineField({
      name: 'quotePdfUrl',
      title: 'Generated Quote PDF',
      type: 'url',
      readOnly: true
    }),
    defineField({
      name: 'lastEmailedAt',
      title: 'Last Emailed At',
      type: 'datetime',
      readOnly: true
    }),
    defineField({
      name: 'convertToInvoice',
      type: 'string',
      title: 'Convert to Invoice',
      components: {input: ConvertToInvoiceButton},
      description: 'Create an invoice from this quote.'
    })
  ],
  preview: {
    select: {
      title: 'title',
      quoteNumber: 'quoteNumber',
      customerName: 'billTo.name',
      total: 'total',
      status: 'status'
    },
    prepare(sel) {
      const {title, quoteNumber, customerName, total, status} = sel as any
      const headline = customerName || title || 'Quote'
      const reference = quoteNumber ? ` • #${quoteNumber}` : ''
      const amount = typeof total === 'number' ? ` • $${fmt(total)}` : ''
      const st = status ? ` • ${String(status).toUpperCase()}` : ''
      return {title: `${headline}${reference}${amount}${st}`}
    }
  }
})
