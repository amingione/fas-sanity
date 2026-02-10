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
  weight?: { value?: number; unit?: string }
  dimensions?: { length?: number; width?: number; height?: number }
}

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: "2024-10-01",
  token: process.env.SANITY_API_TOKEN!,
  useCdn: false,
})

const allowedCarriers = new Set(["ups", "fedex"])

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

function normalizeUnit(unit?: string | null): "lb" | "oz" | "g" | "kg" {
  const normalized = (unit || "pound").toLowerCase()
  switch (normalized) {
    case "pound":
      return "lb"
    case "ounce":
      return "oz"
    case "gram":
      return "g"
    case "kilogram":
      return "kg"
    default:
      return "lb"
  }
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

function filterRates(rates: any[]) {
  return rates
    .filter((rate) => {
      const provider = String(rate?.provider || "").toLowerCase()
      if (!allowedCarriers.has(provider)) return false
      const name = `${rate?.servicelevel?.name || ""} ${rate?.servicelevel?.token || ""}`.toLowerCase()
      if (name.includes("freight") || name.includes("ltl")) return false
      if (name.includes("international") || name.includes("worldwide")) return false
      return true
    })
    .map((rate) => ({
      rateId: String(rate?.objectId || rate?.object_id || ""),
      amount: Number(rate?.amount),
      currency: String(rate?.currency || "USD"),
      carrier: String(rate?.provider || ""),
      provider: String(rate?.provider || ""),
      service: String(rate?.servicelevel?.name || rate?.servicelevel?.token || ""),
      estimatedDays: typeof rate?.estimated_days === "number" ? rate.estimated_days : undefined,
      durationTerms: String(rate?.duration_terms || ""),
    }))
    .filter((rate) => rate.rateId)
    .sort((a, b) => (a.amount || 0) - (b.amount || 0))
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
        weight,
        dimensions
      }`,
      { id: orderId.replace(/^drafts\./, "") },
    )) as OrderSnapshot | null

    if (!order?._id) {
      return json(404, origin, { error: "Order not found" })
    }

    const weightValue = Number(order.weight?.value)
    if (!Number.isFinite(weightValue) || weightValue <= 0) {
      return json(400, origin, { error: "Missing or invalid order weight" })
    }
    const dims = order.dimensions || {}
    const length = Number(dims.length)
    const width = Number(dims.width)
    const height = Number(dims.height)
    if (![length, width, height].every((v) => Number.isFinite(v) && v > 0)) {
      return json(400, origin, { error: "Missing or invalid order dimensions" })
    }

    const addressTo = pickAddress(order)
    assertAddress(addressTo)

    const addressFrom = {
      name: requireEnv("SHIPPO_ORIGIN_NAME", process.env.SHIPPO_ORIGIN_NAME),
      company: (process.env.SHIPPO_ORIGIN_COMPANY || "").trim() || undefined,
      street1: requireEnv("SHIPPO_ORIGIN_STREET1", process.env.SHIPPO_ORIGIN_STREET1),
      street2: (process.env.SHIPPO_ORIGIN_STREET2 || "").trim() || undefined,
      city: requireEnv("SHIPPO_ORIGIN_CITY", process.env.SHIPPO_ORIGIN_CITY),
      state: requireEnv("SHIPPO_ORIGIN_STATE", process.env.SHIPPO_ORIGIN_STATE),
      zip: requireEnv("SHIPPO_ORIGIN_ZIP", process.env.SHIPPO_ORIGIN_ZIP),
      country: requireEnv("SHIPPO_ORIGIN_COUNTRY", process.env.SHIPPO_ORIGIN_COUNTRY),
      phone: requireEnv("SHIPPO_ORIGIN_PHONE", process.env.SHIPPO_ORIGIN_PHONE),
      email: requireEnv("SHIPPO_ORIGIN_EMAIL", process.env.SHIPPO_ORIGIN_EMAIL),
    }

    const shippo = new Shippo({ apiKeyHeader: process.env.SHIPPO_API_KEY! })
    const parcel = {
      length: String(length),
      width: String(width),
      height: String(height),
      distanceUnit: "in",
      weight: String(weightValue),
      massUnit: normalizeUnit(order.weight?.unit),
    }

    const shipment = await shippo.shipments.create({
      async: false,
      addressFrom,
      addressTo,
      parcels: [parcel],
    })

    const rates = filterRates(shipment?.rates || [])
    if (!rates.length) {
      return json(404, origin, { error: "No UPS or FedEx rates returned by Shippo" })
    }

    return json(200, origin, {
      orderId: order._id,
      rates,
    })
  } catch (error: any) {
    return json(500, origin, { error: error?.message || "Shippo rate lookup failed" })
  }
}
