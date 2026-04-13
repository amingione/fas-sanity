# Functions Log Drain SDK - Implementation

Description: Complete TypeScript/JavaScript implementation of the Functions Log Drain SDK. Provides structured logging for Sanity Functions with automatic duration tracking, error handling, and metadata support for orders, webhooks, and invoices.
Category: technical
Version: v1.0
Tags: sdk, typescript, logging, functions, developer-tools, implementation

---


Overview

This document contains the complete TypeScript implementation of the Functions Log Drain SDK. The SDK provides structured logging capabilities for Sanity Functions with automatic duration tracking, comprehensive error handling, and support for contextual metadata.

Type Definitions

First, define the TypeScript interfaces and types that provide type safety throughout the SDK:

/**
 * Log severity levels
 */
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

/**
 * Status of function execution
 */
export type ExecutionStatus = 'running' | 'success' | 'error';

/**
 * Metadata for order-related operations
 */
export interface OrderMetadata {
  orderId?: string;
  orderNumber?: string;
  customerId?: string;
  totalAmount?: number;
  currency?: string;
  items?: Array<{
    productId?: string;
    quantity?: number;
    price?: number;
  }>;
}

/**
 * Metadata for webhook operations
 */
export interface WebhookMetadata {
  webhookId?: string;
  source?: string;
  event?: string;
  payload?: Record<string, any>;
  headers?: Record<string, string>;
  retryCount?: number;
}

/**
 * Metadata for invoice operations
 */
export interface InvoiceMetadata {
  invoiceId?: string;
  invoiceNumber?: string;
  customerId?: string;
  amount?: number;
  currency?: string;
  status?: string;
  dueDate?: string;
}

/**
 * Combined metadata type
 */
export interface LogMetadata {
  order?: OrderMetadata;
  webhook?: WebhookMetadata;
  invoice?: InvoiceMetadata;
  [key: string]: any;
}

/**
 * Individual log entry
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  metadata?: Record<string, any>;
}

/**
 * Error information with stack trace
 */
export interface ErrorInfo {
  message: string;
  name: string;
  stack?: string;
  code?: string;
  statusCode?: number;
}

/**
 * Complete function log document structure
 */
export interface FunctionLog {
  _type: 'functionLog';
  functionName: string;
  executionId: string;
  status: ExecutionStatus;
  startTime: string;
  endTime?: string;
  duration?: number;
  logs: LogEntry[];
  error?: ErrorInfo;
  metadata?: LogMetadata;
  environment?: string;
  version?: string;
}

/**
 * Configuration options for FunctionLogDrain
 */
export interface LogDrainConfig {
  functionName: string;
  sanityClient: any;
  executionId?: string;
  metadata?: LogMetadata;
  environment?: string;
  version?: string;
  batchSize?: number;
  flushInterval?: number;
}

Core Implementation

The main FunctionLogDrain class handles log collection, batching, and persistence to Sanity:

import { v4 as uuidv4 } from 'uuid';
import type { SanityClient } from '@sanity/client';

/**
 * FunctionLogDrain - Structured logging for Sanity Functions
 * 
 * Provides automatic duration tracking, error handling, and metadata support.
 * Logs are batched and persisted to Sanity for analysis and debugging.
 * 
 * @example
 * ```typescript
 * const drain = new FunctionLogDrain({
 *   functionName: 'processOrder',
 *   sanityClient: client,
 *   metadata: {
 *     order: { orderId: '12345', totalAmount: 99.99 }
 *   }
 * });
 * 
 * await drain.start();
 * drain.log('Processing payment');
 * await drain.success();
 * ```
 */
export class FunctionLogDrain {
  private config: Required<LogDrainConfig>;
  private logs: LogEntry[] = [];
  private startTime: Date;
  private documentId: string;
  private flushTimer?: NodeJS.Timeout;
  private isFinalized: boolean = false;

