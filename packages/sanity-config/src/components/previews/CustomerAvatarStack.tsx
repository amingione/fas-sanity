import React, {useEffect, useMemo, useState} from 'react'
import {useClient} from 'sanity'

const FALLBACK_IMAGE =
  'https://cdn.sanity.io/images/r4og35qd/production/c3623df3c0e45a480c59d12765725f985f6d2fdb-1000x1000.png?fit=max&w=500&h=500'

const ORDER_ITEMS_QUERY = `
  *[_type == "order" && customerRef._ref == $customerId]
    | order(createdAt desc)[0...5].cart[]{
      "imageUrl": coalesce(productImage.asset->url, image.asset->url),
      "productRef": coalesce(productRef._ref, product._ref),
      "productSlug": coalesce(productSlug, slug.current, id)
    }
`

const PRODUCT_IMAGES_QUERY = `
  *[_type == "product" && (
      defined($ids[0]) && _id in $ids || defined($slugs[0]) && slug.current in $slugs
    )]{
      _id,
      "slug": slug.current,
      "imageUrl": coalesce(
        defaultProductVariant.images[0].asset->url,
        images[0].asset->url
      )
    }
`

type OrderItemPreview = {
  imageUrl?: string | null
  productRef?: string | null
  productSlug?: string | null
}

type ProductPreview = {
  _id: string
  slug?: string
  imageUrl?: string | null
}

interface CustomerAvatarStackProps {
  customerId?: string
}

export function CustomerAvatarStack({customerId}: CustomerAvatarStackProps) {
  const client = useClient({apiVersion: '2024-10-01'})
  const [images, setImages] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!customerId) {
        if (!cancelled) setImages([])
        return
      }

      try {
        const orderItems: OrderItemPreview[] = await client.fetch(ORDER_ITEMS_QUERY, {customerId})

        if (cancelled) return

        const directImages = orderItems
          .map((item) => item.imageUrl)
          .filter((url): url is string => typeof url === 'string' && url.length > 0)

        const neededRefs = Array.from(
          new Set(
            orderItems
              .map((item) => item.productRef)
              .filter((ref): ref is string => typeof ref === 'string' && ref.length > 0)
          )
        )

        const neededSlugs = Array.from(
          new Set(
            orderItems
              .map((item) => item.productSlug)
              .filter((slug): slug is string => typeof slug === 'string' && slug.length > 0)
          )
        )

        let productLookups: ProductPreview[] = []
        if ((neededRefs.length > 0 || neededSlugs.length > 0) && (!directImages || directImages.length < 3)) {
          productLookups = await client.fetch(PRODUCT_IMAGES_QUERY, {
            ids: neededRefs,
            slugs: neededSlugs,
          })
        }

        if (cancelled) return

        const imageByKey = new Map<string, string>()
        for (const product of productLookups) {
          if (product.imageUrl) {
            imageByKey.set(product._id, product.imageUrl)
            if (product.slug) {
              imageByKey.set(product.slug, product.imageUrl)
            }
          }
        }

        const collected: string[] = []
        const pushUnique = (url?: string | null) => {
          if (!url) return
          if (collected.includes(url)) return
          collected.push(url)
        }

        directImages.forEach((url) => pushUnique(url))

        if (collected.length < 3) {
          for (const item of orderItems) {
            if (collected.length >= 3) break
            const byRef = item.productRef ? imageByKey.get(item.productRef) : undefined
            const bySlug = item.productSlug ? imageByKey.get(item.productSlug) : undefined
            pushUnique(byRef || bySlug)
          }
        }

        setImages(collected.slice(0, 3))
      } catch (err) {
        console.warn('Unable to load customer product previews', err)
        if (!cancelled) setImages([])
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [client, customerId])

  const imageUrls = useMemo(() => {
    if (images.length > 0) {
      return images
    }
    return [FALLBACK_IMAGE]
  }, [images])

  return (
    <div style={{display: 'flex', alignItems: 'center', height: '100%'}}>
      {imageUrls.slice(0, 3).map((url, index) => (
        <span
          key={`${url}-${index}`}
          style={{
            position: 'relative',
            width: 36,
            height: 36,
            borderRadius: '50%',
            overflow: 'hidden',
            border: '2px solid var(--card-bg, #fff)',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.08)',
            marginLeft: index === 0 ? 0 : -12,
            backgroundColor: '#f5f5f5',
          }}
        >
          <img
            src={url}
            alt={index === 0 ? 'Ordered product preview' : 'Additional ordered product'}
            style={{width: '100%', height: '100%', objectFit: 'cover'}}
          />
        </span>
      ))}
    </div>
  )
}
