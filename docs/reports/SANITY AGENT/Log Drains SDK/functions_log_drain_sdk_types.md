/\*\*

- # Functions Log Drain SDK - Types
-
- TypeScript type definitions for the Functions Log Drain SDK. Includes enums, interfaces, and type definitions for log status, metadata, entries, configuration, and all method signatures.
-
- @category operations
- @version v1.0
- @tags typescript, types, sdk, functions, logging, log-drain, type-definitions, interfaces
-
- ## Overview
-
- This module provides comprehensive TypeScript type definitions for the Functions Log Drain SDK. These types ensure type safety and provide IntelliSense support when working with the SDK.
-
- ## Exports
-
- ### Enums
- - `LogStatus` - Log status levels for function execution
-
- ### Type Aliases
- - `LogStatusType` - Log status string literals
-
- ### Core Interfaces
- - `FunctionLogMetadata` - Metadata associated with function log entries
- - `LogEntry` - Individual log entry structure
- - `ErrorDetails` - Detailed error information
- - `FunctionLogDrainConfig` - Configuration options for the Function Log Drain
- - `RetryConfig` - Retry configuration for failed operations
- - `LogOptions` - Options for logging operations
- - `FlushOptions` - Options for flushing log buffer
- - `QueryOptions` - Options for querying logs
-
- ### Parameter Types
- - `InitializeParams` - Parameters for initializing a log drain instance
- - `LogParams` - Parameters for logging a message
- - `LogErrorParams` - Parameters for logging an error
- - `UpdateMetadataParams` - Parameters for updating metadata
- - `BatchLogParams` - Parameters for batch logging
-
- ### Result Types
- - `LogResult` - Result of a log operation
- - `FlushResult` - Result of a flush operation
- - `QueryResult` - Result of a query operation
- - `HealthCheckResult` - Health check result
- - `DrainStatistics` - Statistics about log drain operations
-
- ### Callback & Handler Types
- - `FlushCallback` - Callback invoked when a flush operation completes
- - `ErrorCallback` - Callback invoked when an error occurs
- - `LogTransformer` - Handler for log entry transformation
- - `LogFilter` - Handler for filtering log entries
- - `DrainEventHandler` - Event handler for drain lifecycle events
- - `DrainEvent` - Drain lifecycle events
-
- ### Utility Types
- - `RequiredDeep<T>` - Make all properties required and non-nullable
- - `ReadonlyKeys<T>` - Extract readonly properties
- - `Merge<T, U>` - Merge two types
- - `PartialBy<T, K>` - Make specific properties optional
- - `RequiredBy<T, K>` - Make specific properties required
-
- ### Type Guards
- - `isLogStatus()` - Check if value is a valid LogStatus
- - `isLogEntry()` - Check if value is a LogEntry
- - `isError()` - Check if value is an Error object
- - `isErrorDetails()` - Check if value is ErrorDetails
-
- ### Constants
- - `DEFAULT_CONFIG` - Default configuration values
- - `LOG_LEVEL_PRIORITY` - Log level priority for filtering
- - `LIMITS` - Maximum allowed values
    \*/

# Functions Log Drain SDK - Types

Description: TypeScript type definitions for the Functions Log Drain SDK. Includes enums, interfaces, and type definitions for log status, metadata, entries, configuration, and all method signatures.
Category: operations
Version: v1.0
Tags: typescript, types, sdk, functions, logging, log-drain, type-definitions, interfaces

---

This document provides comprehensive TypeScript type definitions for the Functions Log Drain SDK. These types ensure type safety and provide IntelliSense support when working with the SDK.

Core Enums

/\*\*

- Log status levels for function execution
  \*/
  export enum LogStatus {
  SUCCESS = 'success',
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info'
  }

/\*\*

- Type alias for log status string literals
  \*/
  export type LogStatusType = 'success' | 'error' | 'warning' | 'info';

Metadata Interfaces

/\*\*

- Metadata associated with function log entries
  _/
  export interface FunctionLogMetadata {
  /\*\* Unique identifier for the function execution _/
  readonly executionId: string;

/\*_ Name of the function being executed _/
readonly functionName: string;

/\*_ ISO 8601 timestamp of when the function started _/
readonly timestamp: string;

/\*_ Execution duration in milliseconds _/
readonly duration: number;

/\*_ Current status of the function execution _/
status: LogStatusType;

/\*_ AWS region where the function is executing _/
readonly region?: string;

/\*_ Memory allocated to the function in MB _/
readonly memoryAllocated?: number;

/\*_ Memory used by the function in MB _/
readonly memoryUsed?: number;

/\*_ Request ID from the invoking service _/
readonly requestId?: string;

/\*_ User or service that invoked the function _/
readonly invokedBy?: string;

/\*_ Additional custom metadata fields _/
readonly [key: string]: string | number | boolean | undefined;
}

