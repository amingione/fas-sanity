import {Handler} from '@netlify/functions'
import {Resend} from 'resend'
import {createClient} from '@sanity/client'
import imageUrlBuilder from '@sanity/image-url'
import Stripe from 'stripe'
import {renderInvoicePdf, computeInvoiceTotals} from '../lib/invoicePdf'
import {fetchPrintSettings} from '../lib/printSettings'
import {resolveResendApiKey} from '../../shared/resendEnv'
import {STRIPE_API_VERSION} from '../lib/stripeConfig'
import {getMissingResendFields} from '../lib/resendValidation'

// --- CORS (more permissive localhost-aware)
const DEFAULT_ORIGINS = (
  process.env.CORS_ALLOW || 'http://localhost:8888,http://localhost:3333'
).split(',')
function makeCORS(origin?: string) {
  let o = DEFAULT_ORIGINS[0]
  if (origin) {
    // Trust any localhost port during local dev (e.g., 8888, 3333, vite random ports)
    if (/^http:\/\/localhost:\d+$/i.test(origin)) {
      o = origin
    } else if (DEFAULT_ORIGINS.includes(origin)) {
      o = origin
    }
  }
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  }
}

const resend = new Resend(resolveResendApiKey()!)
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY as string, {apiVersion: STRIPE_API_VERSION})
  : (null as any)

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-04-10',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
})
const logoBuilder = imageUrlBuilder(sanity)

const CAN_PATCH = Boolean(process.env.SANITY_API_TOKEN)

// ---- Helpers
async function ensureCheckoutUrl(invoiceId: string, inv: any, baseUrl: string) {
  // Reuse if already present
  if (inv?.paymentLinkUrl) return String(inv.paymentLinkUrl)
  if (!stripe) return ''

  const {total} = computeInvoiceTotals(inv)
  const unitAmount = Math.round(Number(total || 0) * 100)
  if (!Number.isFinite(unitAmount) || unitAmount <= 0) return ''

  let session: Stripe.Response<Stripe.Checkout.Session> | undefined
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {name: `Invoice ${inv?.invoiceNumber || ''}`.trim() || 'Invoice Payment'},
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      customer_email: inv?.billTo?.email || undefined,
      metadata: {
        sanity_invoice_id: String(invoiceId),
        sanity_invoice_number: String(inv?.invoiceNumber || ''),
      },
      payment_intent_data: {
        metadata: {
          sanity_invoice_id: String(invoiceId),
          sanity_invoice_number: String(inv?.invoiceNumber || ''),
        },
      },
      success_url: `${baseUrl}/invoice/success?invoiceId=${encodeURIComponent(invoiceId)}`,
      cancel_url: `${baseUrl}/invoice/cancel?invoiceId=${encodeURIComponent(invoiceId)}`,
    })
  } catch (e) {
    console.error('Stripe session create failed in resendInvoiceEmail.ensureCheckoutUrl:', e)
    return ''
  }

  const url = session?.url || ''
  if (url && CAN_PATCH) {
    try {
      await sanity.patch(invoiceId).set({paymentLinkUrl: url}).commit({autoGenerateArrayKeys: true})
    } catch (e: any) {
      const code = (e?.response?.statusCode || e?.statusCode || '').toString()
      console.warn(
        `resendInvoiceEmail: could not save paymentLinkUrl (status ${code || 'unknown'}) — continuing without persisting.`,
      )
    }
  }
  return url
}

