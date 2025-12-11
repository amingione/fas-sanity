---
title: Implementing EasyPost Integration and Shipping Labels List Preview
description: Learn how to sync EasyPost saved packages and create a comprehensive shipping labels list with document operations and PDF merging.
imageAlt: EasyPost shipping integration technical illustration showing API connections, shipping labels, and package synchronization
imageColumns: 12
slug: implementing-easypost-integration-shipping-labels-preview
status: draft
publishedAt: 2024-01-15T10:00:00Z
readingTimeMinutes: 15
tags:
  - EasyPost
  - Shipping
  - Integration
  - PDF
  - Sanity
  - API
  - Webhooks
  - Document Operations
---

# Implementing EasyPost Integration and Shipping Labels List Preview

## Overview
This guide covers two critical shipping system enhancements: syncing saved packages from EasyPost and creating a comprehensive shipping labels list preview with document operations. These improvements streamline the shipping workflow by keeping package data synchronized and providing powerful tools for managing shipping labels with integrated packing slip functionality.

## Shipping Labels List Preview Implementation

### Current Problem
The shipping labels document type exists but does not automatically capture purchased or downloaded PDF labels from orders, lacks proper list preview configuration, and is missing document operations for print flows such as printing the label alone or merging it with the packing slip.

### Solution Architecture

#### Step 1: Modify Order Schema to Auto-Create Shipping Label Documents
When a shipping label is purchased on an order, automatically create a `shippingLabel` document that references customer name (from order), order number, created date, PDF file (from `order.shippingLabelFile`), tracking number, and carrier information.

#### Step 2: Create shippingLabel Schema with Preview Configuration
```ts
export default {
  name: 'shippingLabel',
  type: 'document',
  title: 'Shipping Label',
  fields: [
    {
      name: 'orderRef',
      title: 'Order',
      type: 'reference',
      to: [{type: 'order'}],
      validation: Rule => Rule.required()
    },
    {
      name: 'customerName',
      title: 'Customer',
      type: 'string',
      validation: Rule => Rule.required()
    },
    {
      name: 'orderNumber',
      title: 'Order Number',
      type: 'string',
      validation: Rule => Rule.required()
    },
    {
      name: 'trackingNumber',
      title: 'Tracking Number',
      type: 'string'
    },
    {
      name: 'carrier',
      title: 'Carrier',
      type: 'string'
    },
    {
      name: 'service',
      title: 'Service',
      type: 'string'
    },
    {
      name: 'labelPDF',
      title: 'Label PDF',
      type: 'file',
      options: {
        accept: 'application/pdf'
      }
    },
    {
      name: 'labelUrl',
      title: 'Label URL',
      type: 'url'
    },
    {
      name: 'createdAt',
      title: 'Created',
      type: 'datetime',
      initialValue: () => new Date().toISOString()
    },
    {
      name: 'easypostShipmentId',
      title: 'EasyPost Shipment ID',
      type: 'string'
    }
  ],
  preview: {
    select: {
      customerName: 'customerName',
      orderNumber: 'orderNumber',
      createdAt: 'createdAt',
      labelPDF: 'labelPDF'
    },
    prepare({customerName, orderNumber, createdAt, labelPDF}) {
      return {
        title: customerName,
        subtitle: `${orderNumber} • ${new Date(createdAt).toLocaleDateString()}`,
        media: labelPDF
      }
    }
  }
}
```

#### Step 3: Custom List Preview Component
```tsx
import {useDocuments, useApplyDocumentActions} from '@sanity/sdk-react'
import {Card, Stack, Text, Button, Flex} from '@sanity/ui'

export function ShippingLabelsList() {
  const {data, hasMore, isPending, loadMore} = useDocuments({
    documentType: 'shippingLabel',
    batchSize: 20,
    orderings: [{field: '_createdAt', direction: 'desc'}]
  })
  
  const apply = useApplyDocumentActions()
  
  if (isPending) return <div>Loading...</div>
  
  return (
    <Stack space={3}>
      {data.map(label => (
        <Card key={label._id} padding={4} radius={2} shadow={1}>
          <Flex justify="space-between" align="center">
            <Stack space={2}>
              <Text size={2} weight="semibold">{label.customerName}</Text>
              <Text size={1} muted>
                {label.orderNumber} • {new Date(label.createdAt).toLocaleDateString()}
              </Text>
            </Stack>
            <Flex gap={2}>
              <Button
                text="Print Label"
                onClick={() => window.open(label.labelUrl, '_blank')}
              />
              <Button
                text="Print Label + Packing Slip"
                onClick={() => printMergedDocument(label)}
              />
            </Flex>
          </Flex>
        </Card>
      ))}
      {hasMore && (
        <Button text="Load More" onClick={loadMore} />
      )}
    </Stack>
  )
}
```

