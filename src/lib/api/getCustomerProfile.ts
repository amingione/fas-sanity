import { NextApiRequest, NextApiResponse } from 'next';
import { getAuth } from '@clerk/nextjs/server';
import { client } from '@/lib/client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Query Sanity for the customer with the matching Clerk userId
    const query = `*[_type == "customer" && clerkId == $userId][0]{
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