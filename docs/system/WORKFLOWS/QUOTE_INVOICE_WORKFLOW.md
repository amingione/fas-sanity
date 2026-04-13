# Quote + Invoice Workflow (Sanity + Resend + PDF)

This workflow is the canonical operator flow for wholesale quote/invoice handling in Sanity Studio.

## Goals

- Keep quote/invoice lifecycle clear in Studio.
- Support both delivery channels:
  - Email (Resend-backed)
  - Print/PDF export
- Preserve conversion flow:
  - `vendorQuote` -> `invoice` -> `vendorOrder`

## Quote Workflow (`vendorQuote`)

1. Create quote in `draft` status.
2. Add line items, pricing tier, tax/shipping, validity date.
3. Send quote using **Send Quote** document action.
4. Track delivery state on document fields:
   - `sentAt`
   - `lastEmailTo`
   - `emailSendCount`
   - `emailStatus`
   - `lastEmailError`
5. On approval, use **Convert to Invoice** action.

Status progression:

- `draft` -> `sent` -> `approved` -> `converted`
- alternate exits: `rejected`, `expired`

## Invoice Workflow (`invoice`)

1. Invoice is created (usually from quote conversion) with `payable` status.
2. Email client using **Send Invoice Email** action (Resend via `sendCustomerEmail` function).
3. Print/download PDF using **Print / Download PDF** action (`generateInvoicePDF`).
4. Track delivery state on document fields:
   - `sentAt`
   - `lastEmailTo`
   - `emailSendCount`
   - `emailStatus`
   - `lastEmailError`
   - `lastPrintedAt`
   - `printCount`
5. Once paid, convert with **Create Vendor Order (Paid Only)**.

Status progression:

- `draft` -> `payable` -> `sent` -> `paid`
- alternate exits: `partially_paid`, `overdue`, `cancelled`

## Delivery + Audit Fields Added

Both quote/invoice now support structured tracking for:

- delivery channel preference (`deliveryMethod`)
- last recipient and send attempts
- send success/failure state
- print timestamp + count

These fields are intended for operational clarity and reporting.

## Environment Dependencies

- `RESEND_API_KEY`
- `RESEND_FROM`
- `SANITY_STUDIO_PROJECT_ID`
- `SANITY_STUDIO_DATASET`
- `SANITY_API_TOKEN`

Optional:

- `SANITY_STUDIO_VENDOR_PORTAL_URL`
- `PUBLIC_VENDOR_PORTAL_URL`

