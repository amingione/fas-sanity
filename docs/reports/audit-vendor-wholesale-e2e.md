# Vendor/Wholesale Integration Report

**Disclaimer:** This audit was performed with access only to the `fas-sanity` repository. The behavior of the `fas-cms-fresh` vendor portal is inferred from the available schemas and Netlify functions.

## Identity Model
- **Source of truth for vendor identity:** The `vendor` document is the primary source of truth for vendor-specific business information. However, for authentication and Stripe-related activities, the `customer` document (linked via `vendor.customerRef`) is the canonical identity. A vendor *is* a customer with a `'vendor'` role or type.
- **Key fields:**
    - `vendor.customerRef`: A reference to the `customer` document.
    - `vendor.portalAccess.email`: The email used for portal login.
    - `customer.email`: The email on the corresponding customer record.
    - `customer.stripeCustomerId`: The Stripe ID used for all financial transactions.
- **Known risks:**
    - **Email Mismatch:** A critical risk exists if `vendor.portalAccess.email` and the email on the linked `customer` document (`customer.email`) become out of sync. Workflows that look up the user by the portal session email might create or link to the wrong `customer` record, completely detaching the vendor from their Stripe identity and order history.
    - **Orphaned Vendors:** If a `vendor` document is created without a corresponding `customer` document (and `customerRef` link), that vendor will be unable to perform any authenticated actions or transactions.

## Portal Read Paths
- **Endpoints/queries used:** Based on function names, the portal likely uses endpoints like `wholesale-catalog` and `wholesale-orders`. These functions query for `product` and `order` documents, respectively.
- **Fields expected:** The portal expects `product` documents with wholesale pricing information and `order` documents filtered by the vendor's associated `customer` ID.
- **Schema sources:** `vendor`, `customer`, `product`, `order`.

## Portal Write Paths
- **Endpoints/patches used:**
    - **Profile:** There are no dedicated "update vendor profile" functions. It's likely that profile updates are handled by a generic "update document" function that is not immediately identifiable, or this functionality is missing.
    - **Orders:** The `wholesale-orders` function appears to handle order creation.
    - **Messages:** There are `send-vendor-invite` and `sendVendorEmail` functions, but no generic "send message" function was found. The `vendorMessage` schema exists but appears to be orphaned from any API endpoint.
- **Fields written:** The `wholesale-orders` function would write to the `order` schema.
- **Validation/mapping:** The `wholesale-orders` function contains logic to price a wholesale cart, but it's unclear how vendor profile updates are validated or mapped.

## Wholesale Orders
- **Creation path:** The `wholesale-orders` Netlify function is the likely entry point for creating wholesale orders. It uses the `priceWholesaleCart` utility to calculate pricing based on the vendor's pricing tier.
- **Update path:** Standard `order` update webhooks and functions (e.g., `fulfillOrder`) would handle updates. These are not specific to wholesale orders but would apply to them as they are a type of `order`.
- **Display path:** The portal likely fetches orders by querying for `order` documents where the `customerRef` matches the logged-in vendor's associated customer.
- **Schema mismatches:** No direct schema mismatches were found in the `order` schema itself, as it's designed to be generic. However, the reliance on the correct `customerRef` link is a critical point of potential failure.

## Messages
- **Creation path:** A `send-vendor-invite` function exists, but a generic message creation path is not apparent.
- **Update path:** Not applicable.
- **Display path:** Not apparent.
- **Schema mismatches:** The `vendorMessage` schema exists but appears to be **orphaned**, with no clear functions reading from or writing to it. This suggests that messaging functionality may be incomplete or missing entirely.

## Blocking Issues
1.  **Orphaned `vendorMessage` Schema:** The functionality for vendors to send or receive messages appears to be missing on the backend, despite a schema existing for it. This is a critical gap in communication features.
2.  **Ambiguous Vendor Profile Update Path:** There is no clear, dedicated Netlify function for updating a vendor's profile. If this functionality exists in the portal, it's using a generic endpoint that is not easily identifiable, or the backend logic is missing. This is a major risk for data integrity.
3.  **Email Field Mismatch Risk:** The separation of `vendor.portalAccess.email` and `customer.email` is a significant architectural flaw. A mismatch between these two fields will break the link between a vendor's portal identity and their transactional (customer) identity, leading to data corruption and a broken user experience.

## Non-blocking Issues
1.  **No Vendor-Specific Customer Creation Logic:** The `strictFindOrCreateCustomer` function does not have logic to identify a new signup as a vendor. It always defaults to creating a `'retail'` customer. A vendor must be manually linked to a customer record in the Sanity Studio, which is a cumbersome and error-prone workflow.
2.  **Lack of Two-Way Sync for `customerRef`:** If a vendor's `customerRef` is changed in Sanity, there is no clear mechanism to propagate this change back to the vendor portal's session or identity management system.

## Recommended Fix Order (no implementation)
1.  **Resolve the Identity Model:** The most critical issue is the dual-email problem. A decision must be made: either `vendor.portalAccess.email` or `customer.email` must be the single source of truth, and a data migration and refactoring of the login/sync functions must be performed to enforce this. The recommended approach is to make the `customer` document the source of truth and have the vendor portal authenticate against it.
2.  **Implement Vendor Profile and Message Endpoints:** Create dedicated Netlify functions for updating a vendor's profile and for sending/receiving messages, linking them to the `vendor` and `vendorMessage` schemas respectively.
3.  **Improve Vendor Onboarding:** The `strictFindOrCreateCustomer` function should be modified to check if the email belongs to an existing `vendor` document. If it does, it should automatically assign the `'vendor'` role/type to the new `customer` and populate the `customerRef` on the `vendor` document, automating the linking process.
