import React from 'react'
import { useDocumentValues } from 'sanity'

export default function ProductPreview({ document }: any) {
  const { displayed } = document || {}
  const { slug } = displayed || {}

  if (!slug?.current) {
    return <p className="p-4 text-sm">🛈 Save this product to enable live preview.</p>
  }

  const baseUrl = import.meta.env.DEV
    ? 'http://localhost:3000/product'
    : 'https://fasmotorsports.com/product'

  const previewUrl = `${baseUrl}/${slug.current}`

  return (
    <div className="w-full h-[80vh]">
      <iframe
        src={previewUrl}
        title="Live Product Preview"
        className="w-full h-full border rounded"
      />
    </div>
  )
}