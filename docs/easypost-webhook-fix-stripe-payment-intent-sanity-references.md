---
title: Orders Filtering Implementation Guide - Step-by-Step Instructions
description: Technical specification for implementing advanced filtering, order type filters, and simplified desk structure in the orders management system.
imageAlt: Orders management system interface showing filtering tabs, order type filter button, and simplified desk structure for technical implementation
imageColumns: 12
slug: orders-filtering-implementation-guide
status: draft
tags:
  - implementation
  - technical-specification
  - orders
  - filtering
  - sanity-studio
---

# Implementation Overview
This guide implements three major changes to the orders management system:

1. Advanced filtering for carts and archived tabs with custom badges
2. Order type filter button in the table header
3. Simplified desk structure with single 'All Orders' view

# PART 1: Filtering Logic for Carts and Archived Tabs
## 1.1 Carts Tab Implementation
### Requirements:
- Show abandonedCheckout documents (different document type from orders)
- Display both abandoned/expired carts AND recovered carts
- Add custom status badge for 'recovered' status only
- No badges needed for 'abandoned' or 'expired' (implicit in the section)

### GROQ Queries:
```groq
*[_type == "abandonedCheckout" && status in ["abandoned", "expired"]] | order(_createdAt desc)
```

For Recovered Carts:

```groq
*[_type == "abandonedCheckout" && status == "recovered"] | order(_createdAt desc)
```

Combined Query (if showing all in one tab):

```groq
*[_type == "abandonedCheckout"] | order(_createdAt desc)
```

### Implementation in ordersDocumentTable.tsx:
**Step 1: Modify the tabs configuration to handle the 'carts' tab:**

```typescript
const tabs = [
  {
    id: 'all',
    title: 'All',
    filter: '_type == "order"'
  },
  {
    id: 'open',
    title: 'Open',
    filter: '_type == "order" && status == "paid" && fulfillment.status == "unfulfilled"'
  },
  {
    id: 'closed',
    title: 'Closed',
    filter: '_type == "order" && status in ["cancelled", "expired"]'
  },
  {
    id: 'carts',
    title: 'Carts',
    filter: '_type == "abandonedCheckout"',
    documentType: 'abandonedCheckout' // Different document type!
  },
  {
    id: 'archived',
    title: 'Archived',
    filter: '_type == "order" && status in ["fulfilled", "shipped", "refunded"]'
  }
]
```

**Step 2: Update the query logic to handle different document types:**

```typescript
const activeTab = tabs.find(tab => tab.id === currentTabId)
const documentType = activeTab?.documentType || 'order'
const filterQuery = activeTab?.filter || '_type == "order"'

const query = `*[${filterQuery}] | order(_createdAt desc) [0...50]`
```

### Custom Status Badge Component:
**Step 3: Create or modify the status badge component to handle 'recovered' status:**

```typescript
// In ordersDocumentTable.tsx or separate component file

function StatusBadge({ status }: { status: string }) {
  // Only show badge for 'recovered' status in carts tab
  if (status !== 'recovered') return null
  
  return (
    <Badge
      tone="positive"
      style={{
        backgroundColor: '#43D675',
        color: 'white',
        padding: '4px 8px',
        borderRadius: '4px',
        fontSize: '12px',
        fontWeight: 600
      }}
    >
      Recovered
    </Badge>
  )
}

// Usage in table row:
<TableCell>
  {row._type === 'abandonedCheckout' && (
    <StatusBadge status={row.status} />
  )}
</TableCell>
```

## 1.2 Archived Tab Implementation
### Requirements:
- Show orders that have been fulfilled
- Include orders with status: 'fulfilled', 'shipped', or 'refunded'

### GROQ Query:
```groq
*[_type == "order" && status in ["fulfilled", "shipped", "refunded"]] | order(_createdAt desc)
```

Implementation: Already included in the tabs configuration above (Step 1).

# PART 2: Order Type Filter Button
## 2.1 Requirements:
- Add filter button with ONLY an icon (no text)
- Place beside the 'actions' button in table header
- Filter by: Online, In-Store, Wholesale orders
- Include 'All Types' option to clear filter

