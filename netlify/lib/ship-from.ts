type ShipEngineFromAddress = {
  name: string
  phone: string
  address_line1: string
  address_line2?: string
  city_locality: string
  state_province: string
  postal_code: string
  country_code: string
}

type ShipStationFromAddress = {
  name: string
  phone: string
  street1: string
  street2?: string
  city: string
  state: string
  postalCode: string
  country: string
}

const SHIP_FROM_NAME = process.env.SHIP_FROM_NAME || 'F.A.S. Motorsports LLC'
const SHIP_FROM_PHONE = process.env.SHIP_FROM_PHONE || '(812) 200-9012'
const SHIP_FROM_ADDRESS1 = '6161 Riverside Dr'
const SHIP_FROM_ADDRESS2 = process.env.SHIP_FROM_ADDRESS2?.trim() || undefined
const SHIP_FROM_CITY = 'Punta Gorda'
const SHIP_FROM_STATE = 'FL'
const SHIP_FROM_POSTAL = '33982'
const SHIP_FROM_COUNTRY = 'US'

export function getShipEngineFromAddress(): ShipEngineFromAddress {
  return {
    name: SHIP_FROM_NAME,
    phone: SHIP_FROM_PHONE,
    address_line1: SHIP_FROM_ADDRESS1,
    ...(SHIP_FROM_ADDRESS2 ? { address_line2: SHIP_FROM_ADDRESS2 } : {}),
    city_locality: SHIP_FROM_CITY,
    state_province: SHIP_FROM_STATE,
    postal_code: SHIP_FROM_POSTAL,
    country_code: SHIP_FROM_COUNTRY,
  }
}

export function getShipStationFromAddress(): ShipStationFromAddress {
  return {
    name: SHIP_FROM_NAME,
    phone: SHIP_FROM_PHONE,
    street1: SHIP_FROM_ADDRESS1,
    ...(SHIP_FROM_ADDRESS2 ? { street2: SHIP_FROM_ADDRESS2 } : {}),
    city: SHIP_FROM_CITY,
    state: SHIP_FROM_STATE,
    postalCode: SHIP_FROM_POSTAL,
    country: SHIP_FROM_COUNTRY,
  }
}
