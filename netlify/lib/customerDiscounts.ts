import type Stripe from 'stripe'
import type {SanityClient} from '@sanity/client'
import {mapStripeMetadata} from './stripeMetadata'

type CustomerDiscountEntry = {
  _type: 'customerDiscount'
  stripeDiscountId: string
  stripeCouponId?: string
  couponName?: string
  promotionCodeId?: string
  percentOff?: number
  amountOff?: number
  currency?: string
  duration?: string
  durationInMonths?: number
  redeemBy?: string
  startsAt?: string
  endsAt?: string
  createdAt?: string
  maxRedemptions?: number
  timesRedeemed?: number
  valid?: boolean
  livemode?: boolean
  metadata?: ReturnType<typeof mapStripeMetadata>
  status?: 'active' | 'scheduled' | 'expired'
  stripeLastSyncedAt: string
}

function toIso(timestamp?: number | null): string | undefined {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return undefined
  return new Date(timestamp * 1000).toISOString()
}

function normalizeCurrency(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.toString().trim()
  if (!trimmed) return undefined
  return trimmed.toUpperCase()
}

function determineStatus(discount: Stripe.Discount): 'active' | 'scheduled' | 'expired' {
  const now = Date.now()
  const start = typeof discount.start === 'number' ? discount.start * 1000 : undefined
  const end = typeof discount.end === 'number' ? discount.end * 1000 : undefined
  if (typeof end === 'number' && end > 0 && end < now) return 'expired'
  if (typeof start === 'number' && start > now) return 'scheduled'
  return 'active'
}

function mapDiscountToEntry(params: {
  discount: Stripe.Discount
  coupon: Stripe.Coupon | null
  promotion: Stripe.PromotionCode | null
}): CustomerDiscountEntry {
  const {discount, coupon, promotion} = params
  const currency = coupon?.currency ? normalizeCurrency(coupon.currency) : undefined
  const amountOff = typeof coupon?.amount_off === 'number' ? coupon.amount_off / 100 : undefined

  return {
    _type: 'customerDiscount',
    stripeDiscountId: discount.id,
    stripeCouponId:
      (coupon && typeof coupon.id === 'string' && coupon.id) ||
      (typeof discount.coupon === 'string' ? discount.coupon : undefined),
    couponName: coupon?.name || undefined,
    promotionCodeId:
      (promotion && typeof promotion.id === 'string' && promotion.id) ||
      (typeof discount.promotion_code === 'string' ? discount.promotion_code : undefined),
    percentOff: typeof coupon?.percent_off === 'number' ? coupon.percent_off : undefined,
    amountOff,
    currency,
    duration: coupon?.duration || undefined,
    durationInMonths: coupon?.duration_in_months || undefined,
    redeemBy: toIso(coupon?.redeem_by),
    startsAt: toIso(discount.start),
    endsAt: toIso(discount.end),
    createdAt: toIso(coupon?.created),
    maxRedemptions: typeof coupon?.max_redemptions === 'number' ? coupon.max_redemptions : undefined,
    timesRedeemed: typeof coupon?.times_redeemed === 'number' ? coupon.times_redeemed : undefined,
    valid: typeof coupon?.valid === 'boolean' ? coupon.valid : undefined,
    livemode: typeof coupon?.livemode === 'boolean' ? coupon.livemode : undefined,
    metadata: mapStripeMetadata(coupon?.metadata) || undefined,
    status: determineStatus(discount),
    stripeLastSyncedAt: new Date().toISOString(),
  }
}

async function fetchCustomerDoc(
  sanity: SanityClient,
  stripeCustomerId: string,
): Promise<{_id: string; discounts?: Array<{_key?: string; stripeDiscountId?: string}>} | null> {
  return sanity.fetch(
    `*[_type == "customer" && stripeCustomerId == $cid][0]{_id, discounts[]{_key, stripeDiscountId}}`,
    {cid: stripeCustomerId},
  )
}

