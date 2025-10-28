import Stripe from 'stripe'

type PaymentLike = Stripe.PaymentIntent | null | undefined
type SessionLike = Stripe.Checkout.Session | null | undefined
type ChargeLike = Stripe.Charge | null | undefined

type SummaryInput = {
  session?: SessionLike
  paymentIntent?: PaymentLike
  charge?: ChargeLike
  failureCode?: string
  failureMessage?: string
  eventType?: string
  eventCreated?: number | null
}

type CleanValue = string | number | boolean | null | undefined | CleanObject | CleanValue[]
type CleanObject = { [key: string]: CleanValue }

const toISOStringFromSeconds = (timestamp?: number | null) =>
  typeof timestamp === 'number' && Number.isFinite(timestamp) ? new Date(timestamp * 1000).toISOString() : undefined

const prune = (input: CleanObject): CleanObject => {
  const output: CleanObject = {}
  for (const [key, value] of Object.entries(input)) {
    if (value === null || value === undefined) continue
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) continue
      output[key] = trimmed
      continue
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) continue
      output[key] = value
      continue
    }
    if (typeof value === 'boolean') {
      output[key] = value
      continue
    }
    if (Array.isArray(value)) {
      const cleaned = value
        .map((entry) => {
          if (typeof entry === 'object' && entry) {
            return prune(entry as CleanObject)
          }
          return entry
        })
        .filter(
          (entry) =>
            entry !== null &&
            entry !== undefined &&
            (!Array.isArray(entry) || entry.length > 0) &&
            (typeof entry !== 'object' || Object.keys(entry as Record<string, unknown>).length > 0)
        )
      if (cleaned.length > 0) output[key] = cleaned as CleanValue[]
      continue
    }
    if (typeof value === 'object') {
      const cleaned = prune(value as CleanObject)
      if (Object.keys(cleaned).length > 0) output[key] = cleaned
      continue
    }
  }
  return output
}

const normalizeAddress = (address?: Stripe.Address | null, name?: string | null, email?: string | null, phone?: string | null) =>
  prune({
    name,
    email,
    phone,
    line1: address?.line1,
    line2: address?.line2,
    city: address?.city,
    state: address?.state || (address as any)?.province,
    postalCode: address?.postal_code,
    country: address?.country,
  })

