import { defineType, defineField } from 'sanity'
import { createClient } from '@sanity/client'
import React, { useEffect, useMemo, useState } from 'react'
import { useClient, set, useFormValue } from 'sanity'
import { TextInput } from '@sanity/ui'
import { v4 as uuidv4 } from 'uuid'

const el = React.createElement

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
  const { value, onChange } = props
  const orderNumber = (useFormValue(['orderNumber']) as string) || ''
  const status = (useFormValue(['status']) as string) || 'pending'

  // Auto-populate once when empty
  useEffect(() => {
    if (value) return
    if (orderNumber) {
      onChange(set(String(orderNumber)))
    } else {
      const rand = Math.floor(Math.random() * 1_000_000)
      onChange(set(`FAS-${rand.toString().padStart(6, '0')}`))
    }
  }, [orderNumber])

  const readOnly = status !== 'pending' || !!orderNumber

  return el(TextInput as any, {
    readOnly,
    value: value || '',
    onChange: (e: any) => onChange(set(e.currentTarget.value)),
  })
}

// ---- Collapsible object input (Bill To) with customer search and linking
function BillToInput(props: any) {
  const { renderDefault, value, onChange } = props
  const client = useClient({ apiVersion: '2024-10-01' })
  const [open, setOpen] = useState(true)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const inputRef = React.useRef<HTMLInputElement | null>(null)
  function chooseFirst() {
    if (results.length > 0) applyCustomer(results[0])
  }

  // live search existing customers
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setResults([]); return }
    let t: any = setTimeout(async () => {
      try {
        setLoading(true)
        const rs = await client.fetch(
          `*[_type == "customer" && (name match $m || email match $m || phone match $m)][0...10]{
            _id, name, email, phone,
            address_line1, address_line2, city_locality, state_province, postal_code, country_code
          }`,
          { m: `${term}*` }
        )
        setResults(Array.isArray(rs) ? rs : [])
      } catch { setResults([]) } finally { setLoading(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  function applyCustomer(c: any) {
    const patch: any = {
      name: (c?.name || '').trim(),
      email: (c?.email || '').trim(),
      phone: (c?.phone || '').trim(),
      address_line1: (c?.address_line1 || '').trim(),
      address_line2: (c?.address_line2 || '').trim(),
      city_locality: (c?.city_locality || '').trim(),
      state_province: (c?.state_province || '').trim(),
      postal_code: (c?.postal_code || '').trim(),
      country_code: (c?.country_code || '').trim(),
    }
    onChange(set(patch))
    try {
      const docId = (useFormValue(['_id']) as string) || ''
      const currentShip = (useFormValue(['shipTo']) as any) || {}
      const emptyShip = !currentShip?.name && !currentShip?.address_line1 && !currentShip?.postal_code
      const ops: any = { customerRef: { _type: 'reference', _ref: c._id } }
      if (emptyShip) ops.shipTo = patch
      if (docId) client.patch(docId).set(ops).commit({ autoGenerateArrayKeys: true })
    } catch {}
  }

  async function createFromBillTo() {
    // create a new customer doc from the current bill-to fields
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
  }

  return el(
    'div',
    { style: { border: '1px solid #eee', borderRadius: 6, marginBottom: 8 } },
    el(
      'div',
      {
        style: {
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: '#fafafa', padding: '8px 10px', borderRadius: '6px 6px 0 0', borderBottom: '1px solid #eee', cursor: 'pointer'
        },
        onClick: () => setOpen(!open),
      },
      el('div', { style: { fontWeight: 600, color: '#000' } }, 'Bill To (link to Customer)'),
      el('div', { style: { fontSize: 12, color: '#666' } }, open ? 'Hide' : 'Show')
    ),
    open ? el(
      'div',
      { style: { padding: 10 } },
      // search bar
      el('div', { style: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 8 } },
        el('input', {
          ref: (r: any) => (inputRef.current = r),
          placeholder: 'Search customers by name, email, or phone…',
          value: q,
          onChange: (e: any) => setQ(e.currentTarget.value),
          onKeyDown: (e: any) => {
            if (e.key === 'Enter') { e.preventDefault(); chooseFirst() }
            if (e.key === 'ArrowDown' && results.length > 0) {
              // focus list container for screen readers; click first item
              chooseFirst()
            }
          },
          style: { width: '100%', padding: '6px 8px', color: '#000' },
        }),
        el('button', { type: 'button', onClick: createFromBillTo, style: { padding: '6px 10px', borderRadius: 4, border: '1px solid #bbb', background: '#eaeaea', color: '#000', fontWeight: 600, cursor: 'pointer' } }, 'Create Customer from Bill To')
      ),
      // results list
      results.length > 0 ? el(
        'div',
        { style: { border: '1px solid #ddd', borderRadius: 4, maxHeight: 220, overflowY: 'auto', marginBottom: 10 } },
        ...results.map((c: any) => el(
          'div',
          {
            key: c._id,
            onMouseDown: (e: any) => e.preventDefault(),
            onClick: () => applyCustomer(c),
            style: { padding: '8px 10px', cursor: 'pointer', color: '#000' }
          },
          el('div', { style: { fontWeight: 600, color: '#000' } }, c.name || '(No name)'),
          el('div', { style: { fontSize: 12, color: '#000' } }, [c.email || '—', c.phone ? ` • ${c.phone}` : ''].join('')),
          el('div', { style: { fontSize: 12, color: '#000' } }, `${c.address_line1 || ''}${c.address_line2 ? ', ' + c.address_line2 : ''}`),
          el('div', { style: { fontSize: 12, color: '#000' } }, `${c.city_locality || ''}${c.state_province ? ', ' + c.state_province : ''} ${c.postal_code || ''} ${c.country_code || ''}`)
        ))
      ) : (q && !loading ? el('div', { style: { fontSize: 12, color: '#666', marginBottom: 8 } }, 'No matches — fill the form below and click “Create Customer from Bill To”.') : null),

      // default object fields UI
      (props as any).renderDefault(props)
    ) : null
  )
}

function ShipToInput(props: any) {
  const {renderDefault, onChange} = props
  const billTo = useFormValue(['billTo']) as any
  const [open, setOpen] = useState(false)

  function copyFromBillTo() {
    if (!billTo) return
    onChange(set({ ...billTo }))
  }

  return el(
    'div',
    { style: { border: '1px solid #eee', borderRadius: 6, marginBottom: 8 } },
    el(
      'div',
      {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#fafafa',
          padding: '8px 10px',
          borderRadius: '6px 6px 0 0',
          borderBottom: '1px solid #eee'
        }
      },
      el(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        el('div', { style: { fontWeight: 600, color: '#000' } }, 'Ship To'),
        el(
          'button',
          {
            type: 'button',
            onClick: copyFromBillTo,
            style: {
              padding: '2px 8px',
              borderRadius: 4,
              border: '1px solid #bbb',
              background: '#eaeaea',
              color: '#000',
              fontWeight: 600,
              cursor: 'pointer'
            }
          },
          'Use Bill To'
        )
      ),
      el(
        'button',
        { type: 'button', onClick: () => setOpen(!open), style: { fontSize: 12, color: '#666', background: 'transparent', border: 'none', cursor: 'pointer' } },
        open ? 'Hide' : 'Show'
      )
    ),
    open ? el('div', { style: { padding: 10 } }, (props as any).renderDefault(props)) : null
  )
}

// ---- Custom Line Item Input (product-linked or custom)
function LineItemInput(props: any) {
  const { value, onChange } = props
  const client = useClient({ apiVersion: '2024-10-01' })
  const _id = useFormValue(['_id']) as string
  const [mode, setMode] = useState<'product' | 'custom'>(value?.kind || 'product')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<any[]>([])

  useEffect(() => {
    if (mode !== 'product') return
    const q = search.trim()
    if (q.length < 2) { setResults([]); return }
    let t: any = setTimeout(async () => {
      try {
        const rs = await client.fetch(
          `*[_type == "product" && (title match $q || sku match $q)][0...8]{_id, title, sku, price}`,
          { q: `${q}*` }
        )
        setResults(Array.isArray(rs) ? rs : [])
      } catch { setResults([]) }
    }, 200)
    return () => clearTimeout(t)
  }, [search, mode])

  function onPickProduct(p: any) {
    const patch: any = {
      kind: 'product',
      product: { _type: 'reference', _ref: p._id },
      description: p.title,
      sku: p.sku,
      unitPrice: typeof p.price === 'number' ? p.price : Number(p.price || 0),
      quantity: value?.quantity || 1,
      lineTotal: undefined,
    }
    onChange(set(patch))
  }

  const qty = Number(value?.quantity || 1)
  const unit = Number(value?.unitPrice || 0)
  const computed = qty * unit

  return el(
    'div',
    { style: { border: '1px solid #eee', padding: 8, borderRadius: 6 } },
    // mode chooser
    el(
      'div',
      { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 } },
      el('label', null,
        el('input', { type: 'radio', checked: mode === 'product', onChange: () => { setMode('product'); onChange(set({ ...(value || {}), kind: 'product' })) } }),
        ' ', 'Product'
      ),
      el('label', null,
        el('input', { type: 'radio', checked: mode === 'custom', onChange: () => { setMode('custom'); onChange(set({ ...(value || {}), kind: 'custom', product: undefined })) } }),
        ' ', 'Custom'
      ),
    ),

    // product mode
    mode === 'product'
      ? el(
          'div',
          { style: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 } },
          el(
            'div',
            null,
            el('input', {
              placeholder: 'Search products by name or SKU…',
              value: search,
              onChange: (e: any) => setSearch(e.currentTarget.value),
              style: { width: '100%', padding: '6px 8px' },
            }),
            results.length > 0
              ? el(
                  'div',
                  { style: { border: '1px solid #ddd', marginTop: 6, borderRadius: 4, maxHeight: 200, overflowY: 'auto' } },
                  ...results.map((p) =>
                    el(
                      'div',
                      {
                        key: p._id,
                        onMouseDown: (e: any) => e.preventDefault(),
                        onClick: () => onPickProduct(p),
                        style: { padding: '6px 8px', cursor: 'pointer' },
                      },
                      `${p.title} ${p.sku ? `• ${p.sku}` : ''} — $${fmt(p.price)}`
                    )
                  )
                )
              : null
          ),
          el(
            'div',
            { style: { display: 'grid', gap: 6 } },
            el('input', {
              type: 'number',
              min: 1,
              value: qty,
              onChange: (e: any) => onChange(set({ ...(value || {}), quantity: Number(e.currentTarget.value || 1) })),
              placeholder: 'Qty',
              style: { width: 90, padding: '6px 8px' },
            }),
            el('input', {
              type: 'number',
              step: '0.01',
              value: unit,
              onChange: (e: any) => onChange(set({ ...(value || {}), unitPrice: Number(e.currentTarget.value || 0) })),
              placeholder: 'Unit $',
              style: { width: 90, padding: '6px 8px' },
            })
          )
        )
      : // custom mode
        el(
          'div',
          { style: { display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8 } },
          el('input', {
            placeholder: 'Description',
            value: value?.description || '',
            onChange: (e: any) => onChange(set({ ...(value || {}), description: e.currentTarget.value })),
            style: { width: '100%', padding: '6px 8px' },
          }),
          el('input', {
            placeholder: 'Qty',
            type: 'number',
            min: 1,
            value: qty,
            onChange: (e: any) => onChange(set({ ...(value || {}), quantity: Number(e.currentTarget.value || 1) })),
            style: { width: 90, padding: '6px 8px' },
          }),
          el('input', {
            placeholder: 'Unit $',
            type: 'number',
            step: '0.01',
            value: unit,
            onChange: (e: any) => onChange(set({ ...(value || {}), unitPrice: Number(e.currentTarget.value || 0) })),
            style: { width: 110, padding: '6px 8px' },
          })
        ),

    // line total
    el('div', { style: { marginTop: 6, fontSize: 12, color: '#666' } }, `Line total: $${fmt((value as any)?.lineTotal ?? computed)}`)
  )
}

