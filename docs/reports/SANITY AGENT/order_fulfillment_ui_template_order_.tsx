/*
# Order Fulfillment UI Template - order.tsx

Description: Complete UI template specification for order.tsx focused on warehouse fulfillment efficiency - zero ambiguity packing slips. This technical specification defines the essential UI structure for order fulfillment from a warehouse employee perspective.
Category: technical
Tags: order-fulfillment, packing-slip, ui-template, warehouse, operations

---


Overview

This template defines the essential UI structure for order fulfillment from a warehouse employee perspective. The goal is zero questions during packing - every detail needed to pick, pack, and ship should be immediately visible and unambiguous.

Critical Display Requirements

1. Order Header (Always Visible)

Order Number: Large, bold, scannable format

Order Date & Time: Full timestamp

Order Status: Color-coded badge (Pending/Processing/Packed/Shipped)

Order Type: Clearly marked (Standard/Rush/Wholesale/Custom)

Payment Status: Verified/Pending indicator

Priority Flag: Visual indicator for rush orders

2. Customer Information Block

Ship To Address:

Full name (exactly as provided)

Complete street address (line 1 & 2)

City, State, ZIP

Country (if international)

Phone number (for delivery issues)

Customer Email: For communication

Customer Instructions: Prominently displayed if present, highlighted box

3. Line Items Section (Core Fulfillment Data)

Each line item must display:

Product Image: Thumbnail for visual verification

SKU: Large, scannable format

Product Title: Full descriptive name

Quantity Ordered: LARGE, bold number - no ambiguity

Unit Price: For verification

Line Total: Calculated amount

Product Location: Warehouse bin/shelf location if available

Special Notes: Any product-specific instructions

Visual Structure

Table format with clear row separation

Alternating row colors for readability

Quantity in its own prominent column

Checkbox or status indicator for 'picked' state

4. Order Totals Section

Subtotal

Shipping method & cost

Tax amount

Discount/coupon codes applied (with description)

Grand Total: Bold, large format

5. Shipping Information

Shipping Method: Clearly stated (Ground/2-Day/Overnight)

Carrier: USPS/UPS/FedEx

Tracking Number: Once generated, prominently displayed

Expected Ship Date: Target date

Package Count: If multiple boxes

6. Packing Instructions Section

Gift Message: If applicable, in highlighted box

Special Handling: Fragile/Signature Required/etc.

Include Materials: Packing slip, promotional inserts, etc.

Quality Check Requirements: Any inspection notes

7. Internal Notes Section

Customer Service Notes: Any special circumstances

Warehouse Notes: Previous fulfillment issues or preferences

Admin Flags: Hold orders, verification needed, etc.

UI Layout Principles

Print-Optimized Design

Clean, high-contrast layout

Adequate spacing between sections

Page break considerations for multi-item orders

Black and white printer friendly

Screen Display Optimization

Responsive layout for tablets (warehouse devices)

Touch-friendly action buttons

Quick-scan visual hierarchy

Minimal scrolling for standard orders

Visual Hierarchy

Order number & status (top priority)

Quantity & SKU (fulfillment critical)

Shipping address (accuracy critical)

Everything else (supporting information)

Data Mapping from Order Schema

Map these order schema fields to UI:

orderNumber → Header (large display)

orderHeaderDisplay → Secondary identifier

status → Status badge

orderType → Type indicator

paymentStatus → Payment badge

customerName → Ship to name

customerEmail → Contact info

customerInstructions → Special instructions box

items[] → Line items table with:

items[].sku

items[].title

items[].quantity (PROMINENT)

items[].price

items[].image

shippingAddress → Ship to block

shippingMethod → Shipping info

totals → Order totals section

Employee Workflow Considerations

Picking Process

Print or display order

Scan/verify order number

For each line item:

Locate product by SKU

Pick quantity shown

Mark as picked (checkbox/button)

Verify all items picked

Packing Process

Select appropriate box size

Pack items securely

Include packing slip (printed version)

Add any inserts/promotional materials

Seal and label box

Mark order as packed

Shipping Process

Generate shipping label

Attach to package

Scan tracking number

Update order status to shipped

Customer notification sent automatically

Error Prevention

Visual Cues

Incomplete orders: Yellow highlight

Rush orders: Red border

Hold orders: Gray overlay with reason

Verified orders: Green checkmark

Validation Checks

All items marked as picked before packing

Shipping address complete

Payment verified

Inventory availability confirmed

Mobile/Tablet Considerations

Large touch targets (min 44px)

Swipe actions for status updates

Barcode scanner integration

Offline capability for warehouse WiFi issues

Accessibility

High contrast text

Clear font sizes (min 14px body, 18px+ for critical info)

Logical tab order

Screen reader friendly labels

Performance Requirements

Load time < 2 seconds

Real-time status updates

Batch printing capability

Quick search/filter by order number

Integration Points

Inventory system (stock verification)

Shipping carrier APIs (label generation)

Customer notification system

Warehouse management system (location data)

Example Component Structure

The following TypeScript interface defines the data structure for the order fulfillment view:

interface OrderFulfillmentView {
  orderHeader: {
    orderNumber: string;
    orderDate: Date;
    status: OrderStatus;
    orderType: OrderType;
    paymentStatus: PaymentStatus;
    priority: boolean;
  };
  
  customer: {
    name: string;
    email: string;
    phone: string;
    instructions?: string;
  };
  
  shipping: {
    address: Address;
    method: ShippingMethod;
    carrier: string;
    trackingNumber?: string;
  };
  
  lineItems: LineItem[];
  
  totals: {
    subtotal: number;
    shipping: number;
    tax: number;
    discount: number;
    total: number;
  };
  
  packingInstructions: {
    giftMessage?: string;
    specialHandling: string[];
    includeMaterials: string[];
  };
  
  internalNotes: {
    customerService?: string;
    warehouse?: string;
    adminFlags: string[];
  };
}

interface LineItem {
  sku: string;
  title: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  image: string;
  location?: string;
  notes?: string;
  picked: boolean;
}

Testing Checklist

All order types display correctly

Quantities are immediately clear

Print layout is clean and readable

Mobile view is functional

Status updates work in real-time

Barcode scanning integrates properly

Multi-item orders paginate well

Special instructions are prominent

Employee can complete fulfillment without questions

Success Metrics

Zero 'what did they order?' questions

Zero 'how many?' questions

Reduced picking errors

Faster fulfillment time

Fewer customer service contacts about wrong items

Employee satisfaction with UI clarity
*/
