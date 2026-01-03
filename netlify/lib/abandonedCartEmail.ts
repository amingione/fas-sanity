import type {ReactElement} from 'react'
import AbandonedCartEmail, {CartItem as EmailCartItem} from '../emails/AbandonedCartEmail'

export type AbandonedCartEmailPayload = {
  customerName?: string
  cart: EmailCartItem[]
  totalAmount: number
  checkoutUrl: string
}

export const ABANDONED_CART_FROM =
  process.env.FROM_EMAIL ||
  process.env.RESEND_FROM ||
  process.env.NOTIFY_FROM ||
  'orders@fasmotorsports.com'
export const ABANDONED_CART_SUPPORT_EMAIL =
  process.env.SUPPORT_EMAIL || process.env.NOTIFY_EMAIL || 'support@fasmotorsports.com'
export const ABANDONED_CART_SUPPORT_PHONE =
  process.env.SUPPORT_PHONE || process.env.SHIP_FROM_PHONE || '(812) 200-9012'
export const ABANDONED_CART_SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.PUBLIC_SITE_URL ||
  process.env.SANITY_STUDIO_NETLIFY_BASE ||
  ''
export const ABANDONED_CART_SUBJECT = '🛒 Your cart is waiting at FAS Motorsports'

export const buildAbandonedCartEmail = (
  payload: AbandonedCartEmailPayload,
): {from: string; subject: string; react: ReactElement} => {
  return {
    from: ABANDONED_CART_FROM,
    subject: ABANDONED_CART_SUBJECT,
    react: AbandonedCartEmail({
      customerName: payload.customerName,
      cart: payload.cart,
      totalAmount: payload.totalAmount,
      checkoutUrl: payload.checkoutUrl,
      supportEmail: ABANDONED_CART_SUPPORT_EMAIL,
      supportPhone: ABANDONED_CART_SUPPORT_PHONE,
      siteUrl: ABANDONED_CART_SITE_URL || undefined,
    }),
  }
}
