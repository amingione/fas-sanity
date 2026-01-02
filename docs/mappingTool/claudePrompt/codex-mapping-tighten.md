# Webhook Drift & API Contract Scanner — Precision Tightening Codex

**Version:** 2.0
**Status:** AUTHORITATIVE IMPLEMENTATION GUIDE
**Effective:** Immediate
**Last Updated:** 2026-01-02

---

## EXECUTIVE SUMMARY

This codex defines the tightened detection rules for the unified audit scanner, specifically targeting:
1. Webhook idempotency enforcement
2. Unsafe payload access detection
3. External API contract validation (Stripe, EasyPost, Resend)

**Problem Statement:**
The first-pass scanner produced excessive false positives (~90% rate, 52 findings) by matching files via keyword ("webhook") instead of identifying actual executable webhook handlers. Schema files, type definitions, UI components, and tools were incorrectly flagged.

**Solution:**
Implement precision-first scanning with path-based classification and code structure analysis. False positives are unacceptable. False negatives are acceptable at this stage.

**Expected Outcome:**
- Reduce findings to ≤8 high-confidence violations
- False positive rate: <10%
- All findings represent actionable runtime risk
- Scanner becomes trusted enough to block merges on failure

---

## 1. WEBHOOK FILE TARGETING (CRITICAL)

### 1.1 Classification Rules

A file qualifies as a webhook handler **ONLY IF** at least one of the following is true:

#### Path-Based Classification (Primary)

File path matches **ANY** of:
```
src/pages/api/webhooks.ts
src/pages/api/*webhook*.ts
src/pages/api/webhooks/**
netlify/functions/*webhook*.ts
netlify/functions/*webhook*.mjs
netlify/functions/stripe*.ts
netlify/functions/easypost*.ts
netlify/functions/*Events.ts
```

**Examples:**
- ✅ `netlify/functions/easypostWebhook.ts`
- ✅ `src/pages/api/webhooks.ts`
- ✅ `netlify/functions/stripe-shipping-webhook.ts`
- ✅ `netlify/functions/emailEvents.ts`

#### Code-Based Classification (Secondary)

If path doesn't match, file **MUST** have **ALL** of:

1. **Handler signature:**
   - Exports default function accepting `(req, res)` or `(event, context)`
   - Pattern: `export default (async)? function.*\(req,\s*res\)` OR `handler = async \(event`

2. **Signature verification:**
   - Contains: `constructEvent` OR `verifySignature` OR
   - Headers: `req.headers['stripe-signature']` OR
   - Headers: `req.headers['x-easypost-signature']` OR
   - Headers: `req.headers['svix-signature']`

3. **Provider event references:**
   - Contains: `event.id` AND `event.type` OR
   - Contains: `payload.event_type` OR
   - Contains: `data.object`

### 1.2 Exclusions (NON-NEGOTIABLE)

**NEVER scan these paths:**

```
packages/sanity-config/src/**                   # All schemas, types, UI
packages/sanity-config/src/schemaTypes/**       # Schema definitions
packages/sanity-config/src/desk/**              # Desk structure
packages/sanity-config/src/components/**        # UI components
packages/sanity-config/src/views/**             # View components
packages/sanity-config/src/types/**             # Type definitions
packages/sanity-config/src/utils/**             # Utilities
packages/sanity-config/src/autoMapper/**        # Auto-mapper tools
tools/**                                         # CLI tools
scripts/**                                       # Scripts (with exception below)
**/test-*.js                                    # Test files
**/test-*.ts                                    # Test files
netlify/lib/**                                  # Utility libraries
src/lib/**                                      # Utility libraries
```

**Exception:** Only scan `scripts/stripe-maintenance/webhook-handler-fixed.js` if it's used in production.

**Additional Exclusion Criteria:**

Exclude any file that:
- Contains `_type:` schema definitions
- Imports from `'sanity'` or `'@sanity/types'`
- Is a TypeScript type definition file importing webhook types
- Is a React component displaying webhook data

