# API-DOCUMENTATION.md - Comprehensive API Reference

Description: Complete API reference documentation for all exported classes, interfaces, and types. Includes SchemaScanner, FieldMatcher, ConfidenceScorer, MappingEngine, StripeConnector, and NLPParser APIs with detailed examples and error handling.
Category: technical
Version: 1.0.0
Tags: api, documentation, reference, typescript, integration

---


API Documentation

Comprehensive API reference for all exported classes, interfaces, and types. This document provides detailed information about constructor parameters, public methods, properties, events, and common use cases.

Table of Contents

SchemaScanner API

FieldMatcher API

ConfidenceScorer API

MappingEngine API

StripeConnector API

NLPParser API

Interfaces and Types

Error Handling

Common Use Cases

1. SchemaScanner API

The SchemaScanner class analyzes and extracts metadata from schema definitions, providing insights into field types, validation rules, and relationships.

Constructor

constructor(options?: SchemaScannerOptions)

interface SchemaScannerOptions {
  maxDepth?: number;           // Maximum recursion depth (default: 10)
  includeHidden?: boolean;     // Include hidden fields (default: false)
  cacheResults?: boolean;      // Enable result caching (default: true)
  strictMode?: boolean;        // Throw on invalid schemas (default: false)
}

Properties

readonly options: SchemaScannerOptions
readonly cache: Map<string, SchemaMetadata>
readonly version: string

Public Methods

scan()

Scans a schema definition and returns comprehensive metadata.

scan(schema: SchemaDefinition): SchemaMetadata

// Parameters:
// - schema: The schema definition object to scan

// Returns: SchemaMetadata object containing:
// - fields: Array of field metadata
// - types: Map of custom types
// - validations: Validation rules per field
// - relationships: Reference relationships

// Example:
const scanner = new SchemaScanner({ maxDepth: 5 });
const metadata = scanner.scan(mySchema);

console.log(metadata.fields);
// [
//   {
//     name: 'title',
//     type: 'string',
//     required: true,
//     maxLength: 120
//   },
//   ...
// ]

getFieldByPath()

Retrieves field metadata by dot-notation path.

getFieldByPath(path: string, metadata: SchemaMetadata): FieldMetadata | null

// Parameters:
// - path: Dot-notation path (e.g., 'author.name', 'items[].title')
// - metadata: Schema metadata from scan()

// Returns: FieldMetadata or null if not found

// Example:
const field = scanner.getFieldByPath('author.name', metadata);
if (field) {
  console.log(`Type: ${field.type}, Required: ${field.required}`);
}

extractValidations()

Extracts all validation rules from a field definition.

extractValidations(field: FieldDefinition): ValidationRule[]

// Parameters:
// - field: Field definition object

// Returns: Array of validation rules

// Example:
const rules = scanner.extractValidations(fieldDef);
rules.forEach(rule => {
  console.log(`${rule.type}: ${rule.constraint}`);
});
// Output:
// required: true
// maximum: 120
// pattern: ^[a-zA-Z0-9-]+$

findReferences()

Finds all reference fields and their target types.

findReferences(metadata: SchemaMetadata): ReferenceMap

// Parameters:
// - metadata: Schema metadata from scan()

// Returns: Map of field paths to reference targets

// Example:
const refs = scanner.findReferences(metadata);
console.log(refs);
// Map {
//   'author' => ['person', 'organization'],
//   'categories[]' => ['category'],
//   'relatedPosts[]' => ['post']
// }

Events

scanner.on('scan:start', (schema: SchemaDefinition) => void)
scanner.on('scan:complete', (metadata: SchemaMetadata) => void)
scanner.on('scan:error', (error: Error) => void)
scanner.on('field:discovered', (field: FieldMetadata) => void)

// Example:
scanner.on('field:discovered', (field) => {
  console.log(`Found field: ${field.name} (${field.type})`);
});

2. FieldMatcher API

The FieldMatcher class provides intelligent field matching between source and target schemas using semantic analysis and pattern matching.

Constructor

constructor(options?: FieldMatcherOptions)

interface FieldMatcherOptions {
  minConfidence?: number;        // Minimum match confidence (0-1, default: 0.6)
  useSemanticMatch?: boolean;    // Enable semantic matching (default: true)
  caseSensitive?: boolean;       // Case-sensitive matching (default: false)
  fuzzyThreshold?: number;       // Fuzzy match threshold (default: 0.8)
  customRules?: MatchRule[];     // Custom matching rules
}

Properties

readonly options: FieldMatcherOptions
readonly matchHistory: MatchRecord[]
readonly statistics: MatchStatistics

Public Methods

match()

Finds the best matching target field for a source field.

match(
  sourceField: FieldMetadata,
  targetFields: FieldMetadata[]
): FieldMatch | null

// Parameters:
// - sourceField: Source field to match
// - targetFields: Array of potential target fields

// Returns: Best match with confidence score, or null

// Example:
const matcher = new FieldMatcher({ minConfidence: 0.7 });
const match = matcher.match(sourceField, targetFields);

if (match) {
  console.log(`Matched ${match.source.name} -> ${match.target.name}`);
  console.log(`Confidence: ${match.confidence}`);
  console.log(`Reason: ${match.reason}`);
}

