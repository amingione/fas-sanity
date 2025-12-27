# Audit Report: Quotes

| Field | Schema Type | Actual Value | Validation | UI Component | Write Path | Risk |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `quoteDate` | `date` | `YYYY-MM-DD` | (none) | `QuoteDateInput` | Manual / Initial Value | Low |
| `expirationDate` | `date` | `YYYY-MM-DD` | (none) | `QuoteDateInput` | Manual | Low |
| `acceptedDate` | `date` | `YYYY-MM-DD` | (none) | `QuoteDateInput` | Manual | Confusing |
| `createdAt` | `datetime` | ISO 8601 | readOnly | (none) | System (initial value) | Low |
| `lastEmailedAt` | `datetime` | ISO 8601 | readOnly | (none) | Netlify Function | Low |
| `stripeLastSyncedAt` | `datetime` | ISO 8601 | readOnly | (none) | System (Stripe webhook) | Low |

## Notes

- **Missing Date Validation**: The `acceptedDate` field is a `date` type that is manually entered. There is no validation to ensure that the `acceptedDate` is not before the `quoteDate`. This could lead to confusing data.
- **Consistent Date Handling**: The `QuoteDateInput` component is used for all `date` fields, ensuring a consistent `YYYY-MM-DD` format.
- **System-Managed `datetime` Fields**: All `datetime` fields (`createdAt`, `lastEmailedAt`, `stripeLastSyncedAt`) are `readOnly` and managed by the system (initial values, Netlify functions, or webhooks), which is good practice.
