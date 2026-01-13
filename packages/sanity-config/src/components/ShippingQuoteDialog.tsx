import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {
  Autocomplete,
  Box,
  Button,
  Card,
  Dialog,
  Flex,
  Label,
  Stack,
  Text,
  TextArea,
  TextInput,
} from '@sanity/ui'
import {SearchIcon} from '@sanity/icons'
import {set, useClient} from 'sanity'
import type {ObjectInputProps} from 'sanity'
import AddressAutocompleteInput from './inputs/AddressAutocompleteInput'

interface ShippingQuoteDialogProps {
  onClose: () => void
}

interface Dimensions {
  length: number
  width: number
  height: number
}

interface Product {
  _id: string
  title: string
  dimensions?: Dimensions
  weight?: number
}

interface Customer {
  _id: string
  name: string
  email?: string
  shippingAddress?: {
    street?: string
    city?: string
    state?: string
    postalCode?: string
    country?: string
  }
}

interface Rate {
  rateId: string
  carrier: string
  service: string
  rate: string
  currency: string
  deliveryDays?: number
}

const INITIAL_DIMENSIONS = {length: '', width: '', height: '', weight: ''}
const parseManualNumber = (value: string) => {
  const num = Number.parseFloat(value)
  return Number.isFinite(num) ? num : 0
}

const formatAddressPreview = (address: {
  name?: string
  street?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
}) => {
  if (!address) return ''
  const parts = [
    address.name,
    address.street,
    [address.city, address.state, address.postalCode]
      .filter((line) => line && String(line).trim())
      .join(', '),
    address.country,
  ].filter((part) => part && String(part).trim())
  return parts.join('\n')
}

