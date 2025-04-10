import S from '@sanity/desk-tool/structure-builder'

const deskStructure = () =>
  S.list()
    .title('Store')
    .items([
      S.listItem()
        .title('Products')
        .schemaType('wooProduct')
        .child(S.documentTypeList('wooProduct').title('Products')),

      S.listItem()
        .title('Categories')
        .schemaType('category')
        .child(S.documentTypeList('category').title('Categories')),

      S.divider(),

      S.listItem()
        .title('Site Settings')
        .schemaType('siteSettings')
        .child(S.documentTypeList('siteSettings').title('Settings')),
    ])

export default deskStructure