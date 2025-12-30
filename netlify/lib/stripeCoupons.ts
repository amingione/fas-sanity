import type {SanityClient} from '@sanity/client'
import type Stripe from 'stripe'

const STRIPE_COUPON_TYPE = 'stripeCoupon'

type SyncResult = {
  stripeId: string
  status: 'created' | 'updated' | 'skipped' | 'error'
  docId?: string
  reason?: string
}

type SyncSummary = {
  processed: number
  created: number
  updated: number
  deleted: number
  skipped: number
  errors: number
  errorDetails: Array<{stripeId: string; error: string}>
}

type StripeCouponDocument = Record<string, any> & {
  _type: string
}

const toIsoFromUnix = (value?: number | null): string | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return new Date(value * 1000).toISOString()
}

const normalizeId = (value?: string | null): string => (value || '').toString().trim()

const resolveStatus = (
  coupon: Stripe.Coupon,
  syncedAt: string,
  redeemBy?: string,
): boolean => {
  if (!coupon.valid) return false
  if (!redeemBy) return true
  const parsed = new Date(redeemBy).getTime()
  if (!Number.isFinite(parsed)) return Boolean(coupon.valid)
  return parsed >= new Date(syncedAt).getTime()
}

const buildStripeCouponFields = (
  coupon: Stripe.Coupon,
  syncedAt: string,
): StripeCouponDocument | null => {
  const stripeId = normalizeId(coupon.id)
  if (!stripeId) return null

  const name = (coupon.name || stripeId).toString().trim() || stripeId
  const createdAt = toIsoFromUnix(coupon.created) || syncedAt
  const redeemBy = toIsoFromUnix(coupon.redeem_by)
  const percentOff =
    typeof coupon.percent_off === 'number' && Number.isFinite(coupon.percent_off)
      ? coupon.percent_off
      : undefined
  const amountOff =
    percentOff === undefined &&
    typeof coupon.amount_off === 'number' &&
    Number.isFinite(coupon.amount_off)
      ? coupon.amount_off
      : undefined
  const currency =
    amountOff !== undefined && coupon.currency ? coupon.currency.toLowerCase() : undefined
  const durationInMonths =
    typeof coupon.duration_in_months === 'number' &&
    Number.isFinite(coupon.duration_in_months)
      ? coupon.duration_in_months
      : undefined
  const metadata =
    coupon.metadata && Object.keys(coupon.metadata).length ? coupon.metadata : undefined
  const valid = resolveStatus(coupon, syncedAt, redeemBy)

  return {
    _type: STRIPE_COUPON_TYPE,
    stripeId,
    name,
    duration: coupon.duration,
    durationInMonths,
    percentOff,
    amountOff,
    currency,
    valid,
    redeemBy,
    maxRedemptions: coupon.max_redemptions ?? undefined,
    timesRedeemed: coupon.times_redeemed ?? undefined,
    metadata,
    createdAt,
    updatedAt: syncedAt,
  }
}

const ensureStripeCouponUnique = async (
  sanity: SanityClient,
  stripeId: string,
): Promise<string[]> => {
  const matches = await sanity.fetch<{_id: string}[]>(
    `*[_type == "${STRIPE_COUPON_TYPE}" && stripeId == $stripeId]{_id}`,
    {stripeId},
  )
  return Array.isArray(matches) ? matches.map((doc) => doc._id).filter(Boolean) : []
}

export const upsertStripeCoupon = async (
  sanity: SanityClient,
  coupon: Stripe.Coupon,
  syncedAt: string,
  logger: Pick<Console, 'warn'> = console,
): Promise<SyncResult> => {
  const stripeId = normalizeId(coupon.id)
  if (!stripeId) {
    return {stripeId: 'unknown', status: 'skipped', reason: 'Missing Stripe coupon id'}
  }

  const fields = buildStripeCouponFields(coupon, syncedAt)
  if (!fields) {
    return {stripeId, status: 'skipped', reason: 'Invalid Stripe coupon data'}
  }

  const matches = await ensureStripeCouponUnique(sanity, stripeId)
  if (matches.length > 1) {
    logger.warn('stripeCoupons: duplicate stripeId detected', {stripeId, matches})
  }

  if (matches.length > 0) {
    await Promise.all(
      matches.map((docId) =>
        sanity.patch(docId).set(fields).commit({autoGenerateArrayKeys: true}),
      ),
    )
    return {stripeId, status: 'updated', docId: matches[0]}
  }

  const created = await sanity.create(fields, {autoGenerateArrayKeys: true})
  return {stripeId, status: 'created', docId: created?._id}
}