// ---- Totals panel (auto-calc subtotal/discount/tax/total)
function TotalsPanel() {
  const lineItems = (useFormValue(['lineItems']) as any[]) || []
  const discountType = (useFormValue(['discountType']) as string) || 'amount'
  const discountValue = Number(useFormValue(['discountValue']) as any) || 0
  const taxRate = Number(useFormValue(['taxRate']) as any) || 0

  const subtotal = useMemo(() => {
    return lineItems.reduce((sum: number, li: any) => {
      const qty = Number(li?.quantity || 1)
      const unit = Number(li?.unitPrice || 0)
      const manual = li?.lineTotal
      const line = typeof manual === 'number' ? manual : qty * unit
      return sum + (isNaN(line) ? 0 : line)
    }, 0)
  }, [lineItems])

  const discountAmt = useMemo(() => {
    if (!discountValue) return 0
    if (discountType === 'percent') return subtotal * (discountValue / 100)
    return discountValue
  }, [discountType, discountValue, subtotal])

  const taxableBase = Math.max(0, subtotal - discountAmt)
  const taxAmount = taxableBase * (taxRate / 100)
  const total = Math.max(0, taxableBase + taxAmount)

  return el(
    'div',
    { style: { background: '#ffffff', border: '1px solid #eee', padding: 12, borderRadius: 6 } },
    el(
      'div',
      { style: { display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 6 } },
      el('div', { style: { color: '#000' } }, 'Subtotal'),
      el('div', { style: { color: '#000' } }, el('b', { style: { color: '#000' } }, `$${fmt(subtotal)}`)),
      el('div', { style: { color: '#000' } }, 'Discount'),
      el('div', { style: { color: '#000' } }, `-$${fmt(discountAmt)}`),
      el('div', { style: { color: '#000' } }, 'Tax'),
      el('div', { style: { color: '#000' } }, `$${fmt(taxAmount)}`),
      el('div', { style: { borderTop: '1px solid #eee', marginTop: 6, paddingTop: 6, color: '#000' } }, 'Total'),
      el('div', { style: { borderTop: '1px solid #eee', marginTop: 6, paddingTop: 6, textAlign: 'right', color: '#000' } }, el('b', { style: { color: '#000' } }, `$${fmt(total)}`))
    ),
    el('div', { style: { fontSize: 12, color: '#000', marginTop: 6 } }, 'All values auto-calculated from line items, discount, and tax rate.')
  )
}

