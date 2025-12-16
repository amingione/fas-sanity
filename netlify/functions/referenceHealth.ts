// NOTE: orderId is deprecated; prefer orderNumber for identifiers.
import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'
import {requireSanityCredentials} from '../lib/sanityEnv'

const {projectId, dataset, token} = requireSanityCredentials()

const sanity = createClient({
  projectId,
  dataset,
  apiVersion: '2024-04-10',
  token,
  useCdn: false,
})

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {statusCode: 405, body: 'Method Not Allowed'}
  }

  const counts = await sanity.fetch<{
    paidOrdersWithoutInvoices: number
    ordersWithoutCustomers: number
    invoicesWithoutCustomers: number
    invoicesWithoutOrders: number
    shipmentsWithoutOrders: number
    checkoutSessionsWithoutCustomers: number
    paidOrdersMissingCart: number
  }>(
    `{
      "paidOrdersWithoutInvoices": count(*[_type == "order" && status in ["paid","fulfilled","shipped","completed"] && !defined(invoiceRef)]),
      "ordersWithoutCustomers": count(*[_type == "order" && !defined(customerRef)]),
      "invoicesWithoutCustomers": count(*[_type == "invoice" && !defined(customerRef)]),
      "invoicesWithoutOrders": count(*[_type == "invoice" && !defined(orderRef)]),
      "shipmentsWithoutOrders": count(*[_type == "shipment" && !defined(order)]),
      "checkoutSessionsWithoutCustomers": count(*[_type == "checkoutSession" && !defined(customerRef)]),
      "paidOrdersMissingCart": count(*[_type == "order" && status in ["paid","fulfilled","shipped","completed"] && (!defined(cart) || length(cart) == 0)])
    }`,
  )

  return {
    statusCode: 200,
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      generatedAt: new Date().toISOString(),
      counts,
      summary: [
        counts.paidOrdersWithoutInvoices ? `${counts.paidOrdersWithoutInvoices} paid orders missing invoices` : null,
        counts.ordersWithoutCustomers ? `${counts.ordersWithoutCustomers} orders missing customers` : null,
        counts.invoicesWithoutCustomers ? `${counts.invoicesWithoutCustomers} invoices missing customers` : null,
        counts.invoicesWithoutOrders ? `${counts.invoicesWithoutOrders} invoices missing orders` : null,
        counts.shipmentsWithoutOrders ? `${counts.shipmentsWithoutOrders} shipments missing orders` : null,
        counts.checkoutSessionsWithoutCustomers ? `${counts.checkoutSessionsWithoutCustomers} checkout sessions missing customers` : null,
        counts.paidOrdersMissingCart ? `${counts.paidOrdersMissingCart} paid orders missing carts` : null,
      ].filter(Boolean),
    }),
  }
}

export {handler}
