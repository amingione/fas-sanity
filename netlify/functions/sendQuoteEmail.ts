import { Resend } from 'resend'
import { createClient } from '@sanity/client'
import type { Handler } from '@netlify/functions'

const resend = new Resend(process.env.RESEND_API_KEY)

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID,
  dataset: process.env.SANITY_STUDIO_DATASET,
  apiVersion: '2024-04-10',
  useCdn: false,
  token: process.env.PUBLIC_SANITY_WRITE_TOKEN
})

export const handler: Handler = async (event, context) => {
  try {
    const { quoteId } = JSON.parse(event.body || '{}')

    interface SelectedProduct {
      title: string;
      price: number;
    }

    const quote = await sanity.fetch<{
      quoteTotal: number;
      buildPurpose: string;
      targetHP: number;
      customer: { fullName: string; email: string };
      selectedProducts: SelectedProduct[];
    }>(
      `*[_type == "buildQuote" && _id == $id][0]{
        quoteTotal, buildPurpose, targetHP,
        customer->{fullName, email},
        selectedProducts[]->{title, price}
      }`,
      { id: quoteId }
    )

    if (!quote?.customer?.email) {
      return { statusCode: 400, body: 'Missing customer email' }
    }

    const html = `
      <h2>Build Quote for ${quote.customer.fullName}</h2>
      <p><strong>Purpose:</strong> ${quote.buildPurpose}</p>
      <p><strong>Target HP:</strong> ${quote.targetHP}whp</p>
      <ul>
        ${quote.selectedProducts.map(p => `<li>${p.title} - $${p.price}</li>`).join('')}
      </ul>
      <p><strong>Total:</strong> $${quote.quoteTotal}</p>
    `

    await resend.emails.send({
      from: 'FAS Motorsports <quotes@fasmotorsports.com>',
      to: quote.customer.email,
      subject: 'Your Custom Build Quote',
      html
    })

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Email sent' })
    }
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to send email', details: error instanceof Error ? error.message : 'Unknown error' })
    }
  }
}