# Functions Log Drain SDK - README

Description: Complete guide for using the Functions Log Drain SDK to track serverless function executions in Sanity. Includes installation, API reference, configuration options, and best practices for monitoring function performance.
Category: technical
Version: v1.0
Tags: sdk, functions, logging, monitoring, serverless, typescript

---


Overview

The Functions Log Drain SDK provides a lightweight, type-safe interface for tracking serverless function executions in Sanity. It captures execution metadata, performance metrics, and error information, enabling comprehensive monitoring and debugging of your serverless infrastructure.

Key features include:

Automatic execution tracking with minimal overhead

Built-in error handling and retry logic

Performance metrics collection (duration, memory usage)

TypeScript support with full type definitions

Flexible configuration for different environments

Installation

Install the SDK using your preferred package manager:

# npm
npm install @sanity/functions-log-drain

# yarn
yarn add @sanity/functions-log-drain

# pnpm
pnpm add @sanity/functions-log-drain

Quick Start

Here's a basic example to get started with the SDK:

import { LogDrainClient } from '@sanity/functions-log-drain';

// Initialize the client
const client = new LogDrainClient({
  projectId: 'your-project-id',
  dataset: 'production',
  token: process.env.SANITY_TOKEN,
});

// Track a function execution
export async function handler(event) {
  const execution = await client.startExecution({
    functionName: 'my-function',
    trigger: 'http',
    metadata: {
      userId: event.userId,
      requestId: event.requestId,
    },
  });

  try {
    // Your function logic here
    const result = await processRequest(event);
    
    await execution.success({
      statusCode: 200,
      output: result,
    });
    
    return result;
  } catch (error) {
    await execution.error({
      error: error.message,
      stack: error.stack,
    });
    
    throw error;
  }
}

API Reference

LogDrainClient

The main client class for interacting with the log drain service.

new LogDrainClient(config: ClientConfig)

Creates a new client instance with the specified configuration.

startExecution

client.startExecution(options: ExecutionOptions): Promise<Execution>

Initiates tracking for a new function execution. Returns an Execution object for recording the outcome.

Parameters:

functionName (string, required): Name of the function being executed

trigger (string, required): Execution trigger type (http, scheduled, event)

metadata (object, optional): Additional context data

timeout (number, optional): Expected timeout in milliseconds

Execution Methods

The Execution object returned by startExecution provides methods to record execution outcomes.

execution.success(result: SuccessResult): Promise<void>

Records a successful execution with optional result data.

execution.error(error: ErrorResult): Promise<void>

Records a failed execution with error details.

execution.addLog(log: LogEntry): void

Adds a log entry to the execution timeline.

execution.setMetric(key: string, value: number): void

Records a custom metric for the execution.

Configuration Options

The SDK accepts the following configuration options:

interface ClientConfig {
  // Required
  projectId: string;        // Your Sanity project ID
  dataset: string;          // Target dataset name
  token: string;            // Authentication token with write access
  
  // Optional
  apiVersion?: string;      // API version (default: 'v2023-08-01')
  useCdn?: boolean;         // Use CDN for reads (default: false)
  maxRetries?: number;      // Max retry attempts (default: 3)
  retryDelay?: number;      // Delay between retries in ms (default: 1000)
  timeout?: number;         // Request timeout in ms (default: 10000)
  batchSize?: number;       // Batch size for bulk operations (default: 100)
  flushInterval?: number;   // Auto-flush interval in ms (default: 5000)
  enableMetrics?: boolean;  // Collect performance metrics (default: true)
  environment?: string;     // Environment label (default: 'production')
}

Environment-Specific Configuration

// Development
const devClient = new LogDrainClient({
  projectId: 'your-project-id',
  dataset: 'development',
  token: process.env.SANITY_DEV_TOKEN,
  environment: 'development',
  enableMetrics: false,
});

// Production
const prodClient = new LogDrainClient({
  projectId: 'your-project-id',
  dataset: 'production',
  token: process.env.SANITY_PROD_TOKEN,
  environment: 'production',
  maxRetries: 5,
  batchSize: 200,
});