// ---- Actions (Email / PDF / Stripe in-person)
function InvoiceActions() {
  const _id = useFormValue(['_id']) as string
  const invoiceNumber = useFormValue(['invoiceNumber']) as string
  const doc = useFormValue([]) as any
  const base = getFnBase()

  async function postJson(url: string, body: any) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(typeof data === 'string' ? data : JSON.stringify(data))
    return data
  }

  const payload = useMemo(() => ({ invoiceId: _id, invoiceNumber, invoice: doc }), [_id, invoiceNumber, doc])

  return el(
    'div',
    { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
el(
  'button',
  {
    type: 'button',
    onClick: async () => {
      try {
        // Ensure Stripe checkout URL exists (create + patch on server)
        let createdUrl = ''
        try {
          const cc = await postJson(`${base}/.netlify/functions/createCheckout`, payload)
          createdUrl = cc?.url || ''
        } catch (_) {
          // ignore; email step will still run and server can fallback
        }

        // Send the email (server can read paymentLinkUrl from Sanity; we also pass it just in case)
        await postJson(`${base}/.netlify/functions/resendInvoiceEmail`, { ...payload, paymentLinkUrl: createdUrl })
        alert('Invoice email queued')
      } catch (e: any) {
        alert(`Email failed: ${e.message || e}`)
      }
    },
  },
  'Email Invoice'
),
el(
  'button',
  {
    type: 'button',
    onClick: async () => {
      try {
        const res = await fetch(`${base}/.netlify/functions/generateInvoicePDF`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error(await res.text())

        const ct = (res.headers.get('content-type') || '').toLowerCase()
        let blob: Blob

        if (ct.includes('application/pdf')) {
          // Prefer binary if Netlify/dev returns a real PDF stream
          try {
            const ab = await res.arrayBuffer()
            blob = new Blob([ab], { type: 'application/pdf' })
          } catch {
            // Fallback: treat body as base64 text
            const b64 = await res.text()
            const clean = b64.replace(/^\"|\"$/g, '') // strip quotes if any
            const bytes = atob(clean)
            const buf = new Uint8Array(bytes.length)
            for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i)
            blob = new Blob([buf], { type: 'application/pdf' })
          }
        } else {
          // No PDF content-type → assume base64 string
          const b64 = await res.text()
          if (b64.trim().startsWith('{')) {
            // Looks like JSON error bubbled through
            throw new Error(b64)
          }
          const clean = b64.replace(/^\"|\"$/g, '')
          const bytes = atob(clean)
          const buf = new Uint8Array(bytes.length)
          for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i)
          blob = new Blob([buf], { type: 'application/pdf' })
        }

        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `invoice-${invoiceNumber || _id}.pdf`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      } catch (e: any) {
        alert(`PDF failed: ${e?.message || e}`)
      }
    }
  },
  'Download PDF'
),
    el(
      'button',
      {
        type: 'button',
        onClick: async () => {
          try {
            const data = await postJson(`${base}/.netlify/functions/createCheckout`, payload)
            if (data?.url) window.open(data.url, '_blank')
            else alert('No checkout URL returned')
          } catch (e: any) { alert(`Checkout failed: ${e.message || e}`) }
        },
      },
      'Stripe In‑Person'
    )
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

    // Visual totals panel (virtual field)
    defineField({ name: 'totalsPanel', title: 'Totals', type: 'string', components: { input: TotalsPanel }, readOnly: true }),

    // Action buttons (virtual field)
    defineField({ name: 'actions', title: 'Actions', type: 'string', components: { input: InvoiceActions }, readOnly: true }),
  ],

  initialValue: async () => ({ status: 'pending' }),

  preview: {
    select: { title: 'title', invoiceNumber: 'invoiceNumber', total: 'total', status: 'status' },
    prepare(sel) {
      const { title, invoiceNumber, total, status } = sel as any
      const name = title || `Invoice ${invoiceNumber || ''}`
      const amt = typeof total === 'number' ? ` • $${fmt(total)}` : ''
      const st = status ? ` • ${status.toUpperCase()}` : ''
      return { title: `${name}${amt}${st}` }
    },
  },
})
