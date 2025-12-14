const RAW_EXPIRED_VALUES = [
  'expired',
  'checkout.session.expired',
  'stripe.checkout.session.expired',
  'checkout_session_expired',
  'incomplete_expired',
  'abandoned',
]

const RAW_CANCELED_VALUES = ['cancelled', 'canceled', 'refunded']
const RAW_REFUNDED_PAYMENT_VALUES = ['refunded']

const EXPIRED_VALUE_SET = new Set(RAW_EXPIRED_VALUES.map((value) => value.toLowerCase()))
const CANCELED_VALUE_SET = new Set(RAW_CANCELED_VALUES.map((value) => value.toLowerCase()))
const REFUNDED_PAYMENT_SET = new Set(
  RAW_REFUNDED_PAYMENT_VALUES.map((value) => value.toLowerCase()),
)

export const GROQ_EXPIRED_ARRAY = `[${RAW_EXPIRED_VALUES.map((value) => `"${value}"`).join(', ')}]`
export const GROQ_CANCELED_ARRAY = `[${RAW_CANCELED_VALUES.map((value) => `"${value}"`).join(', ')}]`
export const GROQ_REFUNDED_PAYMENT_ARRAY = `[${RAW_REFUNDED_PAYMENT_VALUES.map((value) => `"${value}"`).join(', ')}]`

export const GROQ_FILTER_EXCLUDE_EXPIRED =
  `!(defined(status) && lower(status) in ${GROQ_EXPIRED_ARRAY}) && ` +
  `!(defined(paymentStatus) && lower(paymentStatus) in ${GROQ_EXPIRED_ARRAY})`

export const GROQ_FILTER_ONLY_EXPIRED =
  `(defined(status) && lower(status) in ${GROQ_EXPIRED_ARRAY}) || ` +
  `(defined(paymentStatus) && lower(paymentStatus) in ${GROQ_EXPIRED_ARRAY})`

export const GROQ_FILTER_EXCLUDE_CANCELLED_REFUNDED =
  `!(defined(status) && lower(status) in ${GROQ_CANCELED_ARRAY}) && ` +
  `!(defined(paymentStatus) && lower(paymentStatus) in ${GROQ_REFUNDED_PAYMENT_ARRAY})`

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

export function isCanceledOrRefundedOrder({
  status,
  paymentStatus,
}: {
  status?: string | null
  paymentStatus?: string | null
} = {}) {
  const normalizedStatus = (status || '').toLowerCase()
  const normalizedPaymentStatus = (paymentStatus || '').toLowerCase()
  return (
    (normalizedStatus && CANCELED_VALUE_SET.has(normalizedStatus)) ||
    (normalizedPaymentStatus && REFUNDED_PAYMENT_SET.has(normalizedPaymentStatus))
  )
}

export function filterOutExpiredOrders<
  T extends {status?: string | null; paymentStatus?: string | null},
>(orders: T[]) {
  return orders.filter((order) => !isExpiredOrder(order))
}

export function filterOutCanceledOrRefundedOrders<
  T extends {status?: string | null; paymentStatus?: string | null},
>(orders: T[]) {
  return orders.filter((order) => !isCanceledOrRefundedOrder(order))
}
