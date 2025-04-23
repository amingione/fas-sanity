import type { APIRoute } from 'astro'
import { client } from '../.sanity/lib/client'

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json()
    const { customerId, products, total, paymentMethod, shippingMethod, status } = body

    if (!customerId || !Array.isArray(products) || typeof total !== 'number') {
      return new Response(JSON.stringify({ message: 'Missing required order data.' }), { status: 400 })
    }

    const newOrder = await client.create({
      _type: 'invoice',
      customer: {
        _type: 'reference',
        _ref: customerId
      },
      products,
      total,
      paymentMethod,
      shippingMethod,
      status: status || 'Pending',
      createdAt: new Date().toISOString()
    })

    // Update customer with incremented stats
    await client.patch(customerId)
      .setIfMissing({ orderCount: 0, lifetimeSpend: 0 })
      .inc({ orderCount: 1, lifetimeSpend: total })
      .commit()

    return new Response(JSON.stringify({ message: 'Order saved', orderId: newOrder._id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (err: any) {
    console.error('[Save Order Error]', err)
    return new Response(JSON.stringify({ message: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
