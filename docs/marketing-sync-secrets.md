# Marketing Sync Secrets

The scheduled marketing attribution sync uses a single environment variable to hold all third-party API credentials.  
Set `MARKETING_API_BLOB` to a **base64-encoded JSON** string that matches the template below:

```jsonc
{
  "sanity": {
    "projectId": "r4og35qd",
    "dataset": "production",
    "token": "sanityWriteToken",
  },
  "google": {
    "developerToken": "XXXX",
    "customerId": "1234567890",
    "loginCustomerId": "0987654321",
    "accessToken": "ya29...",
  },
  "meta": {
    "accessToken": "EAAB...",
    "adAccountId": "1234567890",
  },
  "email": {
    "provider": "sendgrid",
    "sendgrid": {
      "apiKey": "SG.xxxxx",
      "category": "All Email", // optional
    },
    /*
    // Alternate provider usage:
    "provider": "klaviyo",
    "klaviyo": {
      "privateKey": "pk_xxxxx",
      "metricId": "abcd1234"
    }
    */
  },
  "affiliate": {
    "endpoint": "https://api.affiliatenetwork.com/report",
    "token": "aff-api-token",
  },
  "organic": {
    "endpoint": "https://your-analytics-endpoint.example.com",
    "token": "optional-bearer-token",
  },
}
```

Encode the JSON to base64 and place the result in Netlify/Env:

```bash
cat secrets.json | base64 | pbcopy
# then set MARKETING_API_BLOB to the copied value
```

- Leave any section out if you do not use that provider.
- You can still override values with individual env vars; the blob takes priority.

After updating `MARKETING_API_BLOB`, deploy or re-run the scheduled function to pick up the new credentials.