## 2.2 Implementation in ordersDocumentTable.tsx:
**Step 1: Import FilterIcon:**

```typescript
import {FilterIcon} from '@sanity/icons'
```

**Step 2: Add state for order type filter:**

```typescript
const [orderTypeFilter, setOrderTypeFilter] = useState<string | null>(null)
```

**Step 3: Create filter button component:**

```typescript
function OrderTypeFilterButton() {
  const [isOpen, setIsOpen] = useState(false)
  
  const orderTypes = [
    { label: 'All Types', value: null },
    { label: 'Online Orders', value: 'online' },
    { label: 'In-Store Orders', value: 'in-store' },
    { label: 'Wholesale Orders', value: 'wholesale' }
  ]
  
  return (
    <MenuButton
      button={
        <Button
          icon={FilterIcon}
          mode="ghost"
          tone={orderTypeFilter ? 'primary' : 'default'}
        />
      }
      id="order-type-filter"
      menu={
        <Menu>
          {orderTypes.map(type => (
            <MenuItem
              key={type.value || 'all'}
              text={type.label}
              onClick={() => {
                setOrderTypeFilter(type.value)
                setIsOpen(false)
              }}
              selected={orderTypeFilter === type.value}
            />
          ))}
        </Menu>
      }
      popover={{portal: true}}
    />
  )
}
```

**Step 4: Update query to include order type filter:**

```typescript
let filterQuery = activeTab?.filter || '_type == "order"'

// Add order type filter if selected
if (orderTypeFilter && activeTab?.id !== 'carts') {
  filterQuery += ` && orderType == "${orderTypeFilter}"`
}

const query = `*[${filterQuery}] | order(_createdAt desc) [0...50]`
```

**Step 5: Add button to header (beside actions button):**

```typescript
<Flex gap={2} align="center">
  <OrderTypeFilterButton />
  <ActionsButton /> {/* Existing actions button */}
</Flex>
```

# PART 3: Desk Structure Simplification
## 3.1 Items to Remove:
- Online Orders
- In-Store Orders
- Wholesale Orders
- All Orders (v2)
- Abandoned Checkouts
- Order Workflow Views
- Payment Links

## 3.2 Payment Links Discussion:
**Current Understanding:**
- Payment links should be automated within invoice logic
- When an invoice is created, a payment link should be automatically generated
- The payment link should reflect the invoice total
- When a customer pays via the invoice payment link, it should automatically convert the invoice to an order

**Action Required:** Verify this automated process is already implemented in the invoice system. If not, this needs to be built separately.

## 3.3 Implementation in deskStructure.ts:
**Step 1: Locate the createOrdersSection function**

**Step 2: Replace the entire function with this simplified version:**

```typescript
function createOrdersSection(S: StructureBuilder) {
  return S.listItem()
    .id('orders')
    .title('Orders')
    .icon(TrolleyIcon)
    .child(
      S.list()
        .title('Orders')
        .items([
          S.listItem()
            .id('orders-all')
            .title('All Orders')
            .icon(ClipboardIcon)
            .child(documentTablePane(S, 'orders-all', 'All Orders', OrdersListTableView)),
        ]),
    )
}
```

**Step 3: Remove any references to:**
- orders-online
- orders-in-store
- orders-wholesale
- orders-all-v2
- abandoned-checkouts
- order-workflows
- payment-links

**Step 4: Ensure the OrdersListTableView component includes all the tabs (all, open, closed, carts, archived) as implemented in Part 1.**

# IMPLEMENTATION CHECKLIST
## Part 1: Filtering Logic
- [ ] Update tabs configuration in ordersDocumentTable.tsx
- [ ] Add 'carts' tab with abandonedCheckout document type
- [ ] Add 'archived' tab with fulfilled orders filter
- [ ] Modify query logic to handle different document types
- [ ] Create/update StatusBadge component for 'recovered' status
- [ ] Add badge rendering in table rows for abandonedCheckout documents
- [ ] Test carts tab shows both abandoned and recovered checkouts
- [ ] Test archived tab shows only fulfilled/shipped/refunded orders
- [ ] Verify recovered badge displays correctly (green/positive tone)

