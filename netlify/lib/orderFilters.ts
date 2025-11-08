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

export const GROQ_FILTER_EXCLUDE_EXPIRED =
  `!(defined(status) && lower(status) in ${GROQ_EXPIRED_ARRAY}) && ` +
  `!(defined(paymentStatus) && lower(paymentStatus) in ${GROQ_EXPIRED_ARRAY})`

export const GROQ_FILTER_ONLY_EXPIRED =
  `(defined(status) && lower(status) in ${GROQ_EXPIRED_ARRAY}) || ` +
  `(defined(paymentStatus) && lower(paymentStatus) in ${GROQ_EXPIRED_ARRAY})`

export function isExpiredOrder({
  status,
  paymentStatus,
}: {
  status?: string | null
  paymentStatus?: string | null
} = {}) {
  const normalizedStatus = (status || '').toLowerCase()
  const normalizedPaymentStatus = (paymentStatus || '').toLowerCase()
  return (
    (normalizedStatus && EXPIRED_VALUE_SET.has(normalizedStatus)) ||
    (normalizedPaymentStatus && EXPIRED_VALUE_SET.has(normalizedPaymentStatus))
  )
}

export function filterOutExpiredOrders<
  T extends {status?: string | null; paymentStatus?: string | null},
>(orders: T[]) {
  return orders.filter((order) => !isExpiredOrder(order))
}