Log Entry Interface

/\*\*

- Individual log entry structure
  _/
  export interface LogEntry {
  /\*\* Log level/status _/
  readonly level: LogStatusType;

/\*_ Log message content _/
readonly message: string;

/\*_ ISO 8601 timestamp of the log entry _/
readonly timestamp: string;

/\*_ Associated metadata for this log entry _/
readonly metadata?: Partial<FunctionLogMetadata>;

/\*_ Error object if level is 'error' _/
readonly error?: Error | ErrorDetails;

/\*_ Additional contextual data _/
readonly context?: Record<string, unknown>;

/\*_ Stack trace for errors _/
readonly stackTrace?: string;
}

/\*\*

- Detailed error information
  _/
  export interface ErrorDetails {
  /\*\* Error name/type _/
  readonly name: string;

/\*_ Error message _/
readonly message: string;

/\*_ Stack trace _/
readonly stack?: string;

/\*_ Error code if applicable _/
readonly code?: string | number;

/\*_ Additional error metadata _/
readonly [key: string]: unknown;
}

Configuration Interfaces

/\*\*

- Configuration options for the Function Log Drain
  _/
  export interface FunctionLogDrainConfig {
  /\*\* Destination endpoint URL for log drain _/
  readonly endpoint: string;

/\*_ API key or authentication token _/
readonly apiKey?: string;

/\*_ Maximum batch size before forcing a flush _/
readonly batchSize?: number;

/\*_ Maximum time in milliseconds before forcing a flush _/
readonly flushInterval?: number;

/\*_ Enable/disable automatic flushing on function completion _/
readonly autoFlush?: boolean;

/\*_ Retry configuration for failed log transmissions _/
readonly retry?: RetryConfig;

/\*_ Custom headers to include in drain requests _/
readonly headers?: Record<string, string>;

/\*_ Minimum log level to capture (filters out lower levels) _/
readonly minLevel?: LogStatusType;

/\*_ Enable debug mode for verbose logging _/
readonly debug?: boolean;

/\*_ Custom serializer for log entries _/
readonly serializer?: (entry: LogEntry) => string;

/\*_ Timeout for drain requests in milliseconds _/
readonly timeout?: number;
}

/\*\*

- Retry configuration for failed operations
  _/
  export interface RetryConfig {
  /\*\* Maximum number of retry attempts _/
  readonly maxAttempts: number;

/\*_ Initial delay between retries in milliseconds _/
readonly initialDelay: number;

/\*_ Maximum delay between retries in milliseconds _/
readonly maxDelay: number;

/\*_ Backoff multiplier for exponential backoff _/
readonly backoffMultiplier?: number;

/\*_ HTTP status codes that should trigger a retry _/
readonly retryableStatusCodes?: number[];
}

Options Interfaces

/\*\*

- Options for logging operations
  _/
  export interface LogOptions {
  /\*\* Override the default log level _/
  readonly level?: LogStatusType;

/\*_ Additional metadata to attach to this log entry _/
readonly metadata?: Partial<FunctionLogMetadata>;

/\*_ Additional context data _/
readonly context?: Record<string, unknown>;

/\*_ Force immediate flush after this log entry _/
readonly flush?: boolean;

/\*_ Tags for categorizing log entries _/
readonly tags?: string[];

/\*_ Correlation ID for tracing across services _/
readonly correlationId?: string;
}

/\*\*

- Options for flushing log buffer
  _/
  export interface FlushOptions {
  /\*\* Force flush even if batch size not reached _/
  readonly force?: boolean;

/\*_ Timeout for flush operation in milliseconds _/
readonly timeout?: number;
}

/\*\*

- Options for querying logs
  _/
  export interface QueryOptions {
  /\*\* Filter by log level _/
  readonly level?: LogStatusType | LogStatusType[];

/\*_ Filter by execution ID _/
readonly executionId?: string;

/\*_ Filter by function name _/
readonly functionName?: string;

/\*_ Start time for query range (ISO 8601) _/
readonly startTime?: string;

/\*_ End time for query range (ISO 8601) _/
readonly endTime?: string;

/\*_ Maximum number of results to return _/
readonly limit?: number;

/\*_ Offset for pagination _/
readonly offset?: number;

/\*_ Sort order _/
readonly sortOrder?: 'asc' | 'desc';
}

