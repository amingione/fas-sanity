import type {SanityClient} from '@sanity/client'

export type PrintColorValue = {
  hex?: string | null
}

export type TypographySettings = {
  fontFamily?: 'Helvetica' | 'Arial' | 'Times' | 'Courier'
  fontSize?: number
}

export type LayoutSettings = {
  pageSize?: 'letter' | 'a4'
  margins?: {
    top?: number
    right?: number
    bottom?: number
    left?: number
  }
}

export type PrintSettings = {
  logo?: unknown
  primaryColor?: PrintColorValue
  secondaryColor?: PrintColorValue
  textColor?: PrintColorValue
  companyName?: string
  companyAddress?: string
  companyPhone?: string
  companyEmail?: string
  companyWebsite?: string
  invoiceSettings?: {
    showLogo?: boolean
    headerText?: string
    footerText?: string
    showPaymentTerms?: boolean
  }
  quoteSettings?: {
    showLogo?: boolean
    headerText?: string
    footerText?: string
  }
  packingSlipSettings?: {
    showLogo?: boolean
    headerText?: string
    showPrices?: boolean
    includeNotes?: boolean
  }
  orderSettings?: {
    showLogo?: boolean
    headerText?: string
    footerText?: string
  }
  typography?: TypographySettings
  layout?: LayoutSettings
}

const PRINT_SETTINGS_QUERY = `*[_type == "printSettings" && _id == "printSettings"][0]{
  logo,
  primaryColor,
  secondaryColor,
  textColor,
  companyName,
  companyAddress,
  companyPhone,
  companyEmail,
  companyWebsite,
  invoiceSettings,
  quoteSettings,
  packingSlipSettings,
  orderSettings,
  typography,
  layout
}`

export async function fetchPrintSettings(client: SanityClient): Promise<PrintSettings | null> {
  try {
    const settings = await client.fetch<PrintSettings>(PRINT_SETTINGS_QUERY)
    return settings || null
  } catch (error) {
    console.warn('fetchPrintSettings: failed to load settings', error)
    return null
  }
}

export type RgbColorValue = {r: number; g: number; b: number}

export function hexToRgb(hex?: string | null, fallback?: RgbColorValue): RgbColorValue {
  if (!hex) return fallback ?? {r: 0, g: 0, b: 0}
  const cleaned = hex.replace('#', '')
  if (!/^[\da-fA-F]{6}$/.test(cleaned)) return fallback ?? {r: 0, g: 0, b: 0}
  const r = parseInt(cleaned.substring(0, 2), 16) / 255
  const g = parseInt(cleaned.substring(2, 4), 16) / 255
  const b = parseInt(cleaned.substring(4, 6), 16) / 255
  return {r, g, b}
}

export function mixRgb(
  a: RgbColorValue,
  b: RgbColorValue,
  weight = 0.5,
): RgbColorValue {
  const clamp = (value: number) => Math.max(0, Math.min(1, value))
  return {
    r: clamp(a.r * (1 - weight) + b.r * weight),
    g: clamp(a.g * (1 - weight) + b.g * weight),
    b: clamp(a.b * (1 - weight) + b.b * weight),
  }
}

export function lightenRgb(color: RgbColorValue, amount = 0.25): RgbColorValue {
  return mixRgb(color, {r: 1, g: 1, b: 1}, amount)
}

export function darkenRgb(color: RgbColorValue, amount = 0.2): RgbColorValue {
  return mixRgb(color, {r: 0, g: 0, b: 0}, amount)
}
