# APPROVED Codex Build Prompt: Log Drains SDK Integration

**Status:** APPROVED FOR BUILD  
**Approval File:** [approval-contract.md](docs/SANITY AGENT/Log Drains SDK/approval-contract.md)

---

## CRITICAL INSTRUCTIONS

Before proceeding, verify:

1. ✅ approval-contract.md exists and shows APPROVED status
2. ✅ Human approval signature is present
3. ✅ Date is within last 30 days

**If any verification fails, STOP and request human approval.**

---

## Project Overview

Build a complete Sanity Log Drains SDK integration for the fas-sanity repository.

**Goal:** Enable structured logging with external drain support (Datadog, Logflare, etc.)

---

## Implementation Requirements

### Phase 1: Core SDK Setup

**Location:** `packages/sanity-log-drains/`

Create the following files:

#### 1. package.json

```json
{
  "name": "@fas/sanity-log-drains",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest"
  },
  "dependencies": {
    "@sanity/client": "^6.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "vitest": "^1.0.0"
  }
}
```

#### 2. src/index.ts

```typescript
export interface LogDrainConfig {
  projectId: string
  dataset: string
  token: string
  apiVersion?: string
}

export interface LogDrain {
  id: string
  name: string
  url: string
  headers?: Record<string, string>
  enabled: boolean
}

export class LogDrainSDK {
  private client: any

  constructor(config: LogDrainConfig) {
    // Initialize Sanity client
  }

  async listDrains(): Promise<LogDrain[]> {
    // Fetch all log drains
  }

  async createDrain(drain: Omit<LogDrain, 'id'>): Promise<LogDrain> {
    // Create new log drain
  }

  async updateDrain(id: string, updates: Partial<LogDrain>): Promise<LogDrain> {
    // Update existing drain
  }

  async deleteDrain(id: string): Promise<void> {
    // Remove drain
  }

  async testDrain(id: string): Promise<boolean> {
    // Test drain connectivity
  }
}
```

#### 3. src/types.ts

```typescript
export interface LogEvent {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  metadata?: Record<string, any>
  source: string
}

export interface DrainResponse {
  success: boolean
  drainId: string
  message?: string
}

export type DrainProvider = 'datadog' | 'logflare' | 'custom'
```

#### 4. tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "declaration": true,
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

### Phase 2: Sanity Schema Integration

**Location:** `packages/sanity-config/src/schemaTypes/documents/logDrain.ts`

```typescript
import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'logDrain',
  title: 'Log Drain',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'provider',
      title: 'Provider',
      type: 'string',
      options: {
        list: [
          {title: 'Datadog', value: 'datadog'},
          {title: 'Logflare', value: 'logflare'},
          {title: 'Custom', value: 'custom'},
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'url',
      title: 'Endpoint URL',
      type: 'url',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'headers',
      title: 'HTTP Headers',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {name: 'key', type: 'string', title: 'Header Name'},
            {name: 'value', type: 'string', title: 'Header Value'},
          ],
        },
      ],
    }),
    defineField({
      name: 'enabled',
      title: 'Enabled',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'lastTestedAt',
      title: 'Last Tested',
      type: 'datetime',
      readOnly: true,
    }),
    defineField({
      name: 'lastTestResult',
      title: 'Last Test Result',
      type: 'string',
      options: {
        list: [
          {title: 'Success', value: 'success'},
          {title: 'Failed', value: 'failed'},
        ],
      },
      readOnly: true,
    }),
  ],
  preview: {
    select: {
      title: 'name',
      provider: 'provider',
      enabled: 'enabled',
    },
    prepare({title, provider, enabled}) {
      return {
        title: title || 'Unnamed Drain',
        subtitle: `${provider} • ${enabled ? 'Enabled' : 'Disabled'}`,
      }
    },
  },
})
```

**Update schema index:** Add `logDrain` to `packages/sanity-config/src/schemaTypes/index.ts`

---

### Phase 3: Netlify Function Integration

**Location:** `netlify/functions/logDrainProxy.ts`

```typescript
import type {Handler} from '@netlify/functions'
import {createClient} from '@sanity/client'

const sanity = createClient({
  projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
  dataset: process.env.SANITY_STUDIO_DATASET!,
  apiVersion: '2024-04-10',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
})

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {statusCode: 405, body: 'Method Not Allowed'}
  }

  try {
    const logEvent = JSON.parse(event.body || '{}')

    // Fetch enabled drains from Sanity
    const drains = await sanity.fetch(
      `*[_type == "logDrain" && enabled == true]{_id, name, provider, url, headers}`,
    )

    // Send log event to each active drain
    const results = await Promise.allSettled(
      drains.map(async (drain: any) => {
        const headers: Record<string, string> = {'Content-Type': 'application/json'}

        if (drain.headers) {
          drain.headers.forEach((h: any) => {
            headers[h.key] = h.value
          })
        }

        const response = await fetch(drain.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(logEvent),
        })

        return {drainId: drain._id, status: response.status, ok: response.ok}
      }),
    )

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        results: results.map((r) => (r.status === 'fulfilled' ? r.value : {error: r.reason})),
      }),
    }
  } catch (error) {
    console.error('Log drain proxy error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({error: 'Failed to process log event'}),
    }
  }
}
```

---

### Phase 4: Studio Integration

**Location:** `packages/sanity-config/src/desk/deskStructure.ts`

Add to desk structure:

```typescript
S.listItem()
  .id('log-drains')
  .title('Log Drains')
  .child(S.documentList().title('Log Drains').schemaType('logDrain').filter('_type == "logDrain"'))
```

---

### Phase 5: Environment Configuration

Add to `.env.example`:

```
LOG_DRAIN_ENABLED=true
LOG_DRAIN_DATADOG_API_KEY=your_datadog_key
LOG_DRAIN_LOGFLARE_SOURCE_TOKEN=your_logflare_token
```

---

## Testing Requirements

- **Unit Tests:** Create tests in `packages/sanity-log-drains/src/__tests__/`
- **Integration Tests:** Verify drain CRUD operations
- **Manual Testing:** Create test drain in Studio and send sample events

---

## Documentation Requirements

Create `README.md` with:

- Installation instructions
- Configuration guide
- API reference
- Setup examples for Datadog and Logflare

---

Validation Checklist
Before marking complete:

All TypeScript files compile without errors
Schema appears in Sanity Studio
Netlify function deploys successfully
Test drain can be created and tested
Documentation is complete
No existing functionality is broken
File Change Summary
New Files:

packages/sanity-log-drains/package.json
index.ts
packages/sanity-log-drains/src/types.ts
packages/sanity-log-drains/tsconfig.json
packages/sanity-config/src/schemaTypes/documents/logDrain.ts
netlify/functions/logDrainProxy.ts
Modified Files:

index.ts
deskStructure.ts
.env.example
Behavioral Parity Requirement
CRITICAL: This is a new feature addition. No existing functionality should be altered.

Existing logs must continue to work
Existing schemas unaffected
Existing Netlify functions unaffected
No changes to authentication or authorization flows
Safety Protocols
Incremental commits: Commit after each phase completion
Testing gates: Run tests before proceeding to next phase
Rollback ready: Keep each phase independently deployable
No production changes: All changes behind feature flag until tested

---

## END OF PROMPT
