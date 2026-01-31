## FAS Motorsports Operations Guide

### Desk navigation
- **🏪 In-Store Operations** – contains Today’s Schedule dashboard, quick booking, the work-order board, appointment views (all/this week/needs confirmation/calendar), full service catalog, and the customer vehicle registry.
- **💻 Online Retail** – filtered views for physical/retail products, online-only orders (`orderType` retail or unset), retail customers, and the full marketing toolkit (feed validator, Merchant Center dashboard, attribution + campaign utilities, email campaigns, analytics).
- **🏭 Wholesale & Manufacturing** – vendor directory, dedicated wholesale orders dashboard (vendor pricing & workflow), pricing tier manager (products with `availableForWholesale`), manufactured inventory view, and shipments-to-vendor filter.
- **👥 All Customers & Orders** – consolidated customers/orders/invoices lists plus the legacy workflow filter stack for quick pivoting between paid/fulfilled/shipped states.

### New schemas
- `service` document captures title/slug, narrative description, hero images, service type, base pricing/estimated hours, required parts (`product` refs), compatibility, and tracks the originating product via `sourceProductId`.
- `appointment` document auto-generates `appointmentNumber` (`APT-xxxxxx`), references customer, vehicle, and service, stores schedule/status/bay/notes, and links to the work order created when the job begins.
- `workOrder` document auto-generates `workOrderNumber` (`WO-xxxxxx`), references appointment/customer/vehicle/service, records bay, timestamps, labor metrics, parts and additional charges, notes, photos, and invoice linkage.
- `vehicle` document ties VIN/mileage/plate/color/etc. to a customer and keeps a service history of work order references.

### Enhanced schemas
- **Product**: wholesale group adds manufacturing cost, tiered wholesale price fields, minimum wholesale quantity, and `availableForWholesale` toggles.
- **Vendor**: pricing tier, discount %, payment terms, tax-exempt controls + certificate upload, structured shipping address, minimum order amount, and account status.
- **Customer**: `customerType`, visit flag, preferred contact method, and direct `vehicle` references.
- **Order**: `orderType`, wholesale workflow status + wholesale detail object (vendor, tier, bulk quantity, ship date, notes), and in-store detail object (appointment/work order/bay). Wholesale workflows now use the dedicated status dropdown in the wholesale orders pane.

### Dashboards & tooling
- **TodayScheduleDashboard** – home for daily appointments, bay occupancy, active/complete stats, and quick actions to start/complete work orders or book appointments.
- **AppointmentBookingPane** – guided booking wizard with live customer/vehicle/service selectors, time/bay assignment, internal/customer notes, and auto-numbering.
- **WorkOrderManagementPane** – Kanban-style view with inline status+bay updates and one-click creation of work orders from unassigned appointments.
- **AppointmentCalendarPane** – upcoming calendar grouped by day with status filtering and range control.
- **WholesaleOrdersPane** – filtered wholesale view highlighting vendor, pricing tier, bulk quantity, workflow status dropdown, and total amount.

### Migrations
Run the consolidated script to backfill legacy data (dry run first):

```bash
pnpm tsx scripts/migrate-service-workflows.ts --dry-run
pnpm tsx scripts/migrate-service-workflows.ts
```

The script:
1. Converts up to 10 `installOnly` products into service documents (one-time).
2. Defaults `customerType` to `retail` for customers lacking the field (current backlog is 51).
3. Sets `orderType` to `retail` for 99 historical orders.
4. Initializes wholesale availability flags on products so the new pricing controls render cleanly.
5. Backfills vendor pricing tier, discount %, payment terms, tax flags/certificates, shipping address shell, minimum order amount, and account status for the six existing vendors.

### Next steps
- Publish the updated schema/deck configuration before inviting staff to test the new panes.
- After running the migration script, spot-check a few services and vendors to ensure the UI reflects the new defaults.
