import crypto from 'crypto'
import type {Handler} from '@netlify/functions'
import fetch from 'node-fetch'

type UploadRequestBody = {
  emails?: string[]
}

const REQUIRED_ENV_VARS = [
  'GOOGLE_ADS_CLIENT_ID',
  'GOOGLE_ADS_CLIENT_SECRET',
  'GOOGLE_ADS_REFRESH_TOKEN',
  'GOOGLE_ADS_DEVELOPER_TOKEN',
  'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
  'GOOGLE_ADS_CUSTOMER_ID',
  'GOOGLE_ADS_CUSTOMER_MATCH_LIST',
] as const

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {statusCode: 405, body: 'Method not allowed'}
  }

  try {
    const body: UploadRequestBody = JSON.parse(event.body || '{}')
    const emails = Array.isArray(body.emails)
      ? body.emails.filter(
          (email): email is string => typeof email === 'string' && Boolean(email.trim()),
        )
      : []

    if (!emails.length) {
      return {statusCode: 400, body: 'No emails provided'}
    }

    const missingEnv = REQUIRED_ENV_VARS.filter((key) => !process.env[key])
    if (missingEnv.length > 0) {
      console.error('uploadCustomerMatch missing env vars:', missingEnv)
      return {statusCode: 500, body: 'Missing Google Ads environment variables'}
    }

    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
        client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
        refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
        grant_type: 'refresh_token',
      }),
    })

    const tokenJson = (await tokenResp.json()) as {access_token?: string; [key: string]: unknown}

    if (!tokenJson.access_token) {
      console.error('uploadCustomerMatch OAuth Error:', tokenJson)
      return {statusCode: 500, body: 'Failed to refresh Google Ads OAuth token'}
    }

    const hashedEmails = emails.map((email) =>
      crypto
        .createHash('sha256')
        .update(email.trim().toLowerCase())
        .digest('hex'),
    )

    const url = `https://googleads.googleapis.com/v17/customers/${process.env.GOOGLE_ADS_CUSTOMER_ID}/userLists:mutateMembers`

    const payload = {
      resourceName: process.env.GOOGLE_ADS_CUSTOMER_MATCH_LIST,
      operations: [
        {
          create: {
            userIdentifiers: hashedEmails.map((hex) => ({
              hashedEmail: hex,
            })),
          },
        },
      ],
    }

    const uploadResp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
        'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
        'login-customer-id': process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const uploadJson = (await uploadResp.json()) as Record<string, unknown>

    if (!uploadResp.ok) {
      console.error('uploadCustomerMatch Google Ads API Error:', uploadJson)
      return {statusCode: 500, body: JSON.stringify(uploadJson)}
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        uploaded: emails.length,
        response: uploadJson,
      }),
    }
  } catch (err) {
    console.error('uploadCustomerMatch internal error:', err)
    return {statusCode: 500, body: 'Server error'}
  }
}
