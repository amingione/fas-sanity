import {randomBytes} from 'node:crypto'
import {createClient, type SanityClient} from '@sanity/client'
import Stripe from 'stripe'
import {requireSanityCredentials} from '../../netlify/lib/sanityEnv'
import {resolveStripeSecretKey} from '../../netlify/lib/stripeEnv'
import {sendEmail} from '../../packages/sanity-config/src/utils/emailService'
import {isValidEmail, normalizeEmail} from '../../netlify/lib/orderFormatting'

type MilitaryVerificationStatus =
  | 'pending'
  | 'verified'
  | 'requires_documents'
  | 'failed'
  | 'expired'

type SheerIdVerificationResponse = {
  verificationId: string
  currentStep?: string
  submissionUrl?: string
}

type MilitaryVerificationDoc = {
  _id: string
  email?: string | null
  status?: MilitaryVerificationStatus | null
  promoCode?: string | null
  stripePromoCodeId?: string | null
  expiresAt?: string | null
  documentUploadUrl?: string | null
  sheerIdVerificationId?: string | null
}

const SHEERID_API_BASE = 'https://services.sheerid.com/rest/v2'
const MILITARY_DISCOUNT_DAYS = 90
const PROMO_CODE_PREFIX = 'MILITARY'

const resolveSheerIdToken = () => process.env.SHEERID_ACCESS_TOKEN?.trim()
const resolveSheerIdProgramId = () => process.env.SHEERID_PROGRAM_ID?.trim()

const buildSanityClient = (): SanityClient => {
  const {projectId, dataset, token} = requireSanityCredentials()
  return createClient({
    projectId,
    dataset,
    token,
    apiVersion: process.env.SANITY_API_VERSION || '2024-04-10',
    useCdn: false,
  })
}

const buildStripeClient = () => {
  const stripeKey = resolveStripeSecretKey()
  if (!stripeKey) {
    throw new Error('Missing Stripe secret key for military discount verification.')
  }
  return new Stripe(stripeKey, {apiVersion: '2024-06-20'})
}

const normalizeBirthDate = (value: string) => {
  const trimmed = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error('Birth date must be in YYYY-MM-DD format.')
  }
  return trimmed
}

const ensureEmail = (value: string) => {
  const normalized = normalizeEmail(value)
  if (!isValidEmail(normalized)) {
    throw new Error('Invalid email address.')
  }
  return normalized
}

const buildSheerIdHeaders = () => {
  const token = resolveSheerIdToken()
  if (!token) {
    throw new Error('Missing SHEERID_ACCESS_TOKEN.')
  }
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

const startSheerIdVerification = async (): Promise<SheerIdVerificationResponse> => {
  const programId = resolveSheerIdProgramId()
  if (!programId) {
    throw new Error('Missing SHEERID_PROGRAM_ID.')
  }

  const response = await fetch(`${SHEERID_API_BASE}/verification`, {
    method: 'POST',
    headers: buildSheerIdHeaders(),
    body: JSON.stringify({programId}),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`SheerID start failed (${response.status}): ${body}`)
  }

  return (await response.json()) as SheerIdVerificationResponse
}

const submitSheerIdPersonalInfo = async (
  verificationId: string,
  payload: {firstName: string; lastName: string; email: string; birthDate: string},
): Promise<SheerIdVerificationResponse> => {
  const response = await fetch(
    `${SHEERID_API_BASE}/verification/${verificationId}/step/collectMilitaryPersonalInfo`,
    {
      method: 'POST',
      headers: buildSheerIdHeaders(),
      body: JSON.stringify(payload),
    },
  )

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`SheerID submission failed (${response.status}): ${body}`)
  }

  return (await response.json()) as SheerIdVerificationResponse
}

const fetchSheerIdVerification = async (
  verificationId: string,
): Promise<SheerIdVerificationResponse> => {
  const response = await fetch(`${SHEERID_API_BASE}/verification/${verificationId}`, {
    headers: buildSheerIdHeaders(),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`SheerID status failed (${response.status}): ${body}`)
  }

  return (await response.json()) as SheerIdVerificationResponse
}

const resolveStatusFromStep = (step?: string): MilitaryVerificationStatus => {
  switch ((step || '').toLowerCase()) {
    case 'success':
      return 'verified'
    case 'docupload':
      return 'requires_documents'
    case 'failed':
    case 'fail':
      return 'failed'
    default:
      return 'pending'
  }
}

