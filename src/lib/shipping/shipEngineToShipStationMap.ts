export type ShipStationServiceMapping = {
  serviceCode: string
  packageCode?: string
}

const mappingTable: Record<string, ShipStationServiceMapping> = {
  'usps::usps ground advantage': {serviceCode: 'usps_ground_advantage'},
  'usps::priority mail': {serviceCode: 'usps_priority_mail'},
  'ups::ground': {serviceCode: 'ups_ground'},
  'fedex::ground': {serviceCode: 'fedex_ground'},
}

const normalizeKey = (carrier: string, serviceName: string): string => {
  const carrierKey = carrier.trim().toLowerCase()
  const serviceKey = serviceName.trim().toLowerCase()
  return `${carrierKey}::${serviceKey}`
}

export function mapService(carrier: string, serviceName: string): ShipStationServiceMapping {
  if (!carrier || !serviceName) {
    throw new Error(`Unknown carrier/service mapping: ${carrier}/${serviceName}`)
  }

  const key = normalizeKey(carrier, serviceName)
  const mapping = mappingTable[key]

  if (!mapping) {
    throw new Error(`Unknown carrier/service mapping: ${carrier}/${serviceName}`)
  }

  return mapping
}
