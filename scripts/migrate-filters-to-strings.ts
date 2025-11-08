// scripts/migrate-filters-to-strings.ts
import {createClient} from '@sanity/client'

const client = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID,
  dataset: process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET || 'production',
  apiVersion: '2024-04-10',
  token: process.env.SANITY_API_TOKEN, // needs write token
  useCdn: false,
})

type AnyRef = {_type?: string; _ref?: string} | string

async function main() {
  const docs: {_id: string; filters?: AnyRef[]}[] = await client.fetch(
    `*[_type=="product" && defined(filters)]{_id, filters}`,
  )

  for (const doc of docs) {
    const original = doc.filters || []
    const refs = original.filter((v) => typeof v === 'object' && v && (v as any)._ref)
    const needsFix = refs.length > 0

    if (!needsFix) continue

    // deref everything we can in one go
    const refIds = refs.map((r: any) => r._ref)
    const refDocs: {
      _id: string
      title?: string
      name?: string
      label?: string
      slug?: {current?: string}
    }[] = refIds.length
      ? await client.fetch(`*[_id in $ids]{_id, title, name, label, slug}`, {ids: refIds})
      : []

    const labelById = new Map(
      refDocs.map((r) => [r._id, r.title || r.name || r.label || r.slug?.current || r._id]),
    )

    const cleaned = original
      .map((v) => {
        if (typeof v === 'string') return v.trim()
        const id = (v as any)?._ref
        return id ? labelById.get(id) || null : null
      })
      .filter((v): v is string => !!v && typeof v === 'string')

    // de-duplicate (case-insensitive)
    const dedup = Array.from(new Map(cleaned.map((s) => [s.toLowerCase(), s])).values())

    console.log(`Patching ${doc._id}: ${cleaned.length} → ${dedup.length}`)
    await client.patch(doc._id).set({filters: dedup}).commit({autoGenerateArrayKeys: true})
  }

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
