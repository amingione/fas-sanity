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
        .title('Stripe Invoices')
        .items([
          S.listItem()
            .title('All Invoices')
            .schemaType('order')
            .child(S.documentTypeList('order').title('All Orders')),

          S.listItem()
            .title('Unfulfilled Orders')
            .child(
              S.documentList()
                .title('Unfulfilled Invoices')
                .filter('_type == "order" && status != "fulfilled"')
            ),

          S.listItem()
            .title('Paid Invoices')
            .child(
              S.documentList()
                .title('Paid Invoices')
                .filter('_type == "order" && status == "paid"')
            ),

          S.listItem()
            .title('Pending Invoices')
            .child(
              S.documentList()
                .title('Pending Invoices')
                .filter('_type == "order" && status == "pending"')
            )
        ])
    )
);