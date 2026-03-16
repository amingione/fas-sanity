/**
 * sync-vendor-tier-to-medusa
 *
 * Netlify Function — called by Sanity Studio document action (or webhook)
 * when a vendor's pricingTier is changed. Forwards the tier change to the
 * Medusa /webhooks/sanity-vendor-tier-sync endpoint.
 *
 * Can also be configured as a Sanity webhook directly:
 *   URL: https://fassanity.fasmotorsports.com/.netlify/functions/sync-vendor-tier-to-medusa
 *   Trigger: On publish, document type "vendor"
 *
 * Body (from Sanity Studio document action):
 *   { vendorId: string, pricingTier?: string }
 *
 * Body (from Sanity webhook — full document):
 *   { _id, _type, pricingTier, portalAccess, primaryContact, companyName }
 *
 * ENV:
 *   MEDUSA_API_URL (default: https://api.fasmotorsports.com)
 *   MEDUSA_VENDOR_WEBHOOK_SECRET (optional, for signature)
 *   SANITY_STUDIO_PROJECT_ID, SANITY_STUDIO_DATASET, SANITY_API_TOKEN
 */

import type { Handler } from "@netlify/functions";
import { createClient } from "@sanity/client";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "OPTIONS,POST",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

const MEDUSA_API_URL =
  (process.env.MEDUSA_API_URL || "https://api.fasmotorsports.com").replace(/\/+$/, "");

const PROJECT_ID = process.env.SANITY_STUDIO_PROJECT_ID;
const DATASET = process.env.SANITY_STUDIO_DATASET || "production";
const API_VERSION = process.env.SANITY_STUDIO_API_VERSION || "2025-10-22";
const TOKEN = process.env.SANITY_API_TOKEN || "";

type SyncPayload = {
  _id?: string;
  vendorId?: string;
  _type?: string;
  pricingTier?: string;
  portalAccess?: { email?: string };
  primaryContact?: { email?: string };
  companyName?: string;
};

async function fetchVendorDoc(vendorId: string): Promise<SyncPayload | null> {
  if (!PROJECT_ID || !TOKEN) return null;
  const client = createClient({
    projectId: PROJECT_ID,
    dataset: DATASET,
    token: TOKEN,
    apiVersion: API_VERSION,
    useCdn: false,
  });
  return client.fetch<SyncPayload>(
    `*[_type == "vendor" && _id == $id][0]{
      _id, _type, pricingTier, companyName,
      "portalAccess": { "email": portalAccess.email },
      "primaryContact": { "email": primaryContact.email }
    }`,
    { id: vendorId }
  );
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: JSON_HEADERS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  let raw: SyncPayload = {};
  try {
    raw = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: "Invalid JSON" }),
    };
  }

  // Support both: direct Sanity webhook (has _id) and Studio action (has vendorId)
  const sanityVendorId = raw._id || raw.vendorId;
  if (!sanityVendorId) {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: "Missing vendorId or _id in payload" }),
    };
  }

  // If payload came from a Studio action (only vendorId, no full doc), fetch the doc
  let payload: SyncPayload = raw;
  if (!raw.pricingTier && !raw._type) {
    const doc = await fetchVendorDoc(sanityVendorId);
    if (doc) {
      payload = { ...doc, ...raw };
    }
  }

  // Ensure _id is set
  payload._id = sanityVendorId;

  // Forward to Medusa webhook endpoint
  const medusaUrl = `${MEDUSA_API_URL}/webhooks/sanity-vendor-tier-sync`;
  const body = JSON.stringify(payload);

  try {
    const res = await fetch(medusaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[sync-vendor-tier] Medusa webhook failed:", res.status, err);
      return {
        statusCode: 502,
        headers: JSON_HEADERS,
        body: JSON.stringify({
          error: "Medusa tier sync failed",
          medusa_status: res.status,
          details: err,
        }),
      };
    }

    const result = await res.json().catch(() => ({}));
    console.info(
      `[sync-vendor-tier] ✅ Vendor ${sanityVendorId} tier synced → ` +
        `tier: ${result.tier}, group: ${result.customer_group_name}`
    );

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({ synced: true, ...result }),
    };
  } catch (err) {
    console.error("[sync-vendor-tier] Fetch to Medusa failed:", err);
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        error: "Failed to reach Medusa API",
        details: err instanceof Error ? err.message : String(err),
      }),
    };
  }
};
