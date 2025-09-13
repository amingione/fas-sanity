import { client } from '@/lib/client'

function normalizeTag(s: string): string {
  return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

export async function getAllFilterTags(): Promise<{slug: string; title: string}[]> {
  // Source from filterTag documents (canonical)
  return client.fetch(`*[_type=="filterTag"]|order(title asc){"slug": slug.current, title}`)
}

export async function getTagCounts(filter?: { categoryId?: string }) {
  // Compute counts per filterTag via references
  const list: { slug: string; title: string; count: number }[] = await client.fetch(
    `*[_type=="filterTag"]{ 
      "slug": slug.current, title,
      "count": count(*[_type=="product" ${filter?.categoryId ? '&& $cat in categories[]._ref' : ''} && references(^._id)])
    }|order(title asc)`,
    { cat: filter?.categoryId }
  )
  return list
}

export async function getProductsByTags(slugs: string[], opts?: { limit?: number }) {
  const normalized = Array.from(new Set((slugs || []).map(normalizeTag))).filter(Boolean)
  if (normalized.length === 0) return []
  // Require all selected slugs to be present in filters (by reference). Also support legacy strings if present.
  const where = normalized
    .map((_, i) => `($s${i} in (filters[]->slug.current) || $s${i} in filters)`)
    .join(' && ')
  const query = `*[_type=="product" && ${where}][0...$lim]{_id, title, slug, sku, filters[]{_type, _ref}}`
  const params: Record<string, any> = { lim: opts?.limit || 100 }
  normalized.forEach((t, i) => (params[`s${i}`] = t))
  return client.fetch(query, params)
}