const buildMetadataEntries = (sources: Array<{ data?: Record<string, string> | null; label: string }>) => {
  const entries: Array<{ key: string; value: string; source: string }> = []
  const seen = new Set<string>()
  for (const source of sources) {
    const data = source.data || {}
    for (const [key, rawValue] of Object.entries(data)) {
      const value = rawValue === undefined || rawValue === null ? '' : String(rawValue)
      if (!key) continue
      const dedupeKey = `${source.label}:${key}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      entries.push({ key, value, source: source.label })
    }
  }
  return entries
}

const buildAttemptEntries = (pi?: PaymentLike, charge?: ChargeLike) => {
  const attempts: Array<{ type: string; status?: string; created?: string; code?: string; message?: string }> = []

  const piAny = pi as any
  const lastError = piAny?.last_payment_error
  if (lastError) {
    attempts.push({
      type: 'payment_intent.last_payment_error',
      status: piAny?.status,
      created: toISOStringFromSeconds(lastError.created) || undefined,
      code: (lastError.code || lastError.decline_code || '') || undefined,
      message: lastError.message || undefined,
    })
  }

  const charges = charge ? [charge] : piAny?.charges?.data || []
  for (const ch of charges) {
    attempts.push({
      type: 'charge',
      status: ch.status || undefined,
      created: toISOStringFromSeconds(ch.created) || undefined,
      code: ch.failure_code || ch.outcome?.reason || undefined,
      message: ch.failure_message || ch.outcome?.seller_message || undefined,
    })
  }

  return attempts
}

const buildLineItemEntries = (session?: SessionLike) => {
  const lines = (session as any)?.display_items || (session as any)?.line_items
  if (!Array.isArray(lines)) return []
  return lines
    .map((item: any) =>
      prune({
        name: item?.custom?.name || item?.price?.product?.name || item?.description,
        sku: item?.price?.product?.metadata?.sku || item?.sku || item?.id,
        quantity: item?.quantity,
        amount: typeof item?.amount_subtotal === 'number' ? item.amount_subtotal / 100 : item?.amount_total,
        metadata: item?.price?.product?.metadata ? JSON.stringify(item.price.product.metadata) : undefined,
      })
    )
    .filter((entry) => Object.keys(entry).length > 0)
}

const buildPaymentMethodDetails = (pi?: PaymentLike, charge?: ChargeLike) => {
  const card = charge?.payment_method_details?.card || (pi as any)?.payment_method?.card
  const wallet = card?.wallet && typeof card.wallet === 'object' ? Object.keys(card.wallet)[0] : undefined

  return prune({
    type: charge?.payment_method_details?.type || pi?.payment_method_types?.[0],
    brand: card?.brand,
    last4: card?.last4,
    exp: card?.exp_month && card?.exp_year ? `${card.exp_month}/${card.exp_year}` : undefined,
    wallet,
    issuer: card?.issuer,
    riskLevel: charge?.outcome?.risk_level || (charge?.outcome?.risk_score !== undefined ? String(charge.outcome.risk_score) : undefined),
  })
}

export const buildStripeSummary = (input: SummaryInput): Record<string, any> => {
  const session = input.session || null
  const paymentIntent = input.paymentIntent || null
  const piAny = paymentIntent as any
  const sessionAny = session as any
  const charge =
    input.charge ||
    (paymentIntent?.latest_charge && typeof paymentIntent.latest_charge === 'object'
      ? (paymentIntent.latest_charge as Stripe.Charge)
      : piAny?.charges?.data?.[0]) ||
    null
  const chargeAny = charge as any

  const failureCode =
    input.failureCode ||
    piAny?.last_payment_error?.code ||
    piAny?.last_payment_error?.decline_code ||
    chargeAny?.failure_code ||
    undefined
  const failureMessage =
    input.failureMessage ||
    piAny?.last_payment_error?.message ||
    chargeAny?.failure_message ||
    chargeAny?.outcome?.seller_message ||
    undefined

  const summary = prune({
    updatedAt: new Date().toISOString(),
    status: paymentIntent?.status || session?.payment_status || session?.status,
    lastEventType: input.eventType,
    lastEventCreated: input.eventCreated ? new Date(input.eventCreated * 1000).toISOString() : undefined,
    failureCode,
    failureMessage,
    paymentIntentId: paymentIntent?.id,
    paymentIntentCreated: paymentIntent?.created ? new Date(paymentIntent.created * 1000).toISOString() : undefined,
    checkoutSessionId:
      session?.id ||
      (typeof (paymentIntent?.metadata as Record<string, any> | undefined)?.checkout_session_id === 'string'
        ? (paymentIntent?.metadata as Record<string, any>).checkout_session_id
        : undefined),
    checkoutStatus: session?.status || undefined,
    checkoutExpiresAt: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : undefined,
    checkoutUrl: session?.url,
    amounts: prune({
      total:
        typeof session?.amount_total === 'number'
          ? session.amount_total / 100
          : typeof piAny?.amount_received === 'number'
            ? piAny.amount_received / 100
          : undefined,
      subtotal:
        typeof session?.amount_subtotal === 'number'
          ? session.amount_subtotal / 100
          : typeof (session as any)?.amount_subtotal === 'number'
            ? (session as any).amount_subtotal / 100
            : undefined,
      tax:
        typeof session?.total_details?.amount_tax === 'number'
          ? session.total_details.amount_tax / 100
          : undefined,
      shipping:
        typeof session?.shipping_cost?.amount_total === 'number'
          ? session.shipping_cost.amount_total / 100
          : typeof piAny?.shipping?.amount_subtotal === 'number'
            ? piAny.shipping.amount_subtotal / 100
            : undefined,
      currency:
        (session?.currency || paymentIntent?.currency || chargeAny?.currency || '').toString().toUpperCase() || undefined,
      captured: typeof piAny?.amount_capturable === 'number' ? piAny.amount_capturable / 100 : undefined,
      refunded: typeof chargeAny?.amount_refunded === 'number' ? chargeAny.amount_refunded / 100 : undefined,
    }),
    customer: prune({
      id: typeof paymentIntent?.customer === 'string' ? paymentIntent.customer : undefined,
      email:
        session?.customer_details?.email ||
        session?.customer_email ||
        piAny?.receipt_email ||
        piAny?.shipping?.name ||
        undefined,
      name:
        session?.customer_details?.name ||
        piAny?.shipping?.name ||
        piAny?.billing_details?.name ||
        undefined,
      phone:
        session?.customer_details?.phone || piAny?.shipping?.phone || piAny?.billing_details?.phone,
      ipAddress: (session as any)?.client_reference_ip || undefined,
    }),
    paymentMethod: buildPaymentMethodDetails(paymentIntent, charge || null),
    shippingAddress: normalizeAddress(
      piAny?.shipping?.address || sessionAny?.shipping_details?.address || sessionAny?.customer_details?.address,
      piAny?.shipping?.name || sessionAny?.shipping_details?.name,
      session?.customer_details?.email || piAny?.shipping?.phone || undefined,
      session?.customer_details?.phone || piAny?.shipping?.phone
    ),
    billingAddress: normalizeAddress(
      piAny?.charges?.data?.[0]?.billing_details?.address ||
        session?.customer_details?.address ||
        piAny?.billing_details?.address,
      piAny?.charges?.data?.[0]?.billing_details?.name,
      piAny?.charges?.data?.[0]?.billing_details?.email,
      piAny?.charges?.data?.[0]?.billing_details?.phone
    ),
    lineItems: buildLineItemEntries(session || piAny?.line_items),
    metadata: buildMetadataEntries([
      { data: session?.metadata || null, label: 'checkout_session' },
      { data: (piAny?.metadata as Record<string, string>) || null, label: 'payment_intent' },
      { data: (chargeAny?.metadata as Record<string, string>) || null, label: 'charge' },
    ]),
    attempts: buildAttemptEntries(paymentIntent || null, charge || null),
  })

  return summary
}
