import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {Autocomplete, Card, Flex, Spinner, Stack, Text} from '@sanity/ui'
import {SearchIcon} from '@sanity/icons'
import type {BaseAutocompleteOption} from '@sanity/ui'
import {ObjectInputProps, set, useClient, useFormValue} from 'sanity'

type AddressValue = Record<string, any> | undefined

interface NormalizedAddress {
  key: string
  label: string
  searchTerms: string
  line1?: string
  line2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  name?: string
  email?: string
  phone?: string
  sourceLabel?: string
}

interface AddressOption extends BaseAutocompleteOption {
  label: string
  address: NormalizedAddress
  sourceLabel?: string
  searchValue: string
}

const ADDRESS_SEARCH_QUERY = `
{
  "customers": *[_type == "customer" && (defined(shippingAddress) || defined(billingAddress)) && (
    lower(name) match $term ||
    lower(email) match $term ||
    lower(firstName) match $term ||
    lower(lastName) match $term ||
    lower(shippingAddress.street) match $term ||
    lower(shippingAddress.addressLine1) match $term ||
    lower(shippingAddress.city) match $term ||
    lower(shippingAddress.state) match $term ||
    lower(shippingAddress.postalCode) match $term ||
    lower(shippingAddress.country) match $term ||
    lower(billingAddress.street) match $term ||
    lower(billingAddress.addressLine1) match $term ||
    lower(billingAddress.city) match $term ||
    lower(billingAddress.state) match $term ||
    lower(billingAddress.postalCode) match $term ||
    lower(billingAddress.country) match $term
  )][0...40]{
    _id,
    firstName,
    lastName,
    name,
    email,
    phone,
    shippingAddress,
    billingAddress
  },
  "orders": *[_type == "order" && defined(shippingAddress) && (
    lower(orderNumber) match $term ||
    lower(customerName) match $term ||
    lower(customerEmail) match $term ||
    lower(shippingAddress.addressLine1) match $term ||
    lower(shippingAddress.city) match $term ||
    lower(shippingAddress.state) match $term ||
    lower(shippingAddress.postalCode) match $term ||
    lower(shippingAddress.country) match $term
  )][0...40]{
    _id,
    orderNumber,
    customerName,
    customerEmail,
    shippingAddress
  }
}
`

interface AddressQueryResult {
  customers: Array<{
    _id: string
    firstName?: string
    lastName?: string
    name?: string
    email?: string
    phone?: string
    shippingAddress?: Record<string, any>
    billingAddress?: Record<string, any>
  }>
  orders: Array<{
    _id: string
    orderNumber?: string
    customerName?: string
    customerEmail?: string
    shippingAddress?: Record<string, any>
  }>
}

const US_STATE_ABBREVIATIONS: Record<string, string> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  'district of columbia': 'DC',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
}

function usStateAbbreviation(value?: string): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const lookup = US_STATE_ABBREVIATIONS[trimmed.toLowerCase()]
  return lookup || trimmed.toUpperCase()
}

function normalizeMapboxFeature(feature: Record<string, any>): NormalizedAddress | null {
  if (!feature) return null
  const ctx = Array.isArray(feature.context) ? feature.context : []
  const place = ctx.find((item) => String(item.id || '').startsWith('place.'))
  const region = ctx.find((item) => String(item.id || '').startsWith('region.'))
  const postcode = ctx.find((item) => String(item.id || '').startsWith('postcode.'))
  const countryCtx = ctx.find((item) => String(item.id || '').startsWith('country.'))

  const addrNum = feature?.address || feature?.properties?.address
  const street =
    feature?.text ||
    feature?.text_en ||
    String(feature?.place_name || '').split(',')[0] ||
    undefined
  const line1 = [addrNum, street].filter(Boolean).join(' ').trim()

  const city = feature?.properties?.city || place?.text
  const rawState = feature?.properties?.region || region?.text
  const countryCode =
    feature?.properties?.short_code ||
    countryCtx?.short_code ||
    countryCtx?.properties?.short_code
  const state =
    String(countryCode || '').toUpperCase() === 'US'
      ? usStateAbbreviation(rawState)
      : rawState
  const postalCode = feature?.properties?.postcode || postcode?.text
  const country = countryCtx?.text || feature?.properties?.country

  if (!line1 && !city && !state && !postalCode && !country) {
    return null
  }

  const searchTerms = [line1, city, state, postalCode, country]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return {
    key: `mapbox-${feature.id}`,
    label: feature?.place_name || line1 || city || 'Global address',
    searchTerms,
    line1: line1 || undefined,
    line2: undefined,
    city,
    state,
    postalCode,
    country,
    sourceLabel: 'Global address search',
  }
}

