import type {SanityClient} from 'sanity'

type ClientLike = Pick<SanityClient, 'fetch'>

type ReferenceCodeOptions = {
  prefix: string
  typeName: string
  fieldName: string
  digits?: number
}

const DEFAULT_DIGITS = 6

export async function generateReferenceCode(
  client: ClientLike | undefined,
  options: ReferenceCodeOptions,
): Promise<string> {
  if (!client) return ''
  const digits = options.digits ?? DEFAULT_DIGITS
  const safeField = options.fieldName
  const safeType = options.typeName
  const latestRaw = await client.fetch<string | null>(
    `*[_type == $type && defined(${safeField})] | order(_createdAt desc)[0].${safeField}`,
    {type: safeType},
  )
  const numericValue = extractNumericSegment(latestRaw, options.prefix)
  const nextValue = numericValue + 1
  return `${options.prefix}${String(nextValue).padStart(digits, '0')}`
}

function extractNumericSegment(value: string | null | undefined, prefix: string): number {
  if (!value) return 0
  const trimmed = String(value).trim().toUpperCase()
  if (!trimmed) return 0
  const stripped = trimmed.startsWith(prefix.toUpperCase())
    ? trimmed.slice(prefix.length)
    : trimmed
  const match = stripped.match(/(\d+)/)
  if (!match) return 0
  const parsed = parseInt(match[1], 10)
  return Number.isFinite(parsed) ? parsed : 0
}