const buildPromoCodeValue = () => {
  const stamp = Date.now().toString().slice(-6)
  const random = randomBytes(2).toString('hex').toUpperCase()
  return `${PROMO_CODE_PREFIX}-${stamp}-${random}`
}

const ensureStripeCouponId = () => {
  const couponId = process.env.STRIPE_MILITARY_COUPON_ID?.trim()
  if (!couponId) {
    throw new Error('Missing STRIPE_MILITARY_COUPON_ID.')
  }
  return couponId
}

const buildExpiryTimestamp = () =>
  Math.floor(Date.now() / 1000) + MILITARY_DISCOUNT_DAYS * 24 * 60 * 60

const buildDiscountEmailHtml = (code: string, expiresAt: number) => {
  const expiryDate = new Date(expiresAt * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const shopUrl = `${process.env.NEXT_PUBLIC_SITE_URL || ''}/shop`
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; }
          .container { max-width: 600px; margin: 0 auto; padding: 24px; }
          .header { background: #0f172a; color: #ffffff; padding: 24px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f8fafc; padding: 28px; border-radius: 0 0 10px 10px; }
          .code-box { background: #ffffff; border: 2px dashed #0f172a; padding: 16px; text-align: center; margin: 20px 0; border-radius: 8px; }
          .code { font-size: 26px; font-weight: bold; color: #0f172a; letter-spacing: 2px; font-family: "Courier New", monospace; }
          .button { display: inline-block; background: #0f172a; color: #ffffff; padding: 12px 26px; text-decoration: none; border-radius: 6px; margin: 18px 0; }
          .footer { text-align: center; color: #6b7280; font-size: 13px; margin-top: 24px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Military Discount Verified</h1>
          </div>
          <div class="content">
            <p>Thank you for your service. Your military status has been verified.</p>
            <p>Here is your exclusive discount code:</p>
            <div class="code-box">
              <div class="code">${code}</div>
            </div>
            <p><strong>Discount:</strong> 10% off your purchase</p>
            <p><strong>Valid Until:</strong> ${expiryDate}</p>
            <p><strong>Usage:</strong> One-time use</p>
            <div style="text-align: center;">
              <a href="${shopUrl}" class="button">Start Shopping</a>
            </div>
            <div class="footer">
              <p>This code is unique to you and can only be used once.</p>
              <p>Questions? Contact support@fasmotorsports.com</p>
              <p>F.A.S. Motorsports</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `
}

export const ensureMilitaryVerificationDoc = async (
  client: SanityClient,
  input: {
    email: string
    firstName: string
    lastName: string
    status: MilitaryVerificationStatus
    sheerIdVerificationId?: string
    documentUploadUrl?: string | null
    metadata?: Record<string, string | null | undefined>
  },
) => {
  return client.create({
    _type: 'militaryVerification',
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    status: input.status,
    sheerIdVerificationId: input.sheerIdVerificationId,
    documentUploadUrl: input.documentUploadUrl || null,
    metadata: input.metadata || undefined,
  })
}

export const generateMilitaryPromoCode = async (
  client: SanityClient,
  docId: string,
  email: string,
  sheerIdVerificationId: string,
) => {
  const stripe = buildStripeClient()
  const couponId = ensureStripeCouponId()
  const expiresAt = buildExpiryTimestamp()

  let promoCode: Stripe.PromotionCode | null = null
  let code = ''
  for (let attempt = 0; attempt < 4; attempt += 1) {
    code = buildPromoCodeValue()
    try {
      promoCode = await stripe.promotionCodes.create({
        coupon: couponId,
        code,
        max_redemptions: 1,
        expires_at: expiresAt,
        metadata: {
          type: 'military',
          email,
          verification_id: sheerIdVerificationId,
          sanity_doc_id: docId,
          verified_at: new Date().toISOString(),
        },
      })
      break
    } catch (error: any) {
      const message = (error?.message || '').toLowerCase()
      if (message.includes('already exists') || message.includes('code')) {
        continue
      }
      throw error
    }
  }

  if (!promoCode) {
    throw new Error('Unable to generate a unique promotion code.')
  }

  await client
    .patch(docId)
    .set({
      status: 'verified',
      promoCode: code,
      stripePromoCodeId: promoCode.id,
      verifiedAt: new Date().toISOString(),
      expiresAt: new Date(promoCode.expires_at * 1000).toISOString(),
    })
    .commit()

  await sendEmail({
    to: email,
    subject: 'Your military discount code is ready',
    html: buildDiscountEmailHtml(code, promoCode.expires_at),
  })

  return {code, promoCodeId: promoCode.id}
}

export const startMilitaryVerification = async (input: {
  email: string
  firstName: string
  lastName: string
  birthDate: string
  ipAddress?: string | null
  userAgent?: string | null
}) => {
  const email = ensureEmail(input.email)
  const birthDate = normalizeBirthDate(input.birthDate)
  if (!input.firstName || !input.lastName || !birthDate) {
    throw new Error('Missing required verification fields.')
  }

  const client = buildSanityClient()

  const active = await client.fetch<MilitaryVerificationDoc | null>(
    `*[_type == "militaryVerification" && email == $email && status == "verified" && expiresAt > now()][0]{
      _id,
      promoCode,
      expiresAt
    }`,
    {email},
  )
  if (active?.promoCode) {
    return {
      alreadyVerified: true,
      code: active.promoCode,
    }
  }

  const pending = await client.fetch<MilitaryVerificationDoc | null>(
    `*[_type == "militaryVerification" && email == $email && status in ["pending","requires_documents"]]|order(_createdAt desc)[0]{
      _id,
      status,
      sheerIdVerificationId,
      documentUploadUrl
    }`,
    {email},
  )
  if (pending?.sheerIdVerificationId) {
    return {
      alreadyPending: true,
      status: pending.status,
      verificationId: pending.sheerIdVerificationId,
      uploadUrl: pending.documentUploadUrl || undefined,
    }
  }

  const verification = await startSheerIdVerification()
  const verificationId = verification.verificationId
  const result = await submitSheerIdPersonalInfo(verificationId, {
    firstName: input.firstName,
    lastName: input.lastName,
    email,
    birthDate,
  })

  const status = resolveStatusFromStep(result.currentStep)

  const doc = await ensureMilitaryVerificationDoc(client, {
    email,
    firstName: input.firstName,
    lastName: input.lastName,
    status,
    sheerIdVerificationId: verificationId,
    documentUploadUrl: result.submissionUrl || null,
    metadata: {
      ipAddress: input.ipAddress || undefined,
      userAgent: input.userAgent || undefined,
      verificationMethod: status === 'verified' ? 'instant' : 'document_upload',
    },
  })

  if (status === 'verified') {
    const promo = await generateMilitaryPromoCode(client, doc._id, email, verificationId)
    return {
      verified: true,
      code: promo.code,
    }
  }

  if (status === 'requires_documents') {
    return {
      verified: false,
      requiresDocuments: true,
      uploadUrl: result.submissionUrl,
      verificationId,
    }
  }

  return {
    verified: false,
    status,
    verificationId,
  }
}

export const checkMilitaryVerificationStatus = async (verificationId: string) => {
  const client = buildSanityClient()
  const result = await fetchSheerIdVerification(verificationId)

  const doc = await client.fetch<MilitaryVerificationDoc | null>(
    `*[_type == "militaryVerification" && sheerIdVerificationId == $verificationId][0]{
      _id,
      email,
      status,
      promoCode,
      stripePromoCodeId,
      documentUploadUrl
    }`,
    {verificationId},
  )

  if (!doc?._id) {
    throw new Error('Verification not found.')
  }

  if (doc.status === 'verified' && doc.promoCode) {
    return {
      verified: true,
      code: doc.promoCode,
    }
  }

  const status = resolveStatusFromStep(result.currentStep)

  if (status === 'verified') {
    if (!doc.email) {
      throw new Error('Verified record is missing an email address.')
    }
    const promo = await generateMilitaryPromoCode(client, doc._id, doc.email, verificationId)
    return {
      verified: true,
      code: promo.code,
    }
  }

  if (status === 'requires_documents') {
    await client
      .patch(doc._id)
      .set({
        status: 'requires_documents',
        documentUploadUrl: result.submissionUrl || doc.documentUploadUrl || null,
      })
      .commit()
  } else if (status === 'failed') {
    await client.patch(doc._id).set({status: 'failed'}).commit()
  } else if (status === 'pending') {
    await client.patch(doc._id).set({status: 'pending'}).commit()
  }

  return {
    verified: false,
    status,
    uploadUrl: result.submissionUrl || doc.documentUploadUrl || undefined,
  }
}