export function ShippingQuoteDialog({onClose}: ShippingQuoteDialogProps) {
  const client = useClient({apiVersion: '2024-01-01'})
  const customerRequestIdRef = useRef(0)
  const productRequestIdRef = useRef(0)
  const customerAbortControllerRef = useRef<AbortController | null>(null)
  const productAbortControllerRef = useRef<AbortController | null>(null)

  // Customer search state
  const [customerSearch, setCustomerSearch] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false)

  const [shipToAddress, setShipToAddress] = useState('')
  const [structuredShipToAddress, setStructuredShipToAddress] = useState<{
    name?: string
    street?: string
    city?: string
    state?: string
    postalCode?: string
    country?: string
  } | null>(null)
  const [manualDimensions, setManualDimensions] = useState(INITIAL_DIMENSIONS)
  const [quoteNotes, setQuoteNotes] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [isLoadingProducts, setIsLoadingProducts] = useState(false)
  const [rates, setRates] = useState<Rate[]>([])
  const [isLoadingRates, setIsLoadingRates] = useState(false)
  const addressSchemaType = useMemo(
    () => ({
      name: 'customerBillingAddress',
      options: {showSavedAddressLookup: true},
    }),
    [],
  )

  const customerOptions = useMemo(
    () =>
      customers.map((customer) => ({
        value: customer._id,
        label: customer.name || customer.email || 'Customer',
        subtitle: customer.email ? `Email: ${customer.email}` : '',
        address: customer.shippingAddress
          ? [
              customer.shippingAddress.street,
              customer.shippingAddress.city,
              customer.shippingAddress.state,
              customer.shippingAddress.postalCode,
            ]
              .filter(Boolean)
              .join(', ')
          : undefined,
      })),
    [customers],
  )

  const productOptions = useMemo(
    () =>
      products.map((product) => {
        const dims = product.dimensions
        const hasDims = dims?.length && dims?.width && dims?.height
        const hasWeight = typeof product.weight === 'number' && product.weight > 0
        const detail =
          hasDims && hasWeight
            ? `(${dims.length}×${dims.width}×${dims.height}" • ${product.weight} lbs)`
            : hasDims
              ? `(${dims.length}×${dims.width}×${dims.height}")`
              : hasWeight
                ? `(${product.weight} lbs)`
                : '(no dimensions)'

        return {
          value: product._id,
          label: product.title,
          subtitle: detail,
        }
      }),
    [products],
  )

  const handleCustomerSelect = useCallback(
    (value?: string) => {
      setSelectedCustomerId(value || '')
      const match = customerOptions.find((option) => option.value === value)
      if (match) {
        setCustomerSearch(match.label)
      }
    },
    [customerOptions],
  )

  const handleProductSelect = useCallback(
    (value?: string) => {
      setSelectedProductId(value || '')
      const match = productOptions.find((option) => option.value === value)
      if (match) {
        setProductSearch(match.label)
      }
    },
    [productOptions],
  )

  const handleStructuredAddressChange = useCallback((patch: any) => {
    if (!patch || patch.type !== 'set') return
    const nextAddress = patch.value
    if (!nextAddress) {
      setStructuredShipToAddress(null)
      return
    }
    const normalized = {
      name: nextAddress.name || '',
      street: nextAddress.street || '',
      city: nextAddress.city || '',
      state: nextAddress.state || '',
      postalCode: nextAddress.postalCode || '',
      country: nextAddress.country || '',
    }
    setStructuredShipToAddress(normalized)
  }, [])

  const renderAddressFields = useCallback(
    (props: ObjectInputProps<Record<string, string | undefined>>) => {
      const currentValue = {
        street: '',
        city: '',
        state: '',
        postalCode: '',
        country: '',
        ...(props.value || {}),
      }
      const handleFieldChange =
        (field: keyof typeof currentValue) => (event: React.ChangeEvent<HTMLInputElement>) => {
          props.onChange?.(
            set({
              ...currentValue,
              [field]: event.currentTarget.value,
              _type: 'customerBillingAddress',
            }),
          )
        }

      return (
        <Stack space={2}>
          <TextInput
            placeholder="Street address"
            value={currentValue.street || ''}
            onChange={handleFieldChange('street')}
          />
          <Flex gap={2}>
            <TextInput
              placeholder="City"
              value={currentValue.city || ''}
              onChange={handleFieldChange('city')}
            />
            <TextInput
              placeholder="State"
              value={currentValue.state || ''}
              onChange={handleFieldChange('state')}
            />
          </Flex>
          <Flex gap={2}>
            <TextInput
              placeholder="Postal code"
              value={currentValue.postalCode || ''}
              onChange={handleFieldChange('postalCode')}
            />
            <TextInput
              placeholder="Country"
              value={currentValue.country || ''}
              onChange={handleFieldChange('country')}
            />
          </Flex>
        </Stack>
      )
    },
    [],
  )

  const addressAutocompleteProps = useMemo(
    () => ({
      renderDefault: renderAddressFields,
      schemaType: addressSchemaType,
      value: structuredShipToAddress || {},
      onChange: handleStructuredAddressChange,
      id: 'shipping-quote-address',
      path: ['shippingAddress'],
    }),
    [
      addressSchemaType,
      handleStructuredAddressChange,
      renderAddressFields,
      structuredShipToAddress,
    ],
  )

  // Customer search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      const query = customerSearch.trim().toLowerCase()
      if (!query) {
        customerAbortControllerRef.current?.abort()
        setIsLoadingCustomers(false)
        return
      }
      const requestId = ++customerRequestIdRef.current
      const controller = new AbortController()
      customerAbortControllerRef.current?.abort()
      customerAbortControllerRef.current = controller
      setIsLoadingCustomers(true)

      void (async () => {
        try {
          const results = await client.fetch<Customer[]>(
            `*[_type == "customer" && (
              lower(name) match $searchTerm ||
              lower(email) match $searchTerm ||
              lower(firstName) match $searchTerm ||
              lower(lastName) match $searchTerm
            )][0...10]{
              _id,
              name,
              email,
              shippingAddress {
                street,
                city,
                state,
                postalCode,
                country
              }
            }`,
            {searchTerm: `*${query}*`},
            {signal: controller.signal},
          )
          if (customerRequestIdRef.current !== requestId) return
          setCustomers(results || [])
        } catch (error: any) {
          if (controller.signal.aborted) return
          if (customerRequestIdRef.current !== requestId) return
          console.error('Error searching customers', error)
          setCustomers([])
        } finally {
          if (customerRequestIdRef.current === requestId && !controller.signal.aborted) {
            setIsLoadingCustomers(false)
          }
        }
      })()
    }, 300)
    return () => {
      clearTimeout(timer)
      customerAbortControllerRef.current?.abort()
    }
  }, [client, customerSearch])

  // Product search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      const query = productSearch.trim().toLowerCase()
      if (!query) {
        productAbortControllerRef.current?.abort()
        setIsLoadingProducts(false)
        return
      }
      const requestId = ++productRequestIdRef.current
      const controller = new AbortController()
      productAbortControllerRef.current?.abort()
      productAbortControllerRef.current = controller
      setIsLoadingProducts(true)

      void (async () => {
        try {
          const results = await client.fetch<Product[]>(
            `*[_type == "product" && lower(title) match $searchTerm][0...20]{
              _id,
              title,
              "dimensions": coalesce(shippingConfig.dimensions, dimensions),
              "weight": coalesce(
                shippingConfig.weight,
                shippingWeight.value,
                shippingWeight
              )
            }`,
            {searchTerm: `*${query}*`},
            {signal: controller.signal},
          )
          if (productRequestIdRef.current !== requestId) return
          setProducts(results || [])
        } catch (error: any) {
          if (controller.signal.aborted) return
          if (productRequestIdRef.current !== requestId) return
          console.error('Error searching products for shipping quote', error)
          setProducts([])
        } finally {
          if (productRequestIdRef.current === requestId && !controller.signal.aborted) {
            setIsLoadingProducts(false)
          }
        }
      })()
    }, 300)
    return () => {
      clearTimeout(timer)
      productAbortControllerRef.current?.abort()
    }
  }, [client, productSearch])

  useEffect(() => {
    if (selectedCustomerId && !customers.some((customer) => customer._id === selectedCustomerId)) {
      setSelectedCustomerId('')
    }
  }, [customers, selectedCustomerId])

  useEffect(() => {
    if (selectedProductId && !products.some((product) => product._id === selectedProductId)) {
      setSelectedProductId('')
    }
  }, [products, selectedProductId])

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer._id === selectedCustomerId),
    [customers, selectedCustomerId],
  )

  const selectedProduct = useMemo(
    () => products.find((product) => product._id === selectedProductId),
    [products, selectedProductId],
  )

  useEffect(() => {
    if (!selectedProduct) return
    const dims = selectedProduct.dimensions
    if (dims?.length && dims?.width && dims?.height && typeof selectedProduct.weight === 'number') {
      setManualDimensions({
        length: String(dims.length),
        width: String(dims.width),
        height: String(dims.height),
        weight: String(selectedProduct.weight),
      })
    }
  }, [selectedProduct])

  // Auto-populate shipping address when customer is selected
  useEffect(() => {
    if (selectedCustomer?.shippingAddress) {
      const addr = selectedCustomer.shippingAddress
      const lines = [
        selectedCustomer.name,
        addr.street,
        [addr.city, addr.state, addr.postalCode]
          .filter((line) => line && String(line).trim())
          .join(', '),
        addr.country,
      ].filter((line) => line && String(line).trim())
      setShipToAddress(lines.join('\n'))
      setStructuredShipToAddress({
        name: selectedCustomer.name,
        street: addr.street,
        city: addr.city,
        state: addr.state,
        postalCode: addr.postalCode,
        country: addr.country,
      })
      return
    }
    setStructuredShipToAddress(null)
  }, [selectedCustomer])

  useEffect(() => {
    if (structuredShipToAddress) {
      setShipToAddress(formatAddressPreview(structuredShipToAddress))
    } else {
      setShipToAddress('')
    }
  }, [structuredShipToAddress])

  const hasManualDimensions = useMemo(() => {
    return (
      manualDimensions.length.trim() &&
      manualDimensions.width.trim() &&
      manualDimensions.height.trim() &&
      manualDimensions.weight.trim()
    )
  }, [manualDimensions])

  const canGetQuote = useMemo(() => {
    const hasAddress = shipToAddress.trim().length > 0
    const hasProductDimensions = Boolean(
      selectedProduct?.dimensions?.length &&
      selectedProduct?.dimensions?.width &&
      selectedProduct?.dimensions?.height &&
      selectedProduct?.weight,
    )
    return hasAddress && (hasManualDimensions || hasProductDimensions)
  }, [hasManualDimensions, selectedProduct, shipToAddress])

  const resolveDimensions = (): {dimensions: Dimensions; weight: number} => {
    if (
      selectedProduct?.dimensions?.length &&
      selectedProduct?.dimensions?.width &&
      selectedProduct?.dimensions?.height &&
      selectedProduct?.weight
    ) {
      return {dimensions: selectedProduct.dimensions, weight: selectedProduct.weight}
    }
    return {
      dimensions: {
        length: parseManualNumber(manualDimensions.length),
        width: parseManualNumber(manualDimensions.width),
        height: parseManualNumber(manualDimensions.height),
      },
      weight: parseManualNumber(manualDimensions.weight),
    }
  }

  const handleGetQuotes = async () => {
    if (!canGetQuote) return
    setIsLoadingRates(true)
    setRates([])

    try {
      const {dimensions, weight} = resolveDimensions()
      const hasStructured =
        structuredShipToAddress &&
        (structuredShipToAddress.street ||
          structuredShipToAddress.city ||
          structuredShipToAddress.state ||
          structuredShipToAddress.postalCode ||
          structuredShipToAddress.country)
      const toAddressPayload = hasStructured ? structuredShipToAddress : shipToAddress
      const response = await fetch('/.netlify/functions/getEasyPostRates', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          ship_to: toAddressPayload,
          package_details: {
            weight: {value: weight, unit: 'pound'},
            dimensions: {
              unit: 'inch',
              length: dimensions.length,
              width: dimensions.width,
              height: dimensions.height,
            },
          },
        }),
      })
      if (!response.ok) {
        const message = await response.text().catch(() => '')
        throw new Error(message || 'Failed to fetch shipping quotes')
      }
      const data = (await response.json()) as {rates?: any[]}
      const normalizedRates = Array.isArray(data.rates)
        ? data.rates.map((rate) => ({
            rateId: rate.rateId,
            carrier: rate.carrier,
            service: rate.service,
            rate:
              typeof rate.amount === 'number' ? rate.amount.toFixed(2) : String(rate.amount || ''),
            currency: rate.currency,
            deliveryDays: rate.deliveryDays,
          }))
        : []
      setRates(normalizedRates)
    } catch (error) {
      console.error('Error fetching shipping quotes', error)
      alert('Failed to fetch shipping quotes. Please try again.')
    } finally {
      setIsLoadingRates(false)
    }
  }

  const handleSaveQuote = async (rate: Rate) => {
    const trimmedCustomerId = selectedCustomerId.trim()
    if (!trimmedCustomerId) {
      alert('Select a customer before saving a quote.')
      return
    }

    try {
      const {dimensions, weight} = resolveDimensions()
      const pdfResponse = await fetch('/.netlify/functions/generateShippingQuotePDF', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          shipToAddress,
          dimensions,
          weight,
          rate,
          customerId: trimmedCustomerId,
          notes: quoteNotes.trim() || undefined,
        }),
      })
      if (!pdfResponse.ok) {
        const message = await pdfResponse.text().catch(() => '')
        throw new Error(message || 'Failed to generate quote PDF')
      }
      const {assetId} = (await pdfResponse.json()) as {assetId: string}

      await client
        .patch(trimmedCustomerId)
        .setIfMissing({shippingQuotes: []})
        .append('shippingQuotes', [
          {
            _type: 'file',
            asset: {_type: 'reference', _ref: assetId},
            createdAt: new Date().toISOString(),
            carrier: rate.carrier,
            service: rate.service,
            rate: rate.rate,
            notes: quoteNotes.trim() || '',
          },
        ])
        .commit({autoGenerateArrayKeys: true})

      alert('Shipping quote saved to customer record.')
      setQuoteNotes('')
      onClose()
    } catch (error) {
      console.error('Error saving shipping quote', error)
      alert('Failed to save quote to customer. Check console for details.')
    }
  }

  const handleManualDimensionChange = (field: keyof typeof manualDimensions) => {
    return (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.currentTarget.value
      setManualDimensions((prev) => ({...prev, [field]: value}))
    }
  }

  const hasAddressPreview = shipToAddress.trim().length > 0
  const manualDimensionHint = selectedProduct
    ? 'Selecting a product auto-fills these values; adjust them if you need a custom package.'
    : 'Enter package dimensions manually or search for a product to auto-populate the fields.'

  return (
    <Dialog id="shipping-quote-dialog" header="Shipping Quote" onClose={onClose} width={2}>
      <Box padding={4}>
        <Stack space={4}>
          <Card padding={4} radius={3} border tone="transparent">
            <Stack space={3}>
              <Stack space={1}>
                <Text size={1} weight="semibold">
                  1. Select Customer
                </Text>
                <Text size={1} muted>
                  Search by name or email to pull saved shipping details.
                </Text>
              </Stack>
              <Stack space={2}>
                <Label>Search Customer</Label>
                <Autocomplete
                  id="shipping-quote-customer"
                  openButton
                  openOnFocus
                  icon={SearchIcon}
                  loading={isLoadingCustomers}
                  options={customerOptions}
                  placeholder="Search by name or email..."
                  value={customerSearch}
                  onSelect={handleCustomerSelect}
                  onQueryChange={(next) => setCustomerSearch(next || '')}
                  renderOption={(option) => (
                    <Card padding={3}>
                      <Stack space={2}>
                        <Text weight="semibold">{option.label}</Text>
                        {option.subtitle && (
                          <Text size={1} muted>
                            {option.subtitle}
                          </Text>
                        )}
                        {option.address && (
                          <Text size={1} muted>
                            {option.address}
                          </Text>
                        )}
                      </Stack>
                    </Card>
                  )}
                  renderValue={(value, option) => option?.label || value}
                  popover={{
                    placement: 'bottom-start',
                    portal: false,
                  }}
                />
                {!customerSearch.trim() && (
                  <Text size={1} muted>
                    Start typing to surface active customers.
                  </Text>
                )}
                {customerSearch && !isLoadingCustomers && customerOptions.length === 0 && (
                  <Text size={1} muted>
                    No customers found — refine the query or add a customer record.
                  </Text>
                )}
              </Stack>
            </Stack>
          </Card>

          <Card padding={4} radius={3} border tone="transparent">
            <Stack space={3}>
              <Stack space={1}>
                <Text size={1} weight="semibold">
                  Shipping Address
                </Text>
                <Text size={1} muted>
                  Enter the destination address manually.
                </Text>
              </Stack>
              <Stack space={2}>
                <Label>Ship To Address *</Label>
                <AddressAutocompleteInput
                  {...(addressAutocompleteProps as ObjectInputProps<
                    Record<string, string | undefined>
                  >)}
                />
              </Stack>
              <Stack space={2}>
                <Label>Quote Notes</Label>
                <TextArea
                  rows={3}
                  value={quoteNotes}
                  onChange={(event) => setQuoteNotes(event.currentTarget.value)}
                  placeholder="Add context to include with the saved quote (optional)"
                />
              </Stack>
              {hasAddressPreview && (
                <Card padding={3} radius={2} border tone="default">
                  <Text size={1} style={{whiteSpace: 'pre-wrap'}}>
                    {shipToAddress}
                  </Text>
                </Card>
              )}
            </Stack>
          </Card>

          <Card padding={4} radius={3} border tone="transparent">
            <Stack space={3}>
              <Stack space={1}>
                <Text size={1} weight="semibold">
                  3. Package Details
                </Text>
                <Text size={1} muted>
                  {manualDimensionHint}
                </Text>
              </Stack>
              <Stack space={2}>
                <Label>Manual Package Dimensions (inches / lbs)</Label>
                <Flex gap={2} align="center">
                  <TextInput
                    placeholder="L"
                    type="number"
                    value={manualDimensions.length}
                    onChange={handleManualDimensionChange('length')}
                  />
                  <Text muted>×</Text>
                  <TextInput
                    placeholder="W"
                    type="number"
                    value={manualDimensions.width}
                    onChange={handleManualDimensionChange('width')}
                  />
                  <Text muted>×</Text>
                  <TextInput
                    placeholder="H"
                    type="number"
                    value={manualDimensions.height}
                    onChange={handleManualDimensionChange('height')}
                  />
                  <TextInput
                    placeholder="Weight (lbs)"
                    type="number"
                    value={manualDimensions.weight}
                    onChange={handleManualDimensionChange('weight')}
                  />
                </Flex>
              </Stack>
              <Flex align="center" gap={2}>
                <Box
                  flex={1}
                  style={{height: 1, backgroundColor: 'var(--card-border-color, #E5E7EB)'}}
                />
                <Text size={1} muted>
                  Or pull a product to auto-fill dimensions
                </Text>
                <Box
                  flex={1}
                  style={{height: 1, backgroundColor: 'var(--card-border-color, #E5E7EB)'}}
                />
              </Flex>
              <Stack space={2}>
                <Label>Select Product</Label>
                <Autocomplete
                  id="shipping-quote-product"
                  openButton
                  openOnFocus
                  icon={SearchIcon}
                  loading={isLoadingProducts}
                  options={productOptions}
                  placeholder="Search for products..."
                  value={productSearch}
                  onSelect={handleProductSelect}
                  onQueryChange={(next) => setProductSearch(next || '')}
                  renderOption={(option) => (
                    <Card padding={3}>
                      <Stack space={2}>
                        <Text weight="semibold">{option.label}</Text>
                        {option.subtitle && (
                          <Text size={1} muted>
                            {option.subtitle}
                          </Text>
                        )}
                      </Stack>
                    </Card>
                  )}
                  renderValue={(value, option) => option?.label || value}
                  popover={{
                    placement: 'bottom-start',
                    portal: false,
                  }}
                />
                {!productSearch.trim() && (
                  <Text size={1} muted>
                    Start typing to surface products with shipping data.
                  </Text>
                )}
                {productSearch && !isLoadingProducts && productOptions.length === 0 && (
                  <Text size={1} muted>
                    No products found — check the spelling or add a new product.
                  </Text>
                )}
              </Stack>
              <Button
                text="Get quotes"
                tone="primary"
                onClick={handleGetQuotes}
                disabled={!canGetQuote || isLoadingRates}
                loading={isLoadingRates}
              />
            </Stack>
          </Card>

          {/* Rates Display */}
          {rates.length > 0 && (
            <Stack space={3}>
              <Text size={1} weight="semibold">
                Available rates
              </Text>
              {rates.map((rate, index) => (
                <Card
                  key={rate.rateId || `${rate.carrier}-${rate.service}-${index}`}
                  padding={3}
                  radius={2}
                  shadow={1}
                >
                  <Flex align="center" justify="space-between">
                    <Stack space={1}>
                      <Text weight="semibold">
                        {rate.carrier} — {rate.service}
                      </Text>
                      {typeof rate.deliveryDays === 'number' && (
                        <Text size={1} muted>
                          {rate.deliveryDays} day{rate.deliveryDays === 1 ? '' : 's'}
                        </Text>
                      )}
                    </Stack>
                    <Flex gap={3} align="center">
                      <Text weight="bold">${Number.parseFloat(rate.rate).toFixed(2)}</Text>
                      <Button
                        text="Save to customer"
                        mode="ghost"
                        tone="primary"
                        onClick={() => handleSaveQuote(rate)}
                        disabled={!selectedCustomerId}
                      />
                    </Flex>
                  </Flex>
                </Card>
              ))}
            </Stack>
          )}
        </Stack>
      </Box>
    </Dialog>
  )
}