Usage Examples

Tracking Successful Executions

export async function processOrder(orderId: string) {
  const execution = await client.startExecution({
    functionName: 'process-order',
    trigger: 'http',
    metadata: {
      orderId,
      timestamp: new Date().toISOString(),
    },
  });

  try {
    execution.addLog({
      level: 'info',
      message: `Processing order ${orderId}`,
    });

    const order = await fetchOrder(orderId);
    execution.setMetric('orderValue', order.total);

    const result = await fulfillOrder(order);
    execution.addLog({
      level: 'info',
      message: 'Order fulfilled successfully',
    });

    await execution.success({
      statusCode: 200,
      output: {
        orderId: result.id,
        status: 'fulfilled',
      },
    });

    return result;
  } catch (error) {
    execution.addLog({
      level: 'error',
      message: `Failed to process order: ${error.message}`,
    });

    await execution.error({
      error: error.message,
      stack: error.stack,
      statusCode: 500,
    });

    throw error;
  }
}

Handling Errors with Context

export async function sendNotification(userId: string, message: string) {
  const execution = await client.startExecution({
    functionName: 'send-notification',
    trigger: 'event',
    metadata: { userId },
    timeout: 30000,
  });

  try {
    const user = await getUser(userId);
    
    if (!user.email) {
      throw new Error('User email not found');
    }

    await emailService.send({
      to: user.email,
      subject: 'Notification',
      body: message,
    });

    await execution.success({
      statusCode: 200,
      output: { sent: true, recipient: user.email },
    });
  } catch (error) {
    // Capture detailed error context
    await execution.error({
      error: error.message,
      stack: error.stack,
      statusCode: error.statusCode || 500,
      context: {
        userId,
        errorType: error.constructor.name,
        timestamp: new Date().toISOString(),
      },
    });

    throw error;
  }
}

Scheduled Function Tracking