#### Step 4: Merged PDF Print Function
Implement the merged PDF download function that combines a shipping label with a packing slip:

```ts
async function printMergedDocument(shippingLabel) {
  // Fetch order data
  const order = await sanityClient.fetch(
    `*[_type == "order" && _id == $orderId][0]`,
    {orderId: shippingLabel.orderRef._ref}
  )
  
  // Call API route to merge PDFs
  const response = await fetch('/api/merge-label-packing-slip', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      labelUrl: shippingLabel.labelUrl,
      orderId: order._id
    })
  })
  
  const blob = await response.blob()
  const url = window.URL.createObjectURL(blob)
  window.open(url, '_blank')
}
```

#### Step 5: Bulk Print Function for Multiple Labels
Extend the existing bulk print function in `ordersDocumentTable.tsx` to support printing multiple shipping labels and printing multiple labels plus packing slips:

```ts
{
  label: 'Print Labels + Packing Slips',
  icon: DocumentIcon,
  onHandle: async (selectedOrders) => {
    // Fetch all shipping labels for selected orders
    const labels = await Promise.all(
      selectedOrders.map(order => 
        sanityClient.fetch(
          `*[_type == "shippingLabel" && orderRef._ref == $orderId][0]`,
          {orderId: order._id}
        )
      )
    )
    
    // Call merge API with all labels
    const response = await fetch('/api/merge-multiple-labels-slips', {
      method: 'POST',
      body: JSON.stringify({labels})
    })
    
    // Download merged PDF
    const blob = await response.blob()
    downloadBlob(blob, 'merged-labels-slips.pdf')
  }
}
```

