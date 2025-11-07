export type SupportedCarrier = 'ups' | 'fedex' | 'usps'

type CarrierMetadata = {
  label: string
  trackingUrl: (trackingNumber: string) => string
}

const CARRIER_METADATA: Record<SupportedCarrier, CarrierMetadata> = {
  ups: {
    label: 'UPS',
    trackingUrl: (trackingNumber) =>
      `https://www.ups.com/track?loc=en_US&tracknum=${encodeURIComponent(trackingNumber)}`,
  },
  fedex: {
    label: 'FedEx',
    trackingUrl: (trackingNumber) =>
      `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(trackingNumber)}`,
  },
  usps: {
    label: 'USPS',
    trackingUrl: (trackingNumber) =>
      `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(trackingNumber)}`,
  },
}

export type TrackingValidationResult = {
  isValid: boolean
  canonical: string
  normalized: string
  carrier: SupportedCarrier | null
  carrierLabel: string | null
  trackingUrl: string | null
  reason?: string
}

const TRACKING_PATTERNS: {carrier: SupportedCarrier; regex: RegExp}[] = [
  {carrier: 'ups', regex: /^1Z[0-9A-Z]{16}$/i},
  {carrier: 'fedex', regex: /^(?:\d{12}|\d{15}|\d{20}|\d{22})$/},
  {carrier: 'usps', regex: /^(?:\d{20}|\d{22}|[A-Z]{2}\d{9}[A-Z]{2})$/i},
]

export function normalizeTrackingNumber(value?: string | null): string {
  return (value ?? '').toString().trim()
}

export function canonicalizeTrackingNumber(value?: string | null): string {
  return normalizeTrackingNumber(value).replace(/[\s-]+/g, '').toUpperCase()
}

export function validateTrackingNumber(value?: string | null): TrackingValidationResult {
  const normalized = normalizeTrackingNumber(value)
  const canonical = canonicalizeTrackingNumber(value)

  if (!canonical) {
    return {
      isValid: false,
      canonical,
      normalized,
      carrier: null,
      carrierLabel: null,
      trackingUrl: null,
      reason: 'Enter a tracking number before fulfilling the order.',
    }
  }

  const match = TRACKING_PATTERNS.find((pattern) => pattern.regex.test(canonical)) || null

  if (!match) {
    return {
      isValid: false,
      canonical,
      normalized,
      carrier: null,
      carrierLabel: null,
      trackingUrl: null,
      reason: 'Tracking number must match UPS, FedEx, or USPS formats.',
    }
  }

  return {
    isValid: true,
    canonical,
    normalized,
    carrier: match.carrier,
    carrierLabel: getTrackingCarrierLabel(match.carrier),
    trackingUrl: buildTrackingUrl(match.carrier, canonical),
  }
}

export function isDuplicateTrackingNumber(
  candidate: string,
  existing: Iterable<string>,
): boolean {
  const canonicalCandidate = canonicalizeTrackingNumber(candidate)
  if (!canonicalCandidate) return false
  for (const entry of existing) {
    if (canonicalizeTrackingNumber(entry) === canonicalCandidate) {
      return true
    }
  }
  return false
}

export function detectTrackingCarrier(value?: string | null): SupportedCarrier | null {
  const canonical = canonicalizeTrackingNumber(value)
  const match = TRACKING_PATTERNS.find((pattern) => pattern.regex.test(canonical))
  return match ? match.carrier : null
}

export function getTrackingCarrierLabel(carrier: SupportedCarrier | null): string | null {
  if (!carrier) return null
  return CARRIER_METADATA[carrier]?.label ?? null
}

export function buildTrackingUrl(
  carrier: SupportedCarrier | null,
  trackingNumber?: string | null,
): string | null {
  if (!carrier) return null
  const canonical = canonicalizeTrackingNumber(trackingNumber)
  if (!canonical) return null
  const metadata = CARRIER_METADATA[carrier]
  return metadata ? metadata.trackingUrl(canonical) : null
}

