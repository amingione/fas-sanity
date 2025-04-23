import type { APIRoute } from 'astro';
import { createClient } from '@sanity/client';
import Stripe from 'stripe';
import { generatePackingSlip } from '../.sanity/lib/generatePackingSlip';

const SHIPENGINE_API_KEY = process.env.SHIPENGINE_API_KEY!;
const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const SANITY_PROJECT_ID = process.env.SANITY_PROJECT_ID!;
const SANITY_TOKEN = process.env.SANITY_API_TOKEN!;

const sanity = createClient({
  projectId: SANITY_PROJECT_ID,
  dataset: 'production',
  apiVersion: '2023-10-01',
  token: SANITY_TOKEN,
  useCdn: false,
});

export const POST: APIRoute = async ({ request }) => {
  try {
    const { orderId } = await request.json();

    if (!orderId) {
      return new Response(JSON.stringify({ error: 'Missing orderId' }), { status: 400 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-03-31.basil'
    });

    const order = await sanity.fetch(
      `*[_type == "order" && _id == $id][0]`,
      { id: orderId }
    );

    if (!order || !order.shippingAddress) {
      return new Response(JSON.stringify({ error: 'Invalid or missing order or shipping address' }), { status: 400 });
    }

    // Step 1: Create shipping label via ShipEngine (simplified example)
    const labelRes = await fetch('https://api.shipengine.com/v1/labels', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'API-Key': SHIPENGINE_API_KEY
      },
      body: JSON.stringify({
        shipment: {
          service_code: 'usps_priority_mail',
          ship_to: {
            name: order.shippingAddress.name,
            phone: order.shippingAddress.phone,
            address_line1: order.shippingAddress.addressLine1,
            address_line2: order.shippingAddress.addressLine2,
            city_locality: order.shippingAddress.city,
            state_province: order.shippingAddress.state,
            postal_code: order.shippingAddress.postalCode,
            country_code: order.shippingAddress.country
          },
          ship_from: {
            name: 'FAS Motorsports',
            phone: '1234567890',
            address_line1: '123 Shop St',
            city_locality: 'Fort Myers',
            state_province: 'FL',
            postal_code: '33919',
            country_code: 'US'
          },
          packages: [
            {
              weight: { value: 2, unit: 'pound' },
              dimensions: { unit: 'inch', length: 12, width: 9, height: 4 }
            }
          ]
        }
      })
    });

    const labelData = await labelRes.json();

    if (!labelData.label_download || !labelData.tracking_number) {
      console.error('ShipEngine response error:', labelData);
      return new Response(JSON.stringify({ error: 'Failed to generate label' }), { status: 500 });
    }

    // Step 2.5: Generate packing slip PDF
    const pdfBuffer = await generatePackingSlip(order);
    const pdfBase64 = pdfBuffer.toString('base64');

    // Step 2: Update order with tracking, label, and packing slip
    await sanity.patch(orderId)
      .set({
        shippingLabelUrl: labelData.label_download.pdf,
        trackingNumber: labelData.tracking_number,
        fulfilledAt: new Date().toISOString(),
        status: 'fulfilled'
      })
      .commit();

    // Step 3: Send confirmation email via Resend with attachment
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'orders@fasmotorsports.com',
        to: order.shippingAddress.email,
        subject: 'Your order has shipped!',
        html: `
          <h1>Order Fulfilled</h1>
          <p>Your order is on its way.</p>
          <p><strong>Tracking Number:</strong> ${labelData.tracking_number}</p>
          <a href="${labelData.tracking_url}">Track your package</a>
        `,
        attachments: [
          {
            filename: 'PackingSlip.pdf',
            content: pdfBase64,
            contentType: 'application/pdf'
          }
        ]
      })
    });

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err: any) {
    console.error('Error fulfilling order:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};