# Audit Report: Customers

| Field | Schema Type | Actual Value | Validation | UI Component | Write Path | Risk |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `stripeLastSyncedAt` | `datetime` | ISO 8601 | readOnly | (none) | System (Stripe webhook) | Low |
| `emailMarketing.subscribedAt` | `datetime` | ISO 8601 | readOnly | (none) | System (Webhook/Automation) | Low |
| `emailMarketing.unsubscribedAt` | `datetime` | ISO 8601 | readOnly | (none) | System (Webhook/Automation) | Low |
| `lastOrderDate` | `datetime` | ISO 8601 | readOnly | (none) | System (Backfill/Webhook) | Low |
| `firstOrderDate` | `datetime` | ISO 8601 | readOnly | (none) | System (Backfill/Webhook) | Low |
| `shippingQuotes[].createdAt` | `datetime` | ISO 8601 | (none) | (none) | Manual | Medium |
| `updatedAt` | `datetime` | ISO 8601 | hidden | (none) | System | Low |

## Notes

- **Editable `datetime` in Array**: The `shippingQuotes[].createdAt` field is a `datetime` that is part of a user-editable array of file uploads. While it has an initial value of the current time, it can be modified by the user. This could lead to inconsistent or inaccurate data. This is a **Medium** risk.
- **System-Managed `datetime` Fields**: The majority of `datetime` fields on the `customer` document are `readOnly` and populated by system processes (Stripe webhooks, backfill scripts, marketing automations). This is good practice and reduces the risk of data integrity issues.
- **No Manual Date Entry on Core Fields**: There are no UI components that allow for manual entry of dates on the core customer fields, which is appropriate for system-managed data.