### 1.3 Implementation Pseudocode

```javascript
export function isWebhookHandler(filePath, fileContent) {
  // 1. Path-based (primary)
  const pathPatterns = [
    /src\/pages\/api\/webhooks\.ts$/,
    /src\/pages\/api\/.*webhook.*\.ts$/,
    /src\/pages\/api\/webhooks\//,
    /netlify\/functions\/.*webhook.*\.(ts|mjs)$/,
    /netlify\/functions\/stripe.*\.ts$/,
    /netlify\/functions\/easypost.*\.ts$/,
    /netlify\/functions\/.*Events\.ts$/,
  ]

  if (pathPatterns.some(p => p.test(filePath))) {
    return !isExcluded(filePath)
  }

  // 2. Exclusions (hard stop)
  if (isExcluded(filePath)) return false

  // 3. Code-based (secondary)
  const hasHandler = /export\s+default\s+(async\s+)?function.*\(req,\s*res\)|handler\s*=\s*async\s*\(event/.test(fileContent)
  const hasSignature = /(constructEvent|verifySignature|stripe-signature|x-easypost-signature|svix-signature)/.test(fileContent)
  const hasEventRef = /(event\.id|event\.type|payload\.event_type|data\.object)/.test(fileContent)

  return hasHandler && hasSignature && hasEventRef
}

function isExcluded(filePath) {
  const exclusions = [
    /packages\/sanity-config\//,
    /tools\//,
    /scripts\/(?!.*webhook-handler-fixed\.js$)/,
    /netlify\/lib\//,
    /src\/lib\//,
    /test-.*\.(js|ts)$/,
  ]

  return exclusions.some(p => p.test(filePath))
}
```

---

## 2. IDEMPOTENCY GUARD DETECTION (HIGH PRIORITY)

### 2.1 Detection Rules

Flag **ONLY** when **ALL** conditions are met:

1. ✅ File is a verified webhook handler (per Section 1)
2. ✅ Handler processes provider events (Stripe, EasyPost, Resend, etc.)
3. ✅ Handler performs side-effects
4. ❌ NO idempotency guard exists

### 2.2 Side-Effect Patterns

Handler performs side-effects if it contains **ANY** of:

```typescript
// Document creation
sanityClient.create(...)
client.createIfNotExists(...)
transaction.create(...)

// Email sending
resend.emails.send(...)

// Shipment creation
easypost.Shipment.create(...)

// Order state updates
sanityClient.patch(orderId).set({ status: ... })
```

**DO NOT flag:**
- Read-only operations: `client.fetch`, `client.getDocument`
- Logging only: `console.log`, logging to analytics
- Metrics/monitoring only

### 2.3 Acceptable Idempotency Patterns

Handler is properly guarded if **ANY** of the following exist:

#### Pattern 1: createIfNotExists with event-keyed ID
```typescript
await client.createIfNotExists({
  _id: `webhook.${event.id}`,
  _type: 'stripeWebhookEvent',
  // ...
})
```

#### Pattern 2: Explicit existence check
```typescript
const existing = await client.fetch(
  `*[webhookEventId == $id][0]`,
  { id: event.id }
)
if (existing) {
  console.log('Already processed')
  return { statusCode: 200 }
}
```

#### Pattern 3: Transaction with guard
```typescript
await client.transaction()
  .createIfNotExists({ _id: `event-${event.id}`, ... })
  .commit()
```

#### Pattern 4: Unique constraint on provider event ID
```typescript
{
  _type: 'order',
  stripeEventId: event.id,  // with schema validation: Rule.unique()
  // ...
}
```

#### Pattern 5: Provider SDK idempotency key
```typescript
await resend.emails.send({
  ...emailData,
  headers: {
    'Idempotency-Key': event.id
  }
})
```

### 2.4 Exceptions (DO NOT Flag)

