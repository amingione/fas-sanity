import { client } from '@/lib/client'

export async function deleteQuote(userId: string, quoteId: string) {
  if (!userId || !quoteId) throw new Error('Missing userId or quoteId');

  try {
    const customer = await client.fetch(
      `*[_type == "customer" && userId == $userId][0]`,
      { userId }
    );

    if (!customer?._id) throw new Error('Customer not found');

    const updated = await client
      .patch(customer._id)
      .unset([`quotes[_key=="${quoteId}"]`])
      .commit();

    return updated;
  } catch (err) {
    console.error('Failed to delete quote:', err);
    throw err;
  }
}