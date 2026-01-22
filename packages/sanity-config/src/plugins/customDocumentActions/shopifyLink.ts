import {EarthGlobeIcon} from '@sanity/icons'
import {collectionUrl, productUrl, productVariantUrl} from '../../utils/shopifyUrls'
import {type DocumentActionDescription} from 'sanity'
import type {ShopifyDocumentActionProps} from './types'

export default (props: ShopifyDocumentActionProps): DocumentActionDescription | undefined => {
  const {published, type} = props

  if (!published?.store || published.store.isDeleted) {
    return
  }

  const {id, productId} = published.store
  let url: string | null = null

  if (type === 'collection' && typeof id === 'number') {
    url = collectionUrl(id)
  } else if (type === 'product' && typeof id === 'number') {
    url = productUrl(id)
  } else if (type === 'productVariant' && typeof id === 'number' && typeof productId === 'number') {
    url = productVariantUrl(productId, id)
  }

  if (!url) {
    return
  }

  return {
    label: 'Edit in Shopify',
    icon: EarthGlobeIcon,
    onHandle: () => {
      window.open(url)
    },
    shortcut: 'Ctrl+Alt+E',
  }
}
