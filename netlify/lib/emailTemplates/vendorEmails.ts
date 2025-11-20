export type VendorWelcomeEmailData = {
  companyName: string
  contactName?: string
  pricingTier?: string
  paymentTerms?: string
  creditLimit?: number | null
  portalEnabled?: boolean
  accountManager?: string
  vendorPortalUrl?: string
}

export type VendorRejectionEmailData = {
  companyName: string
  contactName?: string
  applicationNumber?: string
  reason?: string
}

export type VendorQuoteEmailData = {
  companyName?: string
  contactName?: string
  quoteNumber?: string
  total?: number | null
  validUntil?: string | null
  quoteUrl?: string
}

export type VendorOrderEmailData = {
  companyName?: string
  contactName?: string
  orderNumber?: string
  total?: number | null
  paymentTerms?: string
  portalUrl?: string
}

export type VendorEmailTemplateInput =
  | {template: 'welcome'; data: VendorWelcomeEmailData}
  | {template: 'rejection'; data: VendorRejectionEmailData}
  | {template: 'quote'; data: VendorQuoteEmailData}
  | {template: 'order'; data: VendorOrderEmailData}

const money = (input?: number | null) => {
  if (typeof input !== 'number' || !Number.isFinite(input)) return '$0.00'
  return `$${input.toFixed(2)}`
}

const formatDate = (input?: string | null) => {
  if (!input) return null
  try {
    return new Date(input).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return null
  }
}

const baseHtml = (title: string, body: string) => `
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:24px 0;color:#0f172a;">
    <tr>
      <td>
        <table width="600" align="center" style="margin:0 auto;background:#ffffff;border-radius:24px;padding:32px;font-family:Inter,Arial,sans-serif;">
          <tr>
            <td style="text-align:center;padding-bottom:12px;color:#6366f1;font-weight:600;letter-spacing:1px;font-size:12px;">FAS MOTORSPORTS</td>
          </tr>
          <tr>
            <td style="font-size:24px;font-weight:700;padding-bottom:12px;">${title}</td>
          </tr>
          <tr>
            <td style="font-size:16px;line-height:1.6;color:#475569;">${body}</td>
          </tr>
          <tr>
            <td style="padding-top:32px;font-size:14px;color:#94a3b8;">&copy; ${new Date().getFullYear()} FAS Motorsports</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
`

export const buildVendorWelcomeEmail = ({
  companyName,
  contactName,
  pricingTier,
  paymentTerms,
  creditLimit,
  portalEnabled,
  accountManager,
  vendorPortalUrl,
}: VendorWelcomeEmailData) => {
  const greeting = contactName ? `Hi ${contactName},` : 'Welcome,'
  const portalCopy = portalEnabled
    ? `<p style="margin:0 0 16px">Your portal access is active. Sign in to review products, create quotes, and track wholesale orders.${
        vendorPortalUrl
          ? ` <a href="${vendorPortalUrl}" style="color:#6366f1;text-decoration:none;">Open vendor portal</a>.`
          : ''
      }</p>`
    : ''
  const managerLine = accountManager
    ? `<p style="margin:0 0 16px">Your dedicated account manager is ${accountManager}. They will reach out to coordinate onboarding and answer any questions.</p>`
    : ''

  const html = baseHtml(
    'Your vendor account is approved 🎉',
    `
      <p style="margin:0 0 16px">${greeting}</p>
      <p style="margin:0 0 16px">Great news! ${companyName} is now approved for wholesale ordering with FAS Motorsports.</p>
      <p style="margin:0 0 16px"><strong>Account details</strong><br/>Pricing tier: ${
        pricingTier || 'Standard'
      }<br/>Payment terms: ${paymentTerms || 'Net 30'}<br/>Credit limit: ${
        creditLimit ? money(creditLimit) : 'On file'
      }</p>
      ${portalCopy}
      ${managerLine}
      <p style="margin:0">We look forward to building with you.<br/>— FAS Wholesale Team</p>
    `,
  )

  return {
    subject: 'Welcome to the FAS vendor network',
    html,
  }
}

