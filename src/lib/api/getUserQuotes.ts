import type { Handler } from '@netlify/functions';
import { getAccessToken } from '@auth0/nextjs-auth0/edge';
import { client } from '@/lib/client';

const handler: Handler = async (event, context) => {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) };
    }

    const decoded = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString());
    const userId = decoded.sub;

    // 🛠 Query Sanity for Quotes where userId matches
    const query = `*[_type == "quote" && userId == $userId]{
      _id,
      title,
      status
    }`;

    const quotes = await client.fetch(query, { userId });

    return { statusCode: 200, body: JSON.stringify({ quotes }) };
  } catch (error) {
    console.error('Failed to fetch user quotes:', error);
    return { statusCode: 500, body: JSON.stringify({ message: 'Failed to fetch user quotes' }) };
  }
}

export { handler };