# Audit Report: Shipments

This report covers `shipment` documents, which represent fulfillments, shipping labels, and packing slips.

| Field | Schema Type | Actual Value | Validation | UI Component | Write Path | Risk |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `trackingDetails[].datetime` | `datetime` | ISO 8601 | (none) | (none) | System (EasyPost webhook) | Low |
| `forms[].createdAt` | `datetime` | ISO 8601 | (none) | (none) | System (EasyPost webhook) | Low |
| `createdAt` | `datetime` | ISO 8601 | (none) | (none) | System (EasyPost webhook) | Low |
| `updatedAt` | `datetime` | ISO 8601 | (none) | (none) | System (EasyPost webhook) | Low |

## Notes

- **Purely System-Generated**: The `shipment` document is almost entirely populated by webhooks from a shipping provider (EasyPost, based on the `easypostId` field). All `datetime` fields are set by the external system.
- **No Manual Data Entry**: There are no UI components for manually editing `shipment` data. The `shippingLabel` schema is used to *create* shipments, but the resulting `shipment` document is then managed by the system.
- **No Date/DateTime Mismatches**: All date-related fields are `datetime` and receive full ISO 8601 timestamps from the webhook, so there are no mismatches.
- **Packing Slips**: Packing slips are not a distinct schema type. They are likely generated on-demand using data from the `order` and `shipment` documents.
- **Low Risk**: Because these documents are system-managed and not user-editable, the risk of data integrity issues related to dates and times is very low.
