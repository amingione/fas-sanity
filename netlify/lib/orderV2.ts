import type {CartItem} from './cartEnrichment'

type StripeEventLogInput = {
  eventType?: string | null
  timestamp?: string | null
  details?: string | null
}

type RefundInput = {
  refundId?: string | null
  amount?: number | null
  date?: string | null
  reason?: string | null
}

type DisputeInput = {
  disputeId?: string | null
  status?: string | null
  date?: string | null
  reason?: string | null
}

export interface BuildOrderV2Input {
  orderId?: string | null
  createdAt?: string | null
  status?: string | null
  customerId?: string | null
  customerRef?: {_ref?: string | null} | null
  customerName?: string | null
  customerEmail?: string | null
  customerPhone?: string | null
  shippingAddress?: Record<string, any> | null
  cart?: CartItem[] | null
  subtotal?: number | null
  discount?: number | null
  shippingFee?: number | null
  tax?: number | null
  total?: number | null
  paymentStatus?: string | null
  stripePaymentIntentId?: string | null
  stripeChargeId?: string | null
  receiptUrl?: string | null
  paymentMethod?: string | null
  cardBrand?: string | null
  shippingCarrier?: string | null
  shippingServiceName?: string | null
  shippingTrackingNumber?: string | null
  shippingStatus?: string | null
  shippingEstimatedDelivery?: string | null
  notes?: string | null
  webhookStatus?: string | null
  webhookNotified?: boolean | null
  lastSync?: string | null
  failureReason?: string | null
  refunds?: RefundInput[] | null
  disputes?: DisputeInput[] | null
  stripeEventLog?: StripeEventLogInput[] | null
}

const isObject = (value: unknown): value is Record<string, any> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

const emptyToUndefined = <T>(value: T): T | undefined => {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string' && value.trim() === '') return undefined
  if (Array.isArray(value) && value.length === 0) return undefined
  if (isObject(value) && Object.keys(value).length === 0) return undefined
  return value
}

const prune = <T>(value: T): T | undefined => {
  if (Array.isArray(value)) {
    const pruned = value
      .map((entry) => prune(entry))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)
    return emptyToUndefined(pruned) as T | undefined
  }

  if (isObject(value)) {
    const result: Record<string, unknown> = {}
    for (const [key, raw] of Object.entries(value)) {
      const next = prune(raw)
      if (next !== undefined) {
        result[key] = next
      }
    }
    return emptyToUndefined(result) as T | undefined
  }

  return emptyToUndefined(value)
}

