# Shipment List Preview Configuration with PDF Thumbnails and Print Actions

## Overview
When managing shipments in Sanity Studio, a well-configured list preview can significantly improve workflow efficiency. This implementation provides:
- Visual PDF thumbnails of shipping labels in the document list
- Customer name as the primary title
- Order number and tracking code as the subtitle
- Custom document actions for printing labels and merged documents

## 1. Schema Preview Configuration
First, configure the preview settings in your shipment schema. The preview configuration uses `select` to fetch necessary data and `prepare` to format it for display.

```typescript
import {defineType, defineField} from 'sanity'
import {TruckIcon} from '@sanity/icons'
import {PDFThumbnail} from '../components/PDFThumbnail'

export const shipmentSchema = defineType({
  name: 'shipment',
  title: 'Shipment',
  type: 'document',
  icon: TruckIcon,
  fields: [
    defineField({
      name: 'orderNumber',
      title: 'Order Number',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'customer',
      title: 'Customer',
      type: 'reference',
      to: [{type: 'customer'}],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'trackingCode',
      title: 'Tracking Code',
      type: 'string',
    }),
    defineField({
      name: 'shippingLabel',
      title: 'Shipping Label PDF',
      type: 'file',
      options: {
        accept: 'application/pdf',
      },
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'Pending', value: 'pending'},
          {title: 'Processing', value: 'processing'},
          {title: 'Shipped', value: 'shipped'},
          {title: 'Delivered', value: 'delivered'},
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
  ],
  preview: {
    select: {
      orderNumber: 'orderNumber',
      trackingCode: 'trackingCode',
      customerName: 'customer.name',
      labelUrl: 'shippingLabel.asset.url',
      status: 'status',
    },
    prepare({orderNumber, trackingCode, customerName, labelUrl, status}) {
      const subtitle = [
        orderNumber && `Order: ${orderNumber}`,
        trackingCode && `Tracking: ${trackingCode}`,
      ]
        .filter(Boolean)
        .join(' • ')

      return {
        title: customerName || 'Unknown Customer',
        subtitle: subtitle || 'No order details',
        media: labelUrl ? PDFThumbnail : TruckIcon,
        mediaProps: {
          pdfUrl: labelUrl,
          status: status,
        },
      }
    },
  },
})
```

### Key Points
- `select` fetches document data and resolves references (for example, `customer.name`).
- `prepare` formats the selected data for display.
- `media` can be a React component, icon, or image URL.
- `mediaProps` passes custom props to the media component (non-standard, but Sanity forwards them to the component).

## 2. Custom PDF Thumbnail Component
Create a component that renders PDF thumbnails in the list view. This component uses PDF.js to render the first page of the PDF as an image on a canvas.

```typescript
import React, {useEffect, useRef, useState} from 'react'
import {Box, Spinner, Text} from '@sanity/ui'
import {DocumentIcon} from '@sanity/icons'

interface PDFThumbnailProps {
  pdfUrl?: string
  status?: string
}

export const PDFThumbnail: React.FC<PDFThumbnailProps> = ({pdfUrl, status}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!pdfUrl || !canvasRef.current) {
      setLoading(false)
      return
    }

    let isMounted = true

    const loadPDF = async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

        const loadingTask = pdfjsLib.getDocument(pdfUrl)
        const pdf = await loadingTask.promise
        const page = await pdf.getPage(1)

        if (!isMounted || !canvasRef.current) return

        const viewport = page.getViewport({scale: 0.5})
        const canvas = canvasRef.current
        const context = canvas.getContext('2d')
        if (!context) return

        canvas.height = viewport.height
        canvas.width = viewport.width

        await page.render({
          canvasContext: context,
          viewport: viewport,
        }).promise

        if (isMounted) {
          setLoading(false)
        }
      } catch (err) {
        console.error('Error loading PDF:', err)
        if (isMounted) {
          setError(true)
          setLoading(false)
        }
      }
    }

    loadPDF()

    return () => {
      isMounted = false
    }
  }, [pdfUrl])

  if (!pdfUrl) {
    return (
      <Box style={{width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <DocumentIcon />
      </Box>
    )
  }

  if (loading) {
    return (
      <Box style={{width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <Spinner />
      </Box>
    )
  }

  if (error) {
    return (
      <Box
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f3f3f3',
        }}
      >
        <Text size={0}>PDF</Text>
      </Box>
    )
  }

  return (
    <Box style={{width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden'}}>
      <canvas ref={canvasRef} style={{maxWidth: '100%', maxHeight: '100%', objectFit: 'contain'}} />
    </Box>
  )
}
```

