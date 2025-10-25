import {InfoOutlineIcon} from '@sanity/icons'
import {ListItemBuilder} from 'sanity/structure'
import defineStructure from '../utils/defineStructure'

export default defineStructure<ListItemBuilder>((S) =>
  S.listItem()
    .title('Products')
    .schemaType('product')
    .child(
      S.documentTypeList('product')
        .apiVersion('2024-10-01')
        // .defaultLayout('detail')
        .child(async (id) =>
          S.list()
            .title('Product')
            .canHandleIntent(
              (intentName, params) => intentName === 'edit' && params.type === 'product'
            )
            .items([
              // Details
              S.listItem()
                .title('Details')
                .icon(InfoOutlineIcon)
                .schemaType('product')
                .id(`details-${String(id).replace(/[^A-Za-z0-9_-]/g, '_')}`)
                .child(S.document().schemaType('product').documentId(id)),
              // Product variants
              S.listItem()
                .title('Variants')
                .schemaType('productVariant')
                .child(
                  S.documentList()
                    .apiVersion('2024-10-01')
                    .title('Variants')
                    .schemaType('productVariant')
                    .filter(
                      `
                      _type == "productVariant"
                      && store.productId == $productId
                    `
                    )
                    .params({
                      productId: Number(id.replace('shopifyProduct-', '')),
                    })
                    .canHandleIntent(
                      (intentName, params) =>
                        intentName === 'edit' && params.type === 'productVariant'
                    )
                ),
            ])
        )
    )
)
