# Enabling Invoices for Stripe Checkout Sessions

- If you are using the **Stripe API** for Checkout Sessions, you need to set the `invoice_creation.enabled` parameter to `true` when creating the Checkout Session.

**Here’s an example:**

```
const session = await stripe.checkout.sessions.create({
  payment_method_types: ['card'],
  line_items: [
    {
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'T-shirt',
        },
        unit_amount: 2000,
      },
      quantity: 1,
    },
  ],
  mode: 'payment',
  success_url: 'https://example.com/success',
  cancel_url: 'https://example.com/cancel',
  invoice_creation: {
    enabled: true,
  },
});
```

- **For more information on enabling invoices for Checkout Sessions, refer to the Stripe (API documentation).**

- If you have any further questions or need assistance with setting up Stripe invoicing for Parcelcraft, please don’t hesitate to reach out to our support team at (support@parcelcraft.com).
