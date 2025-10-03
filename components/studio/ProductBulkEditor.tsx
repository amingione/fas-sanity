import React, {useEffect, useMemo, useState} from 'react'
import {Box, Button, Card, Flex, Inline, Spinner, Stack, Table, Text, TextInput, Tooltip, useToast} from '@sanity/ui'
import {useClient} from 'sanity'

type ProductDoc = {
  _id: string
  title?: string
  slug?: {current?: string}
  sku?: string
  price?: number
  salePrice?: number
  onSale?: boolean
  inventory?: number
  taxBehavior?: 'taxable' | 'exempt'
  taxCode?: string
  shippingWeight?: number
  boxDimensions?: string
  brand?: string
  canonicalUrl?: string
  googleProductCategory?: string
  shortDescription?: any
  description?: any
  images?: string[]
  categories?: string[]
}

type EditableProduct = ProductDoc & {
  _key: string
  isSaving?: boolean
  dirty?: boolean
}

const SITE_BASE =
  (import.meta as any)?.env?.SANITY_STUDIO_SITE_BASE_URL ||
  (typeof window !== 'undefined' ? window?.__SITE_BASE_URL__ : undefined) ||
  'https://fasmotorsports.com'

function portableTextToPlain(blocks: any): string {
  if (!Array.isArray(blocks)) return ''
  return blocks
    .map((block) => {
      if (block?._type !== 'block' || !Array.isArray(block.children)) return ''
      return block.children.map((child: any) => child?.text || '').join('')
    })
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

function sanitizeNumber(value: string, fallback?: number): number | undefined {
  if (value === '') return undefined
  const num = Number(value)
  if (Number.isFinite(num)) return num
  return fallback
}

function buildProductLink(product: ProductDoc): string {
  if (product.canonicalUrl) return product.canonicalUrl
  const slug = product.slug?.current || ''
  if (!slug) return ''
  return `${SITE_BASE.replace(/\/$/, '')}/product/${slug}`
}

function toGooglePrice(price?: number): string | undefined {
  if (!Number.isFinite(price || NaN)) return undefined
  return `${price!.toFixed(2)} USD`
}

const GOOGLE_FEED_HEADERS = [
  'id',
  'title',
  'description',
  'link',
  'image_link',
  'availability',
  'price',
  'condition',
  'brand',
  'mpn',
  'shipping_weight',
  'product_type',
  'google_product_category',
]

export default function ProductBulkEditor() {
  const client = useClient({apiVersion: '2024-04-10'})
  const toast = useToast()
  const [products, setProducts] = useState<EditableProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [savingAll, setSavingAll] = useState(false)

  useEffect(() => {
    let isMounted = true
    async function fetchProducts() {
      setLoading(true)
      try {
        const docs: ProductDoc[] = await client.fetch(
          `*[_type == "product"]{
            _id,
            title,
            slug,
            sku,
            price,
            salePrice,
            onSale,
            inventory,
            taxBehavior,
            taxCode,
            shippingWeight,
            boxDimensions,
            brand,
            canonicalUrl,
            googleProductCategory,
            shortDescription,
            description,
            "images": images[].asset->url,
            "categories": category[]->title
          }`
        )

        if (!isMounted) return

        const enriched: EditableProduct[] = docs.map((doc, idx) => ({
          ...doc,
          _key: doc._id || `idx-${idx}`,
        }))
        setProducts(enriched)
      } catch (err) {
        console.error('ProductBulkEditor fetch failed', err)
        toast.push({status: 'error', title: 'Failed to load products', description: String((err as any)?.message || err)})
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    fetchProducts()
    return () => {
      isMounted = false
    }
  }, [client, toast])

  const filteredProducts = useMemo(() => {
    if (!searchTerm) return products
    const term = searchTerm.toLowerCase()
    return products.filter((prod) => {
      return [prod.title, prod.sku, prod._id]
        .filter(Boolean)
        .some((value) => value!.toString().toLowerCase().includes(term))
    })
  }, [products, searchTerm])

  const updateProductField = (id: string, field: keyof EditableProduct, value: any) => {
    setProducts((prev) =>
      prev.map((prod) =>
        prod._id === id
          ? {
              ...prod,
              [field]: value,
              dirty: true,
            }
          : prod
      )
    )
  }

  const handleSave = async (product: EditableProduct) => {
    if (!product._id) return
    try {
      updateProductField(product._id, 'isSaving', true)
      const payload: Record<string, any> = {
        title: product.title || '',
        sku: product.sku || undefined,
        price: Number.isFinite(product.price) ? Number(product.price) : undefined,
        salePrice: Number.isFinite(product.salePrice) ? Number(product.salePrice) : undefined,
        onSale: Boolean(product.onSale),
        inventory: Number.isFinite(product.inventory) ? Number(product.inventory) : undefined,
        taxBehavior: product.taxBehavior || undefined,
        taxCode: product.taxCode || undefined,
        shippingWeight: Number.isFinite(product.shippingWeight) ? Number(product.shippingWeight) : undefined,
        boxDimensions: product.boxDimensions || undefined,
        brand: product.brand || undefined,
        canonicalUrl: product.canonicalUrl || undefined,
        googleProductCategory: product.googleProductCategory || undefined,
      }

      await client.patch(product._id).set(payload).commit({autoGenerateArrayKeys: true})
      toast.push({status: 'success', title: 'Product saved', description: product.title || product.sku || product._id})
      setProducts((prev) =>
        prev.map((prod) =>
          prod._id === product._id
            ? {
                ...prod,
                ...payload,
                isSaving: false,
                dirty: false,
              }
            : prod
        )
      )
    } catch (err) {
      console.error('Product save failed', err)
      toast.push({status: 'error', title: 'Failed to save product', description: String((err as any)?.message || err)})
      updateProductField(product._id, 'isSaving', false)
    }
  }

  const handleSaveAll = async () => {
    const dirtyProducts = filteredProducts.filter((prod) => prod.dirty && !prod.isSaving)
    if (dirtyProducts.length === 0) {
      toast.push({status: 'info', title: 'No changes to save'})
      return
    }
    setSavingAll(true)
    for (const product of dirtyProducts) {
      // eslint-disable-next-line no-await-in-loop
      await handleSave(product)
    }
    setSavingAll(false)
  }

  const createCsv = () => {
    const rows = [GOOGLE_FEED_HEADERS]

    filteredProducts.forEach((product) => {
      const id = product.sku || product._id
      const title = product.title || ''
      const description = portableTextToPlain(product.shortDescription) || portableTextToPlain(product.description) || title
      const link = buildProductLink(product)
      const image = Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : ''
      const availability = Number(product.inventory) > 0 ? 'in stock' : 'out of stock'
      const price = toGooglePrice(product.price)
      const condition = product.taxBehavior === 'exempt' ? 'used' : 'new'
      const brand = product.brand || 'F.A.S. Motorsports'
      const mpn = product.sku || product._id
      const shippingWeight = product.shippingWeight ? `${product.shippingWeight} lb` : ''
      const productType = Array.isArray(product.categories) ? product.categories.join(' > ') : ''
      const googleCategory = product.googleProductCategory || ''

      rows.push([
        id,
        title,
        description,
        link,
        image,
        availability,
        price || '',
        condition,
        brand,
        mpn,
        shippingWeight,
        productType,
        googleCategory,
      ])
    })

    const csvContent = rows
      .map((row) =>
        row
          .map((value) => {
            const str = value ?? ''
            if (typeof str === 'string' && (str.includes(',') || str.includes('"') || str.includes('\n'))) {
              return `"${str.replace(/"/g, '""')}"`
            }
            return str
          })
          .join(',')
      )
      .join('\n')

    const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'})
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `google-products-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card padding={4} radius={3} shadow={1} style={{background: '#0d1117'}}>
      <Stack space={4}>
        <Flex align="center" justify="space-between" wrap="wrap" gap={3}>
          <Box>
            <Text size={2} weight="semibold" style={{color: '#fff'}}>
              Product Bulk Editor
            </Text>
            <Text size={1} style={{color: '#9ca3af'}}>
              Edit key fields and export a Google Shopping CSV.
            </Text>
          </Box>
          <Inline space={2}>
            <TextInput
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.currentTarget.value)}
              placeholder="Search by title, SKU, or ID"
              style={{minWidth: 240}}
            />
            <Button
              text={savingAll ? 'Saving…' : 'Save filtered'}
              tone="primary"
              onClick={handleSaveAll}
              disabled={savingAll || filteredProducts.every((prod) => !prod.dirty)}
            />
            <Button text="Download CSV" tone="default" onClick={createCsv} disabled={filteredProducts.length === 0} />
          </Inline>
        </Flex>

        {loading ? (
          <Flex align="center" justify="center" padding={5}>
            <Spinner muted />
          </Flex>
        ) : (
          <Card shadow={1} radius={2} padding={0} style={{overflowX: 'auto'}}>
            <Table>
              <thead>
                <tr>
                  <th>ID / SKU</th>
                  <th>Title</th>
                  <th>Price</th>
                  <th>Sale Price</th>
                  <th>On Sale?</th>
                  <th>Inventory</th>
                  <th>Brand</th>
                  <th>Tax Behavior</th>
                  <th>Tax Code</th>
                  <th>Shipping Weight (lb)</th>
                  <th>Box Dimensions</th>
                  <th>Google Category</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product._key}>
                    <td>
                      <Stack space={2}>
                        <Text size={1} style={{color: '#e5e7eb'}}>{product.sku || '—'}</Text>
                        <Text size={1} muted>{product._id}</Text>
                      </Stack>
                    </td>
                    <td>
                      <TextInput
                        value={product.title || ''}
                        onChange={(event) => updateProductField(product._id, 'title', event.currentTarget.value)}
                      />
                    </td>
                    <td>
                      <TextInput
                        value={product.price?.toString() ?? ''}
                        onChange={(event) =>
                          updateProductField(
                            product._id,
                            'price',
                            sanitizeNumber(event.currentTarget.value, product.price)
                          )
                        }
                        inputMode="decimal"
                      />
                    </td>
                    <td>
                      <TextInput
                        value={product.salePrice?.toString() ?? ''}
                        onChange={(event) =>
                          updateProductField(
                            product._id,
                            'salePrice',
                            sanitizeNumber(event.currentTarget.value, product.salePrice)
                          )
                        }
                        inputMode="decimal"
                      />
                    </td>
                    <td style={{textAlign: 'center'}}>
                      <input
                        type="checkbox"
                        checked={Boolean(product.onSale)}
                        onChange={(event) => updateProductField(product._id, 'onSale', event.currentTarget.checked)}
                      />
                    </td>
                    <td>
                      <TextInput
                        value={product.inventory?.toString() ?? ''}
                        onChange={(event) =>
                          updateProductField(
                            product._id,
                            'inventory',
                            sanitizeNumber(event.currentTarget.value, product.inventory)
                          )
                        }
                        inputMode="numeric"
                      />
                    </td>
                    <td>
                      <TextInput
                        value={product.brand || ''}
                        onChange={(event) => updateProductField(product._id, 'brand', event.currentTarget.value)}
                      />
                    </td>
                    <td>
                      <select
                        value={product.taxBehavior || 'taxable'}
                        onChange={(event) => updateProductField(product._id, 'taxBehavior', event.currentTarget.value as any)}
                      >
                        <option value="taxable">Taxable</option>
                        <option value="exempt">Tax Exempt</option>
                      </select>
                    </td>
                    <td>
                      <TextInput
                        value={product.taxCode || ''}
                        onChange={(event) => updateProductField(product._id, 'taxCode', event.currentTarget.value)}
                        disabled={product.taxBehavior === 'exempt'}
                      />
                    </td>
                    <td>
                      <TextInput
                        value={product.shippingWeight?.toString() ?? ''}
                        onChange={(event) =>
                          updateProductField(
                            product._id,
                            'shippingWeight',
                            sanitizeNumber(event.currentTarget.value, product.shippingWeight)
                          )
                        }
                        inputMode="decimal"
                      />
                    </td>
                    <td>
                      <TextInput
                        value={product.boxDimensions || ''}
                        onChange={(event) => updateProductField(product._id, 'boxDimensions', event.currentTarget.value)}
                        placeholder="LxWxH"
                      />
                    </td>
                    <td>
                      <TextInput
                        value={product.googleProductCategory || ''}
                        onChange={(event) => updateProductField(product._id, 'googleProductCategory', event.currentTarget.value)}
                      />
                    </td>
                    <td>
                      <Stack space={2}>
                        <Button
                          text={product.isSaving ? 'Saving…' : 'Save'}
                          tone="positive"
                          mode="ghost"
                          onClick={() => handleSave(product)}
                          disabled={product.isSaving || !product.dirty}
                        />
                        <Tooltip
                          content={<Text size={1}>View on site</Text>}
                          placement="top"
                        >
                          <Button
                            text="Preview"
                            tone="default"
                            mode="ghost"
                            as="a"
                            href={buildProductLink(product)}
                            target="_blank"
                            rel="noopener noreferrer"
                          />
                        </Tooltip>
                      </Stack>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </Stack>
    </Card>
  )
}