**DO NOT flag:**
- Test endpoints: `/test`, `/debug`, `/selfCheck`
- Read-only handlers (only query operations)
- Status/health check endpoints
- Reprocess/backfill scripts with explicit user confirmation UI

### 2.5 Implementation Pseudocode

```javascript
export function detectIdempotencyViolation(filePath, fileContent, ast) {
  // 1. Must be webhook handler
  if (!isWebhookHandler(filePath, fileContent)) return null

  // 2. Check for side-effects
  const sideEffectPatterns = [
    /sanityClient\.create\(/,
    /client\.createIfNotExists\(/,
    /transaction\.create\(/,
    /resend\.emails\.send\(/,
    /easypost\.Shipment\.create\(/,
    /\.patch\(.*\)\.set\(/,
  ]

  const hasSideEffects = sideEffectPatterns.some(p => p.test(fileContent))
  if (!hasSideEffects) return null

  // 3. Check for test/debug endpoints
  if (/\/(test|debug|selfCheck)/.test(filePath)) return null

  // 4. Check for idempotency guards
  const guardPatterns = [
    /createIfNotExists/,
    /\*\[webhookEventId\s*==\s*\$id\]/,
    /\*\[stripeEventId\s*==\s*\$id\]/,
    /\*\[easypostEventId\s*==\s*\$id\]/,
    /const\s+existing\s*=.*fetch.*event\.id/,
    /if\s*\(existing\)/,
    /idempotency[_-]?key/i,
    /Idempotency-Key/,
  ]

  const hasGuard = guardPatterns.some(p => p.test(fileContent))

  if (!hasGuard) {
    return {
      type: 'idempotency',
      file: filePath,
      lineNo: getFirstSideEffectLine(fileContent),
      detail: 'Webhook handler performs side-effects without idempotency guard',
      severity: 'HIGH'
    }
  }

  return null
}
```

---

## 3. UNSAFE PAYLOAD ACCESS (PRECISION ONLY)

### 3.1 Detection Rules

Flag **ONLY** when **ALL** are true:

1. ✅ File is a verified webhook handler
2. ✅ Direct access to unvalidated payload
3. ❌ NO prior validation exists

### 3.2 Unsafe Access Patterns

Direct access to:
```typescript
event.data.object.*
req.body.data.object.*
payload.data.object.*
```

**Example violations:**
```typescript
// ❌ UNSAFE
const session = event.data.object
const amount = event.data.object.amount_total

// ❌ UNSAFE
const { customer_email } = req.body.data.object
```

### 3.3 Acceptable Validation Patterns

Handler is safe if **ANY** of the following exist **BEFORE** the payload access:

#### Pattern 1: Zod validation
```typescript
const validated = webhookSchema.parse(event.data.object)
const session = validated  // OK
```

#### Pattern 2: Provider SDK verification
```typescript
const event = stripe.webhooks.constructEvent(
  req.body,
  signature,
  webhookSecret
)
// Type is now narrowed, safe to access
const session = event.data.object as Stripe.Checkout.Session
```

#### Pattern 3: Explicit structural guard
```typescript
if (!event.data.object || typeof event.data.object !== 'object') {
  throw new Error('Invalid payload')
}
const obj = event.data.object  // OK
```

#### Pattern 4: Type assertion with runtime check
```typescript
const session = event.data.object as Stripe.Checkout.Session
if (session.object !== 'checkout.session') {
  throw new Error('Invalid object type')
}
// OK - validated object type
```

### 3.4 Exceptions (DO NOT Flag)

**DO NOT flag:**
- Access on already-validated variables:
  ```typescript
  const validated = webhookSchema.parse(event)
  const obj = validated.data.object  // OK
  ```
- Provider SDK response objects:
  ```typescript
  const stripeSession = await stripe.checkout.sessions.retrieve(id)
  const email = stripeSession.customer_details.email  // OK
  ```
- Type definitions or interface declarations
- Non-webhook files

### 3.5 Implementation Pseudocode

