// NOTE: orderId is deprecated; prefer orderNumber for identifiers.
import type {SanityClient} from '@sanity/client'
import {mapStripeMetadata} from './stripeMetadata'
import {filterOutExpiredOrders, GROQ_FILTER_EXCLUDE_EXPIRED} from './orderFilters'

type ShippingLike = {
  name?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  street?: string | null
  street1?: string | null
  street2?: string | null
  city?: string | null
  state?: string | null
  stateProvince?: string | null
  region?: string | null
  postalCode?: string | null
  postal_code?: string | null
  zip?: string | null
  country?: string | null
  country_code?: string | null
  email?: string | null
  phone?: string | null
  label?: string | null
}

type UpdateCustomerArgs = {
  sanity: SanityClient
  orderId?: string | null
  customerId?: string | null
  email?: string | null
  userId?: string | null
  shippingAddress?: ShippingLike | null
  billingAddress?: ShippingLike | null
  stripeCustomerId?: string | null
  stripeSyncTimestamp?: string | null
  customerName?: string | null
  metadata?: Record<string, unknown> | null
  defaultRoles?: string[]
  emailOptIn?: boolean | null
  marketingOptIn?: boolean | null
  textOptIn?: boolean | null
}

function splitName(value?: string | null): {firstName?: string; lastName?: string} {
  if (!value) return {}
  const trimmed = value.trim()
  if (!trimmed) return {}
  const parts = trimmed.split(/\s+/)
  const firstName = parts.shift()
  const lastName = parts.length ? parts.join(' ') : undefined
  return {
    firstName: firstName || undefined,
    lastName: lastName || undefined,
  }
}

function normalizeShippingAddress(address: ShippingLike | null | undefined) {
  if (!address) return undefined
  const line1 =
    address.addressLine1 ||
    address.street ||
    address.street1 ||
    (typeof address === 'object' && 'address' in address ? (address as any).address : undefined)
  const line2 = address.addressLine2 || address.street2 || undefined
  const city = address.city || undefined
  const state = address.state || address.stateProvince || address.region || undefined
  const postalCode = address.postalCode || address.postal_code || address.zip || undefined
  const country = address.country || address.country_code || undefined
  if (!line1 && !city && !postalCode) return undefined
  return {
    _type: 'customerBillingAddress' as const,
    name: address.name || undefined,
    street: line1 || undefined,
    street2: line2 || undefined,
    city: city || undefined,
    state: state || undefined,
    postalCode: postalCode || undefined,
    country: country || undefined,
  }
}

type CustomerAddressEntry = {
  _type: 'customerAddress'
  label?: string
  street?: string
  city?: string
  state?: string
  zip?: string
  country?: string
}

function toCustomerAddressEntry(
  address: ShippingLike | undefined,
  labelHint?: string,
): CustomerAddressEntry | undefined {
  if (!address) return undefined
  const street = address.addressLine1 || address.street || address.street1 || undefined
  const city = address.city || undefined
  const state = address.state || address.stateProvince || address.region || undefined
  const zip = address.postalCode || address.postal_code || address.zip || undefined
  const country = address.country || address.country_code || undefined
  if (!street && !city && !zip) return undefined
  return {
    _type: 'customerAddress',
    label: labelHint || address.name || address.label || 'Shipping',
    street: street || undefined,
    city: city || undefined,
    state: state || undefined,
    zip: zip || undefined,
    country: country || undefined,
  }
}

function addressKey(entry?: CustomerAddressEntry | null): string {
  if (!entry) return ''
  return [
    entry.street || '',
    entry.city || '',
    entry.state || '',
    entry.zip || '',
    entry.country || '',
  ]
    .map((part) => (part || '').trim().toLowerCase())
    .join('|')
}

