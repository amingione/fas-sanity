type EasyPostAddress = {
  company?: string
  name?: string
  street1: string
  street2?: string
  city: string
  state: string
  zip: string
  country: string
  phone?: string
  email?: string
}

type BasicAddress = {
  name: string
  phone?: string
  addressLine1: string
  addressLine2?: string
  city: string
  state: string
  postalCode: string
  country: string
  email?: string
}

const SHIP_FROM_NAME = process.env.SHIP_FROM_NAME || 'F.A.S. Motorsports LLC'
const SHIP_FROM_PHONE = process.env.SHIP_FROM_PHONE || '(812) 200-9012'
const SHIP_FROM_ADDRESS1 = process.env.SHIP_FROM_ADDRESS1 || '6161 Riverside Dr'
const SHIP_FROM_ADDRESS2 = process.env.SHIP_FROM_ADDRESS2?.trim() || undefined
const SHIP_FROM_CITY = process.env.SHIP_FROM_CITY || 'Punta Gorda'
const SHIP_FROM_STATE = process.env.SHIP_FROM_STATE || 'FL'
const SHIP_FROM_POSTAL = process.env.SHIP_FROM_POSTAL || '33982'
const SHIP_FROM_COUNTRY = process.env.SHIP_FROM_COUNTRY || 'US'
const SHIP_FROM_EMAIL = process.env.SHIP_FROM_EMAIL?.trim() || undefined

export function getBasicFromAddress(): BasicAddress {
  return {
    name: SHIP_FROM_NAME,
    phone: SHIP_FROM_PHONE,
    addressLine1: SHIP_FROM_ADDRESS1,
    ...(SHIP_FROM_ADDRESS2 ? { addressLine2: SHIP_FROM_ADDRESS2 } : {}),
    city: SHIP_FROM_CITY,
    state: SHIP_FROM_STATE,
    postalCode: SHIP_FROM_POSTAL,
    country: SHIP_FROM_COUNTRY,
    ...(SHIP_FROM_EMAIL ? { email: SHIP_FROM_EMAIL } : {}),
  }
}

export function getEasyPostFromAddress(): EasyPostAddress {
  return {
    company: SHIP_FROM_NAME,
    name: SHIP_FROM_NAME,
    street1: SHIP_FROM_ADDRESS1,
    ...(SHIP_FROM_ADDRESS2 ? { street2: SHIP_FROM_ADDRESS2 } : {}),
    city: SHIP_FROM_CITY,
    state: SHIP_FROM_STATE,
    zip: SHIP_FROM_POSTAL,
    country: SHIP_FROM_COUNTRY,
    phone: SHIP_FROM_PHONE,
    ...(SHIP_FROM_EMAIL ? { email: SHIP_FROM_EMAIL } : {}),
  }
}