Method Parameter Types

/\*\*

- Parameters for initializing a log drain instance
  _/
  export interface InitializeParams {
  /\*\* Configuration for the log drain _/
  readonly config: FunctionLogDrainConfig;

/\*_ Initial metadata for the function execution _/
readonly metadata: FunctionLogMetadata;
}

/\*\*

- Parameters for logging a message
  _/
  export interface LogParams {
  /\*\* Log message _/
  readonly message: string;

/\*_ Log options _/
readonly options?: LogOptions;
}

/\*\*

- Parameters for logging an error
  _/
  export interface LogErrorParams {
  /\*\* Error object or message _/
  readonly error: Error | string;

/\*_ Additional context _/
readonly context?: Record<string, unknown>;

/\*_ Log options _/
readonly options?: LogOptions;
}

/\*\*

- Parameters for updating metadata
  _/
  export interface UpdateMetadataParams {
  /\*\* Partial metadata to merge with existing _/
  readonly metadata: Partial<FunctionLogMetadata>;
  }

/\*\*

- Parameters for batch logging
  _/
  export interface BatchLogParams {
  /\*\* Array of log entries to send _/
  readonly entries: LogEntry[];

/\*_ Options for the batch operation _/
readonly options?: FlushOptions;
}

Return Types

/\*\*

- Result of a log operation
  _/
  export interface LogResult {
  /\*\* Whether the operation succeeded _/
  readonly success: boolean;

/\*_ Number of entries processed _/
readonly entriesProcessed: number;

/\*_ Error if operation failed _/
readonly error?: Error;

/\*_ Timestamp of the operation _/
readonly timestamp: string;
}

/\*\*

- Result of a flush operation
  _/
  export interface FlushResult extends LogResult {
  /\*\* Number of entries flushed _/
  readonly entriesFlushed: number;

/\*_ Number of entries remaining in buffer _/
readonly entriesRemaining: number;

/\*_ Duration of flush operation in milliseconds _/
readonly duration: number;
}

/\*\*

- Result of a query operation
  _/
  export interface QueryResult {
  /\*\* Array of matching log entries _/
  readonly entries: LogEntry[];

/\*_ Total number of matching entries _/
readonly total: number;

/\*_ Number of entries returned _/
readonly count: number;

/\*_ Offset used for this query _/
readonly offset: number;

/\*_ Whether more results are available _/
readonly hasMore: boolean;
}

/\*\*

- Health check result
  _/
  export interface HealthCheckResult {
  /\*\* Overall health status _/
  readonly healthy: boolean;

/\*_ Endpoint connectivity status _/
readonly endpointReachable: boolean;

/\*_ Current buffer size _/
readonly bufferSize: number;

/\*_ Number of failed flush attempts _/
readonly failedFlushes: number;

/\*_ Last successful flush timestamp _/
readonly lastSuccessfulFlush?: string;

/\*_ Additional diagnostic information _/
readonly diagnostics?: Record<string, unknown>;
}

/\*\*

- Statistics about log drain operations
  _/
  export interface DrainStatistics {
  /\*\* Total number of log entries processed _/
  readonly totalEntries: number;

/\*_ Number of successful flushes _/
readonly successfulFlushes: number;

/\*_ Number of failed flushes _/
readonly failedFlushes: number;

/\*_ Average flush duration in milliseconds _/
readonly averageFlushDuration: number;

/\*_ Current buffer size _/
readonly currentBufferSize: number;

/\*_ Breakdown by log level _/
readonly entriesByLevel: Record<LogStatusType, number>;

/\*_ Uptime in milliseconds _/
readonly uptime: number;
}

Callback and Handler Types

/\*\*

- Callback invoked when a flush operation completes
  \*/
  export type FlushCallback = (result: FlushResult) => void | Promise<void>;

/\*\*

- Callback invoked when an error occurs
  \*/
  export type ErrorCallback = (error: Error, context?: Record<string, unknown>) => void | Promise<void>;

/\*\*

- Handler for log entry transformation
  \*/
  export type LogTransformer = (entry: LogEntry) => LogEntry | Promise<LogEntry>;

/\*\*