  /**
   * Creates a new FunctionLogDrain instance
   * 
   * @param config - Configuration options
   * @throws {Error} If functionName or sanityClient is missing
   */
  constructor(config: LogDrainConfig) {
    if (!config.functionName) {
      throw new Error('functionName is required');
    }
    if (!config.sanityClient) {
      throw new Error('sanityClient is required');
    }

    this.config = {
      functionName: config.functionName,
      sanityClient: config.sanityClient,
      executionId: config.executionId || uuidv4(),
      metadata: config.metadata || {},
      environment: config.environment || process.env.SANITY_STUDIO_API_DATASET || 'production',
      version: config.version || '1.0.0',
      batchSize: config.batchSize || 50,
      flushInterval: config.flushInterval || 5000,
    };

    this.startTime = new Date();
    this.documentId = `function-log-${this.config.executionId}`;
  }

  /**
   * Starts the function execution and creates the initial log document
   * 
   * @returns Promise that resolves when the log document is created
   * @throws {Error} If document creation fails
   */
  async start(): Promise<void> {
    try {
      const logDocument: FunctionLog = {
        _type: 'functionLog',
        functionName: this.config.functionName,
        executionId: this.config.executionId,
        status: 'running',
        startTime: this.startTime.toISOString(),
        logs: [],
        metadata: this.config.metadata,
        environment: this.config.environment,
        version: this.config.version,
      };

      await this.config.sanityClient.create({
        _id: this.documentId,
        ...logDocument,
      });

      this.log('Function execution started', 'info');
      this.startFlushTimer();
    } catch (error) {
      console.error('Failed to create log document:', error);
      throw error;
    }
  }

  /**
   * Adds a log entry to the batch
   * 
   * @param message - Log message
   * @param level - Log severity level (default: 'info')
   * @param metadata - Additional metadata for this log entry
   */
  log(message: string, level: LogLevel = 'info', metadata?: Record<string, any>): void {
    if (this.isFinalized) {
      console.warn('Cannot log after function has been finalized');
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(metadata && { metadata }),
    };

    this.logs.push(entry);

    // Auto-flush if batch size is reached
    if (this.logs.length >= this.config.batchSize) {
      this.flush().catch(err => {
        console.error('Failed to flush logs:', err);
      });
    }
  }

  /**
   * Marks the function execution as successful and finalizes the log
   * 
   * @param finalMessage - Optional success message
   * @returns Promise that resolves when the log is finalized
   */
  async success(finalMessage?: string): Promise<void> {
    if (this.isFinalized) {
      console.warn('Function already finalized');
      return;
    }

    if (finalMessage) {
      this.log(finalMessage, 'info');
    }

    await this.finalize('success');
  }

  /**
   * Marks the function execution as failed and captures error details
   * 
   * @param error - Error object or error message
   * @param additionalContext - Additional context about the error
   * @returns Promise that resolves when the log is finalized
   */
  async error(error: Error | string, additionalContext?: Record<string, any>): Promise<void> {
    if (this.isFinalized) {
      console.warn('Function already finalized');
      return;
    }

    const errorInfo = this.captureError(error);
    
    this.log(
      `Function failed: ${errorInfo.message}`,
      'error',
      additionalContext
    );

    await this.finalize('error', errorInfo);
  }

  /**
   * Flushes pending logs to Sanity
   * 
   * @returns Promise that resolves when logs are flushed
   */
  private async flush(): Promise<void> {
    if (this.logs.length === 0) {
      return;
    }

    const logsToFlush = [...this.logs];
    this.logs = [];

    try {
      await this.config.sanityClient
        .patch(this.documentId)
        .setIfMissing({ logs: [] })
        .append('logs', logsToFlush)
        .commit();
    } catch (error) {
      console.error('Failed to flush logs to Sanity:', error);
      // Restore logs on failure
      this.logs.unshift(...logsToFlush);
      throw error;
    }
  }