function stringOrUndefined(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }
  return undefined
}

function useMaybeFormValue<T = unknown>(path: (string | number)[]): T | undefined {
  try {
    return useFormValue(path) as T
  } catch (error) {
    if (error instanceof Error && (error.message || '').includes('FormValueProvider')) {
      return undefined
    }
    throw error
  }
}

function normalizeAddress(
  raw: Record<string, any> | null | undefined,
  meta: {label?: string; source?: string; defaultName?: string; email?: string; phone?: string},
): NormalizedAddress | null {
  if (!raw) return null

  const line1 =
    stringOrUndefined(raw.addressLine1) ||
    stringOrUndefined(raw.address_line1) ||
    stringOrUndefined(raw.street) ||
    stringOrUndefined(raw.street1) ||
    stringOrUndefined(raw.line1)

  const line2 =
    stringOrUndefined(raw.addressLine2) ||
    stringOrUndefined(raw.address_line2) ||
    stringOrUndefined(raw.street2) ||
    stringOrUndefined(raw.line2)

  const city =
    stringOrUndefined(raw.city) ||
    stringOrUndefined(raw.city_locality) ||
    stringOrUndefined(raw.locality) ||
    stringOrUndefined(raw.town)

  const state =
    stringOrUndefined(raw.state) ||
    stringOrUndefined(raw.state_province) ||
    stringOrUndefined(raw.region) ||
    stringOrUndefined(raw.stateProvince)

  const postalCode =
    stringOrUndefined(raw.postalCode) ||
    stringOrUndefined(raw.postal_code) ||
    stringOrUndefined(raw.zip) ||
    stringOrUndefined(raw.zipCode)

  const country =
    stringOrUndefined(raw.country) ||
    stringOrUndefined(raw.country_code) ||
    stringOrUndefined(raw.countryCode)

  const name = stringOrUndefined(raw.name) || stringOrUndefined(raw.fullName) || meta.defaultName
  const email = stringOrUndefined(raw.email) || meta.email
  const phone = stringOrUndefined(raw.phone) || meta.phone

  if (!line1 && !city && !state && !postalCode && !country) {
    return null
  }

  const key = [name, line1, line2, city, state, postalCode, country]
    .map((part) => (part || '').toLowerCase())
    .join('|')

  const cityState = [city, state].filter(Boolean).join(', ')
  const postalCountry = [postalCode, country].filter(Boolean).join(' ')
  const labelParts = [name, line1, cityState, postalCountry].filter(Boolean)
  const label =
    labelParts.join(' • ') || line1 || cityState || postalCountry || meta.label || 'Address'

  const searchTerms = [label, line2, meta.label, meta.source]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return {
    key,
    label,
    searchTerms,
    line1,
    line2,
    city,
    state,
    postalCode,
    country,
    name,
    email,
    phone,
    sourceLabel: meta.label,
  }
}

function buildOptions(data: AddressQueryResult | null | undefined): AddressOption[] {
  if (!data) return []
  const seen = new Set<string>()
  const options: AddressOption[] = []

  const pushOption = (address: NormalizedAddress | null | undefined) => {
    if (!address) return
    if (seen.has(address.key)) return
    seen.add(address.key)
    options.push({
      value: `${address.key}`,
      address,
      label: address.label,
      sourceLabel: address.sourceLabel,
      searchValue: `${address.label} ${address.searchTerms}`,
    })
  }

  data.customers.forEach((customer) => {
    const baseName =
      [customer.firstName, customer.lastName].filter(Boolean).join(' ') ||
      customer.name ||
      customer.email ||
      'Customer'

    const baseMeta = {
      source: 'customer',
      defaultName: baseName,
      email: customer.email,
      phone: customer.phone,
    }

    pushOption(
      normalizeAddress(customer.shippingAddress, {
        ...baseMeta,
        label: `Customer shipping — ${baseName}`,
      }),
    )

    pushOption(
      normalizeAddress(customer.billingAddress, {
        ...baseMeta,
        label: `Customer billing — ${baseName}`,
      }),
    )

  })

  data.orders.forEach((order) => {
    pushOption(
      normalizeAddress(order.shippingAddress, {
        source: 'order',
        label: order.orderNumber ? `Order ${order.orderNumber}` : 'Order shipping address',
        defaultName: order.customerName || order.customerEmail,
        email: order.customerEmail,
      }),
    )
  })

  return options.sort((a, b) => a.label.localeCompare(b.label))
}