export async function hydrateDiscountResources(
  stripe: Stripe | null,
  discount: Stripe.Discount,
  presets: {coupon?: Stripe.Coupon | null; promotion?: Stripe.PromotionCode | null} = {},
): Promise<{coupon: Stripe.Coupon | null; promotion: Stripe.PromotionCode | null}> {
  let coupon: Stripe.Coupon | null = presets.coupon ?? null
  if (!coupon) {
    const raw = discount.coupon
    if (raw && typeof raw === 'object' && 'id' in raw) {
      coupon = raw as Stripe.Coupon
    } else if (stripe && typeof raw === 'string') {
      try {
        coupon = await stripe.coupons.retrieve(raw)
      } catch (err) {
        console.warn('customerDiscounts: failed to load coupon', err)
      }
    }
  }

  let promotion: Stripe.PromotionCode | null = presets.promotion ?? null
  if (!promotion) {
    const rawPromotion = (discount as any).promotion_code
    if (rawPromotion && typeof rawPromotion === 'object' && 'id' in rawPromotion) {
      promotion = rawPromotion as Stripe.PromotionCode
    } else if (stripe && typeof discount.promotion_code === 'string') {
      try {
        promotion = await stripe.promotionCodes.retrieve(discount.promotion_code)
      } catch (err) {
        console.warn('customerDiscounts: failed to load promotion code', err)
      }
    }
  }

  return {coupon, promotion}
}

export async function syncCustomerDiscountRecord(params: {
  sanity: SanityClient
  discount: Stripe.Discount
  stripe?: Stripe | null
  coupon?: Stripe.Coupon | null
  promotion?: Stripe.PromotionCode | null
}): Promise<void> {
  const {sanity, discount} = params
  const stripeCustomerId =
    typeof discount.customer === 'string'
      ? discount.customer
      : (discount.customer as Stripe.Customer | null)?.id
  if (!stripeCustomerId) return

  const doc = await fetchCustomerDoc(sanity, stripeCustomerId)
  if (!doc?._id) return

  const {coupon, promotion} = await hydrateDiscountResources(params.stripe ?? null, discount, {
    coupon: params.coupon ?? null,
    promotion: params.promotion ?? null,
  })

  const entry = mapDiscountToEntry({discount, coupon, promotion})

  const existingKey = doc.discounts?.find((item) => item?.stripeDiscountId === discount.id)?._key
  const patch = sanity.patch(doc._id)

  if (!existingKey) {
    patch.setIfMissing({discounts: []}).append('discounts', [entry])
  } else {
    patch.set({[`discounts[_key == "${existingKey}"]`]: {...entry, _key: existingKey}})
  }

  patch.set({stripeLastSyncedAt: new Date().toISOString()})

  try {
    await patch.commit({autoGenerateArrayKeys: true})
  } catch (err) {
    console.warn('customerDiscounts: failed to sync discount record', err)
  }
}

export async function removeCustomerDiscountRecord(params: {
  sanity: SanityClient
  stripeDiscountId: string
  stripeCustomerId?: string | null
}): Promise<void> {
  const {sanity, stripeDiscountId} = params
  if (!stripeDiscountId) return

  let targetDoc: {_id: string; discounts?: Array<{_key?: string; stripeDiscountId?: string}>} | null = null

  if (params.stripeCustomerId) {
    targetDoc = await fetchCustomerDoc(sanity, params.stripeCustomerId)
  } else {
    targetDoc = await sanity.fetch(
      `*[_type == "customer" && $discount in discounts[].stripeDiscountId][0]{_id, discounts[]{_key, stripeDiscountId}}`,
      {discount: stripeDiscountId},
    )
  }

  if (!targetDoc?._id || !Array.isArray(targetDoc.discounts)) return

  const match = targetDoc.discounts.find((item) => item?.stripeDiscountId === stripeDiscountId)
  const key = match?._key
  if (!key) return

  try {
    await sanity
      .patch(targetDoc._id)
      .unset([`discounts[_key == "${key}"]`])
      .set({stripeLastSyncedAt: new Date().toISOString()})
      .commit({autoGenerateArrayKeys: true})
  } catch (err) {
    console.warn('customerDiscounts: failed to remove discount record', err)
  }
}
