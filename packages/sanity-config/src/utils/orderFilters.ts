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

const LOWER_STATUS = 'lower(status)'
const LOWER_PAYMENT_STATUS = 'lower(paymentStatus)'

export const GROQ_FILTER_EXCLUDE_EXPIRED = `!(${LOWER_STATUS} in ${GROQ_EXPIRED_ARRAY}) && !(${LOWER_PAYMENT_STATUS} in ${GROQ_EXPIRED_ARRAY})`

export const GROQ_FILTER_ONLY_EXPIRED = `(${LOWER_STATUS} in ${GROQ_EXPIRED_ARRAY}) || (${LOWER_PAYMENT_STATUS} in ${GROQ_EXPIRED_ARRAY})`

export const GROQ_FILTER_EXCLUDE_CANCELLED_REFUNDED = `!(${LOWER_STATUS} in ${GROQ_CANCELED_ARRAY}) && !(${LOWER_PAYMENT_STATUS} in ${GROQ_REFUNDED_PAYMENT_ARRAY})`

export const EXPIRED_SESSION_PANEL_TITLE = 'Expired Checkout Sessions'

export function isExpiredOrder(order: {status?: string | null; paymentStatus?: string | null}) {
  const normalizedStatus = (order.status || '').toLowerCase()
  const normalizedPaymentStatus = (order.paymentStatus || '').toLowerCase()
  return (
    (normalizedStatus && EXPIRED_VALUE_SET.has(normalizedStatus)) ||
    (normalizedPaymentStatus && EXPIRED_VALUE_SET.has(normalizedPaymentStatus))
  )
}

export function isCanceledOrRefundedOrder(order: {
  status?: string | null
  paymentStatus?: string | null
}) {
  const normalizedStatus = (order.status || '').toLowerCase()
  const normalizedPaymentStatus = (order.paymentStatus || '').toLowerCase()
  return (
    (normalizedStatus && CANCELED_VALUE_SET.has(normalizedStatus)) ||
    (normalizedPaymentStatus && REFUNDED_PAYMENT_SET.has(normalizedPaymentStatus))
  )
}

export function filterOutExpiredOrders<
  T extends {status?: string | null; paymentStatus?: string | null},
>(orders: T[]) {
  return orders.filter((order: any) => !isExpiredOrder(order))
}

export function filterOutCanceledOrRefundedOrders<
  T extends {status?: string | null; paymentStatus?: string | null},
>(orders: T[]) {
  return orders.filter((order: any) => !isCanceledOrRefundedOrder(order))
}