- Handler for filtering log entries
  \*/
  export type LogFilter = (entry: LogEntry) => boolean | Promise<boolean>;

/\*\*

- Event handler for drain lifecycle events
  \*/
  export type DrainEventHandler = (event: DrainEvent) => void | Promise<void>;

/\*\*

- Drain lifecycle events
  _/
  export interface DrainEvent {
  /\*\* Event type _/
  readonly type: 'initialized' | 'flushed' | 'error' | 'closed';

/\*_ Event timestamp _/
readonly timestamp: string;

/\*_ Event payload _/
readonly payload?: unknown;
}

Utility Types

/\*\*

- Make all properties in T required and non-nullable
  \*/
  export type RequiredDeep<T> = {
  [P in keyof T]-?: NonNullable<T[P]>;
  };

/\*\*

- Extract readonly properties from T
  \*/
  export type ReadonlyKeys<T> = {
  [P in keyof T]: T[P] extends Readonly<T[P]> ? P : never;
  }[keyof T];

/\*\*

- Merge two types with the second type taking precedence
  \*/
  export type Merge<T, U> = Omit<T, keyof U> & U;

/\*\*

- Make specific properties optional
  \*/
  export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/\*\*

- Make specific properties required
  \*/
  export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

Type Guards

/\*\*

- Type guard to check if a value is a valid LogStatus
  \*/
  export function isLogStatus(value: unknown): value is LogStatusType {
  return (
  typeof value === 'string' &&
  ['success', 'error', 'warning', 'info'].includes(value)
  );
  }

/\*\*

- Type guard to check if a value is a LogEntry
  \*/
  export function isLogEntry(value: unknown): value is LogEntry {
  return (
  typeof value === 'object' &&
  value !== null &&
  'level' in value &&
  'message' in value &&
  'timestamp' in value &&
  isLogStatus((value as LogEntry).level)
  );
  }

/\*\*

- Type guard to check if a value is an Error object
  \*/
  export function isError(value: unknown): value is Error {
  return value instanceof Error;
  }

/\*\*

- Type guard to check if a value is ErrorDetails
  \*/
  export function isErrorDetails(value: unknown): value is ErrorDetails {
  return (
  typeof value === 'object' &&
  value !== null &&
  'name' in value &&
  'message' in value &&
  typeof (value as ErrorDetails).name === 'string' &&
  typeof (value as ErrorDetails).message === 'string'
  );
  }

Constants

/\*\*

- Default configuration values
  \*/
  export const DEFAULT_CONFIG: Required<Omit<FunctionLogDrainConfig, 'endpoint' | 'apiKey' | 'headers' | 'serializer'>> = {
  batchSize: 100,
  flushInterval: 5000,
  autoFlush: true,
  retry: {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504]
  },
  minLevel: 'info',
  debug: false,
  timeout: 30000
  } as const;

/\*\*

- Log level priority for filtering
  \*/
  export const LOG_LEVEL_PRIORITY: Record<LogStatusType, number> = {
  info: 0,
  success: 1,
  warning: 2,
  error: 3
  } as const;

/\*\*

- Maximum allowed values
  \*/
export const LIMITS = {
  MAX_BATCH_SIZE: 1000,
  MAX_FLUSH_INTERVAL: 60000,
  MAX_MESSAGE_LENGTH: 10000,
  MAX_METADATA_SIZE: 50000,
  MAX_RETRY_ATTEMPTS: 10
  } as const;

## Instrumented Netlify Functions

This list keeps the Functions Log Drain SDK aligned with the Netlify functions in this repository. Run `pnpm tsx scripts/sync-log-drain-functions.ts` whenever a new function lands to refresh the entries below.