matchAll()

Matches all source fields to target fields in batch.

matchAll(
  sourceFields: FieldMetadata[],
  targetFields: FieldMetadata[]
): FieldMatch[]

// Parameters:
// - sourceFields: Array of source fields
// - targetFields: Array of target fields

// Returns: Array of matches (excludes unmatched fields)

// Example:
const matches = matcher.matchAll(sourceSchema.fields, targetSchema.fields);

matches.forEach(match => {
  console.log(`${match.source.name} -> ${match.target.name} (${match.confidence})`);
});

// Output:
// firstName -> first_name (0.95)
// email -> emailAddress (0.88)
// phone -> phoneNumber (0.92)

addCustomRule()

Adds a custom matching rule for domain-specific logic.

addCustomRule(rule: MatchRule): void

interface MatchRule {
  name: string;
  priority: number;              // Higher = evaluated first
  condition: (source: FieldMetadata, target: FieldMetadata) => boolean;
  confidence: number;            // Confidence if matched (0-1)
}

// Example:
matcher.addCustomRule({
  name: 'stripe-customer-id',
  priority: 100,
  condition: (src, tgt) => {
    return src.name === 'customerId' && 
           tgt.name === 'stripeCustomerId' &&
           src.type === 'string';
  },
  confidence: 1.0
});

getMatchStatistics()

Returns statistics about matching performance.

getMatchStatistics(): MatchStatistics

// Returns:
// - totalMatches: Total number of matches performed
// - successRate: Percentage of successful matches
// - averageConfidence: Mean confidence score
// - matchesByType: Breakdown by field type

// Example:
const stats = matcher.getMatchStatistics();
console.log(`Success rate: ${stats.successRate}%`);
console.log(`Average confidence: ${stats.averageConfidence}`);

Events

matcher.on('match:found', (match: FieldMatch) => void)
matcher.on('match:failed', (field: FieldMetadata) => void)
matcher.on('match:ambiguous', (candidates: FieldMatch[]) => void)

// Example:
matcher.on('match:ambiguous', (candidates) => {
  console.warn(`Multiple matches found for ${candidates[0].source.name}:`);
  candidates.forEach(c => console.log(`  - ${c.target.name} (${c.confidence})`));
});

3. ConfidenceScorer API

The ConfidenceScorer class calculates confidence scores for field matches using multiple scoring algorithms and weighted factors.

Constructor

constructor(options?: ConfidenceScorerOptions)

interface ConfidenceScorerOptions {
  weights?: ScoreWeights;        // Custom weight configuration
  algorithm?: 'weighted' | 'ml' | 'hybrid';  // Scoring algorithm
  learningEnabled?: boolean;     // Enable ML learning (default: false)
}

Properties

readonly weights: ScoreWeights
readonly algorithm: string
readonly model: MLModel | null

Public Methods

score()

Calculates a confidence score for a field match.

score(
  sourceField: FieldMetadata,
  targetField: FieldMetadata,
  context?: ScoringContext
): ConfidenceScore

// Parameters:
// - sourceField: Source field metadata
// - targetField: Target field metadata
// - context: Optional context (schema, domain, history)

// Returns: ConfidenceScore with breakdown

// Example:
const scorer = new ConfidenceScorer({
  weights: {
    nameMatch: 0.4,
    typeMatch: 0.3,
    semanticMatch: 0.2,
    structureMatch: 0.1
  }
});

const score = scorer.score(sourceField, targetField);
console.log(`Overall: ${score.overall}`);
console.log(`Breakdown:`, score.breakdown);
// {
//   nameMatch: 0.85,
//   typeMatch: 1.0,
//   semanticMatch: 0.75,
//   structureMatch: 0.9
// }

scoreMultiple()

Scores multiple candidate matches and returns ranked results.

scoreMultiple(
  sourceField: FieldMetadata,
  candidates: FieldMetadata[],
  context?: ScoringContext
): RankedScore[]

// Parameters:
// - sourceField: Source field to match
// - candidates: Array of potential target fields
// - context: Optional scoring context

// Returns: Array of scores sorted by confidence (descending)

// Example:
const ranked = scorer.scoreMultiple(sourceField, targetFields);
ranked.forEach((item, index) => {
  console.log(`${index + 1}. ${item.field.name}: ${item.score.overall}`);
});

setWeights()

Updates scoring weights dynamically.

setWeights(weights: Partial<ScoreWeights>): void

interface ScoreWeights {
  nameMatch: number;         // Weight for name similarity (0-1)
  typeMatch: number;         // Weight for type compatibility (0-1)
  semanticMatch: number;     // Weight for semantic similarity (0-1)
  structureMatch: number;    // Weight for structure similarity (0-1)
  validationMatch: number;   // Weight for validation rules (0-1)
}

// Example:
scorer.setWeights({
  nameMatch: 0.5,
  typeMatch: 0.5
});

train()

Trains the ML model with labeled examples (when ML algorithm is enabled).

train(examples: TrainingExample[]): Promise<TrainingResult>

interface TrainingExample {
  source: FieldMetadata;
  target: FieldMetadata;
  isMatch: boolean;          // True if correct match
  confidence?: number;       // Optional confidence label
}

