# Expired Orders Customer Audit Report

This report details the investigation into why expired checkout orders do not display customer details in the Sanity Desk.

## 1. Where the customer link is expected to be created

The primary link between an `order` and a `customer` is the `customerRef` field on the `order` document. This reference is created in the `netlify/functions/reprocessStripeSession.ts` function.

For non-expired orders, the `upsertOrder` function within `reprocessStripeSession.ts` attempts to find an existing customer by email:

```typescript
if (email) {
    try {
      const customerId = await sanity.fetch<string | null>(
        `*[_type == "customer" && email == $email][0]._id`,
        {email},
      )
      if (customerId) baseDoc.customerRef = {_type: 'reference', _ref: customerId}
    } catch (err) {
      console.warn('reprocessStripeSession: failed to lookup customer by email', err)
    }
  }
```

If a customer is found, the `customerRef` is set on the `order` document before it is created or updated.

## 2. Whether expired orders bypass that logic

Yes, expired orders completely bypass this logic.

When a checkout session has a status of `expired`, the `reprocessStripeSession.ts` function creates an `abandonedCheckout` document instead of an `order` document. The code block for expired sessions does not contain any logic to create or link to a `customer` document.

```typescript
if (sessionStatus === 'expired') {
    // ...
    const abandonedCheckoutId = await upsertAbandonedCheckoutDocument(sanity, {
      // ...
    })

    return {
      orderId: null,
      // ...
      abandonedCheckoutId: abandonedCheckoutId || undefined,
    }
}
```

This is the primary reason why expired checkouts do not appear linked to customers in the Sanity Desk.

## 3. Whether customer queries exclude expired orders

The main "Customers" view in the Sanity Desk is built using the `CustomersDocumentTable.tsx` component. This component queries for documents of type `customer`. Since expired checkouts do not create or update `customer` documents with order information (like `orderCount` or `lifetimeSpend`), they do not contribute to the data displayed in the customer view.

The "Orders" view, specifically the "Carts" tab, is where expired checkouts are displayed. This view uses the `OrdersDocumentTable.tsx` component, which is configured to show `abandonedCheckout` documents.

## 4. Whether name/email resolution fails due to missing fields

Name resolution for expired checkouts (i.e., `abandonedCheckout` documents) does not fail, but it behaves differently than for `order` documents.

In `reprocessStripeSession.ts`, the `customerName` for an expired checkout is determined by the following logic:

```typescript
const customerName =
    shippingAddress?.name ||
    metadata['customer_name'] ||
    metadata['bill_to_name'] ||
    metadata['ship_to_name'] ||
    session.customer_details?.name ||
    (paymentIntent as any)?.charges?.data?.[0]?.billing_details?.name ||
    email ||
    undefined
```

If a customer's name is not available from the Stripe session, the `customerName` variable falls back to the customer's email address. This email address is then stored in the `customerName` field of the `abandonedCheckout` document.

The `OrdersDocumentTable.tsx` component, when displaying the "Carts" tab, uses the `getCustomerLabel` function to display the customer's name. This function uses the `customerName` from the `abandonedCheckout` document. This is why you see an email address in the customer name field for some expired checkouts.

The issue of seeing "customer name" as the name is due to the `customerName` field in `upsertAbandonedCheckoutDocument` in `reprocessStripeSession.ts` being passed as `customerName`, which can be `undefined`. A simple fix, which was reverted by the user, was to change the `customerName` to be `customerName: customerName || email || 'Customer Name'`.

## 5. Whether duplicate customers are created per email

The logic in `reprocessStripeSession.ts` for creating `order` documents attempts to prevent duplicate customers by searching for an existing customer with the same email address before creating a new one.

However, since the expired checkout flow does not create a `customer` document, this logic is never triggered. A `customer` document is typically created only when a customer completes an order. This could lead to the appearance of duplicate customers if a customer has both abandoned checkouts and completed orders, but the system is designed to link orders to a single customer record based on their email address. The "duplicate emails" mentioned in the prompt are likely due to seeing `abandonedCheckout` documents with the same email as existing `customer` documents.
