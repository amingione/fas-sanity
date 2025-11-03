const RAW_EXPIRED_VALUES = [
  'expired',
  'checkout.session.expired',
  'stripe.checkout.session.expired',
  'checkout_session_expired',
  'incomplete_expired',
  'abandoned',
]

const EXPIRED_VALUE_SET = new Set(RAW_EXPIRED_VALUES.map((value) => value.toLowerCase()))

export const GROQ_EXPIRED_ARRAY = `[${RAW_EXPIRED_VALUES.map((value) => `"${value}"`).join(', ')}]`

const LOWER_COALESCE_STATUS = 'lower(coalesce(orderV2.status, status, ""))'
const LOWER_COALESCE_PAYMENT = 'lower(coalesce(orderV2.payment.status, paymentStatus, ""))'

export const GROQ_FILTER_EXCLUDE_EXPIRED =
  `!(${LOWER_COALESCE_STATUS} in ${GROQ_EXPIRED_ARRAY}) && !(${LOWER_COALESCE_PAYMENT} in ${GROQ_EXPIRED_ARRAY})`

export const GROQ_FILTER_ONLY_EXPIRED =
  `(${LOWER_COALESCE_STATUS} in ${GROQ_EXPIRED_ARRAY}) || (${LOWER_COALESCE_PAYMENT} in ${GROQ_EXPIRED_ARRAY})`

export const EXPIRED_SESSION_PANEL_TITLE = 'Expired Checkout Sessions'

export function isExpiredOrder(order: {
  status?: string | null
  paymentStatus?: string | null
  orderV2?: {status?: string | null; payment?: {status?: string | null} | null} | null
}) {
  const normalizedStatus = (order.orderV2?.status || order.status || '').toLowerCase()
  const normalizedPaymentStatus =
    (order.orderV2?.payment?.status || order.paymentStatus || '').toLowerCase()
  return (
    (normalizedStatus && EXPIRED_VALUE_SET.has(normalizedStatus)) ||
    (normalizedPaymentStatus && EXPIRED_VALUE_SET.has(normalizedPaymentStatus))
  )
}

export function filterOutExpiredOrders<T extends {status?: string | null; paymentStatus?: string | null}>(
  orders: T[],
) {
  return orders.filter((order: any) => !isExpiredOrder(order))
}