  /**
   * Finalizes the function execution log
   * 
   * @param status - Final execution status
   * @param errorInfo - Error information if status is 'error'
   */
  private async finalize(status: 'success' | 'error', errorInfo?: ErrorInfo): Promise<void> {
    this.isFinalized = true;
    this.stopFlushTimer();

    // Flush any remaining logs
    await this.flush();

    const endTime = new Date();
    const duration = endTime.getTime() - this.startTime.getTime();

    try {
      const patch = this.config.sanityClient
        .patch(this.documentId)
        .set({
          status,
          endTime: endTime.toISOString(),
          duration,
        });

      if (errorInfo) {
        patch.set({ error: errorInfo });
      }

      await patch.commit();
    } catch (error) {
      console.error('Failed to finalize log document:', error);
      throw error;
    }
  }

  /**
   * Captures error information including stack trace
   * 
   * @param error - Error object or string
   * @returns Structured error information
   */
  private captureError(error: Error | string): ErrorInfo {
    if (typeof error === 'string') {
      return {
        message: error,
        name: 'Error',
      };
    }

    const errorInfo: ErrorInfo = {
      message: error.message || 'Unknown error',
      name: error.name || 'Error',
    };

    if (error.stack) {
      errorInfo.stack = error.stack;
    }

    // Capture additional error properties
    if ('code' in error && typeof error.code === 'string') {
      errorInfo.code = error.code;
    }

    if ('statusCode' in error && typeof error.statusCode === 'number') {
      errorInfo.statusCode = error.statusCode;
    }

    return errorInfo;
  }

  /**
   * Starts the automatic flush timer
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(err => {
        console.error('Scheduled flush failed:', err);
      });
    }, this.config.flushInterval);
  }

  /**
   * Stops the automatic flush timer
   */
  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  /**
   * Gets the current execution ID
   * 
   * @returns The execution ID
   */
  getExecutionId(): string {
    return this.config.executionId;
  }

  /**
   * Gets the document ID in Sanity
   * 
   * @returns The Sanity document ID
   */
  getDocumentId(): string {
    return this.documentId;
  }

  /**
   * Updates metadata for the current execution
   * 
   * @param metadata - Metadata to merge with existing metadata
   */
  async updateMetadata(metadata: Partial<LogMetadata>): Promise<void> {
    this.config.metadata = {
      ...this.config.metadata,
      ...metadata,
    };

    try {
      await this.config.sanityClient
        .patch(this.documentId)
        .set({ metadata: this.config.metadata })
        .commit();
    } catch (error) {
      console.error('Failed to update metadata:', error);
      throw error;
    }
  }
}

Utility Functions

Helper functions for common logging patterns and error handling:

/**
 * Creates a log drain with automatic error handling wrapper
 * 
 * @param config - Log drain configuration
 * @param fn - Function to execute with logging
 * @returns Result of the function execution
 * 
 * @example
 * ```typescript
 * const result = await withLogDrain(
 *   { functionName: 'processOrder', sanityClient: client },
 *   async (drain) => {
 *     drain.log('Starting order processing');
 *     const order = await processOrder();
 *     return order;
 *   }
 * );
 * ```
 */
export async function withLogDrain<T>(
  config: LogDrainConfig,
  fn: (drain: FunctionLogDrain) => Promise<T>
): Promise<T> {
  const drain = new FunctionLogDrain(config);
  await drain.start();

  try {
    const result = await fn(drain);
    await drain.success();
    return result;
  } catch (error) {
    await drain.error(error as Error);
    throw error;
  }
}

/**
 * Batch logs multiple operations with a single drain instance
 * 
 * @param config - Log drain configuration
 * @param operations - Array of operations to execute
 * @returns Array of results
 * 
 * @example
 * ```typescript
 * const results = await batchLog(
 *   { functionName: 'batchProcess', sanityClient: client },
 *   [
 *     { name: 'op1', fn: async (drain) => { ... } },
 *     { name: 'op2', fn: async (drain) => { ... } },
 *   ]
 * );
 * ```
 */
