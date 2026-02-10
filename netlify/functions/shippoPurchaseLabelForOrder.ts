import type { Handler } from "@netlify/functions"
import { createClient } from "@sanity/client"
import { Shippo } from "shippo"

type OrderShippingAddress = {
  name?: string
  phone?: string
  email?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
}

type OrderSnapshot = {
  _id: string
  customerName?: string
  customerEmail?: string
  shippingAddress?: OrderShippingAddress
  shippoRateId?: string
  shippoCarrier?: string
  shippoServicelevel?: string
}

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: "2024-10-01",
  token: process.env.SANITY_API_TOKEN!,
  useCdn: false,
})

const corsHeaders = (origin?: string) => ({
  "Access-Control-Allow-Origin": origin || "http://localhost:3333",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "OPTIONS,POST",
})

function json(statusCode: number, origin: string | undefined, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }
}

function requireEnv(name: string, value?: string | null): string {
  const trimmed = (value || "").trim()
  if (!trimmed) {
    throw new Error(`${name} is required`)
  }
  return trimmed
}

function pickAddress(order: OrderSnapshot) {
  const address = order.shippingAddress || {}
  const name =
    (address.name || "").trim() ||
    (order.customerName || "").trim() ||
    "Customer"
  return {
    name,
    street1: (address.addressLine1 || "").trim(),
    street2: (address.addressLine2 || "").trim() || undefined,
    city: (address.city || "").trim(),
    state: (address.state || "").trim(),
    zip: (address.postalCode || "").trim(),
    country: (address.country || "").trim() || "US",
    phone: (address.phone || "").trim() || undefined,
    email: (address.email || "").trim() || (order.customerEmail || "").trim() || undefined,
  }
}

function assertAddress(address: ReturnType<typeof pickAddress>) {
  const required = ["street1", "city", "state", "zip", "country"]
  for (const key of required) {
    if (!address[key as keyof typeof address]) {
      throw new Error(`Missing shipping address field: ${key}`)
    }
  }
}

export const handler: Handler = async (event) => {
  const origin = (event.headers?.origin || event.headers?.Origin) as string | undefined
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders(origin), body: "" }
  }
  if (event.httpMethod !== "POST") {
    return json(405, origin, { error: "Method Not Allowed" })
  }

  let payload: any
  try {
    payload = JSON.parse(event.body || "{}")
  } catch {
    return json(400, origin, { error: "Invalid JSON payload" })
  }

  const orderId = String(payload?.orderId || "").trim()
  if (!orderId) {
    return json(400, origin, { error: "Missing orderId" })
  }

  try {
    requireEnv("SHIPPO_API_KEY", process.env.SHIPPO_API_KEY)
    const order = (await sanity.fetch(
      `*[_type == "order" && _id == $id][0]{
        _id,
        customerName,
        customerEmail,
        shippingAddress,
        shippoRateId,
        shippoCarrier,
        shippoServicelevel
      }`,
      { id: orderId.replace(/^drafts\./, "") },
    )) as OrderSnapshot | null

    if (!order?._id) {
      return json(404, origin, { error: "Order not found" })
    }

    const rateId = String(payload?.rateId || order.shippoRateId || "").trim()
    if (!rateId) {
      return json(400, origin, { error: "Missing shippo rate id" })
    }

    const addressTo = pickAddress(order)
    assertAddress(addressTo)

    const shippo = new Shippo({ apiKeyHeader: process.env.SHIPPO_API_KEY! })
    const transaction = await shippo.transactions.create({
      rate: rateId,
      async: false,
      label_file_type: "PDF",
    })

    const status = String(transaction?.status || "").toUpperCase()
    if (status !== "SUCCESS") {
      const message = transaction?.messages?.[0]?.text || "Shippo label purchase failed"
      return json(400, origin, { error: message, shippoStatus: status })
    }

    const labelUrl = String(transaction?.label_url || transaction?.labelUrl || "")
    const trackingNumber = String(transaction?.tracking_number || transaction?.trackingNumber || "")
    const trackingUrl = String(transaction?.tracking_url_provider || transaction?.trackingUrl || "")
    const carrier = String(transaction?.carrier || order.shippoCarrier || "")
    const service = String(transaction?.servicelevel?.name || order.shippoServicelevel || "")
    const amount = Number(transaction?.rate?.amount || transaction?.rate_amount || transaction?.amount || 0)
    const currency = String(transaction?.rate?.currency || transaction?.currency || "USD")
    const transactionId = String(
      transaction?.object_id || transaction?.objectId || transaction?.transaction_id || "",
    )

    const purchasedBy = String(payload?.purchasedBy || "").trim() || "system"
    const now = new Date().toISOString()

    await sanity
      .patch(order._id)
      .set({
        labelPurchased: true,
        labelPurchasedAt: now,
        labelPurchasedBy: purchasedBy,
        labelTransactionId: transactionId || rateId,
        shippingLabelUrl: labelUrl || undefined,
        trackingNumber: trackingNumber || undefined,
        trackingUrl: trackingUrl || undefined,
        carrier: carrier || undefined,
        service: service || undefined,
        labelCost: Number.isFinite(amount) ? amount : undefined,
        labelCreatedAt: now,
        shippingStatus: {
          status: "label_created",
          carrier: carrier || undefined,
          service: service || undefined,
          trackingCode: trackingNumber || undefined,
          trackingUrl: trackingUrl || undefined,
          labelUrl: labelUrl || undefined,
          cost: Number.isFinite(amount) ? amount : undefined,
          currency,
          lastEventAt: now,
        },
      })
      .append("shippingLog", [
        {
          _type: "shippingLogEntry",
          status: "label_created",
          message: `Label purchased via Shippo (${carrier || "carrier"})`,
          labelUrl: labelUrl || undefined,
          trackingUrl: trackingUrl || undefined,
          trackingNumber: trackingNumber || undefined,
          createdAt: now,
        },
      ])
      .commit({ autoGenerateArrayKeys: true })

    return json(200, origin, {
      orderId: order._id,
      labelUrl,
      trackingNumber,
      trackingUrl,
      transactionId,
      amount,
      currency,
    })
  } catch (error: any) {
    return json(500, origin, { error: error?.message || "Shippo label purchase failed" })
  }
}