type MappingFn = (
  address: NormalizedAddress,
  prev: AddressValue,
  schemaTypeName: string,
) => Record<string, any>

const mappingByType: Record<string, MappingFn> = {
  shippingAddress: (address, prev, typeName) => {
    const next = {...(prev || {})}
    if (typeName) next._type = prev?._type || typeName
    next.name = address.name ?? ''
    next.email = address.email ?? prev?.email ?? ''
    next.phone = address.phone ?? prev?.phone ?? ''
    next.addressLine1 = address.line1 ?? ''
    next.addressLine2 = address.line2 ?? ''
    next.city = address.city ?? ''
    next.state = address.state ?? ''
    next.postalCode = address.postalCode ?? ''
    next.country = address.country ?? ''
    return next
  },
  customerBillingAddress: (address, prev, typeName) => {
    const next = {...(prev || {})}
    if (typeName) next._type = prev?._type || typeName
    next.name = address.name ?? ''
    next.street =
      [address.line1, address.line2]
        .filter(Boolean)
        .join(address.line1 && address.line2 ? ', ' : '') || ''
    next.city = address.city ?? ''
    next.state = address.state ?? ''
    next.postalCode = address.postalCode ?? ''
    next.country = address.country ?? ''
    return next
  },
  customerAddress: (address, prev, typeName) => {
    const next = {...(prev || {})}
    if (typeName) next._type = prev?._type || typeName
    next.street =
      [address.line1, address.line2]
        .filter(Boolean)
        .join(address.line1 && address.line2 ? ', ' : '') || ''
    next.city = address.city ?? ''
    next.state = address.state ?? ''
    next.zip = address.postalCode ?? ''
    next.country = address.country ?? ''
    return next
  },
  shippingOptionCustomerAddress: (address, prev, typeName) => {
    const next = {...(prev || {})}
    if (typeName) next._type = prev?._type || typeName
    next.name = address.name ?? ''
    next.address_line1 = address.line1 ?? ''
    next.city_locality = address.city ?? ''
    next.state_province = address.state ?? ''
    next.postal_code = address.postalCode ?? ''
    next.country_code = address.country ?? ''
    return next
  },
}

const parseStripeSummary = (value: Record<string, any> | null): Record<string, any> | null => {
  if (!value) return null
  if (typeof value.data === 'string') {
    try {
      const parsed = JSON.parse(value.data)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, any>
      }
    } catch {
      return null
    }
    return null
  }
  return value
}

