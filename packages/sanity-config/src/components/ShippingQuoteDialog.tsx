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
  const [shipToAddress, setShipToAddress] = useState('')
  const [manualDimensions, setManualDimensions] = useState(INITIAL_DIMENSIONS)
  const [productSearch, setProductSearch] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [isLoadingProducts, setIsLoadingProducts] = useState(false)
  const [rates, setRates] = useState<Rate[]>([])
  const [isLoadingRates, setIsLoadingRates] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      void (async () => {
        if (!productSearch.trim()) {
          setProducts([])
          return
        }
        setIsLoadingProducts(true)
        try {
          const search = `*${productSearch.trim()}*`
          const results = await client.fetch<Product[]>(
            `*[_type == "product" && defined(shippingConfig.dimensions.length) && defined(shippingConfig.weight.value) && title match $searchTerm][0...10]{
              _id,
              title,
              "dimensions": {
                "length": shippingConfig.dimensions.length,
                "width": shippingConfig.dimensions.width,
                "height": shippingConfig.dimensions.height
              },
              "weight": coalesce(shippingConfig.weight.value, shippingWeight.value)
            }`,
            {searchTerm: search},
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

  const selectedProduct = useMemo(
    () => products.find((product) => product._id === selectedProductId),
    [products, selectedProductId],
  )

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
          <Stack space={2}>
            <Label>Ship To Address *</Label>
            <TextArea
              placeholder={'FAS Customer\n123 Main St\nCity, ST 12345'}
              rows={4}
              value={shipToAddress}
              onChange={(event) => setShipToAddress(event.currentTarget.value)}
            />
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
            <Box flex={1} style={{height: 1, backgroundColor: '#E5E7EB'}} />
            <Text size={1} muted>
              OR
            </Text>
            <Box flex={1} style={{height: 1, backgroundColor: '#E5E7EB'}} />
          </Flex>

          <Stack space={2}>
            <Label>Select Product</Label>
            <TextInput
              icon={SearchIcon}
              placeholder="Search for products with saved dimensions..."
              value={productSearch}
              onChange={(event) => setProductSearch(event.currentTarget.value)}
            />
            {isLoadingProducts ? (
              <Flex align="center" justify="center">
                <Spinner muted />
              </Flex>
            ) : null}
            {products.length > 0 ? (
              <Select value={selectedProductId} onChange={(event) => setSelectedProductId(event.currentTarget.value)}>
                <option value="">Select a product…</option>
                {products.map((product) => (
                  <option key={product._id} value={product._id}>
                    {product.title} (
                    {product.dimensions
                      ? `${product.dimensions.length}×${product.dimensions.width}×${product.dimensions.height}"`
                      : 'No dims'}
                    , {product.weight ?? '—'} lbs)
                  </option>
                ))}
              </Select>
            ) : null}
          </Stack>

          <Button
            text="Get quotes"
            tone="primary"
            onClick={handleGetQuotes}
            disabled={!canGetQuote || isLoadingRates}
            loading={isLoadingRates}
          />

          {rates.length > 0 ? (
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
                      {typeof rate.deliveryDays === 'number' ? (
                        <Text size={1} muted>
                          {rate.deliveryDays} day{rate.deliveryDays === 1 ? '' : 's'}
                        </Text>
                      ) : null}
                    </Stack>
                    <Flex gap={3} align="center">
                      <Text weight="bold">${Number.parseFloat(rate.rate).toFixed(2)}</Text>
                      <Button
                        text="Save to customer"
                        mode="ghost"
                        tone="primary"
                        onClick={() => handleSaveQuote(rate)}
                      />
                    </Flex>
                  </Flex>
                </Card>
              ))}
            </Stack>
          ) : null}

          {rates.length > 0 ? (
            <Stack space={2}>
              <Label>Customer ID</Label>
              <TextInput
                placeholder="customer document ID"
                value={selectedCustomerId}
                onChange={(event) => setSelectedCustomerId(event.currentTarget.value)}
              />
            </Stack>
          ) : null}
        </Stack>
      </Box>
    </Dialog>
  )
}
