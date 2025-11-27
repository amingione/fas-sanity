import { createClient } from '@sanity/client'

const client = createClient({
  projectId: process.env.SANITY_PROJECT_ID,
  dataset: process.env.SANITY_DATASET,
  token: process.env.SANITY_WRITE_TOKEN,
  apiVersion: '2024-01-01',
  useCdn: false,
})

async function run() {
  const orders = await client.fetch(
    `
    *[_type == "order" && !defined(invoiceRef)][0...50]{
      _id, orderNumber, customerRef, customerName, customerEmail, createdAt,
      totalAmount, amountSubtotal, amountTax, amountShipping,
      cart[]{ name, sku, quantity, price, total }
    }
  `,
  )

  console.log(`Found ${orders.length} orders needing invoices`)

  for (const order of orders) {
    const invoice = await client.create({
      _type: 'invoice',
      title: `Invoice for ${order.orderNumber}`,
      invoiceNumber: order.orderNumber.replace('FAS-', 'INV-'),
      status: 'paid',
      invoiceDate: order.createdAt,
      dueDate: order.createdAt,
      paymentTerms: 'Paid in full',
      customerRef: order.customerRef,
      orderRef: { _type: 'reference', _ref: order._id },
      billTo: { name: order.customerName, email: order.customerEmail },
      lineItems: order.cart.map((item) => ({
        _type: 'invoiceLineItem',
        _key: Math.random().toString(36).substr(2, 9),
        description: item.name,
        sku: item.sku || '',
        quantity: item.quantity || 1,
        unitPrice: item.price || 0,
        total: item.total || 0,
      })),
      subtotal: order.amountSubtotal || 0,
      tax: order.amountTax || 0,
      shipping: order.amountShipping || 0,
      total: order.totalAmount || 0,
    })

    await client
      .patch(order._id)
      .set({
        invoiceRef: { _type: 'reference', _ref: invoice._id },
      })
      .commit()

    console.log(`✅ ${order.orderNumber} → ${invoice.invoiceNumber}`)
  }
}

run()
