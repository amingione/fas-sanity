export const PHYSICAL_PRODUCTS_QUERY = `
  *[_type == "product" && productType != "service" && status != "archived"]|order(_updatedAt desc){
    _id,
    title,
    "slug": slug.current,
    productType,
    status,
    featured,
    promotionTagline,
    price,
    salePrice,
    onSale,
    shortDescription,
    "heroImage": images[0]{
      alt,
      asset->{url}
    }
  }
`

export const SERVICE_PRODUCTS_QUERY = `
  *[_type == "product" && productType == "service" && status != "archived"]|order(title asc){
    _id,
    title,
    "slug": slug.current,
    productType,
    promotionTagline,
    shortDescription,
    price,
    handlingTime,
    serviceDuration,
    serviceLocation,
    "heroImage": images[0]{
      alt,
      asset->{url}
    }
  }
`

export const BUNDLE_PRODUCTS_QUERY = `
  *[_type == "product" && productType == "bundle" && status != "archived"]|order(title asc){
    _id,
    title,
    "slug": slug.current,
    productType,
    promotionTagline,
    price,
    shortDescription,
    "heroImage": images[0]{
      alt,
      asset->{url}
    }
  }
`

export type CatalogProduct = {
  _id: string
  title?: string
  slug?: string
  productType?: string
  promotionTagline?: string
  price?: number
  salePrice?: number
  onSale?: boolean
  shortDescription?: any
  heroImage?: {
    alt?: string
    asset?: {
      url?: string
    }
  }
  serviceDuration?: string
  serviceLocation?: string
  handlingTime?: number
}
