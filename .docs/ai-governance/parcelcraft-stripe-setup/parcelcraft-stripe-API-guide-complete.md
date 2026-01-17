# API Guide

**Note:** This article explains how we interact with the Stripe API. For information on obtaining your EasyPost API key, see [Connect Your EasyPost API key to Parcelcraft](#).

Parcelcraft doesn’t require any software programming skills to use. However, for those who need to interact with Parcelcraft programmatically, we offer various ways to manage your shipment data. Parcelcraft makes extensive use of the Stripe API and the EasyPost API.

## Stripe API

Parcelcraft adds metadata to your PaymentIntents, Invoices, Shipping Rates, and Products to manage shipment status and default options.

### Stripe Invoice and PaymentIntents Metadata

When an invoice is created, our app automatically determines if it’s for a physical product or a service. We use your Stripe Product's _shippable_ status or the selection of a shipping rate on your invoice to indicate, through Stripe metadata, whether an invoice is shippable.

Our app automatically adds metadata to Stripe invoices before shipment:

- **If an invoice uses a shipping rate or includes a shippable product:**
  - Metadata with the key `ship_status` and the value `unshipped` is added.
  - Invoices marked as `unshipped` will appear in your _Unshipped Invoices_ list in Parcelcraft.

#### Supported Metadata Prior to Shipment

| Metadata Key  | Possible Values      | Description                                                          |
| ------------- | -------------------- | -------------------------------------------------------------------- |
| `ship_status` | `unshipped`          | Appears in _Unshipped Invoices_ list                                 |
|               | `canceled`           | Appears in _Canceled Invoices_ list                                  |
|               | `shipped`            | Assumed shipped or hand-delivered outside Parcelcraft                |
|               | `back_ordered`       | Appears in _Backordered Invoices_ list                               |
|               | `unshippable`        | Will not appear in _Unshipped Items_ list (for non-shippable orders) |
|               | _(no value)_         | Assumed non-shippable or undetermined status                         |
| `is_return`   | `true` (as a string) | Shipment will be created as a return by default                      |

### After Shipment

PaymentIntents and Invoices will mirror each other’s metadata at the time of shipment. If no invoice exists for a PaymentIntent, only the PaymentIntent metadata will reflect these values:

| Metadata Key      | Example Value                                                                                           | Description                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `ship_date`       | `2024-05-24T18:07:34Z`                                                                                  | Shipment date                                     |
| `ship_status`     | `shipped` (or `unshipped`, `canceled`, `back_ordered`, `unshippable`)                                   | Shipment status                                   |
| `shipment_id`     | `shp_bdf04565433…`                                                                                      | EasyPost Shipment ID                              |
| `tracking_number` | `9434600110368044455854`                                                                                | Tracking number                                   |
| `tracking_URL`    | [USPS Tracking](https://tools.usps.com/go/TrackConfirmAction_input?origTrackNum=9434600110368044455854) | Tracking URL                                      |
| `service_name`    | `USPS Ground Advantage`                                                                                 | Shipping service used                             |
| `is_return`       | `true` (if return shipment)                                                                             | Indicates if shipment is a return (absent if not) |

### Stripe Product Metadata

All values are optional. Setting product defaults helps prepare shipments according to your product metadata.

| Metadata Key          | Example Value | Description                                                                   |
| --------------------- | ------------- | ----------------------------------------------------------------------------- |
| `customs_description` | `SIM card`    | Product description for customs                                               |
| `origin_country`      | `US`          | Country of origin                                                             |
| `tariff_code`         | `8523.52.00`  | Tariff code                                                                   |
| `weight`              | `0.44`        | Product weight                                                                |
| `weight_unit`         | `ounce`       | Unit of weight (`gram`, `ounce`, `pound`, or `kilogram`; defaults to `ounce`) |
| `is_return`           | `true`        | Indicates if item is a return (defaults to `null` or `false`)                 |

### Stripe Shipping Rate Metadata

All values are optional. Defining defaults helps prepare shipments based on your shipping rate metadata, especially when using shipping rates in Stripe invoices.

| Metadata Key            | Example Value | Description                                                                           |
| ----------------------- | ------------- | ------------------------------------------------------------------------------------- |
| `carrier_id`            | `ca_c38cd24…` | Your EasyPost carrier ID                                                              |
| `package_code`          | `Letter`      | Package code for your EasyPost carrier (defaults to `Package`)                        |
| `packaging_weight`      | `0.26`        | Weight of the packaging                                                               |
| `packaging_weight_unit` | `ounce`       | Unit for packaging weight (`gram`, `ounce`, `pound`, `kilogram`; defaults to `ounce`) |
| `service_code`          | `Priority`    | Service level (e.g., `Ground`, `Priority`, `NextDayAir`)                              |
| `width`                 | `10`          | Default package width (unit based on Parcelcraft carrier settings)                    |
| `length`                | `5`           | Default package length                                                                |
| `height`                | `8`           | Default package height                                                                |

### Stripe Customer Metadata

Some addresses (e.g., shared office spaces) may require a company name for successful delivery. If your Stripe customer record includes `company` metadata, we’ll automatically add the company name to the shipping address when creating a shipment.

**Tip:** Add a custom field called `company` in your Stripe payment links or checkout sessions, then use that data to update the Stripe customer’s metadata.

| Metadata Key | Example Value       | Description                            |
| ------------ | ------------------- | -------------------------------------- |
| `company`    | `Acme Incorporated` | Company name added to shipping address |
