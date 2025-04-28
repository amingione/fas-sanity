import { NextApiRequest, NextApiResponse } from 'next';
import { client } from '@/lib/client';
import { getAuth } from '@clerk/nextjs/server';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { userId } = getAuth(req);

  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { email, firstName, lastName } = req.body;

  try {
    const customerId = `customer.${userId}`;

    // Check if customer already exists
    const existing = await client.fetch(
      `*[_type == "customer" && _id == $id][0]`,
      { id: customerId }
    );

    if (!existing) {
      // If not exists, create new customer
      await client.create({
        _type: 'customer',
        _id: customerId,
        userId,
        email,
        firstName,
        lastName,
        createdAt: new Date().toISOString(),
      });
    }

    res.status(200).json({ message: 'Customer synced successfully' });
  } catch (error) {
    console.error('Failed to sync customer:', error);
    res.status(500).json({ message: 'Failed to sync customer' });
  }
}