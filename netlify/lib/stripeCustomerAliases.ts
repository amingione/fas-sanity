type StripeCustomerAliasCustomer = {
  stripeCustomerId?: string | null
  stripeCustomerIds?: string[] | null
}

function normalizeStripeCustomerId(value?: string | null): string {
  if (!value) return ''
  return value.toString().trim()
}

export function buildStripeCustomerAliasPatch(
  customer: StripeCustomerAliasCustomer,
  incomingId?: string | null,
  customerEmail?: string,
): {patch: Record<string, any>; didAppend: boolean} {
  const normalizedIncoming = normalizeStripeCustomerId(incomingId)
  if (!normalizedIncoming) return {patch: {}, didAppend: false}

  const existingPrimary = normalizeStripeCustomerId(customer.stripeCustomerId)
  const existingAliases = Array.isArray(customer.stripeCustomerIds)
    ? customer.stripeCustomerIds.map((id) => normalizeStripeCustomerId(id)).filter(Boolean)
    : []

  const aliasSet = new Set<string>()
  if (existingPrimary) aliasSet.add(existingPrimary)
  existingAliases.forEach((id) => aliasSet.add(id))
  aliasSet.add(normalizedIncoming)

  const nextAliases = Array.from(aliasSet)
  const didAppend =
    Boolean(existingPrimary) &&
    normalizedIncoming !== existingPrimary &&
    !existingAliases.includes(normalizedIncoming)

  if (didAppend) {
    console.warn('stripeWebhook: customer stripe alias appended', {
      customerEmail,
      existingPrimaryStripeId: existingPrimary || null,
      newStripeId: normalizedIncoming,
      action: 'appendAlias',
    })
  }

  const patch: Record<string, any> = {}
  if (!existingPrimary) patch.stripeCustomerId = normalizedIncoming
  if (!existingAliases.length || nextAliases.length !== existingAliases.length) {
    patch.stripeCustomerIds = nextAliases
  } else if (!existingAliases.includes(normalizedIncoming)) {
    patch.stripeCustomerIds = nextAliases
  }

  return {patch, didAppend}
}
