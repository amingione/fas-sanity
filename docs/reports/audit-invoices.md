# Audit Report: Invoices

| Field | Schema Type | Actual Value | Validation | UI Component | Write Path | Risk |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `invoiceDate` | `date` | `YYYY-MM-DD` | (none) | `InvoiceDateInput` | Manual | Confusing |
| `dueDate` | `date` | `YYYY-MM-DD` | (none) | `InvoiceDateInput` | Manual | Confusing |
| `shippingDetails.labelPurchasedAt` | `datetime` | ISO 8601 | (none) | (none) | Manual | **High** |
| `shippingDetails.availableRates.estimatedDeliveryDate` | `date` | `YYYY-MM-DD` | (none) | (none) | External API | Medium |
| `createdAt` | `datetime` | ISO 8601 | readOnly | (none) | System (initial value) | Low |

## Notes

- **High Risk - Editable `datetime`**: The `shippingDetails.labelPurchasedAt` field is a `datetime` field that is user-editable. This is a significant issue as it should be an immutable, system-set value from a shipping provider. This is a **High** risk.
- **Missing Date Validation**: There is no validation to prevent an `invoiceDate` from being earlier than the `createdAt` date of the associated order it references. This could lead to confusing or logically inconsistent data.
- **Potential API Mismatch**: The `shippingDetails.availableRates.estimatedDeliveryDate` field is of type `date` but is populated from an external API. There is a risk of receiving a full `datetime` string, which could cause issues if not handled correctly on the frontend or in other parts of the system.
- **Manual Date Entry**: `invoiceDate` and `dueDate` are manually entered using a custom `InvoiceDateInput` component. While the component correctly formats the value as `YYYY-MM-DD`, the lack of validation is a concern.
