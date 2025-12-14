export type TrackingEmailCartItem = {
  name?: string | null
  quantity?: number | null
}

export type TrackingEmailOrder = {
  orderNumber?: string | null
  cart?: Array<TrackingEmailCartItem | null> | null
}

export type TrackingEmailOptions = {
  trackingCode?: string | null
  trackingUrl?: string | null
}

const formatCartList = (cart?: Array<TrackingEmailCartItem | null> | null) => {
  const entries =
    cart
      ?.filter(Boolean)
      .map((item) => {
        const label = item?.name?.trim() || 'Item'
        const qty = typeof item?.quantity === 'number' && item.quantity > 1 ? ` ×${item.quantity}` : ''
        return {html: `<li>${label}${qty}</li>`, text: `- ${label}${qty}`}
      }) || []
  return {
    html: entries.length ? `<ul style="padding-left:20px;margin:12px 0;color:#111827;">${entries.map((entry) => entry.html).join('')}</ul>` : '',
    textLines: entries.map((entry) => entry.text),
  }
}

export function buildTrackingEmailHtml(
  order: TrackingEmailOrder,
  options: TrackingEmailOptions = {},
): string {
  const headingOrderNumber = order.orderNumber ? ` ${order.orderNumber}` : ''
  const cartMarkup = formatCartList(order.cart).html
  const trackingCode = options.trackingCode?.trim()
  const trackingUrl = options.trackingUrl?.trim()
  const trackingButton = trackingUrl
    ? `<p style="margin:20px 0;"><a href="${trackingUrl}" style="display:inline-block;padding:12px 20px;background:#dc2626;color:#fff;font-weight:600;text-decoration:none;border-radius:6px;" target="_blank" rel="noopener">Track your shipment</a></p>`
    : ''

  return `
    <div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111827;background:#ffffff;">
      <h2 style="margin:0 0 12px;">Your order${headingOrderNumber} is on the way 🚚</h2>
      <p style="margin:0 0 12px;">We've created a shipment for your order and will keep you posted as it moves.</p>
      ${trackingCode ? `<p style="margin:0 0 8px;font-weight:600;">Tracking #: ${trackingCode}</p>` : ''}
      ${trackingButton}
      ${cartMarkup}
      <p style="margin:20px 0 0;color:#4b5563;">Thanks for shopping with F.A.S. Motorsports!</p>
    </div>
  `
}

export function buildTrackingEmailText(
  order: TrackingEmailOrder,
  options: TrackingEmailOptions = {},
): string {
  const lines: string[] = []
  const orderLabel = order.orderNumber ? ` ${order.orderNumber}` : ''
  lines.push(`Your order${orderLabel} is on the way.`)
  if (options.trackingCode) {
    lines.push(`Tracking #: ${options.trackingCode}`)
  }
  if (options.trackingUrl) {
    lines.push(`Track here: ${options.trackingUrl}`)
  }

  const cartList = formatCartList(order.cart)
  if (cartList.textLines.length) {
    lines.push('', 'Items:')
    lines.push(...cartList.textLines)
  }

  lines.push('', 'Thanks for shopping with F.A.S. Motorsports!')
  return lines.filter((line, index, arr) => {
    if (line !== '') return true
    return index === 0 || arr[index - 1] !== ''
  }).join('\n')
}
