import React, {useEffect, useMemo, useState} from 'react'
import {
  Box,
  Button,
  Card,
  Dialog,
  Flex,
  Label,
  Select,
  Spinner,
  Stack,
  Text,
  TextArea,
  TextInput,
} from '@sanity/ui'
import {SearchIcon} from '@sanity/icons'
import {useClient} from 'sanity'

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
  shippingAddress?: {
    street1?: string
    street2?: string
    city?: string
    state?: string
    postalCode?: string
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

export function ShippingQuoteDialog({onClose}: ShippingQuoteDialogProps) {
  const client = useClient({apiVersion: '2024-01-01'})

  // Customer search state
  const [customerSearch, setCustomerSearch] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false)

  const [shipToAddress, setShipToAddress] = useState('')
  const [manualDimensions, setManualDimensions] = useState(INITIAL_DIMENSIONS)
  const [productSearch, setProductSearch] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [isLoadingProducts, setIsLoadingProducts] = useState(false)
  const [rates, setRates] = useState<Rate[]>([])
  const [isLoadingRates, setIsLoadingRates] = useState(false)

  // Customer search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      void (async () => {
        if (!customerSearch.trim()) {
          setCustomers([])
          return
        }
        setIsLoadingCustomers(true)
        try {
          const search = customerSearch.trim().toLowerCase()
          const results = await client.fetch<Customer[]>(
            `*[_type == "customer" && (
              lower(name) match $searchTerm ||
              lower(email) match $searchTerm ||
              lower(firstName) match $searchTerm ||
              lower(lastName) match $searchTerm
            )][0...10]{
              _id,
              name,
              shippingAddress
            }`,
            {searchTerm: `*${search}*`},
          )
          setCustomers(results || [])
        } catch (error) {
          console.error('Error searching customers', error)
          setCustomers([])
        } finally {
          setIsLoadingCustomers(false)
        }
      })()
    }, 300)
    return () => clearTimeout(timer)
  }, [client, customerSearch])

  // Product search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      void (async () => {
        if (!productSearch.trim()) {
          setProducts([])
          return
        }
        setIsLoadingProducts(true)
        try {
          const search = productSearch.trim().toLowerCase()
          const results = await client.fetch<Product[]>(
            `*[_type == "product" && lower(title) match $searchTerm][0...20]{
              _id,
              title,
              "dimensions": shippingConfig.dimensions,
              "weight": coalesce(shippingConfig.weight.value, shippingWeight.value)
            }`,
            {searchTerm: `*${search}*`},
          )
          setProducts(results || [])
        } catch (error) {
          console.error('Error searching products for shipping quote', error)
          setProducts([])
        } finally {
          setIsLoadingProducts(false)
        }
      })()
    }, 300)
    return () => clearTimeout(timer)
  }, [client, productSearch])

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer._id === selectedCustomerId),
    [customers, selectedCustomerId],
  )

  const selectedProduct = useMemo(
    () => products.find((product) => product._id === selectedProductId),
    [products, selectedProductId],
  )

  // Auto-populate shipping address when customer is selected
  useEffect(() => {
    if (selectedCustomer?.shippingAddress) {
      const addr = selectedCustomer.shippingAddress
      const lines = [
        selectedCustomer.name,
        addr.street1,
        addr.street2,
        [addr.city, addr.state, addr.postalCode].filter(Boolean).join(', '),
      ].filter(Boolean)
      setShipToAddress(lines.join('\n'))
    }
  }, [selectedCustomer])

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
    const hasProductDimensions = Boolean(selectedProduct?.dimensions && selectedProduct?.weight)
    return hasAddress && (hasManualDimensions || hasProductDimensions)
  }, [hasManualDimensions, selectedProduct, shipToAddress])

  const resolveDimensions = (): {dimensions: Dimensions; weight: number} => {
    if (selectedProduct?.dimensions && selectedProduct?.weight) {
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
      const response = await fetch('/.netlify/functions/easypostGetRates', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          toAddress: shipToAddress,
          parcel: {...dimensions, weight},
        }),
      })
      if (!response.ok) {
        const message = await response.text().catch(() => '')
        throw new Error(message || 'Failed to fetch shipping quotes')
      }
      const data = (await response.json()) as {rates?: Rate[]}
      setRates(data.rates || [])
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
          },
        ])
        .commit({autoGenerateArrayKeys: true})

      alert('Shipping quote saved to customer record.')
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

  return (
    <Dialog id="shipping-quote-dialog" header="Shipping Quote" onClose={onClose} width={2}>
      <Box padding={4}>
        <Stack space={4}>
          {/* Customer Search */}
          <Stack space={2}>
            <Label>Search Customer</Label>
            <TextInput
              icon={SearchIcon}
              placeholder="Search by name or email..."
              value={customerSearch}
              onChange={(event) => setCustomerSearch(event.currentTarget.value)}
            />
            {isLoadingCustomers && (
              <Flex align="center" justify="center" padding={2}>
                <Spinner muted />
              </Flex>
            )}
            {customers.length > 0 && (
              <Select
                value={selectedCustomerId}
                onChange={(event) => setSelectedCustomerId(event.currentTarget.value)}
              >
                <option value="">Select a customer…</option>
                {customers.map((customer) => (
                  <option key={customer._id} value={customer._id}>
                    {customer.name}
                  </option>
                ))}
              </Select>
            )}
          </Stack>

          {/* Ship To Address */}
          <Stack space={2}>
            <Label>Ship To Address *</Label>
            <TextArea
              placeholder={'FAS Customer\n123 Main St\nCity, ST 12345'}
              rows={4}
              value={shipToAddress}
              onChange={(event) => setShipToAddress(event.currentTarget.value)}
            />
            <Text size={1} muted>
              {selectedCustomer
                ? 'Auto-filled from customer record (editable)'
                : 'Enter address manually or select a customer above'}
            </Text>
          </Stack>

          {/* Manual Dimensions */}
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
            <Box flex={1} style={{height: 1, backgroundColor: '#E5E7EB'}} />
            <Text size={1} muted>
              OR
            </Text>
            <Box flex={1} style={{height: 1, backgroundColor: '#E5E7EB'}} />
          </Flex>

          {/* Product Search */}
          <Stack space={2}>
            <Label>Select Product</Label>
            <TextInput
              icon={SearchIcon}
              placeholder="Search for products..."
              value={productSearch}
              onChange={(event) => setProductSearch(event.currentTarget.value)}
            />
            {isLoadingProducts && (
              <Flex align="center" justify="center" padding={2}>
                <Spinner muted />
              </Flex>
            )}
            {products.length > 0 && (
              <Select
                value={selectedProductId}
                onChange={(event) => setSelectedProductId(event.currentTarget.value)}
              >
                <option value="">Select a product…</option>
                {products.map((product) => (
                  <option key={product._id} value={product._id}>
                    {product.title}
                    {product.dimensions && product.weight
                      ? ` (${product.dimensions.length}×${product.dimensions.width}×${product.dimensions.height}", ${product.weight} lbs)`
                      : ' (no dimensions)'}
                  </option>
                ))}
              </Select>
            )}
            {productSearch && !isLoadingProducts && products.length === 0 && (
              <Text size={1} muted>
                No products found with shipping dimensions
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