export async function batchLog<T>(
  config: LogDrainConfig,
  operations: Array<{
    name: string;
    fn: (drain: FunctionLogDrain) => Promise<T>;
  }>
): Promise<Array<{ name: string; result?: T; error?: Error }>> {
  const drain = new FunctionLogDrain(config);
  await drain.start();

  const results: Array<{ name: string; result?: T; error?: Error }> = [];

  for (const operation of operations) {
    try {
      drain.log(`Starting operation: ${operation.name}`);
      const result = await operation.fn(drain);
      drain.log(`Completed operation: ${operation.name}`, 'info');
      results.push({ name: operation.name, result });
    } catch (error) {
      drain.log(`Failed operation: ${operation.name}`, 'error');
      results.push({ name: operation.name, error: error as Error });
    }
  }

  const hasErrors = results.some(r => r.error);
  if (hasErrors) {
    await drain.error('One or more operations failed');
  } else {
    await drain.success('All operations completed successfully');
  }

  return results;
}

/**
 * Creates a child logger with inherited context
 * 
 * @param parent - Parent log drain
 * @param context - Additional context for child logger
 * @returns Object with logging methods
 */
export function createChildLogger(
  parent: FunctionLogDrain,
  context: string
): {
  log: (message: string, level?: LogLevel, metadata?: Record<string, any>) => void;
  info: (message: string, metadata?: Record<string, any>) => void;
  warn: (message: string, metadata?: Record<string, any>) => void;
  error: (message: string, metadata?: Record<string, any>) => void;
  debug: (message: string, metadata?: Record<string, any>) => void;
} {
  const prefixMessage = (message: string) => `[${context}] ${message}`;

  return {
    log: (message, level = 'info', metadata) => {
      parent.log(prefixMessage(message), level, metadata);
    },
    info: (message, metadata) => {
      parent.log(prefixMessage(message), 'info', metadata);
    },
    warn: (message, metadata) => {
      parent.log(prefixMessage(message), 'warn', metadata);
    },
    error: (message, metadata) => {
      parent.log(prefixMessage(message), 'error', metadata);
    },
    debug: (message, metadata) => {
      parent.log(prefixMessage(message), 'debug', metadata);
    },
  };
}

Usage Examples

Basic Usage

import { createClient } from '@sanity/client';
import { FunctionLogDrain } from './function-log-drain';

const client = createClient({
  projectId: 'your-project-id',
  dataset: 'production',
  token: 'your-token',
  apiVersion: '2024-01-01',
  useCdn: false,
});

export async function processOrder(orderId: string) {
  const drain = new FunctionLogDrain({
    functionName: 'processOrder',
    sanityClient: client,
    metadata: {
      order: { orderId },
    },
  });

  await drain.start();

  try {
    drain.log('Fetching order details');
    const order = await fetchOrder(orderId);

    drain.log('Validating order', 'info', { itemCount: order.items.length });
    await validateOrder(order);

    drain.log('Processing payment');
    await processPayment(order);

    await drain.success('Order processed successfully');
    return order;
  } catch (error) {
    await drain.error(error as Error, { orderId });
    throw error;
  }
}

Webhook Handler

import { withLogDrain } from './function-log-drain';

export async function handleWebhook(request: Request) {
  const payload = await request.json();
  const webhookId = request.headers.get('x-webhook-id');

  return withLogDrain(
    {
      functionName: 'webhookHandler',
      sanityClient: client,
      metadata: {
        webhook: {
          webhookId,
          source: request.headers.get('x-webhook-source'),
          event: payload.event,
        },
      },
    },
    async (drain) => {
      drain.log('Webhook received', 'info', { event: payload.event });

      // Validate webhook signature
      drain.log('Validating webhook signature');
      await validateSignature(request);

      // Process webhook
      drain.log('Processing webhook event');
      const result = await processWebhookEvent(payload);

      drain.log('Webhook processed successfully');
      return result;
    }
  );
}

Batch Operations

import { batchLog } from './function-log-drain';

