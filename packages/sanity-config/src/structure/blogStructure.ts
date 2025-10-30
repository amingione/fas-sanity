import {BookIcon, ComposeIcon} from '@sanity/icons'
import {ListItemBuilder} from 'sanity/structure'

import defineStructure from '../utils/defineStructure'

export default defineStructure<ListItemBuilder>((S) =>
  S.listItem()
    .title('Blog')
    .icon(BookIcon)
    .child(
      S.list()
        .title('Blog Content')
        .items([
          S.listItem()
            .title('Posts')
            .icon(BookIcon)
            .schemaType('blogPost')
            .child(
              S.documentTypeList('blogPost')
                .apiVersion('2024-10-01')
                .title('Blog Posts')
            ),
          S.listItem()
            .title('Templates')
            .icon(ComposeIcon)
            .schemaType('blogTemplate')
            .child(
              S.documentTypeList('blogTemplate')
                .apiVersion('2024-10-01')
                .title('Blog Templates')
            ),
        ])
    )
)