// Example:
await scorer.train([
  {
    source: { name: 'email', type: 'string' },
    target: { name: 'emailAddress', type: 'string' },
    isMatch: true,
    confidence: 0.95
  },
  // ... more examples
]);

Events

scorer.on('score:calculated', (result: ConfidenceScore) => void)
scorer.on('weights:updated', (weights: ScoreWeights) => void)
scorer.on('training:complete', (result: TrainingResult) => void)

4. MappingEngine API

The MappingEngine class orchestrates the complete mapping process, coordinating schema scanning, field matching, and transformation generation.

Constructor

constructor(options?: MappingEngineOptions)

interface MappingEngineOptions {
  scanner?: SchemaScanner;       // Custom scanner instance
  matcher?: FieldMatcher;        // Custom matcher instance
  scorer?: ConfidenceScorer;     // Custom scorer instance
  autoValidate?: boolean;        // Auto-validate mappings (default: true)
  generateTransforms?: boolean;  // Generate transform functions (default: true)
}

Properties

readonly scanner: SchemaScanner
readonly matcher: FieldMatcher
readonly scorer: ConfidenceScorer
readonly mappings: MappingRegistry

Public Methods

createMapping()

Creates a complete mapping between source and target schemas.

createMapping(
  sourceSchema: SchemaDefinition,
  targetSchema: SchemaDefinition,
  options?: MappingOptions
): Promise<Mapping>

// Parameters:
// - sourceSchema: Source schema definition
// - targetSchema: Target schema definition
// - options: Optional mapping configuration

// Returns: Complete mapping with field matches and transforms

// Example:
const engine = new MappingEngine();
const mapping = await engine.createMapping(
  stripeSchema,
  sanitySchema,
  {
    minConfidence: 0.7,
    includeUnmatched: true,
    generateDocs: true
  }
);

console.log(`Mapped ${mapping.matches.length} fields`);
console.log(`Unmatched: ${mapping.unmatched.length}`);
console.log(`Confidence: ${mapping.averageConfidence}`);

applyMapping()

Applies a mapping to transform source data to target format.

applyMapping(
  data: any,
  mapping: Mapping,
  options?: TransformOptions
): Promise<any>

// Parameters:
// - data: Source data object
// - mapping: Mapping definition from createMapping()
// - options: Transform options (strict mode, error handling)

// Returns: Transformed data in target format

// Example:
const stripeCustomer = {
  id: 'cus_123',
  email: 'user@example.com',
  name: 'John Doe',
  created: 1234567890
};

const sanityDoc = await engine.applyMapping(
  stripeCustomer,
  mapping,
  { strict: false }
);

console.log(sanityDoc);
// {
//   _type: 'customer',
//   stripeId: 'cus_123',
//   email: 'user@example.com',
//   fullName: 'John Doe',
//   createdAt: '2009-02-13T23:31:30.000Z'
// }

validateMapping()

Validates a mapping for completeness and correctness.

validateMapping(mapping: Mapping): ValidationResult

// Parameters:
// - mapping: Mapping to validate

// Returns: Validation result with errors and warnings

// Example:
const validation = engine.validateMapping(mapping);

if (!validation.valid) {
  console.error('Mapping validation failed:');
  validation.errors.forEach(err => {
    console.error(`  - ${err.field}: ${err.message}`);
  });
}

if (validation.warnings.length > 0) {
  console.warn('Warnings:');
  validation.warnings.forEach(warn => {
    console.warn(`  - ${warn.field}: ${warn.message}`);
  });
}

saveMapping()

Saves a mapping to the registry for reuse.

saveMapping(name: string, mapping: Mapping): void

// Parameters:
// - name: Unique identifier for the mapping
// - mapping: Mapping to save

// Example:
engine.saveMapping('stripe-to-sanity-customer', mapping);

loadMapping()

Loads a saved mapping from the registry.

loadMapping(name: string): Mapping | null

// Parameters:
// - name: Mapping identifier

// Returns: Mapping or null if not found

// Example:
const mapping = engine.loadMapping('stripe-to-sanity-customer');
if (mapping) {
  const transformed = await engine.applyMapping(data, mapping);
}

exportMapping()

Exports a mapping to JSON format for persistence or sharing.

exportMapping(mapping: Mapping, format?: 'json' | 'yaml'): string

// Parameters:
// - mapping: Mapping to export
// - format: Output format (default: 'json')

// Returns: Serialized mapping

// Example:
const json = engine.exportMapping(mapping);
fs.writeFileSync('mapping.json', json);

importMapping()

Imports a mapping from JSON or YAML format.

importMapping(data: string, format?: 'json' | 'yaml'): Mapping

// Parameters:
// - data: Serialized mapping data
// - format: Input format (default: 'json')

// Returns: Parsed mapping

// Example:
const json = fs.readFileSync('mapping.json', 'utf-8');
const mapping = engine.importMapping(json);

Events

engine.on('mapping:created', (mapping: Mapping) => void)
engine.on('mapping:applied', (result: TransformResult) => void)
engine.on('mapping:validated', (result: ValidationResult) => void)
engine.on('transform:error', (error: TransformError) => void)