const mapOptions = (details: unknown): any[] | undefined => {
  if (!Array.isArray(details)) return undefined
  const mapped = details
    .map((detail) => {
      if (typeof detail !== 'string') return undefined
      const [rawName, ...rawValue] = detail.split(':')
      const name = rawValue.length ? rawName?.trim() : undefined
      const value = rawValue.length ? rawValue.join(':').trim() : rawName?.trim()
      return prune({
        optionId: undefined,
        optionName: name || value,
        optionValue: value,
      })
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
  return prune(mapped)
}

const mapUpgrades = (upgrades: unknown): any[] | undefined => {
  if (!Array.isArray(upgrades)) return undefined
  const mapped = upgrades
    .map((upgrade) => {
      if (typeof upgrade !== 'string') return undefined
      const [id, ...rest] = upgrade.split(':')
      const value = rest.join(':').trim()
      return prune({
        upgradeId: undefined,
        upgradeName: value ? id.trim() : upgrade.trim(),
        upgradeValue: value || undefined,
      })
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
  return prune(mapped)
}

const mapItems = (cart: CartItem[] | null | undefined) => {
  if (!Array.isArray(cart)) return undefined
  const mapped = cart
    .map((item) =>
      prune({
        productId: item.id || item.sku || undefined,
        productName: item.name || item.productName || undefined,
        quantity: item.quantity,
        price: item.price,
        lineTotal: item.lineTotal,
        total: item.total,
        options: mapOptions(item.optionDetails),
        upgrades: mapUpgrades(item.upgrades),
        customizations: mapOptions(item.customizations),
        productRef: item.productRef,
        validationIssues:
          Array.isArray(item.validationIssues) && item.validationIssues.length
            ? item.validationIssues
            : undefined,
      }),
    )
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
  return prune(mapped)
}

const resolveCustomerId = (
  customerId?: string | null,
  customerRef?: {_ref?: string | null} | null,
): string | undefined => {
  if (customerId && customerId.trim()) return customerId.trim()
  const ref = customerRef?._ref
  return ref && ref.trim() ? ref.trim() : undefined
}

const mapShippingAddress = (address: Record<string, any> | null | undefined) => {
  if (!isObject(address)) return undefined
  let street =
    address.street ||
    address.addressLine1 ||
    address.line1 ||
    [address.addressLine1, address.addressLine2].filter(Boolean).join(' ') ||
    undefined

  let city = address.city || address.locality || undefined
  let state = address.state || address.region || undefined
  let zip = address.zip || address.postalCode || address.postal_code || undefined

  if (street && !city && !state && !zip) {
    const parsed = parseLegacyCombinedStreet(street)
    if (parsed) {
      street = parsed.street
      city = parsed.city || city
      state = parsed.state || state
      zip = parsed.zip || zip
    }
  }

  return prune({
    street,
    city,
    state,
    zip,
    country: address.country,
  })
}

const parseLegacyCombinedStreet = (value: string):
  | {street: string; city?: string; state?: string; zip?: string}
  | null => {
  const trimmed = value.trim()
  if (!trimmed) return null
  const pattern = /^(.+?)\s+([A-Za-z.\s-]+?),?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/
  const match = trimmed.match(pattern)
  if (!match) return null
  const [, street, city, state, zip] = match
  return {
    street: street.trim(),
    city: city?.trim() || undefined,
    state: state?.trim() || undefined,
    zip: zip?.trim() || undefined,
  }
}

const mapRefunds = (refunds: RefundInput[] | null | undefined) => {
  if (!Array.isArray(refunds)) return undefined
  return prune(
    refunds
      .map((refund) =>
        prune({
          refundId: refund.refundId,
          amount: refund.amount,
          date: refund.date,
          reason: refund.reason,
        }),
      )
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
  )
}

const mapDisputes = (disputes: DisputeInput[] | null | undefined) => {
  if (!Array.isArray(disputes)) return undefined
  return prune(
    disputes
      .map((dispute) =>
        prune({
          disputeId: dispute.disputeId,
          status: dispute.status,
          date: dispute.date,
          reason: dispute.reason,
        }),
      )
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
  )
}

const mapEventLog = (events: StripeEventLogInput[] | null | undefined) => {
  if (!Array.isArray(events)) return undefined
  return prune(
    events
      .map((event) =>
        prune({
          eventType: event.eventType,
          timestamp: event.timestamp,
          details: event.details,
        }),
      )
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
  )
}

const deriveWebhookStatus = (
  webhookStatus?: string | null,
  webhookNotified?: boolean | null,
): string | undefined => {
  if (webhookStatus && webhookStatus.trim()) return webhookStatus.trim()
  if (webhookNotified === true) return 'sent'
  if (webhookNotified === false) return 'pending'
  return undefined
}

const buildPaymentMethod = (explicit?: string | null, cardBrand?: string | null) => {
  if (explicit && explicit.trim()) return explicit.trim()
  if (cardBrand && cardBrand.trim()) return `card:${cardBrand.trim().toLowerCase()}`
  return undefined
}

export function buildOrderV2Record(input: BuildOrderV2Input) {
  const normalizedDiscount =
    typeof input.discount === 'number' && input.discount > 0 ? input.discount : undefined
  const normalizedShippingFee =
    typeof input.shippingFee === 'number' && input.shippingFee >= 0 ? input.shippingFee : undefined
  const normalizedTax =
    typeof input.tax === 'number' && input.tax >= 0 ? input.tax : undefined
  const normalizedSubtotal =
    typeof input.subtotal === 'number' && input.subtotal >= 0 ? input.subtotal : undefined
  const normalizedTotal =
    typeof input.total === 'number' && input.total >= 0 ? input.total : undefined

  const orderV2 = prune({
    orderId: input.orderId,
    createdAt: input.createdAt,
    status: input.status,
    customer: prune({
      customerId: resolveCustomerId(input.customerId ?? undefined, input.customerRef),
      name: input.customerName,
      email: input.customerEmail,
      phone: input.customerPhone,
      shippingAddress: mapShippingAddress(input.shippingAddress ?? undefined),
    }),
    items: mapItems(input.cart ?? undefined),
    orderSummary: prune({
      subtotal: normalizedSubtotal,
      discount: normalizedDiscount,
      shippingFee: normalizedShippingFee,
      tax: normalizedTax,
      total: normalizedTotal,
    }),
    payment: prune({
      status: input.paymentStatus,
      stripePaymentIntentId: input.stripePaymentIntentId,
      stripeChargeId: input.stripeChargeId,
      receiptUrl: input.receiptUrl,
      method: buildPaymentMethod(input.paymentMethod, input.cardBrand),
    }),
    shipping: prune({
      carrier: input.shippingCarrier,
      serviceName: input.shippingServiceName,
      trackingNumber: input.shippingTrackingNumber,
      status: input.shippingStatus,
      estimatedDelivery: input.shippingEstimatedDelivery,
    }),
    notes: input.notes,
    admin: prune({
      webhookStatus: deriveWebhookStatus(input.webhookStatus, input.webhookNotified),
      lastSync: input.lastSync,
      stripeEventLog: mapEventLog(input.stripeEventLog ?? undefined),
      failureReason: input.failureReason,
      refunds: mapRefunds(input.refunds ?? undefined),
      disputes: mapDisputes(input.disputes ?? undefined),
    }),
  })

  return orderV2 ?? {}
}