export async function processBatchInvoices(invoiceIds: string[]) {
  const results = await batchLog(
    {
      functionName: 'batchInvoiceProcessor',
      sanityClient: client,
    },
    invoiceIds.map(invoiceId => ({
      name: `invoice-${invoiceId}`,
      fn: async (drain) => {
        drain.log(`Processing invoice ${invoiceId}`);
        
        const invoice = await fetchInvoice(invoiceId);
        await drain.updateMetadata({
          invoice: {
            invoiceId,
            amount: invoice.amount,
            status: invoice.status,
          },
        });

        await generatePDF(invoice);
        await sendEmail(invoice);

        return invoice;
      },
    }))
  );

  return results;
}

Child Logger Pattern

import { FunctionLogDrain, createChildLogger } from './function-log-drain';

export async function complexOperation() {
  const drain = new FunctionLogDrain({
    functionName: 'complexOperation',
    sanityClient: client,
  });

  await drain.start();

  try {
    // Create child loggers for different subsystems
    const dbLogger = createChildLogger(drain, 'Database');
    const apiLogger = createChildLogger(drain, 'API');
    const cacheLogger = createChildLogger(drain, 'Cache');

    dbLogger.info('Connecting to database');
    await connectToDatabase();

    apiLogger.info('Fetching data from external API');
    const data = await fetchExternalData();

    cacheLogger.info('Caching results');
    await cacheData(data);

    await drain.success();
  } catch (error) {
    await drain.error(error as Error);
    throw error;
  }
}

Error Handling Patterns

Retry Logic with Logging

async function withRetry<T>(
  drain: FunctionLogDrain,
  operation: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      drain.log(`Attempt ${attempt} of ${maxRetries}`);
      return await operation();
    } catch (error) {
      lastError = error as Error;
      drain.log(
        `Attempt ${attempt} failed: ${lastError.message}`,
        'warn',
        { attempt, maxRetries }
      );

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        drain.log(`Retrying in ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}

Graceful Degradation

async function processWithFallback(
  drain: FunctionLogDrain,
  primaryFn: () => Promise<any>,
  fallbackFn: () => Promise<any>
) {
  try {
    drain.log('Attempting primary operation');
    return await primaryFn();
  } catch (error) {
    drain.log(
      'Primary operation failed, using fallback',
      'warn',
      { error: (error as Error).message }
    );
    return await fallbackFn();
  }
}

Export Statements

Complete export manifest for the SDK:

// Main exports
export { FunctionLogDrain } from './function-log-drain';
export { withLogDrain, batchLog, createChildLogger } from './utils';

// Type exports
export type {
  LogLevel,
  ExecutionStatus,
  OrderMetadata,
  WebhookMetadata,
  InvoiceMetadata,
  LogMetadata,
  LogEntry,
  ErrorInfo,
  FunctionLog,
  LogDrainConfig,
} from './types';

// Default export
export default FunctionLogDrain;

Edge Cases and Considerations

Handling Network Failures

The SDK handles network failures gracefully by restoring logs to the batch queue if a flush operation fails. This ensures no logs are lost during temporary network issues.

Memory Management

Logs are automatically flushed when the batch size is reached or at regular intervals. This prevents memory buildup in long-running functions. The default batch size of 50 entries and flush interval of 5 seconds balance performance with memory usage.

Finalization Safety

Once a drain is finalized (via success() or error()), subsequent log calls are ignored with a warning. This prevents accidental logging after function completion and ensures clean execution boundaries.

Concurrent Execution

Each FunctionLogDrain instance uses a unique execution ID, allowing multiple function invocations to run concurrently without log collision. The document ID includes the execution ID to ensure uniqueness.

Error Stack Traces

The captureError method extracts comprehensive error information including stack traces, error codes, and HTTP status codes when available. This provides detailed debugging context for failed executions.

Performance Considerations

The SDK is optimized for minimal performance impact:

Batching reduces API calls to Sanity

Asynchronous flush operations don't block function execution

Automatic timer cleanup prevents memory leaks

Configurable batch size and flush interval allow tuning for specific use cases

Testing Recommendations

When testing functions that use the SDK:

Mock the Sanity client to avoid creating test documents

Use a test dataset for integration tests

Verify log entries are created with correct timestamps and metadata

Test error handling paths to ensure stack traces are captured

Validate that finalization prevents further logging