<!-- LOG_DRAIN_FUNCTIONS_START -->
- `_easypost.ts`
- `ai-insights.ts`
- `ai-suggest-mappings.ts`
- `analytics-dashboard.ts`
- `api-docs.ts`
- `autoRelatedProducts.ts`
- `backfillCheckoutAsyncPayments.ts`
- `backfillCustomers.ts`
- `backfillExpiredCheckouts.ts`
- `backfillInvoices.ts`
- `backfillOrders.ts`
- `backfillOrderShipping.ts`
- `backfillOrderStripe.ts`
- `backfillPaymentFailures.ts`
- `backfillRefunds.ts`
- `backfillStripeProducts.ts`
- `calculate-profit-loss.ts`
- `cancelOrder.ts`
- `captureOrderPayment.ts`
- `cleanupFunctionLogs.ts`
- `connector-install.ts`
- `create-shipping-label.ts`
- `create-wholesale-payment-link.ts`
- `createCheckout.ts`
- `createCheckoutSession.ts`
- `createCustomerDiscount.ts`
- `createFinancialConnectionSession.ts`
- `createRefund.ts`
- `easypost-webhook.ts`
- `easypostCreateLabel.ts`
- `easypostGetRates.ts`
- `easypostWebhook.ts`
- `email-health.ts`
- `email-subscribe.ts`
- `emailEvents.ts`
- `enterprise-connectors.ts`
- `fetchSiteTraffic.ts`
- `fetchStripePayouts.ts`
- `finalizeFinancialConnection.ts`
- `fixCardDetails.ts`
- `fulfill-order.ts`
- `fulfillOrder.ts`
- `generateCheckPDF.ts`
- `generateInvoicePDF.ts`
- `generatePackingSlips.ts`
- `generateQuotePDF.ts`
- `generateShippingQuotePDF.ts`
- `getEasyPostRates.ts`
- `getShippingQuoteBySkus.ts`
- `ha-health.ts`
- `handlers/checkoutSessionExpired.ts`
- `inventoryReorderCheck.ts`
- `logDrainProxy.ts`
- `manual-fulfill-order.ts`
- `marketplace.ts`
- `masterBackfill.ts`
- `merchantFeed.ts`
- `notify-sms.ts`
- `productMetrics.ts`
- `productShippingSync.ts`
- `referenceHealth.ts`
- `refund-shipping-label.ts`
- `refundOrder.ts`
- `repo-scan.ts`
- `reprocessStripeSession.ts`
- `requestFreightQuote.ts`
- `resendInvoiceEmail.ts`
- `runEmailAutomations.ts`
- `sanity-resend-sync.ts`
- `security-status.ts`
- `selfCheck.ts`
- `send-email-test.ts`
- `send-vendor-invite.ts`
- `sendAbandonedCartEmails.tsx`
- `sendCustomerEmail.ts`
- `sendEmail.js`
- `sendEmailCampaign.ts`
- `sendQuoteEmail.ts`
- `sendVendorEmail.ts`
- `stripe-shipping-webhook.ts`
- `stripeWebhook.ts`
- `submitVendorApplication.ts`
- `syncMarketingAttribution.ts`
- `syncMerchantProducts.ts`
- `syncStripeCatalog.ts`
- `syncStripeCoupons.ts`
- `syncVendorToStripe.ts`
- `transformation-library.ts`
- `update-customer-segments.ts`
- `updateVendorProfile.ts`
- `uploadCustomerMatch.ts`
- `userData.ts`
- `vendor-application.ts`
- `vendor-onboarding-cron.ts`
- `webhook-test.ts`
- `welcome-subscriber.ts`
- `wholesale-cart.ts`
- `wholesale-catalog.ts`
- `wholesale-orders.ts`
<!-- LOG_DRAIN_FUNCTIONS_END -->

Usage Example

Here's a complete example demonstrating how to use these type definitions:

import {
FunctionLogDrainConfig,
FunctionLogMetadata,
LogOptions,
LogStatus,
LogEntry,
FlushResult,
isLogEntry
} from './types';

// Configure the log drain
const config: FunctionLogDrainConfig = {
endpoint: 'https://logs.example.com/drain',
apiKey: 'your-api-key',
batchSize: 50,
flushInterval: 3000,
autoFlush: true,
retry: {
maxAttempts: 3,
initialDelay: 1000,
maxDelay: 5000,
backoffMultiplier: 2
},
minLevel: 'info'
};

// Define function metadata
const metadata: FunctionLogMetadata = {
executionId: 'exec-123',
functionName: 'processOrder',
timestamp: new Date().toISOString(),
duration: 0,
status: LogStatus.INFO,
region: 'us-east-1',
memoryAllocated: 512
};

// Create a log entry
const logEntry: LogEntry = {
level: LogStatus.SUCCESS,
message: 'Order processed successfully',
timestamp: new Date().toISOString(),
metadata,
context: {
orderId: 'order-456',
customerId: 'cust-789'
}
};

// Use type guard
if (isLogEntry(logEntry)) {
console.log('Valid log entry:', logEntry);
}

// Log with options
const options: LogOptions = {
level: LogStatus.INFO,
flush: false,
tags: ['order', 'payment'],
correlationId: 'corr-123'
};
