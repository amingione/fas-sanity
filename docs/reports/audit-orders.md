# Audit Report: Orders

| Field | Schema Type | Actual Value | Validation | UI Component | Write Path | Risk |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `createdAt` | `datetime` | ISO 8601 | readOnly | (none) | System (initial value) | Cosmetic |
| `orderDate` | `datetime` | ISO 8601 | readOnly | (none) | System (initial value) | Confusing |
| `fulfillment.labelPurchasedAt` | `datetime` | ISO 8601 | readOnly | (none) | System (EasyPost webhook) | Low |
| `fulfillment.labelPrintedAt` | `datetime` | ISO 8601 | readOnly | (none) | System (EasyPost webhook) | Low |
| `fulfillment.deliveryDate` | `date` | `YYYY-MM-DD` | readOnly | (none) | System (EasyPost webhook) | Low |

## Notes

- **`orderDate` vs. `createdAt`**: The `order` schema contains both `createdAt` and `orderDate` fields, both of type `datetime` and set to the same initial value (`new Date().toISOString()`). The UI label for `orderDate` is "Order Date", which could imply a `date`-only value, creating confusion. This is a **Confusing** risk.
- **System-Generated Timestamps**: All date-related fields are correctly marked as `readOnly` and populated by either initial values or webhook handlers (e.g., from EasyPost). This minimizes the risk of data entry errors.
- **No Manual Date Entry**: There are no UI components that allow manual entry or modification of date/datetime fields on the `order` document itself, which is good practice.
