# Parcelcraft + Stripe API Guide — F.A.S. Motorsports

_Note: this article documents how **F.A.S. Motorsports** interacts with the Stripe API via Parcelcraft. For connecting EasyPost to Parcelcraft for **Sanity back-office shipping only**, see [Connect Your EasyPost API key to Parcelcraft](https://docs.parcelcraft.com/api-guide)._

Parcelcraft doesn't require any software programming skills to use, but for those who have a need to interact with Parcelcraft programmatically, we have a variety of ways to interact with your shipment data. Parcelcraft makes extensive use of the **Stripe API** and the **EasyPost API**.

## Stripe API

Parcelcraft adds metadata to your **PaymentIntents**, **Invoices**, **Shipping Rates**, and **Products** to manage shipment status and default options.

## Stripe Invoice and PaymentIntents metadata

When an invoice or Checkout Session is created for **F.A.S. Motorsports**, Parcelcraft automatically determines whether the order contains **physical automotive parts** (e.g., billet components, hardware kits, engine accessories) versus services. We rely on **Stripe Product shippable status** and the customer’s selected shipping rate to mark orders as shippable via metadata.

If an invoice is shippable, metadata with a key of `ship_status` and a value of `unshipped` will be added. These will appear in your **unshipped invoices list** in Parcelcraft.

### Prior to shipment

| **Metadata key** | **Possible metadata values**                                      |
| ---------------- | ----------------------------------------------------------------- |
| **ship_status**  | `unshipped`, `canceled`, `shipped`, `back_ordered`, `unshippable` |
| **is_return**    | `true` (as a string)                                              |

### After shipment

PaymentIntents and Invoices will mirror each other’s metadata values at the time of shipment.

| **Metadata key**    | **Metadata value example**                                                               |
| ------------------- | ---------------------------------------------------------------------------------------- |
| **ship_date**       | `2024-05-24T18:07:34Z`                                                                   |
| **ship_status**     | `shipped`                                                                                |
| **shipment_id**     | `shp_fas_9d82c1...`                                                                      |
| **tracking_number** | `1Z999AA10123456784`                                                                     |
| **tracking_URL**    | [Tracking Link Example](https://www.ups.com/track?loc=en_US&tracknum=1Z999AA10123456784) |
| **service_name**    | `UPS Ground`                                                                             |

---

## Stripe Product metadata

These values help prepare shipments according to product defaults.

| **Metadata key**        | **Example**                                             |
| ----------------------- | ------------------------------------------------------- |
| **customs_description** | Automotive performance part (billet aluminum component) |
| **origin_country**      | US                                                      |
| **tariff_code**         | 8708.99.8180                                            |
| **weight**              | 6.5                                                     |
| **weight_unit**         | `pound`                                                 |

---

## Stripe Shipping Rate metadata

Used to prepare shipments if you use shipping rates in Stripe Invoices.

| **Metadata key**            | **Example**                                                                                                   | **Description**                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **carrier_id**              | `ca_ec65ddeb7dcc43eca9fa42870662751f,ca_d6f01c95df834796822516afe2e05771,ca_ed4230c54cc44385a518e8274f0cdc1e` | Your EasyPost carrier id                                       |
| **package_code**            | `Standard`                                                                                                    | The [EasyPost package code](https://www.easypost.com/carriers) |
| **weight**                  | `7`                                                                                                           | Weight of the packaging itself                                 |
| **width / length / height** | `12`, `12`, `8`                                                                                               | Default dimensions                                             |

---

## Stripe Customer metadata

- **Company Name:** For wholesale and dealer accounts, if the Stripe customer record contains a `company` metadata value (e.g., **F.A.S. Motorsports LLC**), it will be applied automatically to the shipping address and commercial invoice.
- **Tip:** Add a custom field called "company" in Stripe payment links to collect this data automatically.

| **Metadata key** | **Metadata value example** |
| ---------------- | -------------------------- |
| **company**      | F.A.S. Motorsports LLC     |
|                  |                            |

---