// Example:
engine.on('transform:error', (error) => {
  console.error(`Transform failed for field ${error.field}:`);
  console.error(error.message);
  console.error(`Source value:`, error.sourceValue);
});

5. StripeConnector API

The StripeConnector class provides integration with Stripe API, handling authentication, data fetching, and webhook processing.

Constructor

constructor(options: StripeConnectorOptions)

interface StripeConnectorOptions {
  apiKey: string;                // Stripe secret key (required)
  apiVersion?: string;           // API version (default: latest)
  maxRetries?: number;           // Max retry attempts (default: 3)
  timeout?: number;              // Request timeout in ms (default: 30000)
  webhookSecret?: string;        // Webhook signing secret
}

Properties

readonly stripe: Stripe              // Stripe SDK instance
readonly apiVersion: string
readonly isConnected: boolean

Public Methods

connect()

Establishes connection and validates credentials.

connect(): Promise<ConnectionResult>

// Returns: Connection status and account info

// Example:
const connector = new StripeConnector({
  apiKey: process.env.STRIPE_SECRET_KEY
});

const result = await connector.connect();
if (result.success) {
  console.log(`Connected to Stripe account: ${result.accountId}`);
} else {
  console.error(`Connection failed: ${result.error}`);
}

fetchCustomers()

Fetches customer data with pagination support.

fetchCustomers(options?: FetchOptions): Promise<Customer[]>

interface FetchOptions {
  limit?: number;                // Results per page (max: 100)
  startingAfter?: string;        // Cursor for pagination
  endingBefore?: string;         // Cursor for reverse pagination
  created?: DateFilter;          // Filter by creation date
  email?: string;                // Filter by email
}

// Example:
const customers = await connector.fetchCustomers({
  limit: 50,
  created: { gte: '2024-01-01' }
});

console.log(`Fetched ${customers.length} customers`);

fetchSubscriptions()

Fetches subscription data with filtering.

fetchSubscriptions(options?: FetchOptions): Promise<Subscription[]>

// Example:
const activeSubscriptions = await connector.fetchSubscriptions({
  status: 'active',
  limit: 100
});

fetchProducts()

Fetches product catalog data.

fetchProducts(options?: FetchOptions): Promise<Product[]>

// Example:
const products = await connector.fetchProducts({
  active: true,
  limit: 50
});

fetchInvoices()

Fetches invoice data with filtering.

fetchInvoices(options?: FetchOptions): Promise<Invoice[]>

// Example:
const unpaidInvoices = await connector.fetchInvoices({
  status: 'open',
  customer: 'cus_123'
});

streamData()

Streams data in batches for large datasets.

streamData(
  resource: 'customers' | 'subscriptions' | 'products' | 'invoices',
  options?: StreamOptions
): AsyncIterableIterator<any[]>

// Parameters:
// - resource: Stripe resource type
// - options: Streaming configuration

// Returns: Async iterator yielding batches

// Example:
for await (const batch of connector.streamData('customers', { batchSize: 100 })) {
  console.log(`Processing batch of ${batch.length} customers`);
  await processBatch(batch);
}

handleWebhook()

Processes and validates Stripe webhook events.

handleWebhook(
  payload: string | Buffer,
  signature: string
): WebhookEvent

// Parameters:
// - payload: Raw webhook payload
// - signature: Stripe-Signature header value

// Returns: Validated webhook event
// Throws: Error if signature validation fails