## Part 2: Order Type Filter
- [ ] Import FilterIcon from @sanity/icons
- [ ] Add orderTypeFilter state
- [ ] Create OrderTypeFilterButton component
- [ ] Add filter options: All Types, Online, In-Store, Wholesale
- [ ] Update query logic to include order type filter
- [ ] Position button beside actions button in header
- [ ] Test filter works for all three order types
- [ ] Verify filter button shows active state when filter applied
- [ ] Ensure filter doesn't apply to carts tab (abandonedCheckout)

## Part 3: Desk Structure
- [ ] Locate createOrdersSection in deskStructure.ts
- [ ] Replace with simplified version (single 'All Orders' item)
- [ ] Remove all references to removed sections
- [ ] Verify OrdersListTableView is correctly referenced
- [ ] Test navigation to Orders section
- [ ] Confirm only 'All Orders' appears in the list
- [ ] Verify invoice payment link automation (separate task if needed)

# FILES TO MODIFY
**1. ordersDocumentTable.tsx**
- Update tabs configuration
- Add StatusBadge component
- Add OrderTypeFilterButton component
- Update query logic for multiple document types
- Update header to include filter button

**2. deskStructure.ts**
- Simplify createOrdersSection function
- Remove unnecessary list items

**3. Potentially create new file:**
- components/StatusBadge.tsx (if separating component)

# TESTING PROCEDURES
## Test 1: Carts Tab
1. Navigate to Orders → All Orders
2. Click 'Carts' tab
3. Verify abandonedCheckout documents are displayed
4. Check that recovered carts show green 'Recovered' badge
5. Verify abandoned/expired carts do NOT show badges
6. Confirm sorting by creation date (newest first)

## Test 2: Archived Tab
1. Click 'Archived' tab
2. Verify only orders with status 'fulfilled', 'shipped', or 'refunded' appear
3. Confirm no 'paid' or 'cancelled' orders are shown
4. Check sorting by creation date

## Test 3: Order Type Filter
1. Click filter icon button (beside actions)
2. Select 'Online Orders'
3. Verify only orders with orderType='online' are shown
4. Repeat for 'In-Store' and 'Wholesale'
5. Select 'All Types' to clear filter
6. Verify filter button shows active state when filter applied
7. Switch to 'Carts' tab and confirm filter doesn't affect it

## Test 4: Desk Structure
1. Navigate to main Studio view
2. Click 'Orders' in sidebar
3. Verify only 'All Orders' appears (no other sub-items)
4. Confirm all tabs work within the single view
5. Check that removed sections are no longer accessible

# GROQ QUERY REFERENCE
For quick reference, here are all the GROQ queries used:

```groq
// All orders
*[_type == "order"] | order(_createdAt desc)

// Open orders
*[_type == "order" && status == "paid" && fulfillment.status == "unfulfilled"] | order(_createdAt desc)

// Closed orders
*[_type == "order" && status in ["cancelled", "expired"]] | order(_createdAt desc)

// Carts (all abandoned checkouts)
*[_type == "abandonedCheckout"] | order(_createdAt desc)

// Archived orders
*[_type == "order" && status in ["fulfilled", "shipped", "refunded"]] | order(_createdAt desc)

// Online orders
*[_type == "order" && orderType == "online"] | order(_createdAt desc)

// In-store orders
*[_type == "order" && orderType == "in-store"] | order(_createdAt desc)

// Wholesale orders
*[_type == "order" && orderType == "wholesale"] | order(_createdAt desc)
```

# EXPECTED RESULT
After implementation:

**1. Orders section in desk structure shows only:**
- Orders → All Orders (with tabs: All, Open, Closed, Carts, Archived)

**2. Carts tab displays:**
- All abandonedCheckout documents
- Green 'Recovered' badge on recovered carts only
- No badges on abandoned/expired carts

**3. Archived tab displays:**
- Only fulfilled, shipped, or refunded orders

**4. Filter button in header:**
- Icon-only button beside actions
- Filters by Online/In-Store/Wholesale
- Shows active state when filter applied

**5. Removed sections:**
- No more separate Online/In-Store/Wholesale order lists
- No more Order Workflow Views
- No more Abandoned Checkouts standalone section
- No more Payment Links section
