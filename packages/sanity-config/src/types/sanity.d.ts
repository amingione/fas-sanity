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
      component: (comp: any) => {title: (name: string) => any}
    }
  }
  module 'sanity/structure' {
    import type {StructureBuilder} from 'sanity/desk'
    const S: StructureBuilder
    export default S

    export function listItem() {
      throw new Error('Function not implemented.')
    }
  }

  export const StructureBuilder: StructureBuilder

  export function documentTypeListItem() {
    throw new Error('Function not implemented.')
  }

  export function list() {
    throw new Error('Function not implemented.')
  }

  export function listItem() {
    throw new Error('Function not implemented.')
  }

  export function documentTypeList(arg0: string) {
    throw new Error('Function not implemented.')
  }

  export function document() {
    throw new Error('Function not implemented.')
  }

  export function divider(): any {
    throw new Error('Function not implemented.')
  }
}