### Installation Requirements

```bash
npm install pdfjs-dist
# or
yarn add pdfjs-dist
```

## 3. Custom Document Actions for Printing
Create document actions that appear in the document menu for quick printing operations.

```typescript
import {DocumentActionComponent} from 'sanity'
import {PrintIcon} from '@sanity/icons'

export const printLabelAction: DocumentActionComponent = (props) => {
  const {draft, published} = props
  const doc = draft || published

  return {
    label: 'Print Label',
    icon: PrintIcon,
    disabled: !doc?.shippingLabel?.asset?.url,
    onHandle: () => {
      if (doc?.shippingLabel?.asset?.url) {
        const printWindow = window.open(doc.shippingLabel.asset.url, '_blank')
        if (printWindow) {
          printWindow.onload = () => {
            printWindow.print()
          }
        }
      }
    },
  }
}
```

```typescript
import {DocumentActionComponent} from 'sanity'
import {DocumentsIcon} from '@sanity/icons'
import {useToast} from '@sanity/ui'

export const printMergedAction: DocumentActionComponent = (props) => {
  const {draft, published} = props
  const doc = draft || published
  const toast = useToast()

  return {
    label: 'Print Merged Documents',
    icon: DocumentsIcon,
    disabled: !doc?.shippingLabel?.asset?.url,
    onHandle: async () => {
      try {
        const response = await fetch('/api/merge-shipment-docs', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            shipmentId: doc._id,
            labelUrl: doc.shippingLabel?.asset?.url,
          }),
        })

        if (!response.ok) throw new Error('Failed to merge documents')

        const {mergedPdfUrl} = await response.json()
        const printWindow = window.open(mergedPdfUrl, '_blank')
        if (printWindow) {
          printWindow.onload = () => {
            printWindow.print()
          }
        }

        toast.push({status: 'success', title: 'Documents merged successfully'})
      } catch (error) {
        console.error('Error merging documents:', error)
        toast.push({
          status: 'error',
          title: 'Failed to merge documents',
          description: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    },
  }
}
```

## 4. Registration in `sanity.config.ts`
Register the shipment schema and custom actions inside the Sanity configuration.

```typescript
import {defineConfig} from 'sanity'
import {deskTool} from 'sanity/desk'
import {visionTool} from '@sanity/vision'
import {schemaTypes} from './schemas'
import {printLabelAction} from './actions/printLabelAction'
import {printMergedAction} from './actions/printMergedAction'

export default defineConfig({
  name: 'default',
  title: 'My Project',
  projectId: 'your-project-id',
  dataset: 'production',

  plugins: [deskTool(), visionTool()],

  schema: {
    types: schemaTypes,
  },

  document: {
    actions: (prev, context) => {
      if (context.schemaType === 'shipment') {
        return [...prev, printLabelAction, printMergedAction]
      }
      return prev
    },
  },
})
```

## Simpler Fallback: Status-Colored Icons
If PDF thumbnails are too heavy, use lightweight status-colored icons.

```typescript
import React from 'react'
import {Box} from '@sanity/ui'
import {ClockIcon, SyncIcon, RocketIcon, CheckmarkCircleIcon} from '@sanity/icons'

interface StatusIconProps {
  status?: string
}

const statusConfig = {
  pending: {
    icon: ClockIcon,
    color: '#F59E0B',
  },
  processing: {
    icon: SyncIcon,
    color: '#3B82F6',
  },
  shipped: {
    icon: RocketIcon,
    color: '#8B5CF6',
  },
  delivered: {
    icon: CheckmarkCircleIcon,
    color: '#10B981',
  },
}

export const StatusIcon: React.FC<StatusIconProps> = ({status = 'pending'}) => {
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending
  const Icon = config.icon

  return (
    <Box style={{width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: config.color}}>
      <Icon style={{fontSize: '1.5rem'}} />
    </Box>
  )
}
```

### Updated Schema with Status Icons