export const buildVendorRejectionEmail = ({
  companyName,
  contactName,
  applicationNumber,
  reason,
}: VendorRejectionEmailData) => {
  const greeting = contactName ? `Hi ${contactName},` : 'Hello,'
  const reasonCopy = reason ? `<p style="margin:0 0 16px">Reason: ${reason}</p>` : ''
  const html = baseHtml(
    'Vendor application update',
    `
      <p style="margin:0 0 16px">${greeting}</p>
      <p style="margin:0 0 16px">Thank you for applying to become a vendor partner. After reviewing your application${
        applicationNumber ? ` (${applicationNumber})` : ''
      }, we're unable to approve ${companyName} at this time.</p>
      ${reasonCopy}
      <p style="margin:0">Please feel free to reply to this email if you have additional context or would like to reapply in the future.</p>
    `,
  )

  return {
    subject: 'Vendor application decision',
    html,
  }
}

export const buildVendorQuoteEmail = ({
  companyName,
  contactName,
  quoteNumber,
  total,
  validUntil,
  quoteUrl,
}: VendorQuoteEmailData) => {
  const greeting = contactName ? `Hi ${contactName},` : 'Hello,'
  const expires = formatDate(validUntil)
  const html = baseHtml(
    `Quote ${quoteNumber || ''} ready to review`,
    `
      <p style="margin:0 0 16px">${greeting}</p>
      <p style="margin:0 0 16px">We've prepared a wholesale quote${companyName ? ` for ${companyName}` : ''}. The total is ${money(total)}${
        expires ? ` and it is valid until ${expires}.` : '.'
      }</p>
      ${
        quoteUrl
          ? `<p style="margin:0 0 16px"><a href="${quoteUrl}" style="display:inline-block;padding:12px 20px;background:#6366f1;color:#fff;border-radius:999px;text-decoration:none;font-weight:600;">View quote</a></p>`
          : ''
      }
      <p style="margin:0">Let us know if you need adjustments or would like to convert this quote into a production order.</p>
    `,
  )

  return {
    subject: `Quote ${quoteNumber || ''} from FAS Motorsports`,
    html,
  }
}

export const buildVendorOrderEmail = ({
  companyName,
  contactName,
  orderNumber,
  total,
  paymentTerms,
  portalUrl,
}: VendorOrderEmailData) => {
  const greeting = contactName ? `Hi ${contactName},` : 'Hello,'
  const html = baseHtml(
    `Wholesale order ${orderNumber || ''} confirmed`,
    `
      <p style="margin:0 0 16px">${greeting}</p>
      <p style="margin:0 0 16px">We've converted your approved quote${
        companyName ? ` for ${companyName}` : ''
      } into a wholesale order.</p>
      <p style="margin:0 0 16px"><strong>Order total:</strong> ${money(
        total,
      )}<br/><strong>Payment terms:</strong> ${paymentTerms || 'Net 30'}</p>
      ${
        portalUrl
          ? `<p style="margin:0 0 16px"><a href="${portalUrl}" style="display:inline-block;padding:12px 20px;background:#6366f1;color:#fff;border-radius:999px;text-decoration:none;font-weight:600;">View order</a></p>`
          : ''
      }
      <p style="margin:0">Reach out if you need any adjustments.</p>
    `,
  )
  return {
    subject: `Wholesale order ${orderNumber || ''} confirmed`,
    html,
  }
}

export function buildVendorEmail(input: VendorEmailTemplateInput) {
  switch (input.template) {
    case 'welcome':
      return buildVendorWelcomeEmail(input.data)
    case 'rejection':
      return buildVendorRejectionEmail(input.data)
    case 'quote':
      return buildVendorQuoteEmail(input.data)
    case 'order':
      return buildVendorOrderEmail(input.data)
    default:
      throw new Error('Unsupported template')
  }
}
