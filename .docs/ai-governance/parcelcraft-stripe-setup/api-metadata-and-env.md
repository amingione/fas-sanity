## Parcelcraft Shipping Setup: API Metadata & Environment Variables

### 1. Essential API Keys (Environment Variables)

Add these to your backend `.env` file for authentication:

- **STRIPE_SECRET_KEY**: Live or test secret key from Stripe Dashboard
- **STRIPE_WEBHOOK_SECRET**: Required for listening to `checkout.session.completed` events

### 2. Parcelcraft-Specific Configuration (Metadata)

Parcelcraft uses Stripe Metadata instead of environment variables. Pass these keys in API calls like `stripe.checkout.sessions.create()`:

| Metadata Key     | Value / Example | Purpose                                               |
| ---------------- | --------------- | ----------------------------------------------------- |
| `ship_status`    | `unshipped`     | **Critical.** Adds order to "Unshipped Invoices" list |
| `weight`         | `1.5`           | Product weight for label calculation                  |
| `weight_unit`    | `pound`         | Defaults to ounce if not specified                    |
| `origin_country` | `US`            | Required for international customs forms              |

### 3. Required Session Parameters

When creating a Stripe session, ensure:

- `invoice_creation: { enabled: true }` — Parcelcraft creates labels based on Stripe Invoices
- `shipping_address_collection` — Must collect shipping address for label generation

### 4. EasyPost Integration

Parcelcraft uses EasyPost to generate labels. **Do not add your EasyPost API key to environment variables.**

Instead:

1. Open Parcelcraft App in your Stripe Dashboard
2. Navigate to **Settings > Carrier Defaults**
3. Connect your EasyPost account directly in the UI

### 5. Optional Metadata for Advanced Use Cases

| Metadata Key          | Value / Example                | Purpose                              |
| --------------------- | ------------------------------ | ------------------------------------ |
| `customs_description` | `Automotive performance parts` | Used for international customs forms |
| `tariff_code`         | `8708.99.8180`                 | Customs classification               |
| `is_return`           | `false`                         | Indicates shipment is a return       |

### 6. Summary

- Only Stripe API keys go in environment variables
- All Parcelcraft configuration uses Stripe Metadata
- EasyPost credentials stay secure within Parcelcraft UI
