// components/media/PDFThumbnail.tsx
import React from 'react'
import {Box, Text} from '@sanity/ui'
import {DocumentPdfIcon} from '@sanity/icons'

interface PDFThumbnailProps {
  pdfUrl?: string
}

const PDFThumbnail: React.FC<PDFThumbnailProps> = ({pdfUrl}) => {
  if (!pdfUrl) {
    return (
      <Box
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#1a1a1a',
        }}
      >
        <DocumentPdfIcon style={{fontSize: '32px', color: '#666', marginBottom: '8px'}} />
        <Text size={0} muted>
          No Label
        </Text>
      </Box>
    )
  }

  return (
    <Box
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        position: 'relative',
      }}
    >
      {/* Shipping label icon */}
      <DocumentPdfIcon
        style={{fontSize: '48px', color: 'rgba(255,255,255,0.9)', marginBottom: '8px'}}
      />
      <Text size={1} weight="semibold" style={{color: '#fff'}}>
        Shipping Label
      </Text>
      <Text size={0} style={{color: 'rgba(255,255,255,0.7)', marginTop: '4px'}}>
        Click to view
      </Text>
    </Box>
  )
}

export default PDFThumbnail