// Example:
app.post('/webhook', (req, res) => {
  const signature = req.headers['stripe-signature'];
  
  try {
    const event = connector.handleWebhook(req.body, signature);
    
    switch (event.type) {
      case 'customer.created':
        await handleCustomerCreated(event.data.object);
        break;
      case 'subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
    }
    
    res.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

getSchema()

Returns the schema definition for a Stripe resource.

getSchema(resource: string): SchemaDefinition

// Parameters:
// - resource: Stripe resource type

// Returns: Schema definition for the resource

// Example:
const customerSchema = connector.getSchema('customer');
console.log(customerSchema.fields);

Events

connector.on('connected', (account: Account) => void)
connector.on('disconnected', () => void)
connector.on('data:fetched', (resource: string, count: number) => void)
connector.on('webhook:received', (event: WebhookEvent) => void)
connector.on('error', (error: Error) => void)

// Example:
connector.on('data:fetched', (resource, count) => {
  console.log(`Fetched ${count} ${resource}`);
});

6. NLPParser API

The NLPParser class provides natural language processing capabilities for semantic field matching and text analysis.

Constructor

constructor(options?: NLPParserOptions)

interface NLPParserOptions {
  model?: 'basic' | 'advanced';  // NLP model complexity
  language?: string;             // Language code (default: 'en')
  cacheSize?: number;            // Embedding cache size (default: 1000)
  customDictionary?: string[];   // Domain-specific terms
}

Properties

readonly model: string
readonly language: string
readonly dictionary: Set<string>

Public Methods

tokenize()

Tokenizes text into individual tokens.

tokenize(text: string): string[]

// Parameters:
// - text: Input text to tokenize

// Returns: Array of tokens

// Example:
const parser = new NLPParser();
const tokens = parser.tokenize('customerEmailAddress');
console.log(tokens);
// ['customer', 'email', 'address']

stem()

Reduces words to their root form.

stem(word: string): string

// Parameters:
// - word: Word to stem

// Returns: Stemmed word

// Example:
console.log(parser.stem('running'));  // 'run'
console.log(parser.stem('addresses')); // 'address'

similarity()

Calculates semantic similarity between two texts.

similarity(text1: string, text2: string): number

// Parameters:
// - text1: First text
// - text2: Second text

// Returns: Similarity score (0-1)

// Example:
const score = parser.similarity('email', 'emailAddress');
console.log(score); // 0.85

const score2 = parser.similarity('customer', 'user');
console.log(score2); // 0.72

embed()

Generates vector embedding for text.

embed(text: string): Promise<number[]>

// Parameters:
// - text: Text to embed

// Returns: Vector embedding (array of numbers)

// Example:
const embedding = await parser.embed('customer email address');
console.log(embedding.length); // 384 (dimension depends on model)

cosineSimilarity()

Calculates cosine similarity between two embeddings.

cosineSimilarity(embedding1: number[], embedding2: number[]): number

// Parameters:
// - embedding1: First embedding vector
// - embedding2: Second embedding vector

// Returns: Cosine similarity (-1 to 1)

// Example:
const emb1 = await parser.embed('email');
const emb2 = await parser.embed('emailAddress');
const similarity = parser.cosineSimilarity(emb1, emb2);
console.log(similarity); // 0.92

extractKeywords()

Extracts important keywords from text.

extractKeywords(text: string, limit?: number): string[]

// Parameters:
// - text: Input text
// - limit: Maximum keywords to return (default: 10)

// Returns: Array of keywords sorted by importance

// Example:
const keywords = parser.extractKeywords(
  'Customer email address for billing notifications',
  3
);
console.log(keywords);
// ['customer', 'email', 'billing']

addToDictionary()

Adds domain-specific terms to the dictionary.

addToDictionary(terms: string[]): void

// Parameters:
// - terms: Array of terms to add

// Example:
parser.addToDictionary([
  'stripe',
  'sanity',
  'webhook',
  'metadata'
]);

Events

parser.on('embedding:cached', (text: string) => void)
parser.on('dictionary:updated', (size: number) => void)

7. Interfaces and Types

Core interfaces and type definitions used throughout the API.

SchemaDefinition

interface SchemaDefinition {
  name: string;
  type: 'document' | 'object';
  fields: FieldDefinition[];
  title?: string;
  description?: string;
  preview?: PreviewConfig;
  orderings?: OrderingConfig[];
}

FieldDefinition

interface FieldDefinition {
  name: string;
  type: string;
  title?: string;
  description?: string;
  validation?: ValidationRule[];
  options?: FieldOptions;
  hidden?: boolean;
  readOnly?: boolean;
  initialValue?: any;
  of?: FieldDefinition[];        // For arrays
  to?: ReferenceTarget[];        // For references
  fields?: FieldDefinition[];    // For objects
}

FieldMetadata

interface FieldMetadata {
  name: string;
  type: string;
  path: string;
  required: boolean;
  array: boolean;
  reference: boolean;
  referenceTypes?: string[];
  validation: ValidationRule[];
  description?: string;
  defaultValue?: any;
  nested?: FieldMetadata[];      // For objects and arrays
}

ValidationRule

interface ValidationRule {
  type: 'required' | 'maximum' | 'minimum' | 'pattern' | 'custom' | 'enum';
  level: 'error' | 'warning';
  constraint?: any;
  message?: string;
}

FieldMatch

interface FieldMatch {
  source: FieldMetadata;
  target: FieldMetadata;
  confidence: number;
  reason: string;
  transform?: TransformFunction;
  warnings?: string[];
}

Mapping

interface Mapping {
  id: string;
  name: string;
  sourceSchema: SchemaMetadata;
  targetSchema: SchemaMetadata;
  matches: FieldMatch[];
  unmatched: FieldMetadata[];
  averageConfidence: number;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

TransformFunction

type TransformFunction = (
  value: any,
  context: TransformContext
) => any | Promise<any>;

interface TransformContext {
  sourceField: FieldMetadata;
  targetField: FieldMetadata;
  sourceData: any;
  targetData: any;
  options: TransformOptions;
}

ConfidenceScore

interface ConfidenceScore {
  overall: number;               // Overall confidence (0-1)
  breakdown: {
    nameMatch: number;
    typeMatch: number;
    semanticMatch: number;
    structureMatch: number;
    validationMatch: number;
  };
  factors: string[];             // Contributing factors
}

ValidationResult

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  coverage: number;              // Percentage of fields mapped (0-1)
  completeness: number;          // Percentage of required fields mapped (0-1)
}

interface ValidationError {
  field: string;
  message: string;
  code: string;
  severity: 'error';
}

interface ValidationWarning {
  field: string;
  message: string;
  code: string;
  severity: 'warning';
}

WebhookEvent

interface WebhookEvent {
  id: string;
  type: string;
  data: {
    object: any;
    previous_attributes?: any;
  };
  created: number;
  livemode: boolean;
  api_version: string;
}

8. Error Handling

Comprehensive error handling patterns and custom error types.

Error Types

// Base error class
class MappingError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'MappingError';
  }
}

// Schema-related errors
class SchemaError extends MappingError {
  constructor(message: string, details?: any) {
    super(message, 'SCHEMA_ERROR', details);
    this.name = 'SchemaError';
  }
}

// Field matching errors
class MatchError extends MappingError {
  constructor(message: string, details?: any) {
    super(message, 'MATCH_ERROR', details);
    this.name = 'MatchError';
  }
}

// Transformation errors
class TransformError extends MappingError {
  constructor(
    message: string,
    public field: string,
    public sourceValue: any,
    details?: any
  ) {
    super(message, 'TRANSFORM_ERROR', details);
    this.name = 'TransformError';
  }
}

// Validation errors
class ValidationError extends MappingError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

// Connection errors
class ConnectionError extends MappingError {
  constructor(message: string, details?: any) {
    super(message, 'CONNECTION_ERROR', details);
    this.name = 'ConnectionError';
  }
}

Error Handling Patterns

Try-Catch with Specific Error Types

try {
  const mapping = await engine.createMapping(sourceSchema, targetSchema);
} catch (error) {
  if (error instanceof SchemaError) {
    console.error('Schema validation failed:', error.message);
    console.error('Details:', error.details);
  } else if (error instanceof MatchError) {
    console.error('Field matching failed:', error.message);
  } else if (error instanceof ValidationError) {
    console.error('Validation failed:', error.message);
  } else {
    console.error('Unexpected error:', error);
  }
}

Event-Based Error Handling

engine.on('error', (error) => {
  // Log to monitoring service
  logger.error('Mapping engine error', {
    code: error.code,
    message: error.message,
    details: error.details,
    stack: error.stack
  });
  
  // Send alert for critical errors
  if (error.code === 'CONNECTION_ERROR') {
    alerting.send('Critical: Connection lost', error);
  }
});

engine.on('transform:error', (error) => {
  // Handle transformation errors gracefully
  console.warn(`Transform failed for ${error.field}:`, error.message);
  
  // Log for debugging
  logger.debug('Transform error details', {
    field: error.field,
    sourceValue: error.sourceValue,
    targetType: error.details?.targetType
  });
});

Graceful Degradation

async function transformWithFallback(data, mapping) {
  try {
    return await engine.applyMapping(data, mapping, { strict: true });
  } catch (error) {
    if (error instanceof TransformError) {
      console.warn('Strict transform failed, trying lenient mode');
      
      try {
        return await engine.applyMapping(data, mapping, { 
          strict: false,
          skipInvalid: true 
        });
      } catch (fallbackError) {
        console.error('Lenient transform also failed:', fallbackError);
        throw fallbackError;
      }
    }
    throw error;
  }
}

Retry Logic

async function fetchWithRetry(connector, resource, options, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await connector.fetchCustomers(options);
    } catch (error) {
      lastError = error;
      
      if (error instanceof ConnectionError) {
        console.warn(`Attempt ${attempt} failed, retrying...`);
        await sleep(1000 * attempt); // Exponential backoff
      } else {
        // Non-retryable error
        throw error;
      }
    }
  }
  
  throw new Error(`Failed after ${maxRetries} attempts: ${lastError.message}`);
}

