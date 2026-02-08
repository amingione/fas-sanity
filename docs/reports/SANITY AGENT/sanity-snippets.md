## Overview

Below is a drop-in style governance guard config that encodes the current decisions around:

- Current, allowed Stripe + Legacy provider write surfaces
- Legacy/read-only Legacy provider/EasyPost consumers
- Files to ignore for this rule

Use it as the body of the file the guard script reads:

- `tools/ai-governance/guards/stripe-legacy provider-shipping.json`

Suggested guard configuration (JSON):

```json
{
  "ruleId": "stripe-legacy provider-shipping",
  "enforced": true,
  "allowedWriteSurfaces": [
    {
      "path": "netlify/functions/getShippingQuoteBySkus.ts",
      "reason": "Computes shipping packages and Legacy provider-compatible metadata for fas-cms-fresh; EasyPost used only behind fas-sanity backend."
    },
    {
      "path": "netlify/functions/resendInvoiceEmail.ts",
    }
  ],
  "legacyReadOnlySurfaces": [
    {
      "reason": "Consumes Stripe/Legacy provider/EasyPost metadata to create/update orders after checkout; does not originate shipping config."
    },
    {
      "reason": "Reads Stripe shipping metadata to derive order fields; read-only consumption."
    },
    {
      "path": "netlify/functions/backfillOrders.ts",
    }
  ],
  "ignoredForThisRule": [
    {
      "path": "packages/sanity-config/src/utils/cartItemDetails.ts",
      "reason": "Cart/options formatting utilities only; no Stripe, Legacy provider, or EasyPost logic."
    },
    {
      "path": "packages/sanity-config/schema.json",
      "reason": "Generated schema snapshot includes shipping metadata keys."
    },
    {
      "path": "backups/**",
      "reason": "Historical data backups should not be scanned by guard rules."
    }
  ],
  "checks": {
    "disallowNewLegacy providerWritesOutsideAllowed": {
      "description": "Block new Legacy provider/Stripe shipping metadata writes outside allowedWriteSurfaces.",
      "patterns": [
        "legacy provider_",
        "easypost_rate_id",
        "['\\\"]carrier_id['\\\"]",
        "['\\\"]service_code['\\\"]",
        "shipping_carrier_id",
        "shipping_service_code",
        "package_code",
        "packaging_weight",
        "packaging_weight_unit",
        "shipping_rate_data",
        "shipping_options",
        "legacy provider_tracking_",
        "legacy provider_label_",
        "legacy provider_shipment_"
      ],
      "scopeGlobs": ["netlify", "packages", "src", "functions"],
      "exceptions": {
        "allowedWriteSurfaces": true,
        "legacyReadOnlySurfaces": true,
        "ignoredForThisRule": true
      }
    },
    "disallowDirectEasyPostUseInStorefront": {
      "description": "Ensure fas-cms-fresh never calls EasyPost directly; only via fas-sanity Netlify functions.",
      "patterns": [
        "import\\s+.*\\bEasyPost\\b",
        "from\\s+['\\\"]easypost['\\\"]",
        "getEasyPostClient",
        "easypostRequest"
      ],
      "scopeGlobs": ["fas-cms-fresh", "src"],
      "exceptions": {
        "allowedWriteSurfaces": false,
        "legacyReadOnlySurfaces": false,
        "ignoredForThisRule": false
      }
    }
  }
}
```

How to use it:

- If your guard script already has a guards file: add this as the entry for `stripe-legacy provider-shipping`, or merge the `allowedWriteSurfaces`, `legacyReadOnlySurfaces`, and `ignoredForThisRule` arrays into your existing schema.
- If you’re wiring via `governance-guards.mk`: point the make target your script uses (e.g. `governance-guard`) at this JSON file so it can resolve the allowlist/annotations when it flags violations.

## Available Snippets

All snippets are prefixed with `sanity(...)` or `groq(...)` to avoid conflicts. Enabled for JavaScript & TypeScript files.

### Schema & Fields

- **sanitySchema**: Create a simple schema (document, object, or image)
- **sanityFld**: Add a field to a sanity object/document
- **sanityObjFld**: Create a basic object field
- **sanityRefFld**: Create a reference field
- **sanityArrFld**: Create a basic array field
- **sanityListArray**: Add list options to string/number/array types (renders checkboxes for string arrays)

### Field Configuration

- **sanityDesc**: Add custom description to a field, document, or object
- **sanityOptional**: Mark a field as optional
- **sanityOptionalEncouraged**: Mark as optional with encouragement to complete
- **sanityRequired**: Make a field required
- **sanityTip**: Add a tip as field description
- **sanityArrValidation**: Validate array fields by length (min & max)

### Organization

- **sanityFieldset**: Add fieldsets to objects/documents
- **sanityCollapse**: Make object fields collapsible

### Preview & Display

- **sanityPreviewSelect**: Add preview with selection object
- **sanitySelect**: Add selection object for preview
- **sanityPrepare**: Add prepare function for preview
- **sanityPreviewSelectPrepare**: Combine selection object and prepare function
- **sanityViewComponent**: Add document view with React component

### Content Management

- **sanityDocList**: Add custom document list to desk structure with filtering
- **groqDraftConstraint**: Constrain GROQ queries to prevent/limit drafted documents

**Note**: This is a work in progress. Contributions welcome!