```javascript
export function detectUnsafePayloadAccess(filePath, fileContent, ast) {
  // 1. Must be webhook handler
  if (!isWebhookHandler(filePath, fileContent)) return null

  // 2. Find payload access
  const payloadAccessPattern = /(event|req\.body|payload)\.data\.object(?!\s*as\s+\w+\s*\n.*object\s*!==)/g
  const matches = [...fileContent.matchAll(payloadAccessPattern)]

  if (matches.length === 0) return null

  const violations = []

  for (const match of matches) {
    const accessIndex = match.index
    const precedingCode = fileContent.slice(0, accessIndex)

    // 3. Check for validation before access
    const validationPatterns = [
      /\.parse\(/,
      /webhookSchema/,
      /constructEvent\(/,
      /if\s*\(!.*data\.object.*typeof/,
      /zod\..*\.parse/,
    ]

    const hasValidation = validationPatterns.some(p => p.test(precedingCode))

    if (!hasValidation) {
      violations.push({
        type: 'payloadAccess',
        file: filePath,
        lineNo: getLineNumber(fileContent, accessIndex),
        detail: 'Webhook payload accessed without validation',
        severity: 'MEDIUM',
        snippet: fileContent.slice(accessIndex, accessIndex + 50)
      })
    }
  }

  return violations.length > 0 ? violations : null
}
```

---

## 4. API CONTRACT VALIDATION (REDUCE NOISE)

### 4.1 Detection Rules

Detect missing required fields when:
1. Object passed to provider API
2. Required field missing according to provider contract
3. Call site is reachable (not commented, not unreachable)

### 4.2 Provider API Contracts

#### EasyPost Shipment Creation
```typescript
easypost.Shipment.create({
  to_address: Address,    // REQUIRED
  from_address: Address,  // REQUIRED
  parcel: Parcel,        // REQUIRED
  // Optional: customs_info, insurance, etc.
})
```

#### Resend Email Sending
```typescript
resend.emails.send({
  to: string | string[],  // REQUIRED
  from: string,           // REQUIRED
  subject: string,        // REQUIRED
  html: string,          // REQUIRED (or 'text')
  // Optional: cc, bcc, reply_to, etc.
})
```

### 4.3 Variable Assignment Tracking

Track object composition across variable assignments:

```typescript
// Example 1: Direct object
await easypost.Shipment.create({
  to_address,    // Check: is this defined?
  from_address,  // Check: is this defined?
  parcel,        // Check: is this defined?
})

// Example 2: Via variable
const shipmentData = {
  to_address,
  from_address,
  // Missing: parcel
}
await easypost.Shipment.create(shipmentData)  // FLAG HERE

// Example 3: Spread composition
const baseData = { to_address, from_address }
const fullData = { ...baseData, parcel }
await easypost.Shipment.create(fullData)  // OK
```

### 4.4 Exceptions (DO NOT Flag)

**DO NOT flag:**
- Partial builders not yet invoked
- Type definitions
- Intermediate objects not passed to APIs
- Optional fields
- Validation files: `easypostValidation.ts`, `resendValidation.ts`
- Schema files
- Files in `netlify/lib/` or `src/lib/` (unless direct API call)

### 4.5 Schema Mismatch Detection

Report as **INFO** level (not FAIL):
- Fields persisted to Sanity that don't exist in schema
- Only flag if field is written via `create()` or `patch()`
- Ignore read-only references

**Example:**
```typescript
await sanityClient.create({
  _type: 'shipment',
  easyPostShipmentId: shipment.id,  // Check: does schema have this field?
  trackingNumber: shipment.tracking_code,
})
```

### 4.6 Implementation Pseudocode