Error Codes Reference

enum ErrorCode {
  // Schema errors
  SCHEMA_INVALID = 'SCHEMA_INVALID',
  SCHEMA_NOT_FOUND = 'SCHEMA_NOT_FOUND',
  FIELD_NOT_FOUND = 'FIELD_NOT_FOUND',
  
  // Matching errors
  NO_MATCH_FOUND = 'NO_MATCH_FOUND',
  AMBIGUOUS_MATCH = 'AMBIGUOUS_MATCH',
  LOW_CONFIDENCE = 'LOW_CONFIDENCE',
  
  // Transform errors
  TRANSFORM_FAILED = 'TRANSFORM_FAILED',
  TYPE_MISMATCH = 'TYPE_MISMATCH',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  
  // Connection errors
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  AUTH_FAILED = 'AUTH_FAILED',
  RATE_LIMITED = 'RATE_LIMITED',
  TIMEOUT = 'TIMEOUT',
  
  // Webhook errors
  WEBHOOK_SIGNATURE_INVALID = 'WEBHOOK_SIGNATURE_INVALID',
  WEBHOOK_PAYLOAD_INVALID = 'WEBHOOK_PAYLOAD_INVALID'
}

9. Common Use Cases

Practical examples demonstrating common integration patterns and workflows.

Use Case 1: Stripe to Sanity Customer Sync

import { 
  MappingEngine, 
  StripeConnector, 
  SchemaScanner 
} from '@your-package/api';

// Initialize components
const connector = new StripeConnector({
  apiKey: process.env.STRIPE_SECRET_KEY
});

const engine = new MappingEngine({
  autoValidate: true,
  generateTransforms: true
});

// Connect to Stripe
await connector.connect();

// Get schemas
const stripeSchema = connector.getSchema('customer');
const sanitySchema = getSanitySchema('customer'); // Your Sanity schema

// Create mapping
const mapping = await engine.createMapping(
  stripeSchema,
  sanitySchema,
  { minConfidence: 0.7 }
);