export const syncStripeCouponById = async (options: {
  stripe: Stripe
  sanity: SanityClient
  couponId: string
  syncedAt: string
  logger?: Pick<Console, 'warn'>
}): Promise<SyncResult> => {
  const {stripe, sanity, couponId, syncedAt, logger} = options
  const coupon = await stripe.coupons.retrieve(couponId)
  return upsertStripeCoupon(sanity, coupon, syncedAt, logger)
}

export const markStripeCouponDeleted = async (
  sanity: SanityClient,
  stripeId: string,
  deletedAt: string,
  logger: Pick<Console, 'warn'> = console,
): Promise<SyncResult> => {
  const normalized = normalizeId(stripeId)
  if (!normalized) {
    return {stripeId: 'unknown', status: 'skipped', reason: 'Missing Stripe coupon id'}
  }

  const matches = await ensureStripeCouponUnique(sanity, normalized)
  if (!matches.length) {
    return {stripeId: normalized, status: 'skipped', reason: 'No matching Sanity coupon found'}
  }

  if (matches.length > 1) {
    logger.warn('stripeCoupons: duplicate stripeId detected for delete', {stripeId, matches})
  }

  await Promise.all(
    matches.map((docId) =>
      sanity
        .patch(docId)
        .set({
          valid: false,
          deletedAt,
          updatedAt: deletedAt,
        })
        .commit({autoGenerateArrayKeys: true}),
    ),
  )

  return {stripeId: normalized, status: 'updated', docId: matches[0]}
}

export const syncStripeCoupons = async (options: {
  stripe: Stripe
  sanity: SanityClient
  syncedAt?: string
  logger?: Pick<Console, 'warn' | 'log'>
  markMissingAsDeleted?: boolean
}): Promise<SyncSummary> => {
  const {stripe, sanity, logger = console} = options
  const syncedAt = options.syncedAt || new Date().toISOString()
  const markMissingAsDeleted = options.markMissingAsDeleted !== false

  const summary: SyncSummary = {
    processed: 0,
    created: 0,
    updated: 0,
    deleted: 0,
    skipped: 0,
    errors: 0,
    errorDetails: [],
  }

  const stripeIds = new Set<string>()
  let startingAfter: string | undefined
  let hasMore = true

  while (hasMore) {
    const page = await stripe.coupons.list({limit: 100, starting_after: startingAfter})
    const coupons = Array.isArray(page.data) ? page.data : []

    for (const coupon of coupons) {
      const stripeId = normalizeId(coupon.id)
      if (stripeId) stripeIds.add(stripeId)

      try {
        const result = await upsertStripeCoupon(sanity, coupon, syncedAt, logger)
        summary.processed += 1
        if (result.status === 'created') summary.created += 1
        else if (result.status === 'updated') summary.updated += 1
        else if (result.status === 'skipped') {
          summary.skipped += 1
          if (result.reason) {
            logger.warn('stripeCoupons: skipped coupon', {stripeId, reason: result.reason})
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        summary.errors += 1
        summary.errorDetails.push({stripeId: stripeId || 'unknown', error: message})
        logger.warn('stripeCoupons: failed to sync coupon', {stripeId, error: message})
      }
    }

    hasMore = page.has_more
    startingAfter = coupons.length ? coupons[coupons.length - 1].id : undefined
  }

  if (markMissingAsDeleted) {
    const missing = await sanity.fetch<{_id: string; stripeId?: string | null}[]>(
      `*[_type == "${STRIPE_COUPON_TYPE}" && !(stripeId in $stripeIds)]{_id, stripeId}`,
      {stripeIds: Array.from(stripeIds)},
    )

    for (const doc of missing || []) {
      const stripeId = normalizeId(doc?.stripeId)
      if (!stripeId) continue
      try {
        await sanity
          .patch(doc._id)
          .set({
            valid: false,
            deletedAt: syncedAt,
            updatedAt: syncedAt,
          })
          .commit({autoGenerateArrayKeys: true})
        summary.deleted += 1
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        summary.errors += 1
        summary.errorDetails.push({stripeId, error: message})
        logger.warn('stripeCoupons: failed to mark missing coupon deleted', {
          stripeId,
          error: message,
        })
      }
    }
  }

  return summary
}