### API Route for PDF Merging
```ts
import {PDFDocument} from 'pdf-lib'

export async function POST(req: Request) {
  const {labelUrl, orderId} = await req.json()
  
  // Fetch label PDF
  const labelPdf = await fetch(labelUrl).then(r => r.arrayBuffer())
  
  // Generate packing slip PDF from order data
  const packingSlipPdf = await generatePackingSlip(orderId)
  
  // Merge PDFs
  const mergedPdf = await PDFDocument.create()
  const labelDoc = await PDFDocument.load(labelPdf)
  const slipDoc = await PDFDocument.load(packingSlipPdf)
  
  // Copy pages
  const labelPages = await mergedPdf.copyPages(labelDoc, labelDoc.getPageIndices())
  const slipPages = await mergedPdf.copyPages(slipDoc, slipDoc.getPageIndices())
  
  labelPages.forEach(page => mergedPdf.addPage(page))
  slipPages.forEach(page => mergedPdf.addPage(page))
  
  const pdfBytes = await mergedPdf.save()
  
  return new Response(pdfBytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="label-slip-${orderId}.pdf"`
    }
  })
}
```

## Part 3: Automatic Label Document Creation

### Webhook/Function to Auto-Create shippingLabel Documents
When an order's shipping label is purchased, automatically create the corresponding `shippingLabel` document:

```ts
// In your label purchase handler
async function onLabelPurchased(order, labelData) {
  // Create shippingLabel document
  await sanityClient.create({
    _type: 'shippingLabel',
    orderRef: {_type: 'reference', _ref: order._id},
    customerName: order.customerName,
    orderNumber: order.orderNumber,
    trackingNumber: labelData.trackingNumber,
    carrier: labelData.carrier,
    service: labelData.service,
    labelUrl: labelData.labelUrl,
    easypostShipmentId: labelData.shipmentId,
    createdAt: new Date().toISOString()
  })
  
  // Also update the order with label reference
  await sanityClient.patch(order._id)
    .set({
      shippingLabelFile: labelData.file,
      shippingLabelUrl: labelData.labelUrl
    })
    .commit()
}
```

## Part 4: Update deskStructure

### Modified Shipping Section
```ts
function createShippingSection(S) {
  return S.listItem()
    .title('Shipping')
    .icon(TruckIcon)
    .child(
      S.list()
        .title('Shipping')
        .items([
          // Shipping Labels with custom component
          S.listItem()
            .id('shipping-labels')
            .title('Shipping Labels')
            .icon(DocumentIcon)
            .child(
              S.component(ShippingLabelsList)
                .title('Shipping Labels')
            ),
          
          // Saved Packages with sync button
          S.listItem()
            .id('saved-packages')
            .title('Saved Packages')
            .icon(PackageIcon)
            .child(
              S.documentTypeList('savedPackage')
                .title('Saved Packages')
                .menuItems([
                  S.menuItem()
                    .title('Sync from EasyPost')
                    .icon(RefreshIcon)
                    .action(() => {
                      fetch('/api/sync-easypost-packages', {method: 'POST'})
                        .then(() => alert('Sync complete!'))
                    })
                ])
            ),
          
          S.divider(),
          
          S.documentTypeListItem('shipment')
            .title('Shipments')
            .icon(TruckIcon),
          
          S.documentTypeListItem('senderAddress')
            .title('Sender Addresses')
            .icon(HomeIcon)
        ])
    )
}
```

## Implementation Checklist

### EasyPost Integration
- [ ] Create API route for syncing saved packages
- [ ] Add `easypostId` field to `savedPackage` schema
- [ ] Implement field mapping from EasyPost to Sanity
- [ ] Add sync button to Saved Packages list
- [ ] Test sync functionality

### Shipping Labels Schema
- [ ] Create or update `shippingLabel` schema with preview config
- [ ] Add `orderRef` reference field
- [ ] Configure `preview.select` and `prepare` function
- [ ] Test preview rendering

### Auto-Create Label Documents
- [ ] Add webhook/function to create `shippingLabel` on label purchase
- [ ] Update order schema to reference created label
- [ ] Test automatic creation flow

### Custom List Preview Component
- [ ] Create `shippingLabelListPreview.tsx`
- [ ] Implement `useDocuments` hook
- [ ] Add print buttons (label only, label + slip)
- [ ] Style with Sanity UI components

### PDF Merging
- [ ] Create API route for merging label + packing slip
- [ ] Implement single merge function
- [ ] Implement bulk merge function
- [ ] Add to `ordersDocumentTable` bulk actions
- [ ] Test merged PDF downloads

### DeskStructure Updates
- [ ] Update `createShippingSection`
- [ ] Add custom component for shipping labels
- [ ] Add sync button for saved packages
- [ ] Test navigation and functionality

## Testing Notes

### Saved Packages Sync
- Create a package in the EasyPost dashboard
- Trigger sync in Sanity
- Verify the package appears in the Saved Packages list
- Check that all fields are mapped correctly

### Shipping Labels
- Purchase a label for an order
- Verify a `shippingLabel` document is auto-created
- Check that the preview shows correct customer/order info
- Test the print label button
- Test the print label + packing slip button

### Bulk Operations
- Select multiple orders in the document table
- Test bulk print labels
- Test bulk print labels + packing slips
- Verify merged PDF contains all documents

## Dependencies
Required packages for this implementation:

- `@easypost/api` – EasyPost Node.js library
- `pdf-lib` – PDF manipulation for merging
- `@sanity/sdk-react` – Document hooks for the custom list
- `@sanity/ui` – UI components for the list preview

## Conclusion
By implementing these two enhancements, you gain a robust shipping system that keeps EasyPost packages synchronized with Sanity CMS while enabling rich document operations for shipping labels. Automatic creation guarantees labels are never lost, and the custom list preview with print and merge functionality streamlines fulfillment workflows. Follow the implementation checklist and testing notes to ensure a smooth deployment.