// Validate mapping
const validation = engine.validateMapping(mapping);
if (!validation.valid) {
  console.error('Mapping validation failed');
  validation.errors.forEach(err => console.error(err.message));
  process.exit(1);
}

// Save mapping for reuse
engine.saveMapping('stripe-customer-sync', mapping);

// Fetch and transform customers
for await (const batch of connector.streamData('customers', { batchSize: 50 })) {
  const transformed = await Promise.all(
    batch.map(customer => engine.applyMapping(customer, mapping))
  );
  
  // Import to Sanity
  await sanityClient.transaction(
    transformed.map(doc => sanityClient.createOrReplace(doc))
  ).commit();
  
  console.log(`Synced ${batch.length} customers`);
}

Use Case 2: Real-time Webhook Processing

import express from 'express';
import { StripeConnector, MappingEngine } from '@your-package/api';

const app = express();

const connector = new StripeConnector({
  apiKey: process.env.STRIPE_SECRET_KEY,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET
});

const engine = new MappingEngine();

// Load pre-configured mappings
const customerMapping = engine.loadMapping('stripe-customer-sync');
const subscriptionMapping = engine.loadMapping('stripe-subscription-sync');

app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['stripe-signature'];
  
  try {
    // Validate and parse webhook
    const event = connector.handleWebhook(req.body, signature);
    
    console.log(`Received webhook: ${event.type}`);
    
    // Handle different event types
    switch (event.type) {
      case 'customer.created':
      case 'customer.updated':
        const customer = await engine.applyMapping(
          event.data.object,
          customerMapping
        );
        await sanityClient.createOrReplace(customer);
        break;
        
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        const subscription = await engine.applyMapping(
          event.data.object,
          subscriptionMapping
        );
        await sanityClient.createOrReplace(subscription);
        break;
        
      case 'customer.deleted':
        await sanityClient
          .delete(event.data.object.id)
          .catch(err => console.warn('Delete failed:', err));
        break;
        
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
    
    res.json({ received: true });
  } catch (error) {
    console.error('Webhook processing failed:', error);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
});

app.listen(3000, () => {
  console.log('Webhook server running on port 3000');
});

Use Case 3: Custom Field Matching Rules

import { FieldMatcher, MappingEngine } from '@your-package/api';

// Create matcher with custom rules
const matcher = new FieldMatcher({
  minConfidence: 0.6,
  useSemanticMatch: true
});

// Add domain-specific matching rules
matcher.addCustomRule({
  name: 'stripe-id-fields',
  priority: 100,
  condition: (source, target) => {
    // Match Stripe ID fields to custom Sanity fields
    return source.name === 'id' && 
           target.name.startsWith('stripe') &&
           target.name.endsWith('Id');
  },
  confidence: 1.0
});

matcher.addCustomRule({
  name: 'timestamp-conversion',
  priority: 90,
  condition: (source, target) => {
    // Match Unix timestamps to datetime fields
    return source.type === 'number' &&
           target.type === 'datetime' &&
           (source.name.includes('created') || 
            source.name.includes('updated') ||
            source.name.includes('date'));
  },
  confidence: 0.95
});

matcher.addCustomRule({
  name: 'metadata-objects',
  priority: 80,
  condition: (source, target) => {
    // Match metadata objects
    return source.name === 'metadata' &&
           target.name === 'customMetadata' &&
           source.type === 'object' &&
           target.type === 'object';
  },
  confidence: 0.9
});

// Use custom matcher in engine
const engine = new MappingEngine({ matcher });

const mapping = await engine.createMapping(stripeSchema, sanitySchema);

// Review matches
mapping.matches.forEach(match => {
  console.log(
    `${match.source.name} -> ${match.target.name} ` +
    `(${match.confidence.toFixed(2)}) - ${match.reason}`
  );
});

Use Case 4: Schema Analysis and Reporting

import { SchemaScanner } from '@your-package/api';
import fs from 'fs';

const scanner = new SchemaScanner({
  maxDepth: 10,
  includeHidden: false
});

// Scan schema
const metadata = scanner.scan(mySchema);

// Generate comprehensive report
const report = {
  summary: {
    totalFields: metadata.fields.length,
    requiredFields: metadata.fields.filter(f => f.required).length,
    optionalFields: metadata.fields.filter(f => !f.required).length,
    referenceFields: metadata.fields.filter(f => f.reference).length,
    arrayFields: metadata.fields.filter(f => f.array).length
  },
  
  fieldsByType: metadata.fields.reduce((acc, field) => {
    acc[field.type] = (acc[field.type] || 0) + 1;
    return acc;
  }, {}),
  
  validationRules: metadata.fields.reduce((acc, field) => {
    field.validation.forEach(rule => {
      acc[rule.type] = (acc[rule.type] || 0) + 1;
    });
    return acc;
  }, {}),
  
  references: scanner.findReferences(metadata),
  
  fields: metadata.fields.map(field => ({
    name: field.name,
    type: field.type,
    path: field.path,
    required: field.required,
    description: field.description,
    validations: field.validation.map(v => v.type)
  }))
};

// Export report
fs.writeFileSync(
  'schema-report.json',
  JSON.stringify(report, null, 2)
);

