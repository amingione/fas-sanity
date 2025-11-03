export type OrderV2Snapshot = {
  orderId?: string | null
  createdAt?: string | null
  status?: string | null
  customer?: {
    customerId?: string | null
    name?: string | null
    email?: string | null
    phone?: string | null
    shippingAddress?: {
      street?: string | null
      city?: string | null
      state?: string | null
      zip?: string | null
      country?: string | null
    } | null
  } | null
  orderSummary?: {
    subtotal?: number | null
    discount?: number | null
    shippingFee?: number | null
    tax?: number | null
    total?: number | null
  } | null
  payment?: {
    status?: string | null
    stripePaymentIntentId?: string | null
    stripeChargeId?: string | null
    receiptUrl?: string | null
    method?: string | null
  } | null
  shipping?: {
    carrier?: string | null
    serviceName?: string | null
    trackingNumber?: string | null
    status?: string | null
    estimatedDelivery?: string | null
  } | null
  notes?: string | null
  admin?: {
    webhookStatus?: string | null
    lastSync?: string | null
    stripeEventLog?: Array<{
      eventType?: string | null
      timestamp?: string | null
      details?: string | null
    }> | null
    failureReason?: string | null
    refunds?: Array<{
      refundId?: string | null
      amount?: number | null
      date?: string | null
      reason?: string | null
    }> | null
    disputes?: Array<{
      disputeId?: string | null
      status?: string | null
      date?: string | null
      reason?: string | null
    }> | null
  } | null
}

export type OrderDocumentSnapshot = {
  _id?: string
  _type?: string
  _createdAt?: string
  _updatedAt?: string
  orderNumber?: string | null
  status?: string | null
  paymentStatus?: string | null
  customerName?: string | null
  customerEmail?: string | null
  shippingAddress?: {name?: string | null; [key: string]: unknown} | null
  totalAmount?: number | null
  amountSubtotal?: number | null
  amountTax?: number | null
  amountShipping?: number | null
  amountRefunded?: number | null
  currency?: string | null
  createdAt?: string | null
  stripeSessionId?: string | null
  orderV2?: OrderV2Snapshot | null
  [key: string]: unknown
}

export type OrderDisplayData = {
  identifiers: string[]
  orderId?: string
  legacyOrderNumber?: string
  status?: string
  paymentStatus?: string
  customerName?: string
  customerEmail?: string
  customerPhone?: string
  shippingName?: string
  totalAmount?: number
  subtotal?: number
  tax?: number
  discount?: number
  shippingFee?: number
  amountRefunded?: number
  currency?: string
  createdAt?: string
  shippingEstimatedDelivery?: string
  shippingCarrier?: string
  shippingServiceName?: string
  shippingTrackingNumber?: string
  failureReason?: string
  orderV2?: OrderV2Snapshot | null
}

const coerceNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

const sumRefunds = (
  refunds?: Array<{amount?: number | null}> | null,
): number | undefined => {
  if (!Array.isArray(refunds)) return undefined
  const total = refunds.reduce((acc, refund) => {
    const amount = refund?.amount
    return typeof amount === 'number' ? acc + amount : acc
  }, 0)
  return total > 0 ? total : undefined
}

export const deriveOrderDisplay = (doc: OrderDocumentSnapshot): OrderDisplayData => {
  const v2 = doc?.orderV2 || undefined
  const admin = v2?.admin || undefined
  const summary = v2?.orderSummary || undefined
  const payment = v2?.payment || undefined
  const shipping = v2?.shipping || undefined
  const customer = v2?.customer || undefined
  const shippingAddress =
    customer?.shippingAddress || doc?.shippingAddress || (shipping as any)?.address || undefined

  const identifiers = [
    v2?.orderId,
    doc.orderNumber,
    (doc as any)?.invoiceRef?.orderNumber,
    (doc as any)?.invoiceRef?.invoiceNumber,
    doc.stripeSessionId,
    doc._id,
  ]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)

  const normalizedDiscount = (() => {
    const value = coerceNumber(summary?.discount)
    return value && value > 0 ? value : undefined
  })()

  const amountRefundedFromAdmin = sumRefunds((admin?.refunds as any) || undefined)
  const amountRefunded =
    coerceNumber(doc.amountRefunded) ??
    (typeof amountRefundedFromAdmin === 'number' ? amountRefundedFromAdmin : undefined)

  const createdAt =
    v2?.createdAt ||
    doc.createdAt ||
    doc._createdAt ||
    (Array.isArray(doc._updatedAt) ? doc._updatedAt[0] : doc._updatedAt) ||
    undefined

  return {
    identifiers,
    orderId: identifiers[0],
    legacyOrderNumber: doc.orderNumber || undefined,
    status: (v2?.status || doc.status || undefined) || undefined,
    paymentStatus: (payment?.status || doc.paymentStatus || undefined) || undefined,
    customerName: (customer?.name || doc.customerName || undefined) || undefined,
    customerEmail: (customer?.email || doc.customerEmail || undefined) || undefined,
    customerPhone: customer?.phone || undefined,
    shippingName: (shippingAddress as any)?.name || doc.customerName || undefined,
    totalAmount:
      coerceNumber(summary?.total) ??
      coerceNumber(doc.totalAmount) ??
      coerceNumber(doc.amountSubtotal),
    subtotal: coerceNumber(summary?.subtotal) ?? coerceNumber(doc.amountSubtotal),
    tax: coerceNumber(summary?.tax) ?? coerceNumber(doc.amountTax),
    discount: normalizedDiscount,
    shippingFee: (() => {
      const values = [
        coerceNumber(summary?.shippingFee),
        coerceNumber(doc.amountShipping),
        shipping?.status ? coerceNumber((shipping as any)?.amount) : undefined,
      ]
      const first = values.find((value) => typeof value === 'number' && value >= 0)
      return typeof first === 'number' ? first : undefined
    })(),
    amountRefunded,
    currency: (doc.currency || 'USD') || 'USD',
    createdAt,
    shippingEstimatedDelivery: shipping?.estimatedDelivery || undefined,
    shippingCarrier: shipping?.carrier || (doc as any)?.shippingCarrier || undefined,
    shippingServiceName:
      shipping?.serviceName || (doc as any)?.shippingServiceName || undefined,
    shippingTrackingNumber:
      shipping?.trackingNumber || (doc as any)?.trackingNumber || undefined,
    failureReason: admin?.failureReason || undefined,
    orderV2: v2 || null,
  }
}
