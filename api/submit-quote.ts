import type { APIRoute } from 'astro'
import { client } from '../.sanity/lib/client'

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json()
    const { customerId, selectedProducts, targetHP, buildPurpose, quoteTotal } = body

    if (!customerId || !Array.isArray(selectedProducts)) {
      return new Response(JSON.stringify({ message: 'Missing required quote data.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const newQuote = await client.create({
      _type: 'quote',
      customer: {
        _type: 'reference',
        _ref: customerId
      },
      selectedProducts,
      targetHP,
      buildPurpose,
      quoteTotal,
      status: 'Draft',
      createdAt: new Date().toISOString()
    })

    await client.patch(customerId)
      .setIfMissing({ quoteCount: 0 })
      .inc({ quoteCount: 1 })
      .commit()

    return new Response(JSON.stringify({ message: 'Quote submitted', quoteId: newQuote._id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    console.error('[Submit Quote Error]', err)
    return new Response(JSON.stringify({ message: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}