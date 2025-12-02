import type {SanityClient} from '@sanity/client'

const SETTINGS_TYPE = 'siteSettings'
const SETTINGS_TITLE = 'Site Settings'
const NEXT_VENDOR_FIELD = 'nextVendorNumber'
const DEFAULT_START = 201
const VENDOR_PREFIX = 'VEN-'
const PAD_LENGTH = 3

type SettingsDoc = {
  _id: string
  nextVendorNumber?: number
}

function formatVendorNumber(serialNumber: number): string {
  const safeNumber = Number.isFinite(serialNumber) ? serialNumber : DEFAULT_START
  return `${VENDOR_PREFIX}${String(safeNumber).padStart(PAD_LENGTH, '0')}`
}

function parseVendorNumber(value?: string | null): number {
  if (!value) return 0
  const match = String(value).match(/(\d+)/)
  const parsed = match ? parseInt(match[1], 10) : NaN
  return Number.isFinite(parsed) ? parsed : 0
}

export async function generateInitialVendorNumber(
  client: SanityClient | undefined,
): Promise<string> {
  if (!client) return ''

  const settings = await client.fetch<SettingsDoc | null>(
    `*[_type == $type][0]{_id, ${NEXT_VENDOR_FIELD}}`,
    {type: SETTINGS_TYPE},
  )

  const highestExisting = await client.fetch<string | null>(
    '*[_type == "vendor" && defined(vendorNumber)] | order(vendorNumber desc)[0].vendorNumber',
  )

  const settingsId = settings?._id || SETTINGS_TYPE
  const startingValue =
    typeof settings?.nextVendorNumber === 'number' ? settings.nextVendorNumber : DEFAULT_START
  const highestValue = parseVendorNumber(highestExisting)
  const seedValue = Math.max(startingValue, highestValue + 1, DEFAULT_START)

  await client.createIfNotExists({
    _id: settingsId,
    _type: SETTINGS_TYPE,
    title: SETTINGS_TITLE,
    [NEXT_VENDOR_FIELD]: seedValue,
  })

  const updatedSettings = await client
    .patch(settingsId)
    .setIfMissing({[NEXT_VENDOR_FIELD]: seedValue})
    .inc({[NEXT_VENDOR_FIELD]: 1})
    .commit({autoGenerateArrayKeys: true})

  const nextValue =
    typeof updatedSettings?.nextVendorNumber === 'number'
      ? updatedSettings.nextVendorNumber
      : seedValue + 1

  const reservedNumber = nextValue - 1
  return formatVendorNumber(reservedNumber)
}
