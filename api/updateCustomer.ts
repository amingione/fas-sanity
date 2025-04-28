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
    const updated = await client
      .patch(userId) // assumes Clerk userId is the document _id
      .set({
        ...(updates.email && { email: updates.email }),
        ...(updates.phone && { phone: updates.phone }),
        ...(updates.billingAddress && { billingAddress: updates.billingAddress }),
        ...(updates.shippingAddress && { shippingAddress: updates.shippingAddress }),
        ...(updates.orderCount !== undefined && { orderCount: updates.orderCount }),
        ...(updates.quoteCount !== undefined && { quoteCount: updates.quoteCount }),
        ...(updates.lifetimeSpend !== undefined && { lifetimeSpend: updates.lifetimeSpend }),
      })
      .commit();

    return updated;
  } catch (err) {
    console.error('Failed to update customer:', err);
    throw err;
  }
}