```javascript
export function detectApiContractViolation(filePath, fileContent, ast) {
  // Skip validation files
  if (/(Validation|validator)\.ts$/.test(filePath)) return []
  if (/netlify\/lib\//.test(filePath)) return []
  if (/src\/lib\//.test(filePath)) return []

  const violations = []

  // 1. Extract variable assignments
  const assignments = extractVariableAssignments(ast)

  // 2. Define API contracts
  const apiContracts = [
    {
      pattern: /easypost\.Shipment\.create\s*\(\s*(\w+|\{)/,
      service: 'easypost',
      operation: 'Shipment.create',
      required: ['to_address', 'from_address', 'parcel']
    },
    {
      pattern: /resend\.emails\.send\s*\(\s*(\w+|\{)/,
      service: 'resend',
      operation: 'emails.send',
      required: ['to', 'from', 'subject', ['html', 'text']]  // html OR text
    }
  ]

  // 3. Check each API call
  for (const contract of apiContracts) {
    const matches = [...fileContent.matchAll(contract.pattern)]

    for (const match of matches) {
      const callIndex = match.index
      const varOrObject = match[1]

      // Determine object definition
      let objectFields
      if (varOrObject === '{') {
        // Inline object
        objectFields = extractInlineObjectFields(callIndex, fileContent)
      } else {
        // Variable reference
        objectFields = assignments[varOrObject] || new Set()
      }

      // Check required fields
      for (const field of contract.required) {
        if (Array.isArray(field)) {
          // OR condition (e.g., html OR text)
          const hasAny = field.some(f => objectFields.has(f))
          if (!hasAny) {
            violations.push({
              type: 'missingField',
              service: contract.service,
              file: filePath,
              lineNo: getLineNumber(fileContent, callIndex),
              fieldPath: field.join(' OR '),
              recommendedFix: `Ensure one of [${field.join(', ')}] is set before ${contract.operation} call.`
            })
          }
        } else {
          // Single required field
          if (!objectFields.has(field)) {
            violations.push({
              type: 'missingField',
              service: contract.service,
              file: filePath,
              lineNo: getLineNumber(fileContent, callIndex),
              fieldPath: field,
              recommendedFix: `Ensure required ${contract.service} field '${field}' is set before ${contract.operation} call.`
            })
          }
        }
      }
    }
  }

  return violations
}

function extractVariableAssignments(ast) {
  const assignments = {}

  // Walk AST to find: const varName = { field1, field2, ... }
  walkAST(ast, (node) => {
    if (node.type === 'VariableDeclaration') {
      for (const declarator of node.declarations) {
        if (declarator.init?.type === 'ObjectExpression') {
          const fields = new Set()
          for (const prop of declarator.init.properties) {
            if (prop.type === 'Property') {
              fields.add(prop.key.name)
            } else if (prop.type === 'SpreadElement') {
              // Handle spread: { ...baseData }
              const spreadVar = prop.argument.name
              if (assignments[spreadVar]) {
                assignments[spreadVar].forEach(f => fields.add(f))
              }
            }
          }
          assignments[declarator.id.name] = fields
        }
      }
    }
  })

  return assignments
}

function extractInlineObjectFields(startIndex, fileContent) {
  // Parse inline object: { to_address, from_address, ... }
  const objectMatch = fileContent.slice(startIndex).match(/\{([^}]+)\}/)
  if (!objectMatch) return new Set()

  const fields = new Set()
  const props = objectMatch[1].split(',')

  for (const prop of props) {
    const fieldMatch = prop.trim().match(/^(\w+)/)
    if (fieldMatch) fields.add(fieldMatch[1])
  }

  return fields
}
```

---

## 5. DECISION TABLE

