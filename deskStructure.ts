import { StructureBuilder } from 'sanity/structure'

const deskStructure = (S: StructureBuilder) =>
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
        .title('Quote Requests')
        .schemaType('buildQuote')
        .child(S.documentTypeList('buildQuote').title('Quote Requests')),

      S.divider(),

      S.listItem()
        .title('Site Settings')
        .schemaType('siteSettings')
        .child(S.documentTypeList('siteSettings').title('Settings')),
        
      
        S.divider(),

        S.listItem()
          .title('Customers')
          .schemaType('customer')
          .child(S.documentTypeList('customer')),
  
        S.listItem()
          .title('Shipping Options')
          .schemaType('shippingOption')
          .child(S.documentTypeList('shippingOption')),
  
        S.divider(),
  
        // Optional: Site Settings
        S.listItem()
          .title('Site Settings')
          .schemaType('siteSettings')
          .child(S.documentTypeList('siteSettings')),  
   
    ])

export default deskStructure