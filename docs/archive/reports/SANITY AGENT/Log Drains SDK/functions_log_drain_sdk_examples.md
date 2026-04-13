# Functions Log Drain SDK - Examples

Description: Real-world usage examples for the Functions Log Drain SDK. Includes basic logging, order processing, webhook handling, invoice generation, batch processing, and integrations with Sanity, Vercel, and AWS Lambda.
Category: technical
Version: v1.0
Tags: sdk, logging, examples, functions, serverless

---

This document provides complete, runnable examples for the Functions Log Drain SDK across various use cases and platforms.

1. Basic Logging Example

Simple function that demonstrates basic logging capabilities with different log levels.

import { LogDrain } from '@your-org/functions-log-drain-sdk';

const logger = new LogDrain({
apiKey: process.env.LOG_DRAIN_API_KEY,
service: 'basic-example',
environment: process.env.NODE_ENV || 'development'
});

export async function handler(event) {
const requestId = event.requestId || generateRequestId();

// Info level logging
await logger.info('Function invoked', {
requestId,
path: event.path,
method: event.httpMethod
});

try {
// Debug level logging
await logger.debug('Processing request', {
requestId,
headers: event.headers
});

    const result = await processRequest(event);

    // Success logging
    await logger.info('Request processed successfully', {
      requestId,
      duration: result.duration,
      statusCode: 200
    });

    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };

} catch (error) {
// Error logging
await logger.error('Request processing failed', {
requestId,
error: error.message,
stack: error.stack
});

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };

}
}

