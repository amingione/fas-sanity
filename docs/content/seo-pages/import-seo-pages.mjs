/* global process, console */
/**
 * SANITY SEO PAGE IMPORT SCRIPT
 *
 * Imports all documents in seoPageDocuments.json into the Sanity dataset.
 * Safe to re-run — uses createOrReplace so existing documents are updated.
 *
 * USAGE (from fas-sanity root):
 *   node docs/content/seo-pages/import-seo-pages.mjs
 *
 * Requires env vars (or reads from .env.local):
 *   SANITY_STUDIO_PROJECT_ID (or SANITY_PROJECT_ID)
 *   SANITY_STUDIO_DATASET    (or SANITY_DATASET)
 *   SANITY_API_TOKEN         (write token)
 *
 * NOTE: These were already imported to production on 2026-04-01 via the
 *       Sanity Mutations API. This script exists as a repeatable reference
 *       for re-import or future additions.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@sanity/client";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const projectId =
    process.env.SANITY_STUDIO_PROJECT_ID ||
    process.env.SANITY_PROJECT_ID ||
    "r4og35qd";
  const dataset =
    process.env.SANITY_STUDIO_DATASET ||
    process.env.SANITY_DATASET ||
    "production";
  const token = process.env.SANITY_API_TOKEN;
  if (!token) {
    throw new Error(
      "SANITY_API_TOKEN is required. Set it in your environment or .env.local."
    );
  }
  return { projectId, dataset, token };
}

function addKeys(docs) {
  return docs.map((doc) => {
    const d = JSON.parse(JSON.stringify(doc));
    if (Array.isArray(d.sections)) {
      d.sections = d.sections.map((section, i) => {
        if (!section._key) section._key = `section-${i}`;
        if (Array.isArray(section.body)) {
          section.body = section.body.map((block, j) => {
            if (!block._key) block._key = `block-${i}-${j}`;
            if (!block.markDefs) block.markDefs = [];
            if (Array.isArray(block.children)) {
              block.children = block.children.map((child, k) => {
                if (!child._key) child._key = `span-${i}-${j}-${k}`;
                if (!child.marks) child.marks = [];
                return child;
              });
            }
            return block;
          });
        }
        return section;
      });
    }
    return d;
  });
}

async function main() {
  const { projectId, dataset, token } = loadEnv();

  const client = createClient({
    projectId,
    dataset,
    token,
    apiVersion: "2021-06-07",
    useCdn: false,
  });

  const raw = readFileSync(join(__dirname, "seoPageDocuments.json"), "utf-8");
  const docs = addKeys(JSON.parse(raw));

  console.log(`Importing ${docs.length} seoPage documents to ${projectId}/${dataset}...\n`);

  const transaction = client.transaction();
  for (const doc of docs) {
    transaction.createOrReplace(doc);
  }

  const result = await transaction.commit({ visibility: "async" });
  console.log(`✅ Done. Transaction ID: ${result.transactionId}`);
  console.log(`   Documents imported:`);
  for (const r of result.results) {
    console.log(`   ${r.operation === "create" ? "created" : "updated"}: ${r.id}`);
  }
}

main().catch((err) => {
  console.error("Import failed:", err.message);
  process.exit(1);
});
