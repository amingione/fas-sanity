import React, {useEffect, useMemo, useState} from 'react'
import {Box, Button, Card, Flex, Inline, Spinner, Stack, Text, TextInput, Tooltip, useToast} from '@sanity/ui'
import {useClient} from 'sanity'
import { googleProductCategories } from '../../schemaTypes/constants/googleProductCategories'

type ProductDoc = {
  _id: string
  title?: string
  slug?: {current?: string}
  sku?: string
  price?: number
  salePrice?: number
  onSale?: boolean
  availability?: 'in_stock' | 'out_of_stock' | 'preorder' | 'backorder'
  condition?: 'new' | 'refurbished' | 'used'
  taxBehavior?: 'taxable' | 'exempt'
  taxCode?: string
  shippingWeight?: number
  boxDimensions?: string
  brand?: string
  canonicalUrl?: string
  googleProductCategory?: string
  installOnly?: boolean
  shippingLabel?: string
  productHighlights?: string[]
  productDetails?: string[]
  color?: string
  size?: string
  material?: string
  productLength?: string
  productWidth?: string
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
  'additional_image_link',
  'availability',
  'price',
  'condition',
  'brand',
  'mpn',
  'shipping_weight',
  'product_type',
  'google_product_category',
  'shipping_label',
  'product_highlight',
  'product_detail',
  'color',
  'size',
  'material',
  'product_length',
  'product_width',
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
            availability,
            condition,
            taxBehavior,
            taxCode,
            installOnly,
            shippingLabel,
            shippingWeight,
            boxDimensions,
            brand,
            canonicalUrl,
            googleProductCategory,
            productHighlights,
            productDetails,
            color,
            size,
            material,
            productLength,
            productWidth,
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
        availability: product.availability || 'in_stock',
        condition: product.condition || 'new',
        taxBehavior: product.taxBehavior || undefined,
        taxCode: product.taxCode || undefined,
        shippingWeight: Number.isFinite(product.shippingWeight) ? Number(product.shippingWeight) : undefined,
        boxDimensions: product.boxDimensions || undefined,
        brand: product.brand || undefined,
        canonicalUrl: product.canonicalUrl || undefined,
        googleProductCategory: product.googleProductCategory || undefined,
        installOnly: Boolean(product.installOnly),
        shippingLabel: product.shippingLabel || undefined,
        productHighlights: Array.isArray(product.productHighlights) ? product.productHighlights : undefined,
        productDetails: Array.isArray(product.productDetails) ? product.productDetails : undefined,
        color: product.color || undefined,
        size: product.size || undefined,
        material: product.material || undefined,
        productLength: product.productLength || undefined,
        productWidth: product.productWidth || undefined,
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
      const additionalImages = Array.isArray(product.images) && product.images.length > 1 ? product.images.slice(1).join(',') : ''
      const availabilityValue = product.availability || 'in_stock'
      const availabilityMap: Record<string, string> = {
        in_stock: 'in stock',
        out_of_stock: 'out of stock',
        preorder: 'preorder',
        backorder: 'backorder',
      }
      const availability = availabilityMap[availabilityValue] || 'in stock'
      const price = toGooglePrice(product.price)
      const condition = product.condition || 'new'
      const brand = product.brand || 'F.A.S. Motorsports'
      const mpn = product.sku || product._id
      const shippingWeight = product.shippingWeight ? `${product.shippingWeight} lb` : ''
      const productType = Array.isArray(product.categories) ? product.categories.join(' > ') : ''
      const googleCategory = product.googleProductCategory || ''
      const shippingLabel = product.shippingLabel || (product.installOnly ? 'install_only' : '')
      const highlightsString = Array.isArray(product.productHighlights) ? product.productHighlights.join('; ') : ''
      const detailsString = Array.isArray(product.productDetails) ? product.productDetails.join('; ') : ''
      const color = product.color || ''
      const size = product.size || ''
      const material = product.material || ''
      const productLength = product.productLength || ''
      const productWidth = product.productWidth || ''

      rows.push([
        id,
        title,
        description,
        link,
        image,
        additionalImages,
        availability,
        price || '',
        condition,
        brand,
        mpn,
        shippingWeight,
        productType,
        googleCategory,
        shippingLabel,
        highlightsString,
        detailsString,
        color,
        size,
        material,
        productLength,
        productWidth,
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
            <table style={{width: '100%', borderCollapse: 'collapse', minWidth: 960}}>
              <thead>
                <tr style={{background: '#111827'}}>
                  {[
                    'ID / SKU',
                    'Title',
                    'Price',
                    'Sale Price',
                    'On Sale?',
                    'Availability',
                    'Condition',
                    'Brand',
                    'Tax Behavior',
                    'Tax Code',
                    'Shipping Weight (lb)',
                    'Box Dimensions',
                    'Google Category',
                    'Highlights',
                    'Details',
                    'Color',
                    'Size',
                    'Material',
                    'Length',
                    'Width',
                    'Install Only',
                    'Shipping Label',
                    'Actions',
                  ].map((header) => (
                    <th key={header} style={{textAlign: 'left', padding: '12px 16px', color: '#d1d5db', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5}}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product._key} style={{borderTop: '1px solid rgba(148, 163, 184, 0.1)'}}>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <Stack space={2}>
                        <Text size={1} style={{color: '#e5e7eb'}}>{product.sku || '—'}</Text>
                        <Text size={1} muted>{product._id}</Text>
                      </Stack>
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <TextInput
                        value={product.title || ''}
                        onChange={(event) => updateProductField(product._id, 'title', event.currentTarget.value)}
                      />
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
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
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
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
                    <td style={{textAlign: 'center', padding: '12px 16px', verticalAlign: 'top'}}>
                      <input
                        type="checkbox"
                        checked={Boolean(product.onSale)}
                        onChange={(event) => updateProductField(product._id, 'onSale', event.currentTarget.checked)}
                      />
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <select
                        value={product.availability || 'in_stock'}
                        onChange={(event) => updateProductField(product._id, 'availability', event.currentTarget.value as any)}
                      >
                        <option value="in_stock">In stock</option>
                        <option value="out_of_stock">Out of stock</option>
                        <option value="preorder">Preorder</option>
                        <option value="backorder">Backorder</option>
                      </select>
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <select
                        value={product.condition || 'new'}
                        onChange={(event) => updateProductField(product._id, 'condition', event.currentTarget.value as any)}
                      >
                        <option value="new">New</option>
                        <option value="refurbished">Refurbished</option>
                        <option value="used">Used</option>
                      </select>
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <TextInput
                        value={product.brand || ''}
                        onChange={(event) => updateProductField(product._id, 'brand', event.currentTarget.value)}
                      />
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <select
                        value={product.taxBehavior || 'taxable'}
                        onChange={(event) => updateProductField(product._id, 'taxBehavior', event.currentTarget.value as any)}
                      >
                        <option value="taxable">Taxable</option>
                        <option value="exempt">Tax Exempt</option>
                      </select>
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <TextInput
                        value={product.taxCode || ''}
                        onChange={(event) => updateProductField(product._id, 'taxCode', event.currentTarget.value)}
                        disabled={product.taxBehavior === 'exempt'}
                      />
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
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
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <TextInput
                        value={product.boxDimensions || ''}
                        onChange={(event) => updateProductField(product._id, 'boxDimensions', event.currentTarget.value)}
                        placeholder="LxWxH"
                      />
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <select
                        value={product.googleProductCategory || ''}
                        onChange={(event) => updateProductField(product._id, 'googleProductCategory', event.currentTarget.value)}
                      >
                        <option value="">Select category</option>
                        {googleProductCategories.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <textarea
                        value={(product.productHighlights || []).join('\n')}
                        onChange={(event) =>
                          updateProductField(
                            product._id,
                            'productHighlights',
                            event.currentTarget.value
                              .split('\n')
                              .map((line) => line.trim())
                              .filter(Boolean)
                          )
                        }
                        rows={3}
                        style={{width: '100%', resize: 'vertical'}}
                      />
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <textarea
                        value={(product.productDetails || []).join('\n')}
                        onChange={(event) =>
                          updateProductField(
                            product._id,
                            'productDetails',
                            event.currentTarget.value
                              .split('\n')
                              .map((line) => line.trim())
                              .filter(Boolean)
                          )
                        }
                        rows={3}
                        style={{width: '100%', resize: 'vertical'}}
                        placeholder="section: attribute: value"
                      />
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <TextInput
                        value={product.color || ''}
                        onChange={(event) => updateProductField(product._id, 'color', event.currentTarget.value)}
                      />
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <TextInput
                        value={product.size || ''}
                        onChange={(event) => updateProductField(product._id, 'size', event.currentTarget.value)}
                      />
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <TextInput
                        value={product.material || ''}
                        onChange={(event) => updateProductField(product._id, 'material', event.currentTarget.value)}
                      />
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <TextInput
                        value={product.productLength || ''}
                        onChange={(event) => updateProductField(product._id, 'productLength', event.currentTarget.value)}
                        placeholder="10 in"
                      />
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <TextInput
                        value={product.productWidth || ''}
                        onChange={(event) => updateProductField(product._id, 'productWidth', event.currentTarget.value)}
                        placeholder="4 in"
                      />
                    </td>
                    <td style={{textAlign: 'center', padding: '12px 16px', verticalAlign: 'top'}}>
                      <input
                        type="checkbox"
                        checked={Boolean(product.installOnly)}
                        onChange={(event) => updateProductField(product._id, 'installOnly', event.currentTarget.checked)}
                      />
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
                      <TextInput
                        value={product.shippingLabel || ''}
                        onChange={(event) => updateProductField(product._id, 'shippingLabel', event.currentTarget.value)}
                        placeholder="install_only"
                      />
                    </td>
                    <td style={{padding: '12px 16px', verticalAlign: 'top'}}>
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
            </table>
          </Card>
        )}
      </Stack>
    </Card>
  )
}
