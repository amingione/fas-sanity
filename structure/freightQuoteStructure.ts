import { ListItemBuilder } from 'sanity/structure'
import defineStructure from '../utils/defineStructure'
import { TruckIcon } from '@sanity/icons'

export default defineStructure<ListItemBuilder>((S) =>
  S.listItem()
    .title('Freight Quotes')
    .icon(TruckIcon)
    .child(
      S.list()
        .title('Freight Quotes')
        .items([
          S.listItem()
            .title('All')
            .schemaType('freightQuote')
            .child(S.documentTypeList('freightQuote').title('All Freight Quotes')),

          S.listItem()
            .title('Open')
            .child(
              S.documentList()
                .title('Open')
                .filter('_type == "freightQuote" && status == "open"')
            ),

          S.listItem()
            .title('Quoted')
            .child(
              S.documentList()
                .title('Quoted')
                .filter('_type == "freightQuote" && status == "quoted"')
            ),

          S.listItem()
            .title('Scheduled')
            .child(
              S.documentList()
                .title('Scheduled')
                .filter('_type == "freightQuote" && status == "scheduled"')
            ),

          S.listItem()
            .title('Completed')
            .child(
              S.documentList()
                .title('Completed')
                .filter('_type == "freightQuote" && status == "completed"')
            ),

          S.listItem()
            .title('Cancelled')
            .child(
              S.documentList()
                .title('Cancelled')
                .filter('_type == "freightQuote" && status == "cancelled"')
            ),
        ])
    )
)

