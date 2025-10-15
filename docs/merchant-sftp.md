# Google Merchant Center SFTP Feed

Use the `upload:merchant-feed` script to generate a tab-separated product feed from Sanity and deliver it to Google Merchant Center via SFTP.

## 1. Environment Variables

Configure these in your Netlify/CI environment (and locally through `.env.development` as needed):

| Variable | Example | Notes |
| --- | --- | --- |
| `GOOGLE_MERCHANT_SFTP_HOST` / `GMC_SFTP_HOST` | `partnerupload.google.com` | Optional; defaults to Google’s host. |
| `GOOGLE_MERCHANT_SFTP_PORT` / `GMC_SFTP_PORT` | `19321` | Optional; defaults to Google’s SFTP port. |
| `GOOGLE_MERCHANT_SFTP_USERNAME` / `GMC_SFTP_USERNAME` | `mc-sftp-…` | **Required** – provided in Merchant Center. |
| `GOOGLE_MERCHANT_SFTP_PASSWORD` / `GMC_SFTP_PASSWORD` | `••••` | **Required** – use the generated password from Merchant Center. |
| `GOOGLE_MERCHANT_SFTP_REMOTE_DIR` / `GMC_SFTP_REMOTE_DIR` | `/` | Optional; folder to upload into (trailing slash optional). |
| `GOOGLE_MERCHANT_SFTP_FILENAME` / `GMC_SFTP_FEED_FILENAME` | `fas-products-feed.txt` | Optional; defaults to `products.txt`. |
| `GOOGLE_MERCHANT_FEED_CURRENCY` / `GMC_FEED_CURRENCY` | `USD` | Optional; sets currency for price columns. |
| `GOOGLE_MERCHANT_FEED_BASE_URL` / `GMC_FEED_BASE_URL` | `https://www.fasmotorsports.com` | Optional; falls back to `SITE_BASE_URL`/`PUBLIC_SITE_URL`. |
| `GOOGLE_MERCHANT_FEED_OUTPUT_DIR` / `GMC_FEED_OUTPUT_DIR` | `./tmp` | Optional; where the local feed file is written. |

Make sure the standard Sanity environment variables (`SANITY_PROJECT_ID`, `SANITY_DATASET`, etc.) are also configured so the script can pull product data.

## 2. Fingerprint Verification

Before uploading from a new machine, verify Google’s host key once:

```sh
ssh-keyscan -p 19321 partnerupload.google.com
```

Confirm the SHA256 fingerprint matches the Merchant Center UI, then trust the key (typically by placing the output in `~/.ssh/known_hosts`).

## 3. Generate & Upload the Feed

Run the script when you need to push an updated feed:

```sh
pnpm upload:merchant-feed
```

Steps performed:

1. Fetches sellable products from Sanity.
2. Builds a tab-separated feed with the fields Google expects (`id`, `title`, `description`, `link`, etc.).
3. Writes the feed locally (defaults to `tmp/products.txt`).
4. Uploads the file to the configured SFTP location.

The script reports how many products were included and prints any skipped product IDs (typically missing price, link, or image).

## 4. Scheduling

To automate uploads, run the command above from your preferred scheduler (e.g., GitHub Actions, Netlify Scheduled Functions, or a cron job) after setting the environment variables in that environment.

---

If you prefer to continue using the Content API, the existing `netlify/functions/syncMerchantProducts.ts` is untouched. You can run either approach as needed.
