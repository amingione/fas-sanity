// Removed @vercel/node types to avoid dependency; using untyped req/res compatible with current runtime
import { getSession } from '@auth0/nextjs-auth0';
import { client } from '@/lib/client';

export default async function handler(req: any, res: any) {
  try {
    const session = await getSession(req, res);
    const userId = session?.user?.sub;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Query Sanity for the customer with the matching Auth0 userId
    const query = `*[_type == "customer" && userId == $userId][0]{
      _id,
      name,
      email,
      phone
    }`;
    const customer = await client.fetch(query, { userId });

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    return res.status(200).json({ customer });
  } catch (error) {
    console.error('Failed to fetch customer profile:', error);
    return res.status(500).json({ message: 'Failed to fetch customer profile' });
  }
}