import type {StructureBuilder} from 'sanity/desk'
import {DocumentIcon} from '@sanity/icons'
import DownloadsQuickCreatePane from '../components/studio/downloads/DownloadsQuickCreatePane'
import DownloadsPreviewList from '../components/studio/downloads/DownloadsPreviewList'

const API_VERSION = '2024-10-01'
const BASE_FILTER = '_type == "downloadResource" && isArchived != true'

const defaultOrdering = [{field: 'lastUpdated', direction: 'desc' as const}]

const buildList = (S: StructureBuilder, title: string, filter: string) =>
  S.documentList()
    .apiVersion(API_VERSION)
    .title(title)
    .filter(filter)
    .defaultOrdering([
      ...defaultOrdering,
      {field: '_updatedAt', direction: 'desc' as const},
      {field: '_createdAt', direction: 'desc' as const},
    ])

export const DOWNLOADS_STRUCTURE_ID = 'downloads-documents'

export const downloadsStructure = (S: StructureBuilder) =>
  S.listItem()
    .id(DOWNLOADS_STRUCTURE_ID)
    .title('Downloads & Documents')
    .icon(DocumentIcon)
    .child(
      S.list()
        .title('Downloads & Documents')
        .items([
          S.listItem()
            .title('Overview')
            .child(
              S.component()
                .id('downloads-overview')
                .title('Downloads Overview')
                .component(DownloadsPreviewList as any),
            ),
          S.divider(),
          S.listItem()
            .title('📄 All Documents')
            .child(buildList(S, 'All Documents', BASE_FILTER)),
          S.divider(),
          S.listItem()
            .title('By Type')
            .child(
              S.list()
                .title('By Type')
                .items([
                  S.listItem()
                    .title('📥 Downloads')
                    .child(
                      buildList(
                        S,
                        'Downloads',
                        `${BASE_FILTER} && documentType == "download"`,
                      ),
                    ),
                  S.listItem()
                    .title('📋 Templates')
                    .child(
                      buildList(
                        S,
                        'Templates',
                        `${BASE_FILTER} && documentType == "template"`,
                      ),
                    ),
                  S.listItem()
                    .title('📖 Reference Docs')
                    .child(
                      buildList(
                        S,
                        'Reference Docs',
                        `${BASE_FILTER} && documentType == "reference"`,
                      ),
                    ),
                  S.listItem()
                    .title('📚 Internal Guides')
                    .child(
                      buildList(S, 'Internal Guides', `${BASE_FILTER} && documentType == "guide"`),
                    ),
                  S.listItem()
                    .title('🗃️ Archived')
                    .child(
                      buildList(
                        S,
                        'Archived Documents',
                        '_type == "downloadResource" && isArchived == true',
                      ),
                    ),
                ]),
            ),
          S.listItem()
            .title('By Category')
            .child(
              S.list()
                .title('By Category')
                .items([
                  S.listItem()
                    .title('📢 Marketing Materials')
                    .child(
                      buildList(
                        S,
                        'Marketing Materials',
                        `${BASE_FILTER} && category == "marketing"`,
                      ),
                    ),
                  S.listItem()
                    .title('⚙️ Operations Docs')
                    .child(
                      buildList(
                        S,
                        'Operations Docs',
                        `${BASE_FILTER} && category == "operations"`,
                      ),
                    ),
                  S.listItem()
                    .title('🔧 Technical Specs')
                    .child(
                      buildList(
                        S,
                        'Technical Specs',
                        `${BASE_FILTER} && category == "technical"`,
                      ),
                    ),
                  S.listItem()
                    .title('⚖️ Legal Documents')
                    .child(
                      buildList(S, 'Legal Documents', `${BASE_FILTER} && category == "legal"`),
                    ),
                  S.listItem()
                    .title('📝 Templates')
                    .child(
                      buildList(S, 'Template Category', `${BASE_FILTER} && category == "templates"`),
                    ),
                ]),
            ),
          S.divider(),
          S.listItem()
            .title('➕ Create New')
            .child(
              S.component()
                .id('downloads-create-new')
                .title('Create New Document')
                .component(DownloadsQuickCreatePane as any),
            ),
        ]),
    )
