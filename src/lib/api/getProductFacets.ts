import { client } from '@/lib/client'

function normalizeTag(s: string): string {
  return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

export async function getAllFilterTags(): Promise<string[]> {
  const tags: string[] = await client.fetch(
    'array::unique(*[_type == "product" && defined(filters)][].filters[])'
  )
  const cleaned = (Array.isArray(tags) ? tags : [])
    .filter((t): t is string => typeof t === 'string')
    .map((t) => normalizeTag(t))
  return Array.from(new Set(cleaned)).sort()
}

export async function getTagCounts(filter?: { categoryId?: string }) {
  const prods: { _id: string; filters?: string[]; categories?: any[] }[] = await client.fetch(
    `*[_type == "product" ${filter?.categoryId ? '&& $cat in categories[]._ref' : ''}]{ _id, filters, "categories": categories[]->_id }`,
    { cat: filter?.categoryId }
  )
  const counts = new Map<string, number>()
  for (const p of prods) {
    const arr = Array.isArray(p.filters) ? p.filters : []
    const set = new Set(arr.map((s) => normalizeTag(s)))
    for (const t of set) counts.set(t, (counts.get(t) || 0) + 1)
  }
  return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]))
}

export async function getProductsByTags(tags: string[], opts?: { limit?: number }) {
  const normalized = Array.from(new Set((tags || []).map(normalizeTag))).filter(Boolean)
  if (normalized.length === 0) return []
  // GROQ uses exact string match; we store normalized lower-case tags
  const query = `*[_type == "product" && count([${normalized
    .map((_, i) => `$t${i} in filters`)
    .join(' , ')}]) == ${normalized.length}][0...$lim]{_id, title, slug, sku, filters}`
  const params: Record<string, any> = { lim: opts?.limit || 100 }
  normalized.forEach((t, i) => (params[`t${i}`] = t))
  return client.fetch(query, params)
}