export async function updateCustomerProfileForOrder({
  sanity,
  orderId,
  customerId: initialCustomerId,
  email: rawEmail,
  userId,
  shippingAddress: shippingFromOrder,
  billingAddress,
  stripeCustomerId,
  stripeSyncTimestamp,
  customerName,
  metadata,
  defaultRoles,
  emailOptIn,
  marketingOptIn,
  textOptIn,
}: UpdateCustomerArgs): Promise<string | null> {
  const email = (rawEmail || '').toLowerCase().trim()
  if (!initialCustomerId && !email) return null
  const nowIso = new Date().toISOString()

  let customerId = initialCustomerId || null
  let customerDoc: any = null

  if (customerId) {
    customerDoc = await sanity.fetch(
      `*[_type == "customer" && _id == $id][0]{_id, addresses, shippingAddress, address, stripeCustomerId, firstName, lastName, email}`,
      {id: customerId},
    )
  }
  if (!customerDoc && email) {
    customerDoc = await sanity.fetch(
      `*[_type == "customer" && email == $email][0]{_id, addresses, shippingAddress, address, stripeCustomerId, firstName, lastName, email}`,
      {email},
    )
  }
  if (customerDoc) {
    customerId = customerDoc._id
  }

  const shippingNormalized = normalizeShippingAddress(shippingFromOrder)
  const billingNormalized = normalizeShippingAddress(billingAddress)
  const legacyShippingString = shippingNormalized
    ? [
        shippingNormalized.street,
        shippingNormalized.city,
        shippingNormalized.state,
        shippingNormalized.postalCode,
        shippingNormalized.country,
      ]
        .filter(Boolean)
        .join(', ')
    : undefined

  // Create a customer document if none exists but we have an email.
  if (!customerId && email) {
    const nameParts = splitName(shippingFromOrder?.name || customerName || '')
    const metadataEntries = mapStripeMetadata(metadata as Record<string, unknown> | null)
    const roles = Array.isArray(defaultRoles) && defaultRoles.length ? defaultRoles : ['customer']
    const payload: Record<string, any> = {
      _type: 'customer',
      email,
      userId: userId || undefined,
      roles,
      firstName: nameParts.firstName || undefined,
      lastName: nameParts.lastName || undefined,
      shippingAddress: shippingNormalized,
      address: legacyShippingString || undefined,
      addresses: shippingNormalized
        ? [
            {
              _type: 'customerAddress',
              label: shippingFromOrder?.name || 'Shipping',
              street: shippingNormalized.street,
              city: shippingNormalized.city,
              state: shippingNormalized.state,
              zip: shippingNormalized.postalCode,
              country: shippingNormalized.country,
            },
          ]
        : undefined,
      billingAddress: billingNormalized,
      stripeCustomerId: stripeCustomerId || undefined,
      stripeLastSyncedAt: stripeSyncTimestamp || undefined,
      ...(shippingFromOrder?.phone ? {phone: shippingFromOrder.phone} : {}),
      ...(metadataEntries ? {stripeMetadata: metadataEntries} : {}),
      emailOptIn: typeof emailOptIn === 'boolean' ? emailOptIn : false,
      marketingOptIn: typeof marketingOptIn === 'boolean' ? marketingOptIn : false,
      textOptIn: typeof textOptIn === 'boolean' ? textOptIn : false,
      updatedAt: nowIso,
    }
    try {
      const created = await sanity.create(payload as any, {autoGenerateArrayKeys: true})
      if (created?._id) {
        customerId = created._id
        customerDoc = {...payload, _id: created._id}
      }
    } catch (err) {
      console.warn('customerSnapshot: failed to create customer', err)
      return null
    }
  }

  if (!customerId) return null

  const stats = await sanity.fetch(
    `{
      "orders": *[_type == "order" && (${GROQ_FILTER_EXCLUDE_EXPIRED}) && (
        ($id != "" && customerRef._ref == $id) ||
        ($email != "" && customerEmail == $email)
      )] | order(coalesce(orderDate, createdAt, _createdAt) desc)[0...10]{
        orderNumber,
        status,
        "orderDate": coalesce(orderDate, createdAt, _createdAt),
        "totalAmount": coalesce(totalAmount, amountSubtotal - coalesce(amountDiscount, 0) + amountTax + amountShipping, totalAmount, total)
      },
      "orderCount": count(*[_type == "order" && (${GROQ_FILTER_EXCLUDE_EXPIRED}) && (
        ($id != "" && customerRef._ref == $id) ||
        ($email != "" && customerEmail == $email)
      )]),
      "orderTotals": *[_type == "order" && (${GROQ_FILTER_EXCLUDE_EXPIRED}) && (
        ($id != "" && customerRef._ref == $id) ||
        ($email != "" && customerEmail == $email)
      ) && status != "cancelled"]{
        "amount": coalesce(totalAmount, amountSubtotal - coalesce(amountDiscount, 0) + amountTax + amountShipping, totalAmount, total)
      },
      "quotes": *[_type == "quote" && (
        ($id != "" && (customer._ref == $id || customerRef._ref == $id)) ||
        ($email != "" && (customer->email == $email || billTo.email == $email))
      )] | order(coalesce(createdAt, _createdAt) desc)[0...10]{
        "quoteId": coalesce(quoteNumber, _id),
        status,
        "dateRequested": coalesce(createdAt, _createdAt),
        notes
      },
      "quoteCount": count(*[_type == "quote" && (
        ($id != "" && (customer._ref == $id || customerRef._ref == $id)) ||
        ($email != "" && (customer->email == $email || billTo.email == $email))
      )]),
      "shippingDocs": *[_type == "order" && (${GROQ_FILTER_EXCLUDE_EXPIRED}) && (
        ($id != "" && customerRef._ref == $id) ||
        ($email != "" && customerEmail == $email)
      ) && defined(shippingAddress.addressLine1)]{
        shippingAddress
      }
    }`,
    {id: customerId, email},
  )

  const orderSummaries = Array.isArray(stats?.orders)
    ? filterOutExpiredOrders(stats.orders)
        .map((order: any) => ({
          _type: 'customerOrderSummary' as const,
          orderNumber: order?.orderNumber || '',
          status: order?.status || '',
          orderDate: order?.orderDate || null,
          total: typeof order?.totalAmount === 'number' ? Number(order.totalAmount) : undefined,
        }))
        .filter((entry: any) => entry.orderNumber)
    : []

  const dedupedOrders: typeof orderSummaries = []
  const orderKeys = new Set<string>()
  for (const entry of orderSummaries) {
    const key =
      (entry?.orderNumber || '')
        .toString()
        .trim()
        .toUpperCase() || `${entry?.orderNumber || ''}|${entry?.orderDate || ''}`
    if (key && orderKeys.has(key)) continue
    if (key) orderKeys.add(key)
    dedupedOrders.push(entry)
  }

  const lifetimeSpend = Array.isArray(stats?.orderTotals)
    ? stats.orderTotals.reduce((sum: number, entry: any) => {
        const amount = typeof entry?.amount === 'number' ? entry.amount : Number(entry?.amount || 0)
        return sum + (Number.isFinite(amount) ? amount : 0)
      }, 0)
    : 0

  const quoteSummaries = Array.isArray(stats?.quotes)
    ? stats.quotes
        .map((quote: any) => ({
          _type: 'customerQuoteSummary' as const,
          quoteId: quote?.quoteId || '',
          status: quote?.status || '',
          dateRequested: quote?.dateRequested || null,
          notes: typeof quote?.notes === 'string' ? quote.notes : undefined,
        }))
        .filter((entry: any) => entry.quoteId)
    : []

  const addressesSet = new Map<string, CustomerAddressEntry>()

  const existingAddresses: CustomerAddressEntry[] = Array.isArray(customerDoc?.addresses)
    ? (customerDoc.addresses as any[])
        .map((addr) => toCustomerAddressEntry(addr, addr?.label || undefined))
        .filter((entry): entry is CustomerAddressEntry => Boolean(entry))
    : []
  existingAddresses.forEach((entry) => {
    const key = addressKey(entry)
    if (key) addressesSet.set(key, entry as CustomerAddressEntry)
  })

  if (customerDoc?.address && typeof customerDoc.address === 'string') {
    const legacyEntry = toCustomerAddressEntry({addressLine1: customerDoc.address}, 'Shipping')
    const key = addressKey(legacyEntry)
    if (key && legacyEntry) addressesSet.set(key, legacyEntry)
  }

  if (shippingNormalized) {
    const shippingEntry: CustomerAddressEntry = {
      _type: 'customerAddress',
      label: shippingFromOrder?.name || 'Shipping',
      street: shippingNormalized.street,
      city: shippingNormalized.city,
      state: shippingNormalized.state,
      zip: shippingNormalized.postalCode,
      country: shippingNormalized.country,
    }
    const key = addressKey(shippingEntry)
    if (key) addressesSet.set(key, shippingEntry)
  }

  if (billingNormalized) {
    const billingEntry: CustomerAddressEntry = {
      _type: 'customerAddress',
      label: billingAddress?.name || 'Billing',
      street: billingNormalized.street,
      city: billingNormalized.city,
      state: billingNormalized.state,
      zip: billingNormalized.postalCode,
      country: billingNormalized.country,
    }
    const key = addressKey(billingEntry)
    if (key) addressesSet.set(key, billingEntry)
  }

  if (Array.isArray(stats?.shippingDocs)) {
    stats.shippingDocs.forEach((doc: any) => {
      const addrEntry = toCustomerAddressEntry(doc?.shippingAddress)
      if (!addrEntry) return
      const key = addressKey(addrEntry)
      if (key) addressesSet.set(key, addrEntry)
    })
  }

  const addressesArray = Array.from(addressesSet.values()).slice(0, 10)

  const nameParts = splitName(shippingFromOrder?.name || customerName || '')

  const patch: Record<string, any> = {
    orderCount: typeof stats?.orderCount === 'number' ? stats.orderCount : dedupedOrders.length,
    quoteCount: typeof stats?.quoteCount === 'number' ? stats.quoteCount : quoteSummaries.length,
    lifetimeSpend: Number(lifetimeSpend.toFixed(2)),
    orders: dedupedOrders,
    quotes: quoteSummaries,
    updatedAt: nowIso,
  }

  if (shippingNormalized) patch.shippingAddress = shippingNormalized
  if (billingNormalized) patch.billingAddress = billingNormalized
  if (addressesArray.length) patch.addresses = addressesArray
  if (stripeCustomerId) patch.stripeCustomerId = stripeCustomerId
  if (stripeSyncTimestamp) patch.stripeLastSyncedAt = stripeSyncTimestamp
  if (legacyShippingString) patch.address = legacyShippingString
  if (nameParts.firstName && !customerDoc?.firstName) patch.firstName = nameParts.firstName
  if (nameParts.lastName && !customerDoc?.lastName) patch.lastName = nameParts.lastName
  if (shippingFromOrder?.phone && !customerDoc?.phone) patch.phone = shippingFromOrder.phone
  if (userId && !customerDoc?.userId) patch.userId = userId
  if (typeof emailOptIn === 'boolean') patch.emailOptIn = emailOptIn
  else if (typeof customerDoc?.emailOptIn === 'undefined') patch.emailOptIn = false
  if (typeof marketingOptIn === 'boolean') patch.marketingOptIn = marketingOptIn
  else if (typeof customerDoc?.marketingOptIn === 'undefined') patch.marketingOptIn = false
  if (typeof textOptIn === 'boolean') patch.textOptIn = textOptIn
  else if (typeof customerDoc?.textOptIn === 'undefined') patch.textOptIn = false

  const metadataEntries = mapStripeMetadata(metadata as Record<string, unknown> | null)
  if (metadataEntries) patch.stripeMetadata = metadataEntries

  const roles = Array.isArray(defaultRoles) && defaultRoles.length ? defaultRoles : ['customer']
  const hasRoles = Array.isArray(customerDoc?.roles) && customerDoc.roles.length
  if (!hasRoles && roles.length) patch.roles = roles

  try {
    await sanity.patch(customerId).set(patch).commit({autoGenerateArrayKeys: true})
  } catch (err) {
    console.warn('customerSnapshot: failed to update customer aggregate fields', err)
  }

  if (orderId) {
    try {
      await sanity
        .patch(orderId)
        .set({customerRef: {_type: 'reference', _ref: customerId}})
        .commit({autoGenerateArrayKeys: true})
    } catch (err) {
      console.warn('customerSnapshot: failed to ensure order.customerRef linkage', err)
    }
  }

  return customerId
}
