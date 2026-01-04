import React from 'react'

export default function ProductPreview({document}: any) {
  const {displayed} = document || {}
  const {slug} = displayed || {}

  if (!slug?.current) {
    return <p className="p-4 text-sm">🛈 Save this product to enable live preview.</p>
  }

  const isDev = typeof process !== 'undefined' ? process.env?.NODE_ENV === 'development' : false
  const baseSite =
    (typeof process !== 'undefined'
      ? process.env.SANITY_STUDIO_SITE_URL
      : undefined) || 'https://fasmotorsports.com'
  const baseUrl = `${isDev ? 'http://localhost:3000' : baseSite}/product`

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
