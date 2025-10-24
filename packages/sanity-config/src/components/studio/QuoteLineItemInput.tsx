import React, {useEffect, useState} from 'react'
import {set, useClient} from 'sanity'

import '../../schemaTypes/documents/quoteStyles.css'

function fmt(value?: number) {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return number.toFixed(2)
}

export default function QuoteLineItemInput(props: any) {
  const {value, onChange} = props
  const client = useClient({apiVersion: '2024-10-01'})
  const [mode, setMode] = useState<'product' | 'custom'>(value?.kind || (value?.product ? 'product' : 'custom'))
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
      customName: product.title,
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
  const manualTotal = value?.lineTotal
  const computedTotal = quantity * unitPrice
  const resolvedTotal = typeof manualTotal === 'number' ? manualTotal : computedTotal

  return (
    <div className="quote-line-item">
      <div className="quote-line-item__mode">
        <label className="quote-line-item__mode-option">
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
        <label className="quote-line-item__mode-option">
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
        <div className="quote-line-item__product">
          <div className="quote-line-item__product-search">
            <input
              className="quote-line-item__field quote-line-item__field--wide"
              placeholder="Search products by name or SKU…"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
            />
            {results.length > 0 && (
              <div className="quote-line-item__product-results">
                {results.map((product: any) => (
                  <button
                    key={product._id}
                    type="button"
                    className="quote-line-item__product-result"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onPickProduct(product)}
                  >
                    <span className="quote-line-item__product-title">{product.title || 'Untitled product'}</span>
                    <span className="quote-line-item__product-meta">
                      {[product.sku || '—', `$${fmt(product.price)}`].filter(Boolean).join(' • ')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="quote-line-item__numeric-group">
            <input
              className="quote-line-item__field"
              type="number"
              min={1}
              value={quantity}
              onChange={(event) =>
                onChange(set({...(value || {}), quantity: Number(event.currentTarget.value || 1)}))
              }
              placeholder="Qty"
            />
            <input
              className="quote-line-item__field"
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
        <div className="quote-line-item__custom">
          <div className="quote-line-item__custom-row">
            <input
              className="quote-line-item__field quote-line-item__field--wide"
              placeholder="Item name"
              value={value?.customName || ''}
              onChange={(event) => onChange(set({...(value || {}), customName: event.currentTarget.value}))}
            />
            <input
              className="quote-line-item__field"
              placeholder="SKU"
              value={value?.sku || ''}
              onChange={(event) => onChange(set({...(value || {}), sku: event.currentTarget.value}))}
            />
          </div>
          <div className="quote-line-item__custom-row">
            <input
              className="quote-line-item__field quote-line-item__field--wide"
              placeholder="Description"
              value={value?.description || ''}
              onChange={(event) => onChange(set({...(value || {}), description: event.currentTarget.value}))}
            />
          </div>
          <div className="quote-line-item__custom-row quote-line-item__custom-row--numeric">
            <input
              className="quote-line-item__field"
              placeholder="Qty"
              type="number"
              min={1}
              value={quantity}
              onChange={(event) =>
                onChange(set({...(value || {}), quantity: Number(event.currentTarget.value || 1)}))
              }
            />
            <input
              className="quote-line-item__field"
              placeholder="Unit $"
              type="number"
              step="0.01"
              value={unitPrice}
              onChange={(event) =>
                onChange(set({...(value || {}), unitPrice: Number(event.currentTarget.value || 0)}))
              }
            />
          </div>
        </div>
      )}

      <div className="quote-line-item__total">
        <span className="quote-line-item__total-label">Line total</span>
        <span className="quote-line-item__total-value">${fmt(resolvedTotal)}</span>
      </div>
    </div>
  )
}