export async function dailyCleanup() {
  const execution = await client.startExecution({
    functionName: 'daily-cleanup',
    trigger: 'scheduled',
    metadata: {
      schedule: '0 0 * * *',
      runDate: new Date().toISOString(),
    },
  });

  try {
    execution.addLog({ level: 'info', message: 'Starting cleanup' });

    const deletedCount = await cleanupOldRecords();
    execution.setMetric('recordsDeleted', deletedCount);

    const archivedCount = await archiveInactiveUsers();
    execution.setMetric('usersArchived', archivedCount);

    execution.addLog({
      level: 'info',
      message: `Cleanup complete: ${deletedCount} records deleted, ${archivedCount} users archived`,
    });

    await execution.success({
      statusCode: 200,
      output: { deletedCount, archivedCount },
    });
  } catch (error) {
    await execution.error({
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

Batch Operations

export async function processBatch(items: string[]) {
  const execution = await client.startExecution({
    functionName: 'process-batch',
    trigger: 'http',
    metadata: {
      batchSize: items.length,
    },
  });

  try {
    let successCount = 0;
    let errorCount = 0;

    for (const item of items) {
      try {
        await processItem(item);
        successCount++;
      } catch (error) {
        errorCount++;
        execution.addLog({
          level: 'warn',
          message: `Failed to process item ${item}: ${error.message}`,
        });
      }
    }

    execution.setMetric('successCount', successCount);
    execution.setMetric('errorCount', errorCount);

    await execution.success({
      statusCode: 200,
      output: {
        total: items.length,
        successful: successCount,
        failed: errorCount,
      },
    });
  } catch (error) {
    await execution.error({
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

TypeScript Types

The SDK includes comprehensive TypeScript definitions for type safety:

// Client configuration
interface ClientConfig {
  projectId: string;
  dataset: string;
  token: string;
  apiVersion?: string;
  useCdn?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  batchSize?: number;
  flushInterval?: number;
  enableMetrics?: boolean;
  environment?: string;
}

// Execution options
interface ExecutionOptions {
  functionName: string;
  trigger: 'http' | 'scheduled' | 'event';
  metadata?: Record<string, any>;
  timeout?: number;
}

// Success result
interface SuccessResult {
  statusCode?: number;
  output?: any;
  metrics?: Record<string, number>;
}

// Error result
interface ErrorResult {
  error: string;
  stack?: string;
  statusCode?: number;
  context?: Record<string, any>;
}

// Log entry
interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp?: string;
  metadata?: Record<string, any>;
}

// Execution interface
interface Execution {
  id: string;
  startTime: Date;
  success(result: SuccessResult): Promise<void>;
  error(error: ErrorResult): Promise<void>;
  addLog(log: LogEntry): void;
  setMetric(key: string, value: number): void;
}

Best Practices

1. Always Track Execution Outcomes

Ensure every execution is completed with either success() or error(). Incomplete executions can skew metrics and make debugging difficult.

// Good
const execution = await client.startExecution(options);
try {
  const result = await doWork();
  await execution.success({ output: result });
} catch (error) {
  await execution.error({ error: error.message });
  throw error;
}

// Bad - execution never completed
const execution = await client.startExecution(options);
const result = await doWork();
return result;

2. Use Meaningful Metadata

Include contextual information that will help with debugging and analysis. Avoid sensitive data like passwords or tokens.

// Good
const execution = await client.startExecution({
  functionName: 'user-registration',
  trigger: 'http',
  metadata: {
    userId: user.id,
    source: 'web-app',
    version: '2.1.0',
  },
});

// Bad - too much or sensitive data
const execution = await client.startExecution({
  functionName: 'user-registration',
  trigger: 'http',
  metadata: {
    user: entireUserObject,  // Too much data
    password: user.password,  // Sensitive!
  },
});

3. Leverage Custom Metrics

Track business-relevant metrics alongside technical performance data for comprehensive monitoring.

execution.setMetric('itemsProcessed', items.length);
execution.setMetric('totalValue', calculateTotal(items));
execution.setMetric('cacheHitRate', cacheHits / totalRequests);

4. Use Structured Logging

Add logs at key points in your function execution to create an audit trail.

execution.addLog({ level: 'info', message: 'Starting data validation' });
execution.addLog({ level: 'info', message: 'Validation complete' });
execution.addLog({ level: 'info', message: 'Writing to database' });
execution.addLog({ level: 'info', message: 'Operation complete' });

5. Handle Errors Gracefully

Capture error context to make debugging easier. Include relevant state information that led to the error.

catch (error) {
  await execution.error({
    error: error.message,
    stack: error.stack,
    statusCode: error.statusCode || 500,
    context: {
      operation: 'database-write',
      recordId: record.id,
      attemptNumber: retryCount,
    },
  });
  throw error;
}

6. Configure for Your Environment

Use different configurations for development and production environments.

const config = {
  projectId: process.env.SANITY_PROJECT_ID,
  dataset: process.env.SANITY_DATASET,
  token: process.env.SANITY_TOKEN,
  environment: process.env.NODE_ENV,
  maxRetries: process.env.NODE_ENV === 'production' ? 5 : 1,
  enableMetrics: process.env.NODE_ENV === 'production',
};

const client = new LogDrainClient(config);

7. Reuse Client Instances

Create a single client instance and reuse it across function invocations to benefit from connection pooling and batching.

// Good - singleton pattern
let clientInstance: LogDrainClient | null = null;

function getClient() {
  if (!clientInstance) {
    clientInstance = new LogDrainClient(config);
  }
  return clientInstance;
}

// Bad - new client every time
export async function handler(event) {
  const client = new LogDrainClient(config);  // Inefficient
  // ...
}

8. Monitor SDK Performance

The SDK is designed to have minimal overhead, but monitor its impact on your function execution time, especially in latency-sensitive applications.

const startTime = Date.now();
const execution = await client.startExecution(options);
const sdkOverhead = Date.now() - startTime;

if (sdkOverhead > 100) {
  console.warn(`SDK overhead: ${sdkOverhead}ms`);
}

Support

For issues, questions, or feature requests, please contact the internal development team or file an issue in the internal repository.