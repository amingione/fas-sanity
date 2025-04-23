// /structure/orderStructure.ts
import { ListItemBuilder } from 'sanity/structure';
import defineStructure from '../utils/defineStructure';
import { DocumentTextIcon } from '@sanity/icons';

export default defineStructure<ListItemBuilder>((S) =>
  S.listItem()
    .title('Orders')
    .icon(DocumentTextIcon)
    .child(
      S.list()
        .title('Stripe Orders')
        .items([
          S.listItem()
            .title('All Orders')
            .schemaType('order')
            .child(S.documentTypeList('order').title('All Orders')),

          S.listItem()
            .title('Unfulfilled Orders')
            .child(
              S.documentList()
                .title('Unfulfilled Orders')
                .filter('_type == "order" && status != "fulfilled"')
            )
        ])
    )
);