const ORDER_NUMBER_PREFIX = 'FAS'

function sanitizeOrderNumber(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.toString().trim().toUpperCase()
  if (!trimmed) return undefined
  if (/^FAS-\d{6}$/.test(trimmed)) return trimmed
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length >= 6) return `${ORDER_NUMBER_PREFIX}-${digits.slice(-6)}`
  return undefined
}

function orderNumberFromSessionId(id?: string | null): string | undefined {
  if (!id) return undefined
  const core = id.toString().trim().replace(/^cs_(?:test|live)_/i, '')
  const digits = core.replace(/\D/g, '')
  if (digits.length >= 6) return `${ORDER_NUMBER_PREFIX}-${digits.slice(-6)}`
  return undefined
}

type FormatOrderNumberOptions = {
  orderNumber?: string | null
  stripeSessionId?: string | null
  fallbackId?: string | null
}

function formatOrderNumberForDisplay(options: FormatOrderNumberOptions): string | undefined {
  return (
    sanitizeOrderNumber(options.orderNumber) ||
    orderNumberFromSessionId(options.stripeSessionId) ||
    sanitizeOrderNumber(options.fallbackId) ||
    undefined
  )
}

function normalizeEmail(value?: string | null): string {
  return (value ?? '').toString().trim()
}

function isValidEmail(value?: string | null): boolean {
  const normalized = normalizeEmail(value)
  if (!normalized) return false
  if (normalized.length > 254) return false
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) === false) return false
  return true
}

function resolveCustomerName(order: Record<string, any> | null | undefined): string {
  const rawName = (
    order?.customerName ||
    order?.shippingAddress?.name ||
    (order?.customerEmail ? String(order.customerEmail).split('@')[0] : '') ||
    ''
  ).toString()

  return rawName.trim()
}

function titleCase(value: string): string {
  return value
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

export {
  ORDER_NUMBER_PREFIX,
  formatOrderNumberForDisplay,
  isValidEmail,
  normalizeEmail,
  orderNumberFromSessionId,
  resolveCustomerName,
  sanitizeOrderNumber,
  titleCase,
}
