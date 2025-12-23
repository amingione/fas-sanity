import dotenv from 'dotenv'
import { createClient } from '@sanity/client'

dotenv.config()

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
    *[_type == "order" && !defined(customerRef) && defined(customerEmail)]{
      _id, orderNumber, customerEmail, customerName
    }
  `,
  )

  console.log(`Found ${orders.length} orders needing customer references`)

  for (const order of orders) {
    const customer = await client.fetch(
      `
      *[_type == "customer" && email == $email][0]{_id, name}
    `,
      { email: order.customerEmail },
    )

    if (customer) {
      await client
        .patch(order._id)
        .set({
          customerRef: { _type: 'reference', _ref: customer._id },
          ...((!order.customerName || order.customerName === '') && { customerName: customer.name }),
        })
        .commit()
      console.log(`✅ ${order.orderNumber} → ${customer.name}`)
    }
  }
}

run()
