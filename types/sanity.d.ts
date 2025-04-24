declare module 'sanity/desk' {
    interface StructureBuilder {
      list: () => any
      listItem: () => any
      document: () => any
      documentList: () => any
      documentTypeList: (type: string) => any
      divider: () => any
      component: () => any
      view: {
        form: () => any
        component: (comp: any) => { title: (name: string) => any }
      }
    }
    module 'sanity/structure' {
        import type { StructureBuilder } from 'sanity/desk'
        const S: StructureBuilder
        export default S
      }
  
    export const StructureBuilder: StructureBuilder
  }