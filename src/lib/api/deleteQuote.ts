import { client } from '@/lib/client'

export async function deleteQuote(userId: string, quoteId: string) {
  if (!userId || !quoteId) throw new Error('Missing userId or quoteId');

  try {
    const updated = await client
      .patch(userId) // assumes Clerk userId is the document _id
      .unset([`quotes[_key=="${quoteId}"]`])
      .commit();

    return updated;
  } catch (err) {
    console.error('Failed to delete quote:', err);
    throw err;
  }
}