| File/Path | Scanned? | Reason |
|-----------|----------|--------|
| `netlify/functions/easypostWebhook.ts` | ✅ YES | Matches webhook pattern, has signature verification |
| `src/pages/api/webhooks.ts` | ✅ YES | Explicit webhook ingress path |
| `netlify/functions/emailEvents.ts` | ✅ YES | Provider event handler (Resend) |
| `netlify/functions/stripe-shipping-webhook.ts` | ✅ YES | Matches webhook pattern |
| `netlify/functions/stripeWebhook/stripeWebhook.mjs` | ✅ YES | Webhook handler in subdirectory |
| `packages/sanity-config/src/schemaTypes/documents/order.tsx` | ❌ NO | Schema file, not executable handler |
| `packages/sanity-config/src/schemaTypes/documents/stripeWebhook.ts` | ❌ NO | Schema type definition |
| `packages/sanity-config/src/schemaTypes/documents/stripeWebhookEvent.ts` | ❌ NO | Schema type definition |
| `packages/sanity-config/src/schemaTypes/documents/easypostWebhookEvent.ts` | ❌ NO | Schema type definition |
| `packages/sanity-config/src/types/order.ts` | ❌ NO | Type definition |
| `netlify/lib/stripeCustomerAliases.ts` | ❌ NO | Utility library, not ingress point |
| `packages/sanity-config/src/components/studio/AdminTools.tsx` | ❌ NO | UI component |
| `packages/sanity-config/src/autoMapper/ui/WebhookTesterTool.tsx` | ❌ NO | UI tool component |
| `tools/unified-audit/cli.mjs` | ❌ NO | CLI tool, not webhook handler |
| `scripts/test-webhook.js` | ❌ NO | Test script |
| `scripts/stripe-maintenance/test-webhook.js` | ❌ NO | Test script |
| `netlify/lib/backfills/refunds.ts` | ❌ NO | Backfill utility script |
| `netlify/lib/backfills/checkoutAsyncPayments.ts` | ❌ NO | Backfill utility script |
| `packages/sanity-config/src/utils/emailService.ts` | ❌ NO | Service utility |
| `packages/sanity-config/src/views/orderView.tsx` | ❌ NO | View component |
| `packages/sanity-config/src/desk/deskStructure.ts` | ❌ NO | Desk configuration |
| `src/pages/api/status.ts` | ❌ NO | Status endpoint, no webhook signature |
| `netlify/functions/createRefund.ts` | ❌ NO | Action endpoint, not webhook |
| `netlify/functions/fulfillOrder.ts` | ⚠️ PARTIAL | API contract check only (not webhook) |
| `netlify/functions/send-email-test.ts` | ⚠️ PARTIAL | API contract check only |

---

## 6. MIGRATION STRATEGY

### 6.1 Why False Positives Were Reduced

**Previous Approach:**
- Keyword matching: `/webhook/i` in file content
- No path discrimination
- No exclusion rules
- No code structure analysis

**Result:** 52 findings, ~90% false positive rate

**Issues:**
- Schema files defining `stripeWebhook` document types flagged
- Type definitions importing webhook types flagged
- UI components displaying webhook data flagged
- Documentation and test utilities flagged
- Backfill scripts and tools flagged

**New Approach:**
1. **Path-first classification** — Known webhook ingress points
2. **Code structure analysis** — Handler signatures + signature verification
3. **Strict exclusions** — Remove non-executable files
4. **Context-aware detection** — Only flag when side-effects exist

**Expected Result:** ≤8 findings, <10% false positive rate

### 6.2 Phased Rollout

#### Phase 1: Deploy Tightened Scanner (Immediate)
- Implement all detection rules per this codex
- Set scanner to **WARN** mode
- Generate reports but don't block CI
- Monitor for 3 consecutive clean runs

#### Phase 2: Promote to Blocking (After 3 Clean Runs)
- Upgrade webhook-drift from WARN to FAIL
- Block merges on idempotency violations
- Require fixes before merge approval

#### Phase 3: Full Enforcement (After 10 Clean Runs)
- All violations block merge
- API contract violations enforced
- Scanner becomes source of truth

---

## 7. IMPLEMENTATION TASKS

### Task 1: Create Webhook Handler Classifier
**File:** `tools/unified-audit/lib/classifiers/webhook-handler.mjs`

**Functions:**
- `isWebhookHandler(filePath, fileContent): boolean`
- `isExcluded(filePath): boolean`

