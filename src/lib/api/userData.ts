import { NextApiRequest, NextApiResponse } from 'next';
import { getAuth } from '@clerk/nextjs/server';
import { client } from '@/lib/client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // 🛠 Query Sanity for Orders where userId matches
    const query = `*[_type == "order" && userId == $userId]{
      _id,
      title,
      status
    }`;

    const orders = await client.fetch(query, { userId });

    return res.status(200).json({ orders });
  } catch (error) {
    console.error('Failed to fetch user orders:', error);
    return res.status(500).json({ message: 'Failed to fetch user orders' });
  }
}