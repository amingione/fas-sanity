import {defineMigration, at, setIfMissing} from 'sanity/migrate'

export default defineMigration({
  title: 'Convert invoice orderRef to weak references',
  documentTypes: ['invoice'],
  migrate: {
    document(doc) {
      if (
        !doc.orderRef ||
        typeof doc.orderRef !== 'object' ||
        typeof doc.orderRef._ref !== 'string'
      ) {
        return doc
      }
      if (doc.orderRef._weak === true) {
        return doc
      }
      return at(
        'orderRef',
        setIfMissing({
          _type: 'reference',
          _ref: doc.orderRef._ref,
          _weak: true
        })
      )
    }
  }
})