**Tests:**
- Should return true for `netlify/functions/easypostWebhook.ts`
- Should return true for `src/pages/api/webhooks.ts`
- Should return false for `packages/sanity-config/src/schemaTypes/documents/stripeWebhook.ts`
- Should return false for `tools/unified-audit/cli.mjs`

### Task 2: Create Idempotency Detector
**File:** `tools/unified-audit/lib/detectors/idempotency.mjs`

**Functions:**
- `detectIdempotencyViolation(filePath, fileContent, ast): Violation | null`
- `hasSideEffects(fileContent): boolean`
- `hasIdempotencyGuard(fileContent): boolean`

**Tests:**
- Should flag webhook handler with `sanityClient.create()` and no guard
- Should NOT flag webhook handler with `createIfNotExists()`
- Should NOT flag read-only handlers
- Should NOT flag test endpoints

### Task 3: Create Payload Access Detector
**File:** `tools/unified-audit/lib/detectors/payload-access.mjs`

**Functions:**
- `detectUnsafePayloadAccess(filePath, fileContent, ast): Violation[] | null`
- `findPayloadAccess(fileContent): Match[]`
- `hasValidationBefore(fileContent, index): boolean`

**Tests:**
- Should flag `event.data.object.amount` without validation
- Should NOT flag after `webhookSchema.parse()`
- Should NOT flag after `stripe.webhooks.constructEvent()`
- Should NOT flag non-webhook files

### Task 4: Create API Contract Detector
**File:** `tools/unified-audit/lib/detectors/api-contract.mjs`

**Functions:**
- `detectApiContractViolation(filePath, fileContent, ast): Violation[]`
- `extractVariableAssignments(ast): Map<string, Set<string>>`
- `extractInlineObjectFields(index, fileContent): Set<string>`
- `checkRequiredFields(objectFields, required): Violation[]`

**Tests:**
- Should flag `easypost.Shipment.create()` missing `parcel`
- Should flag `resend.emails.send()` missing `subject`
- Should NOT flag validation files
- Should track variable assignments across spreads

### Task 5: Update Main Scanner
**File:** `tools/unified-audit/lib/scan.mjs`

**Changes:**
- Import all detectors
- Apply `isWebhookHandler()` filter before scanning
- Collect findings from all detectors
- Format output as JSON

### Task 6: Update CI Verdict Logic
**File:** `tools/unified-audit/steps/ci-verdict.mjs`

**Changes:**
- Webhook drift → WARN (not blocking initially)
- API contract violations → FAIL (blocking)
- Add phased enforcement flag

### Task 7: Add Unit Tests
**File:** `tools/unified-audit/test/detectors.test.mjs`

**Test Cases:**
- Webhook handler classification (20 cases)
- Idempotency detection (15 cases)
- Payload access detection (10 cases)
- API contract detection (12 cases)

### Task 8: Update Documentation
**Files:**
- `tools/unified-audit/README.md`
- `docs/mappingTool/README.md`

**Content:**
- Explain tightened rules
- Document exclusion criteria
- Provide example violations and fixes
- Add troubleshooting guide

---

## 8. ACCEPTANCE CRITERIA

Scanner is ready for production when:

1. ✅ `webhook-drift-report.json` contains ≤8 findings
2. ✅ All findings in webhook report are from `netlify/functions/*webhook*.ts` or `src/pages/api/webhooks.ts`
3. ✅ Zero schema files flagged
4. ✅ Zero type definition files flagged
5. ✅ Zero UI component files flagged
6. ✅ Zero tool/script files flagged (except production handlers)
7. ✅ API contract violations reference only actual provider API call sites
8. ✅ CI verdict fails ONLY on actionable violations
9. ✅ All unit tests pass
10. ✅ Documentation updated

---

## 9. EXAMPLE VIOLATIONS & FIXES

### Example 1: Missing Idempotency Guard

