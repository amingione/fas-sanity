import { NextApiRequest, NextApiResponse } from 'next';
import { getAccessToken } from '@auth0/nextjs-auth0/edge';
import { client } from '@/lib/client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const accessToken = await getAccessToken();
    const decoded = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString());
    const userId = decoded.sub;

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