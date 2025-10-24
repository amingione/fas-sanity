// components/studio/DocumentIframePreview.tsx

import React from 'react'

interface Props {
  basePath: string
  document: {
    displayed: {
      slug?: { current?: string }
    }
  }
}

const DocumentIframePreview: React.FC<Props> = ({ basePath, document }) => {
  const slug = document?.displayed?.slug?.current

  if (!slug) {
    return <div style={{ padding: 16 }}>⚠️ Missing slug — unable to generate preview.</div>
  }

  const baseUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : process.env.SANITY_STUDIO_SITE_URL || process.env.VITE_SITE_URL || 'https://fasmotorsports.com'

  const iframeUrl = `${baseUrl}${basePath}/${slug}`

  return (
    <div style={{ width: '100%', height: '100%', border: 'none' }}>
      <iframe
        src={iframeUrl}
        frameBorder="0"
        style={{ width: '100%', height: '100%' }}
        title="Live Preview"
      />
    </div>
  )
}

export default DocumentIframePreview
