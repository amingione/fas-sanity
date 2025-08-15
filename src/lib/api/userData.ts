import { getAccessToken } from '@auth0/nextjs-auth0/edge';
import { client } from '@/lib/client';
import type { Handler } from '@netlify/functions';

const handler: Handler = async (event, context) => {
  try {
    const accessToken = await getAccessToken();
    const decoded = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString());
    const userId = decoded.sub;

    if (!userId) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    // 🛠 Query Sanity for Orders where userId matches
    const query = `*[_type == "order" && userId == $userId]{
      _id,
      title,
      status
    }`;

    const orders = await client.fetch(query, { userId });

    return {
      statusCode: 200,
      body: JSON.stringify({ orders }),
    };
  } catch (error) {
    console.error('Failed to fetch user orders:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Failed to fetch user orders' }),
    };
  }
};

export default handler;