console.log('Schema Analysis Report');
console.log('======================');
console.log(`Total fields: ${report.summary.totalFields}`);
console.log(`Required: ${report.summary.requiredFields}`);
console.log(`Optional: ${report.summary.optionalFields}`);
console.log(`References: ${report.summary.referenceFields}`);
console.log(`Arrays: ${report.summary.arrayFields}`);
console.log('\nField Types:');
Object.entries(report.fieldsByType).forEach(([type, count]) => {
  console.log(`  ${type}: ${count}`);
});

Use Case 5: Batch Import with Progress Tracking

import { MappingEngine, StripeConnector } from '@your-package/api';
import cliProgress from 'cli-progress';

async function batchImport() {
  const connector = new StripeConnector({
    apiKey: process.env.STRIPE_SECRET_KEY
  });
  
  const engine = new MappingEngine();
  const mapping = engine.loadMapping('stripe-customer-sync');
  
  // Initialize progress bar
  const progressBar = new cliProgress.SingleBar({}, 
    cliProgress.Presets.shades_classic
  );
  
  let total = 0;
  let processed = 0;
  let errors = 0;
  
  // Count total records
  console.log('Counting records...');
  const countResult = await connector.stripe.customers.list({ limit: 1 });
  total = countResult.has_more ? 1000 : countResult.data.length; // Estimate
  
  progressBar.start(total, 0);
  
  // Process in batches
  try {
    for await (const batch of connector.streamData('customers', { batchSize: 100 })) {
      const results = await Promise.allSettled(
        batch.map(async (customer) => {
          const transformed = await engine.applyMapping(customer, mapping);
          return sanityClient.createOrReplace(transformed);
        })
      );
      
      // Count successes and failures
      results.forEach(result => {
        if (result.status === 'fulfilled') {
          processed++;
        } else {
          errors++;
          console.error('\nImport error:', result.reason.message);
        }
      });
      
      progressBar.update(processed + errors);
    }
  } finally {
    progressBar.stop();
  }
  
  // Summary
  console.log('\nImport Complete');
  console.log('===============');
  console.log(`Total: ${total}`);
  console.log(`Processed: ${processed}`);
  console.log(`Errors: ${errors}`);
  console.log(`Success rate: ${((processed / total) * 100).toFixed(2)}%`);
}

batchImport().catch(console.error);

Use Case 6: Semantic Field Matching with NLP

import { 
  FieldMatcher, 
  NLPParser, 
  ConfidenceScorer 
} from '@your-package/api';

// Initialize NLP parser with custom dictionary
const parser = new NLPParser({ model: 'advanced' });
parser.addToDictionary([
  'stripe', 'sanity', 'webhook', 'metadata',
  'subscription', 'invoice', 'payment'
]);

// Create custom scorer using NLP
const scorer = new ConfidenceScorer({
  weights: {
    nameMatch: 0.3,
    typeMatch: 0.2,
    semanticMatch: 0.4,  // Higher weight for semantic matching
    structureMatch: 0.1
  }
});

// Create matcher with NLP-enhanced scoring
const matcher = new FieldMatcher({
  minConfidence: 0.65,
  useSemanticMatch: true
});

// Custom semantic matching function
async function semanticMatch(sourceField, targetField) {
  // Tokenize field names
  const sourceTokens = parser.tokenize(sourceField.name);
  const targetTokens = parser.tokenize(targetField.name);
  
  // Calculate token similarity
  const tokenScores = sourceTokens.map(srcToken => {
    return Math.max(...targetTokens.map(tgtToken => 
      parser.similarity(srcToken, tgtToken)
    ));
  });
  
  const avgTokenScore = tokenScores.reduce((a, b) => a + b, 0) / tokenScores.length;
  
  // Calculate embedding similarity
  const srcEmbedding = await parser.embed(sourceField.name);
  const tgtEmbedding = await parser.embed(targetField.name);
  const embeddingScore = parser.cosineSimilarity(srcEmbedding, tgtEmbedding);
  
  // Combine scores
  return (avgTokenScore * 0.4) + (embeddingScore * 0.6);
}

// Use in matching
const matches = await Promise.all(
  sourceFields.map(async (sourceField) => {
    const candidates = await Promise.all(
      targetFields.map(async (targetField) => {
        const semanticScore = await semanticMatch(sourceField, targetField);
        const overallScore = scorer.score(sourceField, targetField);
        
        return {
          target: targetField,
          score: (overallScore.overall * 0.6) + (semanticScore * 0.4)
        };
      })
    );
    
    // Get best match
    const best = candidates.reduce((a, b) => a.score > b.score ? a : b);
    
    if (best.score >= 0.65) {
      return {
        source: sourceField,
        target: best.target,
        confidence: best.score,
        reason: 'Semantic NLP matching'
      };
    }
    
    return null;
  })
);

const validMatches = matches.filter(m => m !== null);
console.log(`Found ${validMatches.length} semantic matches`);

Additional Resources

For more information and examples, refer to:

GitHub Repository: Complete source code and examples

TypeScript Definitions: Full type definitions in the package

Integration Guides: Step-by-step tutorials for common platforms

API Changelog: Version history and breaking changes

Community Forum: Ask questions and share solutions