# Sanity Assist Content Agent AI - Configuration Fix

## Problem
Error: "No JSON object found in response" when trying to create agents in Sanity Studio

## Root Causes
1. Missing AI provider configuration in `assist()` plugin
2. No API credentials passed to the Sanity Assist plugin
3. Schema types may lack comprehensive descriptions

## Solution: Configure OpenAI Provider

### Step 1: Add OpenAI API Key to Environment

You already have `OPENAI_API_KEY` in `.env.local`. Now expose it to Sanity Studio:

Add to `.env.local`:
```bash
SANITY_STUDIO_OPENAI_API_KEY=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
```

### Step 2: Update Sanity Config

Edit `packages/sanity-config/sanity.config.ts` at line 329.

**Current Configuration (lines 329-332):**
```typescript
assist({
  // Configure the AI assistant with instructions specific to your schema
  __customMaxTokens: 4000,
}),
```

**Replace with:**
```typescript
assist({
  // Configure the AI assistant with OpenAI
  __customMaxTokens: 4000,
  aiAssist: {
    provider: 'openai',
    configuration: {
      apiKey: readEnv('SANITY_STUDIO_OPENAI_API_KEY'),
      model: 'gpt-4o', // or 'gpt-4-turbo' for faster responses
      temperature: 0.7,
    },
  },
  // Optional: Add custom instructions for your schema
  instructions: `
You are helping content editors at FAS Motorsports create and manage content.
Key context:
- This is an automotive parts e-commerce platform
- Products have complex attributes (fitment, specifications, pricing tiers)
- Orders flow through multiple fulfillment states
- Customer data includes vehicles, purchase history, and wholesale accounts
- Strict data integrity requirements exist between Stripe, Sanity, and EasyPost

When creating content:
- Use proper automotive terminology
- Ensure product fitment data is accurate
- Maintain consistency with existing content patterns
- Follow established naming conventions for orders, customers, and products
  `.trim(),
}),
```

### Step 3: Alternative Configuration (Anthropic/Claude)

If you prefer Claude (since you're already using it), you can configure it:

```typescript
assist({
  __customMaxTokens: 4000,
  aiAssist: {
    provider: 'anthropic',
    configuration: {
      apiKey: readEnv('SANITY_STUDIO_ANTHROPIC_API_KEY'),
      model: 'claude-sonnet-4-5-20250929',
      temperature: 0.7,
    },
  },
}),
```

You'll need to add to `.env.local`:
```bash
SANITY_STUDIO_ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

### Step 4: Verify CORS Settings

Ensure Sanity CORS allows the AI provider:

Run this script (already in your codebase):
```bash
pnpm exec tsx scripts/ensure-sanity-cors.ts
```

Or manually add to CORS in Sanity project settings:
- `https://api.openai.com` (for OpenAI)
- `https://api.anthropic.com` (for Claude)

### Step 5: Restart Dev Server

```bash
pnpm dev
```

### Step 6: Test Content Agent

1. Open Sanity Studio
2. Navigate to any document type (Product, Order, Customer)
3. Look for the AI assistant icon or "Create new agent" option
4. Try creating an agent with a simple prompt: "Help me write product descriptions"

## Schema Improvements (Optional but Recommended)

To make AI agents more effective, enhance your schema types with better descriptions:

### Example: Product Schema Enhancement

```typescript
export default {
  name: 'product',
  title: 'Product',
  type: 'document',
  description: 'Automotive parts and accessories sold through FAS Motorsports. Products have fitment compatibility, pricing tiers, and inventory tracking.',
  fields: [
    {
      name: 'title',
      title: 'Product Title',
      type: 'string',
      description: 'The display name for this product. Should include brand, part type, and key specifications. Example: "Mishimoto Performance Radiator for 2015-2020 Mustang GT"',
      validation: Rule => Rule.required(),
    },
    {
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 5,
      description: 'Detailed product description including features, benefits, specifications, and fitment information. Optimized for SEO and customer understanding.',
    },
    // ... more fields with descriptions
  ],
}
```

## Troubleshooting

### Issue: Still getting "No JSON object found"

**Check:**
1. API key is correct and active
2. CORS settings include AI provider domain
3. Browser console for detailed error messages
4. Network tab to see actual API requests/responses

**Debug:**
```bash
# Check if env var is loading
pnpm exec sanity exec --with-user-token scripts/debug-env.js
```

Create `scripts/debug-env.js`:
```javascript
const readEnv = (key) => process.env[key];
console.log('SANITY_STUDIO_OPENAI_API_KEY exists:', !!readEnv('SANITY_STUDIO_OPENAI_API_KEY'));
console.log('Value starts with:', readEnv('SANITY_STUDIO_OPENAI_API_KEY')?.substring(0, 10));
```

### Issue: API key not loading

Sanity Studio only loads env vars prefixed with `SANITY_STUDIO_` or `PUBLIC_`.

Make sure your key is:
```bash
SANITY_STUDIO_OPENAI_API_KEY=sk-...
```

NOT:
```bash
OPENAI_API_KEY=sk-...  # Won't work in Studio!
```

### Issue: Rate limit errors

If using OpenAI free tier, you may hit rate limits. Consider:
- Upgrading to paid tier
- Using a different provider (Anthropic)
- Implementing request throttling

## Documentation References

- [Sanity Assist Plugin Docs](https://www.sanity.io/docs/ai-assist)
- [OpenAI API Keys](https://platform.openai.com/api-keys)
- [Anthropic API Keys](https://console.anthropic.com/)
- [Sanity CORS Settings](https://www.sanity.io/docs/cors)

## Next Steps After Fix

1. **Test basic agent creation** - Verify it works
2. **Create domain-specific agents** - Build agents for products, orders, customers
3. **Train team** - Show content editors how to use AI assistance
4. **Monitor usage** - Track API costs and set up billing alerts
5. **Iterate on instructions** - Refine the custom instructions based on actual usage

## Cost Considerations

- **OpenAI GPT-4**: ~$0.03 per 1K tokens (input) + $0.06 per 1K tokens (output)
- **Anthropic Claude**: ~$0.015 per 1K tokens (input) + $0.075 per 1K tokens (output)
- Typical agent interaction: 500-2000 tokens = $0.05-0.20 per request

Set up usage alerts in your AI provider dashboard!