**Violation:**
```typescript
// File: netlify/functions/easypostWebhook.ts
export default async function handler(req, res) {
  const signature = req.headers['x-easypost-signature']
  const event = verifySignature(req.body, signature)

  // ❌ No idempotency check
  await sanityClient.create({
    _type: 'shipment',
    trackingCode: event.data.object.tracking_code
  })

  return { statusCode: 200 }
}
```

**Fix:**
```typescript
export default async function handler(req, res) {
  const signature = req.headers['x-easypost-signature']
  const event = verifySignature(req.body, signature)

  // ✅ Idempotency guard
  await sanityClient.createIfNotExists({
    _id: `easypost-event.${event.id}`,
    _type: 'easypostWebhookEvent',
    eventId: event.id,
    eventType: event.type,
    processedAt: new Date().toISOString()
  })

  await sanityClient.create({
    _type: 'shipment',
    trackingCode: event.data.object.tracking_code,
    sourceEventId: event.id
  })

  return { statusCode: 200 }
}
```

### Example 2: Unsafe Payload Access

**Violation:**
```typescript
// File: src/pages/api/webhooks.ts
const event = stripe.webhooks.constructEvent(body, signature, secret)

// ❌ Direct access without validation
const amount = event.data.object.amount_total
const email = event.data.object.customer_details.email
```

**Fix:**
```typescript
const event = stripe.webhooks.constructEvent(body, signature, secret)

// ✅ Validate and narrow type
const session = event.data.object as Stripe.Checkout.Session
if (session.object !== 'checkout.session') {
  throw new Error('Invalid object type')
}

const amount = session.amount_total
const email = session.customer_details?.email
```

### Example 3: Missing API Contract Field

**Violation:**
```typescript
// File: netlify/functions/fulfillOrder.ts
const shipmentData = {
  to_address: toAddress,
  from_address: fromAddress,
  // ❌ Missing required field: parcel
}

const shipment = await easypost.Shipment.create(shipmentData)
```

**Fix:**
```typescript
const shipmentData = {
  to_address: toAddress,
  from_address: fromAddress,
  parcel: {  // ✅ Added required field
    length: 10,
    width: 8,
    height: 6,
    weight: 16
  }
}

const shipment = await easypost.Shipment.create(shipmentData)
```

---

## 10. TROUBLESHOOTING GUIDE

### Issue: False Positive on Schema File

**Symptom:** Scanner flags `packages/sanity-config/src/schemaTypes/documents/stripeWebhook.ts`

**Cause:** Exclusion pattern not applied

**Fix:** Verify `isExcluded()` function includes `/packages\/sanity-config\//`

### Issue: Missing Idempotency Violation Not Detected

**Symptom:** Webhook handler with side-effects not flagged

**Cause:** Handler not classified as webhook, or side-effect pattern not matched

**Debug:**
1. Check `isWebhookHandler()` returns true for file
2. Verify side-effect pattern matches actual code
3. Ensure guard pattern doesn't false-match comments

### Issue: API Contract False Positive

**Symptom:** Scanner flags complete API call as missing fields

**Cause:** Variable assignment tracking failed, or spread operator not resolved

**Debug:**
1. Check `extractVariableAssignments()` captures all assignments
2. Verify spread operator resolution
3. Ensure inline object parsing works correctly

---

## 11. REFERENCE LINKS

- [Stripe Webhook Best Practices](https://stripe.com/docs/webhooks/best-practices)
- [EasyPost Webhooks Documentation](https://www.easypost.com/docs/api#webhooks)
- [Resend API Reference](https://resend.com/docs/api-reference/emails/send-email)
- [Sanity createIfNotExists](https://www.sanity.io/docs/js-client#createifnotexists)

---

## 12. FINAL AUTHORITY

This codex is the authoritative implementation guide for the tightened scanner. All implementation decisions must align with the rules, patterns, and pseudocode defined herein.

**Deviations require explicit approval.**

**Proceed with implementation.**

---

**END CODEX**