const handler: Handler = async (event) => {
  const origin = (event.headers?.origin || event.headers?.Origin || '') as string
  const CORS = makeCORS(origin)

  if (event.httpMethod === 'OPTIONS') return {statusCode: 200, headers: CORS, body: ''}
  if (event.httpMethod !== 'POST')
    return {
      statusCode: 405,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({message: 'Method Not Allowed'}),
    }

  let email = ''
  let invoiceId = ''
  try {
    const payload = JSON.parse(event.body || '{}')
    email = String(payload.email || '').trim()
    invoiceId = String(payload.invoiceId || '').trim()
  } catch {
    return {
      statusCode: 400,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({message: 'Invalid JSON'}),
    }
  }

  if (!invoiceId)
    return {
      statusCode: 400,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({message: 'Missing invoiceId'}),
    }

  try {
    const invoice = await sanity.fetch(
      `*[_type == "invoice" && _id == $id][0]{
        _id,
        title,
      invoiceNumber,
      invoiceDate,
      dueDate,
      total,
      amountSubtotal,
      amountTax,
      amountShipping,
      trackingNumber,
      shippingLabelUrl,
      fulfillment{
        carrier,
        service,
        deliveryDays,
        estimatedDeliveryDate,
        trackingNumber,
        trackingUrl,
        easypostRateId
      },
      billTo,
      shipTo,
      lineItems[]{
        _key,
        kind,
          product->{_id, title, sku},
          description,
        sku,
        quantity,
        unitPrice,
        lineTotal,
        optionSummary,
        optionDetails,
        upgrades,
        metadata{option_summary, upgrades},
        metadataEntries[]{key, value}
      },
      orderRef->{
        _id,
        orderNumber,
        amountSubtotal,
        amountTax,
        amountShipping,
        trackingNumber,
        shippingLabelUrl,
        fulfillment{
          carrier,
          service,
          deliveryDays,
          estimatedDeliveryDate,
          trackingNumber,
          trackingUrl,
          shippedAt,
          deliveredAt,
          easypostRateId
        },
        cart[]{
            _key,
            name,
            productName,
            sku,
          quantity,
          price,
          lineTotal,
          total,
          optionSummary,
          optionDetails,
          upgrades,
          metadata{option_summary, upgrades},
          metadataEntries[]{key, value}
        }
      },
      order->{
        _id,
        orderNumber,
        amountSubtotal,
        amountTax,
        amountShipping,
        trackingNumber,
        shippingLabelUrl,
        fulfillment{
          carrier,
          service,
          deliveryDays,
          estimatedDeliveryDate,
          trackingNumber,
          trackingUrl,
          shippedAt,
          deliveredAt,
          easypostRateId
        },
        cart[]{
            _key,
            name,
            productName,
            sku,
          quantity,
          price,
          lineTotal,
          total,
          optionSummary,
          optionDetails,
          upgrades,
          metadata{option_summary, upgrades},
          metadataEntries[]{key, value}
        }
      },
        discountType,
        discountValue,
        taxRate,
        customerNotes,
        terms,
        paymentLinkUrl,
      }`,
      {id: invoiceId},
    )

    if (!invoice)
      return {
        statusCode: 404,
        headers: {...CORS, 'Content-Type': 'application/json'},
        body: JSON.stringify({message: 'Invoice not found'}),
      }

    // Derive email
    if (!email) email = String(invoice?.billTo?.email || '').trim()
    if (!email)
      return {
        statusCode: 400,
        headers: {...CORS, 'Content-Type': 'application/json'},
        body: JSON.stringify({message: 'No email provided and none found on the invoice.'}),
      }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return {
        statusCode: 400,
        headers: {...CORS, 'Content-Type': 'application/json'},
        body: JSON.stringify({message: 'Invalid email format'}),
      }

    // Ensure there is a payment link (reuse stored URL or create & patch it)
    const baseUrl = process.env.PUBLIC_SITE_URL || 'http://localhost:3333'
    const payUrl =
      String(invoice?.paymentLinkUrl || '') ||
      (await ensureCheckoutUrl(invoiceId, invoice, baseUrl))
    if (!payUrl) {
      const {total} = computeInvoiceTotals(invoice)
      const unitAmount = Math.round(Number(total || 0) * 100)
      console.error('resendInvoiceEmail: No payment link generated', {
        invoiceId,
        unitAmount,
        total,
        hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
      })
      return {
        statusCode: 500,
        headers: CORS,
        body: JSON.stringify({
          message: 'No payment link could be generated for this invoice',
          total,
          unitAmount,
          hint: !process.env.STRIPE_SECRET_KEY
            ? 'Missing STRIPE_SECRET_KEY'
            : unitAmount < 50
              ? 'Total must be at least $0.50'
              : 'Check Stripe logs for a session creation error',
        }),
      }
    }

    const printSettings = await fetchPrintSettings(sanity)
    let logoUrl: string | undefined
    if (printSettings?.logo) {
      try {
        logoUrl = logoBuilder.image(printSettings.logo).width(400).url()
      } catch (err) {
        console.warn('resendInvoiceEmail: failed to build logo URL', err)
      }
    }

    // Build PDF and attach
    const pdfResult = await renderInvoicePdf(invoice, {
      invoiceNumber: String(invoice.invoiceNumber || ''),
      invoiceDate: invoice?.invoiceDate,
      dueDate: invoice?.dueDate,
      printSettings,
      logoUrl,
    })

    const customerName = invoice?.billTo?.name || 'Customer'

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1b1b1b;line-height:1.45;">
        <div style="margin:0 0 14px;">
          <h2 style="margin:0 0 8px;font-weight:700;">Invoice from F.A.S. Motorsports</h2>
          <p style="margin:0 0 6px;">Hello ${customerName},</p>
          <p style="margin:0 0 10px;">Please find your invoice ${invoice.invoiceNumber ? `#<strong>${invoice.invoiceNumber}</strong>` : ''} attached as a PDF for your records.</p>
        </div>
        ${
          payUrl
            ? `
        <div style="margin:14px 0 10px;">
          <a href="${payUrl}" target="_blank" style="display:inline-block;padding:12px 18px;background:#dc362e;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Pay Invoice Securely</a>
        </div>
        <p style="margin:8px 0 10px;font-size:13px;color:#444;">If the button doesn’t work, copy and paste this link into your browser:<br/>
          <a href="${payUrl}" target="_blank" style="color:#0a66c2;text-decoration:underline;word-break:break-all;">${payUrl}</a>
        </p>
        `
            : ''
        }
        <p style="margin:16px 0 0;">Thank you for your business.<br/>— F.A.S. Motorsports</p>
      </div>
    `

    const from = 'FAS Motorsports <billing@updates.fasmotorsports.com>'
    const subject = `Your Invoice${invoice.invoiceNumber ? ' #' + invoice.invoiceNumber : ''}`
    const missing = getMissingResendFields({to: email, from, subject})
    if (missing.length) {
      return {
        statusCode: 400,
        headers: {...CORS, 'Content-Type': 'application/json'},
        body: JSON.stringify({error: `Missing email fields: ${missing.join(', ')}`}),
      }
    }

    await resend.emails.send({
      from,
      to: email,
      subject,
      html,
      text: `Your invoice${invoice.invoiceNumber ? ' #' + invoice.invoiceNumber : ''} is attached. ${payUrl ? 'Pay securely: ' + payUrl : ''}`,
      attachments: [
        {
          filename: `invoice-${invoice.invoiceNumber || invoiceId}.pdf`,
          content: pdfResult.base64,
          contentType: 'application/pdf',
          encoding: 'base64',
        } as any,
      ],
    })

    return {
      statusCode: 200,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({message: 'Invoice email sent with PDF attachment.', to: email, payUrl}),
    }
  } catch (err: any) {
    console.error('Failed to send invoice email:', err)
    return {
      statusCode: 500,
      headers: {...CORS, 'Content-Type': 'application/json'},
      body: JSON.stringify({message: 'Email send failed.', error: String(err?.message || err)}),
    }
  }
}

export {handler}
