export type DocumentStub<T extends Record<string, any> = Record<string, any>> = T & {
  _type: string
}