export default function AddressAutocompleteInput(props: ObjectInputProps<Record<string, any>>) {
  const {renderDefault, schemaType, value, onChange, id, path} = props
  const mapping = useMemo(() => mappingByType[schemaType.name], [schemaType.name])
  const client = useClient({apiVersion: '2024-10-01'})
  const [savedOptions, setSavedOptions] = useState<AddressOption[]>([])
  const [savedLoading, setSavedLoading] = useState<boolean>(false)
  const [savedError, setSavedError] = useState<string | null>(null)
  const [mapboxOptions, setMapboxOptions] = useState<AddressOption[]>([])
  const [mapboxLoading, setMapboxLoading] = useState<boolean>(false)
  const [mapboxError, setMapboxError] = useState<string | null>(null)
  const [query, setQuery] = useState<string>('')
  const savedRequestIdRef = useRef(0)
  const mapboxRequestIdRef = useRef(0)
  const searchControllerRef = useRef<AbortController | null>(null)
  const mapboxControllerRef = useRef<AbortController | null>(null)
  const mapboxToken = (
    typeof process !== 'undefined' ? process.env?.SANITY_STUDIO_MAPBOX_TOKEN : undefined
  ) as string | undefined
  const autoFilledRef = useRef(false)
  const stripeSummaryValue = useMaybeFormValue(['stripeSummary']) as Record<string, any> | null
  const stripeSummary = useMemo(
    () => parseStripeSummary(stripeSummaryValue),
    [stripeSummaryValue],
  )
  const schemaOptions = schemaType.options as Record<string, any> | undefined
  const lookupSetting = schemaOptions?.showSavedAddressLookup
  const showLookup = lookupSetting === true

  useEffect(() => {
    if (!mapping || !showLookup) return
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      savedRequestIdRef.current = 0
      searchControllerRef.current?.abort()
      setSavedLoading(false)
      setSavedError(null)
      setSavedOptions([])
      return
    }

    const requestId = ++savedRequestIdRef.current
    const controller = new AbortController()
    searchControllerRef.current?.abort()
    searchControllerRef.current = controller
    setSavedLoading(true)
    setSavedError(null)

    const searchTerm = `*${trimmed.toLowerCase()}*`

    client
      .fetch<AddressQueryResult>(ADDRESS_SEARCH_QUERY, {term: searchTerm}, {signal: controller.signal})
      .then((result) => {
        if (
          controller.signal.aborted ||
          savedRequestIdRef.current !== requestId ||
          !mapping ||
          !showLookup
        ) {
          return
        }
        const built = buildOptions(result)
        setSavedOptions(built)
      })
      .catch((err) => {
        if (
          controller.signal.aborted ||
          savedRequestIdRef.current !== requestId ||
          !mapping ||
          !showLookup
        ) {
          return
        }
        console.error('AddressAutocompleteInput: failed to search saved addresses', err)
        setSavedError('Unable to search saved addresses')
        setSavedOptions([])
      })
      .finally(() => {
        if (
          controller.signal.aborted ||
          savedRequestIdRef.current !== requestId ||
          !mapping ||
          !showLookup
        ) {
          return
        }
        setSavedLoading(false)
      })

    return () => {
      controller.abort()
    }
  }, [client, mapping, query, showLookup])

  useEffect(() => {
    if (!mapping || !showLookup || !mapboxToken) return
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      mapboxRequestIdRef.current = 0
      mapboxControllerRef.current?.abort()
      setMapboxLoading(false)
      setMapboxError(null)
      setMapboxOptions([])
      return
    }

    const requestId = ++mapboxRequestIdRef.current
    const controller = new AbortController()
    mapboxControllerRef.current?.abort()
    mapboxControllerRef.current = controller
    setMapboxLoading(true)
    setMapboxError(null)

    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
      trimmed,
    )}.json?types=address&autocomplete=true&limit=6&access_token=${mapboxToken}`

    fetch(url, {signal: controller.signal})
      .then((res) => {
        if (!res.ok) {
          throw new Error('Mapbox returned an error')
        }
        return res.json()
      })
      .then((data) => {
        if (
          controller.signal.aborted ||
          mapboxRequestIdRef.current !== requestId ||
          !mapping ||
          !showLookup
        ) {
          return
        }
        const features = Array.isArray(data?.features) ? data.features : []
        const normalized = features
          .map((feature: Record<string, any>) => normalizeMapboxFeature(feature))
          .filter((address): address is NormalizedAddress => Boolean(address))
          .map((address) => ({
            value: address.key,
            address,
            label: address.label,
            sourceLabel: address.sourceLabel,
            searchValue: `${address.label} ${address.searchTerms}`,
          }))
        setMapboxOptions(normalized)
      })
      .catch((err) => {
        if (
          controller.signal.aborted ||
          mapboxRequestIdRef.current !== requestId ||
          !mapping ||
          !showLookup
        ) {
          return
        }
        console.error('AddressAutocompleteInput: failed to search global addresses', err)
        setMapboxError('Unable to search global addresses')
        setMapboxOptions([])
      })
      .finally(() => {
        if (
          controller.signal.aborted ||
          mapboxRequestIdRef.current !== requestId ||
          !mapping ||
          !showLookup
        ) {
          return
        }
        setMapboxLoading(false)
      })

    return () => {
      controller.abort()
    }
  }, [mapping, mapboxToken, query, showLookup])

  useEffect(() => {
    if (!mapping) return
    if (autoFilledRef.current) return

    const current = value as Record<string, any> | undefined
    const hasMeaningfulValue = () => {
      if (!current) return false
      const entries = Object.entries(current).filter(([key]) => !key.startsWith('_'))
      return entries.some(([, v]) => {
        if (typeof v === 'string') return v.trim().length > 0
        return Boolean(v)
      })
    }

    if (hasMeaningfulValue()) {
      autoFilledRef.current = true
      return
    }

    const summaryAddress = stripeSummary?.shippingAddress || stripeSummary?.billingAddress
    if (!summaryAddress) return

    const normalized = normalizeAddress(summaryAddress, {
      label: 'Stripe checkout',
      source: 'stripe',
      defaultName:
        stripeSummary?.customer?.name || summaryAddress?.name || summaryAddress?.email || undefined,
      email: stripeSummary?.customer?.email || summaryAddress?.email,
      phone: stripeSummary?.customer?.phone || summaryAddress?.phone,
    })

    if (!normalized) return

    const nextValue = mapping(normalized, current, schemaType.name)
    autoFilledRef.current = true
    onChange(set(nextValue))
  }, [mapping, onChange, schemaType.name, stripeSummary, value])

  const options = useMemo(() => [...savedOptions, ...mapboxOptions], [
    savedOptions,
    mapboxOptions,
  ])
  const optionLookup = useMemo(
    () => new Map(options.map((option) => [option.value, option])),
    [options],
  )
  const loading = savedLoading || mapboxLoading
  const error = savedError || mapboxError

  const handleSelect = useCallback(
    (selectedValue: string) => {
      if (!mapping || !selectedValue) return
      const option = optionLookup.get(selectedValue)
      if (!option) return
      const nextValue = mapping(option.address, value, schemaType.name)
      onChange(set(nextValue))
      setQuery('')
    },
    [mapping, onChange, optionLookup, schemaType.name, value],
  )

  if (!mapping) {
    return renderDefault(props)
  }

  const inputId =
    id || (Array.isArray(path) ? ['address-lookup', ...path].join('-') : 'address-lookup-input')

  return (
    <Stack space={4}>
      {showLookup && (
        <Card padding={4} paddingBottom={[7, 7, 8]} radius={2} border tone="transparent">
          <Stack space={3}>
            <Text size={2} weight="semibold">
              Pull a saved or global address
            </Text>
            <Autocomplete<AddressOption>
              id={inputId}
              fontSize={[2, 2, 3]}
              icon={SearchIcon}
              options={options}
              value={query}
              loading={loading}
              onChange={setQuery}
              onSelect={handleSelect}
              filterOption={(term, option) => {
                if (!term) return true
                const opt = option as AddressOption
                return opt.searchValue.toLowerCase().includes(term.toLowerCase())
              }}
              renderOption={(option) => {
                const opt = option as AddressOption
                const address = opt.address
                const lines = [
                  [address.line1, address.line2].filter(Boolean).join(', '),
                  [address.city, address.state].filter(Boolean).join(', '),
                  [address.postalCode, address.country].filter(Boolean).join(' '),
                ].filter(Boolean)

                return (
                  <Stack paddingY={2} paddingX={3} space={2}>
                    <Text size={2} weight="semibold">
                      {address.name || address.label}
                    </Text>
                    {lines.map((line, idx) => (
                      <Text key={idx} size={1}>
                        {line}
                      </Text>
                    ))}
                    {opt.sourceLabel && (
                      <Text size={1} muted>
                        {opt.sourceLabel}
                      </Text>
                    )}
                  </Stack>
                )
              }}
              placeholder={
                loading ? 'Loading saved and global addresses…' : 'Type 2+ characters to search saved and global addresses'
              }
              suffix={
                loading ? (
                  <Flex align="center">
                    <Spinner muted size={2} />
                  </Flex>
                ) : undefined
              }
              openOnFocus
            />
            {error && (
              <Text size={1} style={{color: 'var(--card-critical-fg-color)', minHeight: '1.5em'}}>
                {error}
              </Text>
            )}
            {!loading && options.length === 0 && !error && (
              <Text size={1} muted>
                {query.trim().length < 2
                  ? 'Type at least two characters to search saved and global addresses.'
                  : 'No saved or global addresses matched that text.'}
              </Text>
            )}
          </Stack>
        </Card>
      )}
      {renderDefault(props)}
    </Stack>
  )
}