```typescript
import {defineType} from 'sanity'
import {TruckIcon} from '@sanity/icons'
import {StatusIcon} from '../components/StatusIcon'

export const shipmentSchema = defineType({
  name: 'shipment',
  title: 'Shipment',
  type: 'document',
  icon: TruckIcon,
  preview: {
    select: {
      orderNumber: 'orderNumber',
      trackingCode: 'trackingCode',
      customerName: 'customer.name',
      status: 'status',
    },
    prepare({orderNumber, trackingCode, customerName, status}) {
      const subtitle = [
        orderNumber && `Order: ${orderNumber}`,
        trackingCode && `Tracking: ${trackingCode}`,
      ]
        .filter(Boolean)
        .join(' • ')

      return {
        title: customerName || 'Unknown Customer',
        subtitle: subtitle || 'No order details',
        media: () => <StatusIcon status={status} />,
      }
    },
  },
})
```

## Implementation Checklist

### Schema Configuration
- [ ] Define the shipment schema with required fields (`orderNumber`, `customer`, `status`).
- [ ] Include a file field for the shipping label PDF (`accept: 'application/pdf'`).
- [ ] Configure `preview.select` to fetch `customer.name` and `shippingLabel.asset.url`.
- [ ] Implement `preview.prepare` to format the title and subtitle.

### Media Component (Choose One)
- [ ] **Option A:** Install `pdfjs-dist` for PDF thumbnails.
- [ ] **Option A:** Create `PDFThumbnail` with canvas rendering, loading states, and error fallbacks.
- [ ] **Option B:** Create `StatusIcon` with color-coded states.

### Document Actions
- [ ] Build `printLabelAction` to open the PDF and trigger `window.print()`.
- [ ] Build `printMergedAction` that hits an API endpoint, opens the merged PDF, and shows toasts.
- [ ] Disable both actions when no PDF is attached.

### Configuration
- [ ] Register the shipment schema in `schemaTypes`.
- [ ] Register custom actions in `sanity.config.ts`.
- [ ] Only attach print actions to the `shipment` schema type.

## Testing Procedures

### Preview Display
- Document with complete data: verify title, subtitle, and PDF thumbnail/status icon render.
- Missing data handling: ensure fallback title, subtitle, and icon/thumbnail states work.

### PDF Thumbnail (Option A)
- Upload various PDF sizes and multi-page documents.
- Confirm the first page renders, spinner appears while loading, and errors show fallback text.
- Check console for worker errors and confirm CORS headers.

### Status Icon (Option B)
- Create shipments with each status value to confirm correct icon and color.
- Test undefined status defaults to `pending`.

### Document Actions
- Ensure actions appear for shipment documents and disable without PDFs.
- `Print Label`: opens a new tab or window and automatically prints.
- `Print Merged Documents`: hits `/api/merge-shipment-docs`, opens merged PDF, and surfaces toast notifications on success or failure.

### Performance & Cross-Browser
- Seed 50+ shipment documents to monitor Studio scrolling performance.
- Compare memory usage between thumbnails vs. icons.
- Test Chrome, Firefox, Safari, and Edge for rendering consistency and popup handling.

## Troubleshooting Common Issues

### PDF Thumbnails Not Rendering
- Check the browser console for PDF.js worker errors.
- Ensure the worker source URL and PDF URLs have accessible CORS headers.
- Try hosting `pdf.worker.js` locally if CDN requests fail.

### Customer Name Not Showing
- Verify the customer document exposes a `name` field and is published.
- Confirm `preview.select` paths match the schema.

### Print Actions Not Appearing
- Ensure actions are registered in `sanity.config.ts`.
- Confirm the `context.schemaType === 'shipment'` guard.
- Restart the development server and refresh Studio.

### Print Window Blocked
- Prompt users to allow popups for the Studio domain.
- Consider a download-first workflow if popup blockers are unavoidable.

## Conclusion
Configuring shipment previews with either PDF thumbnails or status icons plus targeted print actions provides a professional fulfillment workflow in Sanity Studio. Choose the PDF approach for visual fidelity or status icons for maximum performance—both dramatically improve list scannability and reduce clicks during shipping operations.

*Alt text: Sanity Studio shipment list preview interface showing PDF thumbnails, customer information, and print actions.*
