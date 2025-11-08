import React, {useEffect, useState} from 'react'
import {set, useClient} from 'sanity'

export default function InvoiceLineItemInput(props: any) {
  const {value, onChange} = props
  const client = useClient({apiVersion: '2024-10-01'})
  const [mode, setMode] = useState<'product' | 'custom'>(value?.kind || 'product')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<any[]>([])

  useEffect(() => {
    if (mode !== 'product') return
    const q = search.trim()
    if (q.length < 2) {
      setResults([])
      return
    }
    let t: ReturnType<typeof setTimeout> | null = setTimeout(async () => {
      try {
        const rs = await client.fetch(
          `*[_type == "product" && (title match $q || sku match $q)][0...8]{_id, title, sku, price}`,
          {q: `${q}*`},
        )
        setResults(Array.isArray(rs) ? rs : [])
      } catch {
        setResults([])
      }
    }, 200)
    return () => {
      if (t) clearTimeout(t)
    }
  }, [client, search, mode])

  function onPickProduct(p: any) {
    const patch: any = {
      kind: 'product',
      product: {_type: 'reference', _ref: p._id},
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

  return React.createElement(
    'div',
    {style: {border: '1px solid #eee', padding: 8, borderRadius: 6}},
    // mode chooser
    React.createElement(
      'div',
      {style: {display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6}},
      React.createElement(
        'label',
        null,
        React.createElement('input', {
          type: 'radio',
          checked: mode === 'product',
          onChange: () => {
            setMode('product')
            onChange(set({...(value || {}), kind: 'product'}))
          },
        }),
        ' ',
        'Product',
      ),
      React.createElement(
        'label',
        null,
        React.createElement('input', {
          type: 'radio',
          checked: mode === 'custom',
          onChange: () => {
            setMode('custom')
            onChange(set({...(value || {}), kind: 'custom', product: undefined}))
          },
        }),
        ' ',
        'Custom',
      ),
    ),

    // product mode
    mode === 'product'
      ? React.createElement(
          'div',
          {style: {display: 'grid', gridTemplateColumns: '1fr auto', gap: 8}},
          React.createElement(
            'div',
            null,
            React.createElement('input', {
              placeholder: 'Search products by name or SKU…',
              value: search,
              onChange: (e: any) => setSearch(e.currentTarget.value),
              style: {width: '100%', padding: '6px 8px'},
            }),
            results.length > 0
              ? React.createElement(
                  'div',
                  {
                    style: {
                      border: '1px solid #ddd',
                      marginTop: 6,
                      borderRadius: 4,
                      maxHeight: 200,
                      overflowY: 'auto',
                    },
                  },
                  ...results.map((p) =>
                    React.createElement(
                      'div',
                      {
                        key: p._id,
                        onMouseDown: (e: any) => e.preventDefault(),
                        onClick: () => onPickProduct(p),
                        style: {padding: '8px 10px', cursor: 'pointer'},
                      },
                      React.createElement('div', {style: {fontWeight: 600}}, p.title || '—'),
                      React.createElement(
                        'div',
                        {style: {fontSize: 12, color: '#444'}},
                        p.sku || '—',
                      ),
                      React.createElement(
                        'div',
                        {style: {fontSize: 12}},
                        `$${Number(p.price || 0).toFixed(2)}`,
                      ),
                    ),
                  ),
                )
              : null,
          ),
          React.createElement(
            'div',
            {style: {display: 'grid', gap: 6}},
            React.createElement('input', {
              type: 'number',
              value: value?.quantity ?? 1,
              onChange: (e: any) =>
                onChange(set({...(value || {}), quantity: Number(e.currentTarget.value || 1)})),
              placeholder: 'Qty',
              min: 1,
              style: {width: 80, padding: '6px 8px'},
            }),
            React.createElement(
              'div',
              {style: {fontSize: 12, textAlign: 'right'}},
              `= $${(computed || 0).toFixed(2)}`,
            ),
          ),
        )
      : null,

    // custom mode
    mode === 'custom'
      ? React.createElement(
          'div',
          {style: {display: 'grid', gap: 8}},
          React.createElement('input', {
            placeholder: 'Description',
            value: value?.description || '',
            onChange: (e: any) =>
              onChange(set({...(value || {}), description: e.currentTarget.value})),
            style: {width: '100%', padding: '6px 8px'},
          }),
          React.createElement('input', {
            placeholder: 'SKU (optional)',
            value: value?.sku || '',
            onChange: (e: any) => onChange(set({...(value || {}), sku: e.currentTarget.value})),
            style: {width: '100%', padding: '6px 8px'},
          }),
          React.createElement(
            'div',
            {style: {display: 'flex', gap: 8}},
            React.createElement('input', {
              type: 'number',
              placeholder: 'Qty',
              value: value?.quantity ?? 1,
              min: 1,
              onChange: (e: any) =>
                onChange(set({...(value || {}), quantity: Number(e.currentTarget.value || 1)})),
              style: {width: 120, padding: '6px 8px'},
            }),
            React.createElement('input', {
              type: 'number',
              placeholder: 'Unit Price',
              value: value?.unitPrice ?? 0,
              onChange: (e: any) =>
                onChange(set({...(value || {}), unitPrice: Number(e.currentTarget.value || 0)})),
              style: {width: 160, padding: '6px 8px'},
            }),
          ),
          React.createElement(
            'div',
            {style: {fontSize: 12, textAlign: 'right'}},
            `= $${(computed || 0).toFixed(2)}`,
          ),
        )
      : null,
  )
}
