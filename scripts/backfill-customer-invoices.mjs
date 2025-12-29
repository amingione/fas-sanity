import {createClient} from '@sanity/client'

const {SANITY_PROJECT_ID, SANITY_DATASET, SANITY_API_TOKEN} = process.env

if (!SANITY_PROJECT_ID || !SANITY_DATASET || !SANITY_API_TOKEN) {
  console.error(
    'Missing SANITY_PROJECT_ID, SANITY_DATASET, or SANITY_API_TOKEN. Load .env before running.',
  )
  process.exit(1)
}

const args = new Set(process.argv.slice(2))
const getArgValue = (name) => {
  const prefix = `--${name}=`
  for (const arg of args) {
    if (arg.startsWith(prefix)) return arg.slice(prefix.length)
  }
  return undefined
}

const dryRun = args.has('--dry-run') || args.has('--dryRun')
const force = args.has('--force')
const pageSize = Number(getArgValue('pageSize') || getArgValue('page-size') || 200)
const maxCount = Number(getArgValue('limit') || getArgValue('max') || 0)

const client = createClient({
  projectId: SANITY_PROJECT_ID,
  dataset: SANITY_DATASET,
  token: SANITY_API_TOKEN,
  apiVersion: '2024-01-01',
  useCdn: false,
})

const customerQuery = `*[_type == "customer" && _id > $cursor] | order(_id)[0...$limit]{
  _id,
  invoices,
  "invoiceDocs": *[_type == "invoice" && customerRef._ref == ^._id] | order(_createdAt desc){
    _id,
    invoiceNumber,
    status,
    _createdAt,
    total
  }
}`

const toSummary = (invoice) => ({
  _key: invoice._id.replace(/^drafts\./, ''),
  invoiceNumber: invoice.invoiceNumber,
  status: invoice.status,
  createdAt: invoice._createdAt,
  total: invoice.total,
})

async function run() {
  let cursor = ''
  let processed = 0
  let updated = 0
  let skipped = 0
  let withoutInvoices = 0

  while (true) {
    const remaining = maxCount > 0 ? Math.max(maxCount - processed, 0) : pageSize
    const limit = maxCount > 0 ? Math.min(pageSize, remaining) : pageSize
    if (maxCount > 0 && limit === 0) break

    const customers = await client.fetch(customerQuery, {cursor, limit})
    if (!customers.length) break

    for (const customer of customers) {
      processed += 1
      cursor = customer._id

      if (!force && Array.isArray(customer.invoices) && customer.invoices.length > 0) {
        skipped += 1
        continue
      }

      const invoiceDocs = Array.isArray(customer.invoiceDocs) ? customer.invoiceDocs : []
      if (!invoiceDocs.length) {
        withoutInvoices += 1
        continue
      }

      const invoices = invoiceDocs.map(toSummary)
      updated += 1

      if (!dryRun) {
        await client.patch(customer._id).set({invoices}).commit({autoGenerateArrayKeys: true})
      }

      console.log(
        `${dryRun ? 'DRY RUN' : 'Updated'} ${customer._id} with ${invoices.length} invoice${
          invoices.length === 1 ? '' : 's'
        }.`,
      )
    }

    if (customers.length < limit) break
  }

  console.log('---')
  console.log(`Processed: ${processed}`)
  console.log(`Updated: ${updated}`)
  console.log(`Skipped (already had invoices): ${skipped}`)
  console.log(`No invoices found: ${withoutInvoices}`)
  if (dryRun) console.log('Dry run only; no documents were updated.')
}

run().catch((err) => {
  console.error('Backfill failed:', err?.message || err)
  process.exit(1)
})
