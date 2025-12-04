# Archived Parcelcraft Integration

**Archived Date:** 2025-12-04  
**Reason:** Stripe Shipping Labels API (Parcelcraft) not available for this account

## What's Here
- Parcelcraft label creation function
- Sanity document action for Parcelcraft

## Restoration
If Stripe enables Shipping Labels for this account:
1. Move files back to original locations
2. Set env vars: ENABLE_STRIPE_SHIPPING_LABELS=true, STRIPE_SHIPPING_API_ENABLED=true
3. Set SHIPPING_PROVIDER=parcelcraft (or keep easypost as default)
4. Redeploy

## Files Archived
- netlify/functions/create-parcelcraft-label.ts
- packages/sanity-config/src/schemaTypes/documentActions/createParcelcraftLabelAction.ts
