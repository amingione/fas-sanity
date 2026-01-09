import {useCallback} from 'react'
import {DocumentActionComponent} from 'sanity'
import {DownloadIcon} from '@sanity/icons'
import {toPlainText} from '@portabletext/react'

type DownloadDocument = {
  title?: string | null
  description?: string | null
  category?: string | null
  version?: string | null
  tags?: string[] | null
  documentType?: string | null
  content?: unknown
}

const sanitizeFilename = (title: string) =>
  title
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()

const extractTextFromContent = (content?: unknown): string => {
  if (Array.isArray(content)) {
    const lines: string[] = []
    content.forEach((block) => {
      if (!block || typeof block !== 'object') {
        return
      }

      const blockType = (block as { _type?: string })._type
      if (blockType === 'block') {
        const blockText = toPlainText(block)
        if (blockText) {
          lines.push(blockText)
        }
      } else if (blockType === 'code' && typeof (block as { code?: unknown }).code === 'string') {
        lines.push((block as { code: string }).code)
      } else if (blockType === 'image') {
        const imageBlock = block as { alt?: string }
        lines.push(`[Image: ${imageBlock.alt || 'image'}]`)
      }
    })
    return lines.join('\n\n')
  }

  if (typeof content === 'string') {
    return content
  }

  return ''
}

const determineExtension = (title: string, documentType?: string | null) => {
  const lowerTitle = title.toLowerCase()
  let extension = '.txt'
  let mimeType = 'text/plain'

  if (documentType === 'code' || lowerTitle.includes('.ts')) {
    extension = lowerTitle.includes('.tsx') ? '.tsx' : '.ts'
    mimeType = 'text/typescript'
  } else if (lowerTitle.includes('.jsx') || lowerTitle.includes('.js')) {
    extension = lowerTitle.includes('.jsx') ? '.jsx' : '.js'
    mimeType = 'text/javascript'
  } else if (lowerTitle.includes('.json')) {
    extension = '.json'
    mimeType = 'application/json'
  } else if (lowerTitle.includes('.md')) {
    extension = '.md'
    mimeType = 'text/markdown'
  } else if (lowerTitle.includes('.css')) {
    extension = '.css'
    mimeType = 'text/css'
  } else if (lowerTitle.includes('.html')) {
    extension = '.html'
    mimeType = 'text/html'
  } else if (lowerTitle.includes('.sh') || lowerTitle.includes('bash')) {
    extension = '.sh'
    mimeType = 'text/x-shellscript'
  } else if (lowerTitle.includes('.env')) {
    extension = '.env'
    mimeType = 'text/plain'
  } else if (documentType === 'guide' || documentType === 'documentation') {
    extension = '.md'
    mimeType = 'text/markdown'
  }

  return {extension, mimeType}
}

export const DownloadFileAction: DocumentActionComponent = (props) => {
  const {draft, published, type, onComplete} = props

  const handleDownload = useCallback(() => {
    if (type !== 'downloadResource') {
      onComplete()
      return
    }

    const doc = (published || draft) as DownloadDocument | null
    if (!doc) {
      onComplete()
      return
    }

    const title = (doc.title?.trim() || 'download').slice(0, 120)
    const content = extractTextFromContent(doc.content)
    const {extension, mimeType} = determineExtension(title, doc.documentType)

    const metadataFields = [
      doc.description ? `Description: ${doc.description}` : null,
      doc.category ? `Category: ${doc.category}` : null,
      doc.version ? `Version: ${doc.version}` : null,
      doc.tags?.length ? `Tags: ${doc.tags.join(', ')}` : null,
    ].filter((value): value is string => Boolean(value))

    const metadataLines = [`# ${title}`]
    if (metadataFields.length > 0) {
      metadataLines.push('', ...metadataFields)
    }
    metadataLines.push('', '---', '')
    const metadataHeader = metadataLines.join('\n')

    const trimmedContent = content.trim()
    const fullContent = trimmedContent
      ? `${metadataHeader}\n\n${trimmedContent}`
      : `${metadataHeader}\n\n`

    const sanitizedTitle = sanitizeFilename(title)
    const filename = `${sanitizedTitle || 'download'}${extension}`

    if (typeof document === 'undefined') {
      onComplete()
      return
    }

    const blob = new Blob([fullContent], {type: mimeType})
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    onComplete()
  }, [draft, published, onComplete, type])

  if (type !== 'downloadResource') {
    return null
  }

  return {
    label: 'Download File',
    icon: DownloadIcon,
    tone: 'primary',
    onHandle: handleDownload,
  }
}
