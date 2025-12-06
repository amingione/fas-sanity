import React from 'react'

import {deriveVariantAndAddOns} from '../utils/cartItemDetails'

type FulfillmentOverviewProps = {
  value?: any
}

const formatDate = (date?: string) => {
  if (!date) return 'N/A'
  return new Date(date).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function FulfillmentOverview({value}: FulfillmentOverviewProps) {
  if (!value) return null

  const customerName = value.customerName || value.shippingAddress?.name || 'Unknown Customer'

  return (
    <div style={{padding: '24px', backgroundColor: '#ffffff'}}>
      {/* Customer Name */}
      <div style={{marginBottom: '24px'}}>
        <div
          style={{
            fontSize: '13px',
            color: '#6b7280',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '8px',
          }}
        >
          Customer
        </div>
        <div style={{fontSize: '24px', fontWeight: '700', color: '#111827'}}>{customerName}</div>
        {value.customerEmail && (
          <div style={{fontSize: '14px', color: '#6b7280', marginTop: '4px'}}>
            {value.customerEmail}
          </div>
        )}
      </div>

      {/* Ordered Items */}
      <div style={{marginBottom: '24px'}}>
        <div
          style={{
            fontSize: '13px',
            color: '#6b7280',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '12px',
          }}
        >
          Ordered Items
        </div>
        {value.cart?.map((item: any, index: number) => {
          const {selectedVariant, addOns} = deriveVariantAndAddOns({
            selectedVariant: item.selectedVariant,
            optionDetails: item.optionDetails,
            upgrades: item.upgrades,
          })
          const optionText =
            [selectedVariant, ...addOns.map((addon: string) => `Add-on: ${addon}`)]
              .map((entry) => (entry || '').trim())
              .filter(Boolean)
              .join(' • ') || item.optionSummary

          return (
            <div
              key={index}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                padding: '12px 0',
                borderBottom: index < value.cart.length - 1 ? '1px solid #f3f4f6' : 'none',
              }}
            >
              <div style={{flex: 1}}>
                <div style={{fontSize: '15px', fontWeight: '600', color: '#111827'}}>
                  {item.name || item.productName || 'Product'}
                </div>
                {item.sku && (
                  <div style={{fontSize: '13px', color: '#6b7280', marginTop: '2px'}}>
                    SKU: {item.sku}
                  </div>
                )}
                {optionText && (
                  <div style={{fontSize: '13px', color: '#6b7280', marginTop: '2px'}}>
                    {optionText}
                  </div>
                )}
              </div>
              <div style={{textAlign: 'right', marginLeft: '16px'}}>
                <div style={{fontSize: '15px', fontWeight: '600', color: '#111827'}}>
                  Qty: {item.quantity || 1}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Order Date */}
      <div>
        <div
          style={{
            fontSize: '13px',
            color: '#6b7280',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '8px',
          }}
        >
          Order Date
        </div>
        <div style={{fontSize: '16px', fontWeight: '600', color: '#111827'}}>
          {formatDate(value.createdAt)}
        </div>
      </div>
    </div>
  )
}
