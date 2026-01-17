# Carrier defaults

The **Carrier defaults** tab in the [Parcelcraft Settings page](https://app.parcelcraft.com/settings) allows you to associate shipping carriers with Stripe shipping rates and set default shipping options.

---

## Stripe Shipping Rates

If you use [Stripe Shipping Rates](https://stripe.com/docs/shipping) on your invoices, they will be listed on the **Carrier defaults** page. For each shipping rate, you can assign a carrier from your connected EasyPost account.

To modify the available carriers, go to your [EasyPost Account Settings](https://www.easypost.com/account/settings). After adding a new carrier in EasyPost, refresh the Parcelcraft Settings page to see the updated options.

---

## Default Settings

If you don’t use Stripe Shipping Rates, you can use the **Default Settings** section to specify the default carrier and other shipping information. These settings will be applied to all shipments unless overridden when creating a shipping label.

---

## Shipment Weight Calculation

Parcelcraft automatically calculates the weight of your shipment using the following formula:

$$(PRODUCT \text{ } WEIGHT \times PRODUCT \text{ } QUANTITY) + PACKAGING \text{ } WEIGHT = TOTAL \text{ } WEIGHT$$

- **PRODUCT WEIGHT**: The weight of each individual product, as defined in the [Shippable products](https://docs.parcelcraft.com/shippable-products) tab.
- **PRODUCT QUANTITY**: The number of units of each product included in the shipment.
- **PACKAGING WEIGHT**: The weight of the packaging materials used to ship the products, as specified in the Packaging column.

The calculated total weight is used to determine the appropriate shipping rate and generate accurate shipping labels.

---

## Overriding Default Settings

When creating a shipping label, you have the option to override any aspect of the shipment.

> [!IMPORTANT]
> Remember to review and update your Carrier defaults and packaging weights regularly to ensure accurate shipping calculations and a streamlined shipping process.
