import {EnvelopeIcon, MegaphoneIcon} from '@sanity/icons'
import {ListItemBuilder} from 'sanity/structure'

import defineStructure from '../utils/defineStructure'

export default defineStructure<ListItemBuilder>((S) =>
  S.listItem()
    .title('Email Marketing')
    .icon(MegaphoneIcon)
    .child(
      S.list()
        .title('Email Marketing')
        .items([
          S.listItem()
            .title('Campaigns')
            .icon(MegaphoneIcon)
            .schemaType('emailMarketingCampaign')
            .child(
              S.documentTypeList('emailMarketingCampaign')
                .apiVersion('2024-10-01')
                .title('Email Campaigns')
            ),
          S.listItem()
            .title('Outreach Templates')
            .icon(EnvelopeIcon)
            .schemaType('outreachEmailTemplateLibrary')
            .child(
              S.documentTypeList('outreachEmailTemplateLibrary')
                .apiVersion('2024-10-01')
                .title('Outreach Template Libraries')
            ),
        ])
    )
)
