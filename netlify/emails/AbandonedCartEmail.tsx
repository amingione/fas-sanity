import * as React from 'react'

export type CartItem = {
  name?: string
  quantity?: number
  price?: number
  total?: number
  image?: string
  productUrl?: string
}

export type AbandonedCartEmailProps = {
  customerName?: string
  cart: CartItem[]
  totalAmount: number
  checkoutUrl: string
  supportEmail: string
  supportPhone: string
  siteUrl?: string
}

const money = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '$0.00'
  return `$${Number(value).toFixed(2)}`
}

const cardStyles = {
  container: {
    background: '#0b1224',
    color: '#e5e7eb',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    padding: '0',
    margin: '0',
  },
  header: {
    background: 'linear-gradient(135deg, #0b1224 0%, #111827 50%, #0b1224 100%)',
    color: '#fff',
    padding: '36px 28px 28px',
    textAlign: 'center' as const,
  },
  badge: {
    display: 'inline-block',
    padding: '6px 12px',
    borderRadius: '999px',
    border: '1px solid rgba(255,255,255,0.25)',
    fontSize: '12px',
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
  },
  content: {
    padding: '28px 28px 16px',
    background: '#0f172a',
  },
  card: {
    maxWidth: '680px',
    margin: '0 auto',
    background: '#0f172a',
    borderRadius: '14px',
    border: '1px solid rgba(255,255,255,0.08)',
    overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
  },
  body: {
    padding: '24px 24px 8px',
  },
  cta: {
    display: 'block',
    width: '100%',
    maxWidth: '420px',
    margin: '28px auto 8px',
    background: 'linear-gradient(120deg, #f97316 0%, #fb923c 100%)',
    color: '#0b1224',
    padding: '16px 28px',
    textDecoration: 'none',
    borderRadius: '10px',
    textAlign: 'center' as const,
    fontWeight: 700,
    fontSize: '17px',
    boxShadow: '0 10px 30px rgba(249, 115, 22, 0.35)',
  },
  cartItem: {
    display: 'flex',
    gap: '14px',
    padding: '14px',
    borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.02)',
    marginBottom: '12px',
  },
  footer: {
    textAlign: 'center' as const,
    color: '#9ca3af',
    padding: '24px 20px 28px',
    background: '#0b1224',
    borderTop: '1px solid rgba(255,255,255,0.08)',
  },
}

export default function AbandonedCartEmail({
  customerName,
  cart,
  totalAmount,
  checkoutUrl,
  supportEmail,
  supportPhone,
  siteUrl,
}: AbandonedCartEmailProps) {
  const firstName = (customerName || '').trim().split(' ')[0] || 'there'
  const cleanedCart = Array.isArray(cart) ? cart : []

  return (
    <html>
      <body style={cardStyles.container as React.CSSProperties}>
        <table role="presentation" cellPadding={0} cellSpacing={0} style={{width: '100%', margin: '0 auto'}}>
          <tbody>
            <tr>
              <td>
                <div style={cardStyles.card as React.CSSProperties}>
                  <div style={cardStyles.header as React.CSSProperties}>
                    <div style={cardStyles.badge as React.CSSProperties}>Cart saved</div>
                    <h1 style={{margin: '14px 0 6px', fontSize: '26px', fontWeight: 800}}>
                      We held your picks for you
                    </h1>
                    <p style={{margin: 0, color: 'rgba(255,255,255,0.75)', fontSize: '15px'}}>
                      Hi {firstName}, finish checkout in one click.
                    </p>
                  </div>

                  <div style={cardStyles.body as React.CSSProperties}>
                    <p style={{color: '#cbd5e1', fontSize: '15px', lineHeight: 1.6, margin: '0 0 18px'}}>
                      Your items are waiting. Complete your order below—pricing and availability are held for a limited time.
                    </p>

                    {cleanedCart.map((item, index) => (
                      <div key={index} style={cardStyles.cartItem as React.CSSProperties}>
                        {item.image ? (
                          <a href={item.productUrl || checkoutUrl} style={{display: 'block'}}>
                            <img
                              src={item.image}
                              alt={item.name || 'Product'}
                              width="82"
                              height="82"
                              style={{
                                width: '82px',
                                height: '82px',
                                objectFit: 'cover',
                                borderRadius: '8px',
                                border: '1px solid rgba(255,255,255,0.08)',
                              }}
                            />
                          </a>
                        ) : null}
                        <div style={{flex: 1}}>
                          <p style={{margin: '0 0 6px', color: '#e5e7eb', fontWeight: 700, fontSize: '15px'}}>
                            {item.productUrl ? (
                              <a
                                href={item.productUrl}
                                style={{color: '#e5e7eb', textDecoration: 'none'}}
                              >
                                {item.name || 'Cart item'}
                              </a>
                            ) : (
                              item.name || 'Cart item'
                            )}
                          </p>
                          <p style={{margin: '0', color: '#94a3b8', fontSize: '13px'}}>
                            Qty: {Number(item.quantity || 1)} • {money(item.price)} each
                          </p>
                        </div>
                        <div style={{fontWeight: 700, color: '#fbbf24', fontSize: '15px'}}>
                          {money(item.total ?? (item.price || 0) * Number(item.quantity || 1))}
                        </div>
                      </div>
                    ))}

                    <div
                      style={{
                        marginTop: '18px',
                        padding: '16px 18px',
                        borderRadius: '12px',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span style={{color: '#cbd5e1', fontSize: '14px', letterSpacing: '0.01em'}}>
                        Order total
                      </span>
                      <span style={{color: '#fbbf24', fontSize: '22px', fontWeight: 800}}>
                        {money(totalAmount)}
                      </span>
                    </div>

                    <a href={checkoutUrl} style={cardStyles.cta as React.CSSProperties}>
                      Resume checkout
                    </a>

                    <div
                      style={{
                        margin: '18px 0 10px',
                        padding: '14px 16px',
                        borderRadius: '10px',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px dashed rgba(255,255,255,0.15)',
                        color: '#cbd5e1',
                        fontSize: '13px',
                        lineHeight: 1.6,
                      }}
                    >
                      <strong style={{color: '#f97316'}}>Need help?</strong>{' '}
                      Email us at{' '}
                      <a href={`mailto:${supportEmail}`} style={{color: '#fbbf24'}}>
                        {supportEmail}
                      </a>{' '}
                      or call {supportPhone}.
                    </div>
                  </div>

                  <div style={cardStyles.footer as React.CSSProperties}>
                    <p style={{margin: '0 0 6px', fontWeight: 600, color: '#e5e7eb'}}>
                      FAS Motorsports
                    </p>
                    <p style={{margin: 0, fontSize: '12px'}}>Performance parts &amp; tuning support.</p>
                    {siteUrl ? (
                      <p style={{margin: '12px 0 0', fontSize: '12px'}}>
                        <a
                          href={`${siteUrl.replace(/\/$/, '')}/unsubscribe`}
                          style={{color: '#fbbf24', textDecoration: 'none'}}
                        >
                          Unsubscribe from cart recovery emails
                        </a>
                      </p>
                    ) : null}
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  )
}
