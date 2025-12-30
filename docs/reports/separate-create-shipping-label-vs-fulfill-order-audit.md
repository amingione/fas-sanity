### Audit Report: `separate-create-shipping-label-vs-fulfill-order-audit.md`

#### 1. Where Create Shipping Label is implemented

*   **File:** `packages/sanity-config/src/schemaTypes/actions/orderActions.ts`
*   **Action Name:** `CreateShippingLabelAction`
*   **Description:** This action is a `DocumentActionComponent` that appears in the Sanity Studio for `order` documents.

#### 2. Where Fulfill Order is implemented

*   **File:** `packages/sanity-config/src/schemaTypes/documents/order.actions.ts`
*   **Action Name:** `fulfillOrder` (within the `orderActions` DocumentActionsResolver)
*   **Description:** This action is part of the `DocumentActionsResolver` for `order` documents in the Sanity Studio.

#### 3. What each action currently does (step-by-step)

##### Create Shipping Label (`CreateShippingLabelAction`)

1.  **Checks:**
    *   Ensures the document type is `order`.
    *   Checks if a label has already been purchased (`doc?.labelPurchased`). If so, it disables the action and shows a message.
    *   Ensures the order is saved (`doc?._id`).
    *   Checks for a shipping address (`doc.shippingAddress`).
2.  **Shipment Data Sourcing:**
    *   Attempts to retrieve `packageDimensions` (weight, length, width, height) from `doc.packageDimensions`.
    *   If dimensions are missing or invalid, it prompts the user to enter them with default values (`weight: 2, length: 10, width: 8, height: 4`). It parses the input and validates it.
3.  **Confirmation:** Prompts the user to confirm the purchase of the shipping label, showing order details, customer name, shipping address, and selected carrier/service.
4.  **API Call:** Makes a `POST` request to `/api/create-shipping-label` with the following body:
    *   `orderId`
    *   `orderNumber`
    *   `shippingAddress`
    *   `packageDimensions` (derived/user-entered)
    *   `easypostRateId`, `carrier`, `service` (from `doc`)
    *   `purchasedBy` (current user's email/name)
5.  **Response Handling:**
    *   If the API call is successful, it displays an alert with tracking details, carrier, service, and cost.
    *   **Crucially, it then opens the `labelUrl` in a new window/tab.**
    *   If the API call fails, it displays an error message.

##### Fulfill Order (`fulfillOrder` action within `orderActions`)

1.  **Checks:**
    *   Ensures the document is an `order`.
    *   Checks if the order status is `paid` (`FULFILLABLE_STATUSES`). If not, the action is disabled and hidden.
    *   Ensures the order is published (`doc._id`).
2.  **API Call:** Calls a Netlify function named `fulfillOrder` using `callFn` helper. The `orderId` is passed in the body.
    *   The `callFn` helper iterates through `getNetlifyFunctionBaseCandidates()` to find the correct base URL for the Netlify function.
3.  **Response Handling:**
    *   If the `fulfillOrder` Netlify function call is successful:
        *   **It checks for `data?.labelUrl` in the response and, if present, opens it in a new window/tab.**
        *   Displays an alert: "Order fulfilled and customer notified."
    *   If the call fails, it displays an error message.

#### 4. Which backend functions are used today

*   **Create Shipping Label:**
    *   `POST /api/create-shipping-label` (Direct `fetch` call to a relative path)
*   **Fulfill Order:**
    *   Netlify Function `fulfillOrder` (called via `callFn` helper, which constructs the URL using `/.netlify/functions/fulfillOrder`)

#### 5. How shipment data (weight, dimensions) is sourced or missing

*   **Create Shipping Label:**
    *   **Sourced:** Primarily from `doc.packageDimensions`.
    *   **Missing/Override:** If `doc.packageDimensions` is incomplete or missing, the user is prompted to enter `weight, length, width, height` with defaults.
*   **Fulfill Order:**
    *   There is no explicit sourcing or handling of `weight` or `dimensions` within the `fulfillOrder` action itself. The action relies on the `fulfillOrder` Netlify function to handle any shipping label creation logic, and potentially uses data already present on the order document for that.

#### 6. Where coupling exists that should not

*   **"Create Shipping Label" action's broken routing:** The `CreateShippingLabelAction` makes a `fetch` call to `/api/create-shipping-label`. As noted in the problem statement, "On the deployed Sanity Studio (`fassanity.fasmotorsports.com`), no `/api/*` server exists". This means the client-side fetch will always result in a 404, making the action non-functional as intended.
*   **"Fulfill Order" creates labels and opens them:** The `fulfillOrder` action (via its backend Netlify function) currently has the side effect of creating a shipping label and immediately opening its URL (`data?.labelUrl`) if returned by the Netlify function. This is a clear coupling where fulfillment is incorrectly intertwined with label creation and viewing.
*   **Implicit dependency on EasyPost:** Both actions, by their nature of creating shipping labels and discussing carriers/services, imply an underlying dependency on EasyPost for shipping logistics, even if not explicitly coded in the frontend action logic for "Fulfill Order."

---

#### Behavior Comparison Table

| Action | Current Behavior | Intended Behavior (from prompt) |
| :--------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Create Shipping Label** | 1. Checks if label already purchased, order saved, shipping address exists. <br/> 2. Prompts user for missing package dimensions (weight, length, width, height) or uses `doc.packageDimensions`. <br/> 3. Confirms purchase with user. <br/> 4. Attempts `POST /api/create-shipping-label`. <br/> 5. If successful, displays tracking/cost, then **opens label URL in new window/tab.** <br/> **Current Status: Broken due to 404 on `/api/*` route.** | 1. Prompts for shipment data (derived defaults + user-editable inputs: weight, dimensions, carrier/service). <br/> 2. Renders available carrier/service options. <br/> 3. Allows override of weight/dimensions. <br/> 4. Calls authoritative backend label-creation path. <br/> 5. Creates and persists label/metadata (URL, tracking, carrier). <br/> 6. Stores label URL, tracking number, carrier metadata on order. <br/> 7. Provides "Print Shipping Label" button to open label. <br/> **Must not:** Mark order as fulfilled, modify fulfillment status, require tracking for fulfillment, trigger fulfillment dialogs, assume fulfillment. |
| **Fulfill Order** | 1. Checks if document is `order` and status is `paid`. <br/> 2. Calls Netlify function `fulfillOrder`. <br/> 3. If successful, **checks for `data?.labelUrl` and opens it in a new window/tab.** <br/> 4. Displays "Order fulfilled and customer notified." <br/> **Current Status: Works, but does too much (creates label + opens it immediately).** | 1. Responsible for order fulfillment state *only*. <br/> 2. Opens a modal/popup for manual fulfillment workflows. <br/> 3. Allows manual tracking number entry (optional). <br/> 4. Allows manual fulfillment status selection (e.g., unfulfilled, processing, shipped, delivered). <br/> 5. Allows fulfillment without tracking. <br/> 6. Optionally associates existing tracking/label. <br/> 7. Persists fulfillment state changes. <br/> **Must not:** Automatically create shipping labels, assume EasyPost, fail/block fulfillment if no tracking. |