function generateRequestId() {
return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

async function processRequest(event) {
const startTime = Date.now();
// Your business logic here
await new Promise(resolve => setTimeout(resolve, 100));
return {
success: true,
duration: Date.now() - startTime
};
}

2. Order Processing Function with Metadata

E-commerce order processing function that logs detailed metadata for tracking and analytics.

import { LogDrain } from '@your-org/functions-log-drain-sdk';
import { validateOrder, chargePayment, createShipment } from './services';

const logger = new LogDrain({
apiKey: process.env.LOG_DRAIN_API_KEY,
service: 'order-processor',
environment: process.env.NODE_ENV
});

export async function processOrder(orderData) {
const orderId = orderData.id;
const startTime = Date.now();

await logger.info('Order processing started', {
orderId,
customerId: orderData.customerId,
itemCount: orderData.items.length,
totalAmount: orderData.total,
currency: orderData.currency,
paymentMethod: orderData.paymentMethod
});

try {
// Validation step
await logger.debug('Validating order', { orderId });
const validation = await validateOrder(orderData);

    if (!validation.valid) {
      await logger.warn('Order validation failed', {
        orderId,
        errors: validation.errors,
        step: 'validation'
      });
      throw new Error('Invalid order data');
    }

    // Payment step
    await logger.info('Processing payment', {
      orderId,
      amount: orderData.total,
      paymentMethod: orderData.paymentMethod
    });

    const payment = await chargePayment({
      orderId,
      amount: orderData.total,
      paymentMethod: orderData.paymentMethod
    });

    await logger.info('Payment processed', {
      orderId,
      transactionId: payment.transactionId,
      status: payment.status
    });

    // Shipment step
    await logger.info('Creating shipment', {
      orderId,
      shippingAddress: orderData.shippingAddress.city
    });

    const shipment = await createShipment(orderData);

    await logger.info('Shipment created', {
      orderId,
      trackingNumber: shipment.trackingNumber,
      carrier: shipment.carrier,
      estimatedDelivery: shipment.estimatedDelivery
    });

    // Success
    const duration = Date.now() - startTime;
    await logger.info('Order processed successfully', {
      orderId,
      transactionId: payment.transactionId,
      trackingNumber: shipment.trackingNumber,
      duration,
      status: 'completed'
    });

    return {
      success: true,
      orderId,
      transactionId: payment.transactionId,
      trackingNumber: shipment.trackingNumber
    };

} catch (error) {
const duration = Date.now() - startTime;

    await logger.error('Order processing failed', {
      orderId,
      error: error.message,
      stack: error.stack,
      duration,
      status: 'failed'
    });

    throw error;

}
}

3. Webhook Handler with Error Handling

Robust webhook handler with signature verification, retry logic, and comprehensive error logging.

import { LogDrain } from '@your-org/functions-log-drain-sdk';
import crypto from 'crypto';

const logger = new LogDrain({
apiKey: process.env.LOG_DRAIN_API_KEY,
service: 'webhook-handler',
environment: process.env.NODE_ENV
});

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const MAX_RETRIES = 3;

export async function handleWebhook(event) {
const webhookId = generateWebhookId();
const signature = event.headers['x-webhook-signature'];
const payload = JSON.parse(event.body);

await logger.info('Webhook received', {
webhookId,
eventType: payload.type,
source: event.headers['x-webhook-source'],
timestamp: payload.timestamp
});

try {
// Verify signature
await logger.debug('Verifying webhook signature', { webhookId });

    if (!verifySignature(event.body, signature, WEBHOOK_SECRET)) {
      await logger.warn('Webhook signature verification failed', {
        webhookId,
        source: event.headers['x-webhook-source'],
        eventType: payload.type
      });

      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid signature' })
      };
    }

    await logger.debug('Signature verified', { webhookId });

    // Process webhook with retry logic
    let attempt = 0;
    let lastError;

    while (attempt < MAX_RETRIES) {
      attempt++;

      try {
        await logger.debug('Processing webhook', {
          webhookId,
          attempt,
          maxRetries: MAX_RETRIES
        });

        const result = await processWebhookEvent(payload);

        await logger.info('Webhook processed successfully', {
          webhookId,
          eventType: payload.type,
          attempt,
          result: result.summary
        });

        return {
          statusCode: 200,
          body: JSON.stringify({ success: true, webhookId })
        };

      } catch (error) {
        lastError = error;

        await logger.warn('Webhook processing attempt failed', {
          webhookId,
          attempt,
          maxRetries: MAX_RETRIES,
          error: error.message,
          willRetry: attempt < MAX_RETRIES
        });

        if (attempt < MAX_RETRIES) {
          // Exponential backoff
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries exhausted
    await logger.error('Webhook processing failed after all retries', {
      webhookId,
      eventType: payload.type,
      attempts: MAX_RETRIES,
      error: lastError.message,
      stack: lastError.stack
    });

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Processing failed' })
    };

} catch (error) {
await logger.error('Webhook handler error', {
webhookId,
error: error.message,
stack: error.stack
});

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };

}
}

function verifySignature(payload, signature, secret) {
const hmac = crypto.createHmac('sha256', secret);
const digest = hmac.update(payload).digest('hex');
return crypto.timingSafeEqual(
Buffer.from(signature),
Buffer.from(digest)
);
}

function generateWebhookId() {
return `wh_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

async function processWebhookEvent(payload) {
// Your webhook processing logic
return { summary: 'Event processed' };
}

4. Invoice Generation Example

Invoice generation function with detailed logging for audit trails and compliance.

import { LogDrain } from '@your-org/functions-log-drain-sdk';
import { generatePDF, sendEmail, storeInvoice } from './services';

const logger = new LogDrain({
apiKey: process.env.LOG_DRAIN_API_KEY,
service: 'invoice-generator',
environment: process.env.NODE_ENV
});

export async function generateInvoice(invoiceData) {
const invoiceId = `INV-${Date.now()}`;
const startTime = Date.now();

await logger.info('Invoice generation started', {
invoiceId,
customerId: invoiceData.customerId,
customerName: invoiceData.customerName,
amount: invoiceData.total,
currency: invoiceData.currency,
lineItems: invoiceData.items.length
});

try {
// Validate invoice data
await logger.debug('Validating invoice data', { invoiceId });

    if (!invoiceData.customerId || !invoiceData.items.length) {
      await logger.warn('Invalid invoice data', {
        invoiceId,
        missingFields: [
          !invoiceData.customerId && 'customerId',
          !invoiceData.items.length && 'items'
        ].filter(Boolean)
      });
      throw new Error('Invalid invoice data');
    }

    // Generate PDF
    await logger.info('Generating PDF', {
      invoiceId,
      template: invoiceData.template || 'default'
    });

    const pdf = await generatePDF({
      invoiceId,
      ...invoiceData,
      generatedAt: new Date().toISOString()
    });

    await logger.info('PDF generated', {
      invoiceId,
      fileSize: pdf.size,
      pages: pdf.pageCount
    });

    // Store invoice
    await logger.info('Storing invoice', { invoiceId });

    const storage = await storeInvoice({
      invoiceId,
      pdf: pdf.buffer,
      metadata: {
        customerId: invoiceData.customerId,
        amount: invoiceData.total,
        currency: invoiceData.currency,
        generatedAt: new Date().toISOString()
      }
    });

    await logger.info('Invoice stored', {
      invoiceId,
      storageUrl: storage.url,
      storageId: storage.id
    });

    // Send email
    await logger.info('Sending invoice email', {
      invoiceId,
      recipient: invoiceData.customerEmail
    });

    const email = await sendEmail({
      to: invoiceData.customerEmail,
      subject: `Invoice ${invoiceId}`,
      template: 'invoice',
      attachments: [{
        filename: `${invoiceId}.pdf`,
        content: pdf.buffer
      }],
      data: {
        invoiceId,
        customerName: invoiceData.customerName,
        amount: invoiceData.total,
        currency: invoiceData.currency
      }
    });

    await logger.info('Invoice email sent', {
      invoiceId,
      emailId: email.id,
      recipient: invoiceData.customerEmail
    });

    // Success
    const duration = Date.now() - startTime;

    await logger.info('Invoice generation completed', {
      invoiceId,
      customerId: invoiceData.customerId,
      amount: invoiceData.total,
      storageUrl: storage.url,
      emailId: email.id,
      duration,
      status: 'completed'
    });

    return {
      success: true,
      invoiceId,
      url: storage.url,
      emailSent: true
    };

} catch (error) {
const duration = Date.now() - startTime;

    await logger.error('Invoice generation failed', {
      invoiceId,
      customerId: invoiceData.customerId,
      error: error.message,
      stack: error.stack,
      duration,
      status: 'failed'
    });

    throw error;

}
}

5. Batch Processing Example

Batch processing function that handles large datasets with progress tracking and error aggregation.

import { LogDrain } from '@your-org/functions-log-drain-sdk';
import { fetchRecords, processRecord, updateStatus } from './services';

const logger = new LogDrain({
apiKey: process.env.LOG_DRAIN_API_KEY,
service: 'batch-processor',
environment: process.env.NODE_ENV
});

const BATCH_SIZE = 100;
const CONCURRENCY = 10;

export async function processBatch(batchConfig) {
const batchId = `batch_${Date.now()}`;
const startTime = Date.now();

await logger.info('Batch processing started', {
batchId,
source: batchConfig.source,
filters: batchConfig.filters,
batchSize: BATCH_SIZE,
concurrency: CONCURRENCY
});

try {
// Fetch records
await logger.info('Fetching records', { batchId });

    const records = await fetchRecords(batchConfig);
    const totalRecords = records.length;

    await logger.info('Records fetched', {
      batchId,
      totalRecords,
      estimatedBatches: Math.ceil(totalRecords / BATCH_SIZE)
    });

    // Process in batches
    const results = {
      total: totalRecords,
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: []
    };

    for (let i = 0; i < totalRecords; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(totalRecords / BATCH_SIZE);

      await logger.info('Processing batch', {
        batchId,
        batchNumber,
        totalBatches,
        batchSize: batch.length,
        progress: `${Math.round((i / totalRecords) * 100)}%`
      });

      // Process records concurrently within batch
      const chunks = chunkArray(batch, CONCURRENCY);

      for (const chunk of chunks) {
        const promises = chunk.map(async (record) => {
          try {
            await processRecord(record);
            results.succeeded++;

            await logger.debug('Record processed', {
              batchId,
              recordId: record.id,
              batchNumber
            });

          } catch (error) {
            results.failed++;
            results.errors.push({
              recordId: record.id,
              error: error.message
            });

            await logger.warn('Record processing failed', {
              batchId,
              recordId: record.id,
              batchNumber,
              error: error.message
            });
          }

          results.processed++;
        });

        await Promise.all(promises);
      }

      // Log batch completion
      await logger.info('Batch completed', {
        batchId,
        batchNumber,
        totalBatches,
        processed: results.processed,
        succeeded: results.succeeded,
        failed: results.failed,
        progress: `${Math.round((results.processed / totalRecords) * 100)}%`
      });
    }

    // Update final status
    await updateStatus(batchId, 'completed', results);

    const duration = Date.now() - startTime;
    const successRate = (results.succeeded / results.total) * 100;

    await logger.info('Batch processing completed', {
      batchId,
      totalRecords: results.total,
      succeeded: results.succeeded,
      failed: results.failed,
      successRate: `${successRate.toFixed(2)}%`,
      duration,
      averageTimePerRecord: Math.round(duration / results.total),
      status: 'completed'
    });

    if (results.failed > 0) {
      await logger.warn('Batch completed with errors', {
        batchId,
        failedCount: results.failed,
        errorSample: results.errors.slice(0, 5)
      });
    }

    return {
      success: true,
      batchId,
      results
    };

} catch (error) {
const duration = Date.now() - startTime;

    await updateStatus(batchId, 'failed', { error: error.message });

    await logger.error('Batch processing failed', {
      batchId,
      error: error.message,
      stack: error.stack,
      duration,
      status: 'failed'
    });

    throw error;

}
}

function chunkArray(array, size) {
const chunks = [];
for (let i = 0; i < array.length; i += size) {
chunks.push(array.slice(i, i + size));
}
return chunks;
}

6. Custom Metadata Example

Advanced usage with custom metadata fields for enhanced filtering and analytics.

import { LogDrain } from '@your-org/functions-log-drain-sdk';

const logger = new LogDrain({
apiKey: process.env.LOG_DRAIN_API_KEY,
service: 'custom-metadata-example',
environment: process.env.NODE_ENV,
// Global metadata applied to all logs
metadata: {
region: process.env.AWS_REGION,
version: process.env.APP_VERSION,
deployment: process.env.DEPLOYMENT_ID
}
});

export async function handleRequest(event) {
const requestId = event.requestId;
const userId = event.user?.id;
const tenantId = event.tenant?.id;

// Create a child logger with request-specific metadata
const requestLogger = logger.child({
requestId,
userId,
tenantId,
userAgent: event.headers['user-agent'],
ipAddress: event.requestContext?.identity?.sourceIp,
path: event.path,
method: event.httpMethod
});

await requestLogger.info('Request started', {
queryParams: event.queryStringParameters,
hasBody: !!event.body
});

try {
// Business logic with contextual logging
const resource = event.pathParameters?.resource;

    await requestLogger.debug('Fetching resource', {
      resourceType: resource,
      includeRelated: event.queryStringParameters?.include
    });

    const data = await fetchResource(resource, {
      userId,
      tenantId
    });

    // Log with custom business metrics
    await requestLogger.info('Resource fetched', {
      resourceType: resource,
      resourceId: data.id,
      recordCount: data.items?.length || 1,
      cacheHit: data.fromCache,
      queryTime: data.queryTime,
      // Custom business metrics
      metrics: {
        dataSize: JSON.stringify(data).length,
        complexity: calculateComplexity(data),
        accessLevel: data.accessLevel
      }
    });

    // Log user activity for analytics
    await requestLogger.info('User activity', {
      action: 'resource.view',
      resourceType: resource,
      resourceId: data.id,
      // Analytics metadata
      analytics: {
        sessionId: event.headers['x-session-id'],
        referrer: event.headers['referer'],
        deviceType: detectDeviceType(event.headers['user-agent']),
        timestamp: new Date().toISOString()
      }
    });

    await requestLogger.info('Request completed', {
      statusCode: 200,
      responseSize: JSON.stringify(data).length
    });

    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };

} catch (error) {
// Error logging with full context
await requestLogger.error('Request failed', {
error: error.message,
errorCode: error.code,
errorType: error.constructor.name,
stack: error.stack,
// Additional error context
context: {
resource: event.pathParameters?.resource,
operation: 'fetch',
retryable: isRetryableError(error)
}
});

    return {
      statusCode: error.statusCode || 500,
      body: JSON.stringify({ error: error.message })
    };

}
}

function calculateComplexity(data) {
// Custom business logic
return data.items?.length || 1;
}

function detectDeviceType(userAgent) {
if (/mobile/i.test(userAgent)) return 'mobile';
if (/tablet/i.test(userAgent)) return 'tablet';
return 'desktop';
}

function isRetryableError(error) {
return error.code === 'ETIMEDOUT' || error.statusCode >= 500;
}

async function fetchResource(resource, context) {
// Mock implementation
return { id: '123', items: [], fromCache: false, queryTime: 45 };
}

7. Integration with Sanity Functions

Using the Log Drain SDK within Sanity Functions for content operations.

import { LogDrain } from '@your-org/functions-log-drain-sdk';
import { createClient } from '@sanity/client';

const logger = new LogDrain({
apiKey: process.env.LOG_DRAIN_API_KEY,
service: 'sanity-function',
environment: process.env.SANITY_STUDIO_API_DATASET
});

const sanityClient = createClient({
projectId: process.env.SANITY_STUDIO_API_PROJECT_ID,
dataset: process.env.SANITY_STUDIO_API_DATASET,
token: process.env.SANITY_API_TOKEN,
apiVersion: '2024-01-01',
useCdn: false
});

export default async function handler(req, res) {
const functionId = `fn_${Date.now()}`;

await logger.info('Sanity function invoked', {
functionId,
method: req.method,
path: req.url,
dataset: process.env.SANITY_STUDIO_API_DATASET
});

try {
const { action, documentType, documentId, data } = req.body;

    await logger.debug('Processing action', {
      functionId,
      action,
      documentType,
      documentId
    });

    let result;

    switch (action) {
      case 'create':
        await logger.info('Creating document', {
          functionId,
          documentType,
          fieldCount: Object.keys(data).length
        });

        result = await sanityClient.create({
          _type: documentType,
          ...data
        });

        await logger.info('Document created', {
          functionId,
          documentType,
          documentId: result._id,
          revision: result._rev
        });
        break;

      case 'update':
        await logger.info('Updating document', {
          functionId,
          documentId,
          updateFields: Object.keys(data).length
        });

        result = await sanityClient
          .patch(documentId)
          .set(data)
          .commit();

        await logger.info('Document updated', {
          functionId,
          documentId: result._id,
          revision: result._rev
        });
        break;

      case 'delete':
        await logger.info('Deleting document', {
          functionId,
          documentId
        });

        result = await sanityClient.delete(documentId);

        await logger.info('Document deleted', {
          functionId,
          documentId
        });
        break;

      case 'query':
        const query = data.query;
        const params = data.params || {};

        await logger.info('Executing query', {
          functionId,
          query: query.substring(0, 100),
          paramCount: Object.keys(params).length
        });

        const startTime = Date.now();
        result = await sanityClient.fetch(query, params);
        const queryTime = Date.now() - startTime;

        await logger.info('Query executed', {
          functionId,
          resultCount: Array.isArray(result) ? result.length : 1,
          queryTime
        });
        break;

      default:
        await logger.warn('Unknown action', {
          functionId,
          action
        });

        return res.status(400).json({ error: 'Unknown action' });
    }

    await logger.info('Sanity function completed', {
      functionId,
      action,
      status: 'success'
    });

    return res.status(200).json({
      success: true,
      result
    });

} catch (error) {
await logger.error('Sanity function failed', {
functionId,
error: error.message,
stack: error.stack,
statusCode: error.statusCode
});

    return res.status(error.statusCode || 500).json({
      error: error.message
    });

}
}

8. Integration with Vercel Functions

Deploying the SDK in Vercel serverless functions with edge runtime support.

import { LogDrain } from '@your-org/functions-log-drain-sdk';

// Vercel Edge Runtime configuration
export const config = {
runtime: 'edge'
};

const logger = new LogDrain({
apiKey: process.env.LOG_DRAIN_API_KEY,
service: 'vercel-edge-function',
environment: process.env.VERCEL_ENV || 'development',
metadata: {
region: process.env.VERCEL_REGION,
deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
runtime: 'edge'
}
});

export default async function handler(request) {
const requestId = crypto.randomUUID();
const url = new URL(request.url);

await logger.info('Edge function invoked', {
requestId,
method: request.method,
path: url.pathname,
region: process.env.VERCEL_REGION,
country: request.geo?.country,
city: request.geo?.city
});

try {
// Parse request
const body = request.method === 'POST'
? await request.json()
: null;

    await logger.debug('Request parsed', {
      requestId,
      hasBody: !!body,
      queryParams: Object.fromEntries(url.searchParams)
    });

    // Process request
    const startTime = Date.now();
    const result = await processEdgeRequest({
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body,
      headers: Object.fromEntries(request.headers),
      geo: request.geo
    });
    const processingTime = Date.now() - startTime;

    await logger.info('Request processed', {
      requestId,
      statusCode: 200,
      processingTime,
      cacheStatus: result.cached ? 'hit' : 'miss'
    });

    // Return response with appropriate headers
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': result.cached ? 'public, max-age=3600' : 'no-cache',
        'X-Request-Id': requestId
      }
    });

} catch (error) {
await logger.error('Edge function failed', {
requestId,
error: error.message,
stack: error.stack,
path: url.pathname
});

    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Id': requestId
        }
      }
    );

}
}

async function processEdgeRequest(request) {
// Your edge function logic
return {
success: true,
cached: false,
data: { message: 'Processed at the edge' }
};
}

// Alternative: Vercel Serverless Function (Node.js runtime)
// api/function.js

import { LogDrain } from '@your-org/functions-log-drain-sdk';

const logger = new LogDrain({
apiKey: process.env.LOG_DRAIN_API_KEY,
service: 'vercel-serverless-function',
environment: process.env.VERCEL_ENV,
metadata: {
region: process.env.VERCEL_REGION,
deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
runtime: 'nodejs'
}
});

export default async function handler(req, res) {
const requestId = req.headers['x-vercel-id'] || crypto.randomUUID();

await logger.info('Serverless function invoked', {
requestId,
method: req.method,
path: req.url,
region: process.env.VERCEL_REGION
});

try {
const result = await processServerlessRequest(req);

    await logger.info('Request completed', {
      requestId,
      statusCode: 200
    });

    res.status(200).json(result);

} catch (error) {
await logger.error('Serverless function failed', {
requestId,
error: error.message,
stack: error.stack
});

    res.status(500).json({ error: 'Internal server error' });

}
}

async function processServerlessRequest(req) {
return { success: true, data: {} };
}

9. Integration with AWS Lambda

Complete AWS Lambda integration with CloudWatch compatibility and X-Ray tracing support.

import { LogDrain } from '@your-org/functions-log-drain-sdk';
import AWS from 'aws-sdk';

const logger = new LogDrain({
apiKey: process.env.LOG_DRAIN_API_KEY,
service: 'aws-lambda-function',
environment: process.env.STAGE || 'dev',
metadata: {
region: process.env.AWS_REGION,
functionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
functionVersion: process.env.AWS_LAMBDA_FUNCTION_VERSION,
memorySize: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE
}
});

const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();

export const handler = async (event, context) => {
const requestId = context.requestId;
const traceId = process.env.\_X_AMZN_TRACE_ID;

await logger.info('Lambda invoked', {
requestId,
traceId,
eventSource: event.Records?.[0]?.eventSource || 'api-gateway',
functionName: context.functionName,
functionVersion: context.functionVersion,
remainingTime: context.getRemainingTimeInMillis()
});

try {
// Handle different event sources
let result;

    if (event.Records) {
      // S3, SQS, SNS, DynamoDB Streams, etc.
      result = await handleEventRecords(event.Records, { requestId, context });
    } else if (event.httpMethod) {
      // API Gateway
      result = await handleApiGateway(event, { requestId, context });
    } else if (event.source === 'aws.events') {
      // EventBridge
      result = await handleEventBridge(event, { requestId, context });
    } else {
      // Direct invocation
      result = await handleDirectInvocation(event, { requestId, context });
    }

    await logger.info('Lambda completed', {
      requestId,
      executionTime: context.getRemainingTimeInMillis(),
      memoryUsed: process.memoryUsage().heapUsed,
      status: 'success'
    });

    return result;

} catch (error) {
await logger.error('Lambda failed', {
requestId,
traceId,
error: error.message,
errorType: error.constructor.name,
stack: error.stack,
remainingTime: context.getRemainingTimeInMillis()
});

    throw error;

}
};

async function handleEventRecords(records, { requestId, context }) {
await logger.info('Processing event records', {
requestId,
recordCount: records.length,
eventSource: records[0].eventSource
});

const results = [];

for (const record of records) {
try {
let result;

      switch (record.eventSource) {
        case 'aws:s3':
          result = await handleS3Event(record, { requestId });
          break;
        case 'aws:sqs':
          result = await handleSQSEvent(record, { requestId });
          break;
        case 'aws:dynamodb':
          result = await handleDynamoDBEvent(record, { requestId });
          break;
        default:
          await logger.warn('Unknown event source', {
            requestId,
            eventSource: record.eventSource
          });
      }

      results.push({ success: true, result });

    } catch (error) {
      await logger.error('Record processing failed', {
        requestId,
        recordId: record.eventID,
        error: error.message
      });

      results.push({ success: false, error: error.message });
    }

}

return {
statusCode: 200,
body: JSON.stringify({ processed: results.length, results })
};
}

async function handleS3Event(record, { requestId }) {
const bucket = record.s3.bucket.name;
const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

await logger.info('Processing S3 event', {
requestId,
eventName: record.eventName,
bucket,
key,
size: record.s3.object.size
});

// Get object from S3
const object = await s3.getObject({ Bucket: bucket, Key: key }).promise();

await logger.debug('S3 object retrieved', {
requestId,
bucket,
key,
contentType: object.ContentType,
contentLength: object.ContentLength
});

// Process the object
const processed = await processS3Object(object.Body, {
bucket,
key,
metadata: object.Metadata
});

await logger.info('S3 object processed', {
requestId,
bucket,
key,
result: processed.summary
});

return processed;
}

async function handleSQSEvent(record, { requestId }) {
const messageId = record.messageId;
const body = JSON.parse(record.body);

await logger.info('Processing SQS message', {
requestId,
messageId,
attributes: record.attributes
});

const result = await processSQSMessage(body);

await logger.info('SQS message processed', {
requestId,
messageId,
result: result.summary
});

return result;
}

async function handleDynamoDBEvent(record, { requestId }) {
const eventName = record.eventName;
const keys = record.dynamodb.Keys;

await logger.info('Processing DynamoDB stream event', {
requestId,
eventName,
tableName: record.eventSourceARN.split('/')[1],
keys
});

const result = await processDynamoDBRecord({
eventName,
keys,
newImage: record.dynamodb.NewImage,
oldImage: record.dynamodb.OldImage
});

await logger.info('DynamoDB record processed', {
requestId,
eventName,
result: result.summary
});

return result;
}

async function handleApiGateway(event, { requestId, context }) {
await logger.info('Processing API Gateway request', {
requestId,
method: event.httpMethod,
path: event.path,
sourceIp: event.requestContext.identity.sourceIp
});

const result = await processApiRequest({
method: event.httpMethod,
path: event.path,
queryParams: event.queryStringParameters,
body: event.body ? JSON.parse(event.body) : null,
headers: event.headers
});

return {
statusCode: 200,
headers: {
'Content-Type': 'application/json',
'X-Request-Id': requestId
},
body: JSON.stringify(result)
};
}

async function handleEventBridge(event, { requestId, context }) {
await logger.info('Processing EventBridge event', {
requestId,
source: event.source,
detailType: event['detail-type'],
resources: event.resources
});

const result = await processEventBridgeEvent(event.detail);

return { success: true, result };
}

async function handleDirectInvocation(event, { requestId, context }) {
await logger.info('Processing direct invocation', {
requestId,
payload: event
});

const result = await processDirectEvent(event);

return { success: true, result };
}

// Mock processing functions
async function processS3Object(body, metadata) {
return { summary: 'Processed' };
}

async function processSQSMessage(body) {
return { summary: 'Processed' };
}

async function processDynamoDBRecord(record) {
return { summary: 'Processed' };
}

async function processApiRequest(request) {
return { success: true };
}

async function processEventBridgeEvent(detail) {
return { success: true };
}

async function processDirectEvent(event) {
return { success: true };
}

Additional Resources

For more information, refer to the SDK documentation and API reference guides.
