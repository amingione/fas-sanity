# EasyPost Deployment Checklist

## Environment Variables (Netlify / Production)
- [ ] `EASYPOST_API_KEY`
- [ ] `EASYPOST_WEBHOOK_SECRET`
- [ ] `SHIPPING_PROVIDER=easypost`
- [ ] `SHIP_FROM_NAME`
- [ ] `SHIP_FROM_PHONE`
- [ ] `SHIP_FROM_ADDRESS1`
- [ ] `SHIP_FROM_CITY`
- [ ] `SHIP_FROM_STATE`
- [ ] `SHIP_FROM_POSTAL_CODE`
- [ ] `SHIP_FROM_COUNTRY`
- [ ] (Optional) `SHIP_FROM_ADDRESS2`

## EasyPost Dashboard
- [ ] Webhook URL points to `/.netlify/functions/easypostWebhook`
- [ ] Webhook secret matches `EASYPOST_WEBHOOK_SECRET`
- [ ] Carrier accounts connected and enabled

## Manual Test Flow
- [ ] Create/publish an order in Sanity with full shipping address
- [ ] Use “Create EasyPost Label” button (Shipping tab) → expect success toast
- [ ] Label URL opens and downloads; tracking number saved
- [ ] Tracking URL/number visible on order; carrier populated
- [ ] EasyPost webhook updates tracking on status change

## Rollback Plan
- [ ] If label creation fails broadly, unset `SHIPPING_PROVIDER` (defaults to easypost UI) and disable label actions in Studio
- [ ] Re-enable Parcelcraft only if Stripe Shipping Labels becomes available and archived code is restored

## Monitoring
- [ ] Check Netlify function logs for `easypostCreateLabel`, `getEasyPostRates`, `easypostWebhook`
- [ ] Verify no 401/403 from EasyPost; ensure rate and label responses contain URLs/tracking
