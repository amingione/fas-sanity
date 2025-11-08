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

const ADDRESS_QUERY = `
{
  "customers": *[_type == "customer"][0...250]{
    _id,
    firstName,
    lastName,
    name,
    email,
    phone,
    shippingAddress,
    billingAddress,
    addresses
  },
  "orders": *[_type == "order"][0...250]{
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
    addresses?: Array<Record<string, any> | null> | null
  }>
  orders: Array<{
    _id: string
    orderNumber?: string
    customerName?: string
    customerEmail?: string
    shippingAddress?: Record<string, any>
  }>
}

function stringOrUndefined(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }
  return undefined
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

    if (Array.isArray(customer.addresses)) {
      customer.addresses.forEach((entry) => {
        pushOption(
          normalizeAddress(entry || {}, {
            ...baseMeta,
            label: `Saved address — ${baseName}`,
          }),
        )
      })
    }
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

export default function AddressAutocompleteInput(props: ObjectInputProps<Record<string, any>>) {
  const {renderDefault, schemaType, value, onChange, id, path} = props
  const mapping = useMemo(() => mappingByType[schemaType.name], [schemaType.name])
  const client = useClient({apiVersion: '2024-10-01'})
  const [options, setOptions] = useState<AddressOption[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState<string>('')
  const [optionLookup, setOptionLookup] = useState<Map<string, AddressOption>>(new Map())
  const autoFilledRef = useRef(false)
  const stripeSummary = useFormValue(['stripeSummary']) as Record<string, any> | null

  useEffect(() => {
    if (!mapping) return
    let cancelled = false
    setLoading(true)
    setError(null)
    client
      .fetch<AddressQueryResult>(ADDRESS_QUERY)
      .then((result) => {
        if (cancelled) return
        const built = buildOptions(result)
        setOptions(built)
        setOptionLookup(new Map(built.map((opt) => [opt.value, opt])))
      })
      .catch((err) => {
        if (cancelled) return
        console.error('AddressAutocompleteInput: failed to load saved addresses', err)
        setError('Unable to load saved addresses')
        setOptions([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [client, mapping])

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

  const schemaOptions = schemaType.options as Record<string, any> | undefined
  const lookupSetting = schemaOptions?.showSavedAddressLookup
  const showLookup =
    typeof lookupSetting === 'boolean' ? lookupSetting : schemaType.name !== 'shippingAddress'

  return (
    <Stack space={4}>
      {showLookup && (
        <Card padding={4} paddingBottom={[7, 7, 8]} radius={2} border tone="transparent">
          <Stack space={3}>
            <Text size={2} weight="semibold">
              Pull a saved address
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
              placeholder={loading ? 'Loading saved addresses…' : 'Search saved addresses'}
              suffix={
                loading ? (
                  <Flex align="center">
                    <Spinner muted size={2} />
                  </Flex>
                ) : undefined
              }
              openButton
            />
            {error && (
              <Text size={1} style={{color: 'var(--card-critical-fg-color)', minHeight: '1.5em'}}>
                {error}
              </Text>
            )}
            {!loading && options.length === 0 && !error && (
              <Text size={1} muted>
                No saved addresses found yet. You can fill the fields manually below.
              </Text>
            )}
          </Stack>
        </Card>
      )}
      {renderDefault(props)}
    </Stack>
  )
}
