2. sample-environment-vars.md - Add missing configuration

# Sample Environment Variables

Add these to your `.env` or `.env.local` file:

```bash
# Sanity Configuration (Required)
SANITY_STUDIO_PROJECT_ID=your_project_id
SANITY_STUDIO_DATASET=production
SANITY_API_TOKEN=your_write_token

# Log Drains Configuration
LOG_DRAIN_ENABLED=true

# Datadog Integration (Optional)
LOG_DRAIN_DATADOG_API_KEY=your_datadog_api_key
LOG_DRAIN_DATADOG_SITE=datadoghq.com
LOG_DRAIN_DATADOG_SERVICE=fas-sanity

# Logflare Integration (Optional)
LOG_DRAIN_LOGFLARE_SOURCE_TOKEN=your_logflare_token
LOG_DRAIN_LOGFLARE_ENDPOINT=https://api.logflare.app/logs/json

# Custom Drain Configuration (Optional)
LOG_DRAIN_CUSTOM_URL=https://your-custom-endpoint.com/logs
LOG_DRAIN_CUSTOM_HEADERS='{"Authorization": "Bearer your_token"}'

# Function Configuration
LOG_DRAIN_BATCH_SIZE=100
LOG_DRAIN_FLUSH_INTERVAL=5000
LOG_DRAIN_RETRY_ATTEMPTS=3
LOG_DRAIN_TIMEOUT=10000
```

## Configuration Notes

### Required Variables

- [SANITY_STUDIO_PROJECT_ID](http://_vscodecontentref_/10): Your Sanity project ID
- [SANITY_STUDIO_DATASET](http://_vscodecontentref_/11): Dataset name (usually "production")
- [SANITY_API_TOKEN](http://_vscodecontentref_/12): Write token for creating/updating documents

### Optional Provider Variables

Configure only the providers you plan to use:

- **Datadog:** Requires API key and site (us, eu, etc.)
- **Logflare:** Requires source token from your Logflare account
- **Custom:** Requires endpoint URL and any authentication headers

### Performance Tuning

- `LOG_DRAIN_BATCH_SIZE`: Number of events to batch before sending
- `LOG_DRAIN_FLUSH_INTERVAL`: Milliseconds to wait before flushing batch
- `LOG_DRAIN_RETRY_ATTEMPTS`: Number of retry attempts on failure
- `LOG_DRAIN_TIMEOUT`: Request timeout in milliseconds

## Security Notes

⚠️ **Never commit these values to version control**

- Use [.env.local](http://_vscodecontentref_/13) for local development
- Use Netlify environment variables for production
- Rotate tokens regularly
- Use read-only tokens where possible

```

```
