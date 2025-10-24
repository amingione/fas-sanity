import { client } from '@/lib/client';

export async function updateCustomer(userId: string, updates: {
  email?: string;
  phone?: string;
  billingAddress?: string;
  shippingAddress?: string;
  orderCount?: number;
  quoteCount?: number;
  lifetimeSpend?: number;
}) {
  if (!userId) throw new Error('Missing userId for update');

  try {
    const customer = await client.fetch(
      `*[_type == "customer" && userId == $userId][0]`,
      { userId }
    );

    if (!customer?._id) throw new Error('Customer not found');

    const updated = await client
      .patch(customer._id)
      .set({
        ...(updates.email && { email: updates.email }),
        ...(updates.phone && { phone: updates.phone }),
        ...(updates.billingAddress && { billingAddress: updates.billingAddress }),
        ...(updates.shippingAddress && { shippingAddress: updates.shippingAddress }),
        ...(updates.orderCount !== undefined && { orderCount: updates.orderCount }),
        ...(updates.quoteCount !== undefined && { quoteCount: updates.quoteCount }),
        ...(updates.lifetimeSpend !== undefined && { lifetimeSpend: updates.lifetimeSpend }),
        updatedAt: new Date().toISOString(),
      })
      .commit({ autoGenerateArrayKeys: true });

    return updated;
  } catch (err) {
    console.error('Failed to update customer:', err);
    throw err;
  }
}
