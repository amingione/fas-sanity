/**
 * POST /api/vendor/invoices/upload
 *
 * Allows vendors to upload invoice files (PDF, DOC, DOCX) to Sanity CDN.
 * Creates a new invoice document linked to the authenticated vendor.
 *
 * Requires the upload_invoices permission scope.
 *
 * Request: multipart/form-data
 *   file       - Required. The invoice file (PDF, DOC, DOCX — max 10MB)
 *   title      - Required. Invoice title / reference label
 *   invoiceNumber - Optional. Vendor's own invoice number
 *   orderNumber   - Optional. Related order number
 *   invoiceDate   - Optional. ISO date string (YYYY-MM-DD)
 *
 * Response 201: { invoiceId: string, fileUrl: string }
 * Response 400/401/403: { error: string }
 */

import type {APIRoute} from 'astro'
import {requireVendorAuth, requirePermission, handleAuthError, jsonOk, jsonError} from '@/lib/vendorAuth'
import {sanityClient} from '@/sanity/lib/client'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])
const ALLOWED_EXTENSIONS = new Set(['pdf', 'doc', 'docx'])

function getExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? ''
}

export const POST: APIRoute = async ({request}) => {
  try {
    const {vendor, token} = await requireVendorAuth(request)
    requirePermission(token, 'upload_invoices')

    const contentType = request.headers.get('content-type') ?? ''
    if (!contentType.includes('multipart/form-data')) {
      return jsonError('Request must be multipart/form-data', 400)
    }

    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return jsonError('Failed to parse form data', 400)
    }

    // --- Validate file ---
    const file = formData.get('file')
    if (!file || !(file instanceof File)) {
      return jsonError('file is required', 400)
    }

    if (file.size > MAX_FILE_SIZE) {
      return jsonError('File exceeds maximum size of 10MB', 400)
    }

    const ext = getExtension(file.name)
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return jsonError('Only PDF, DOC, and DOCX files are allowed', 400)
    }

    if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
      return jsonError(`Invalid MIME type: ${file.type}. Only PDF, DOC, DOCX are allowed`, 400)
    }

    // --- Validate metadata fields ---
    const title = formData.get('title')
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return jsonError('title is required', 400)
    }

    const invoiceNumber = formData.get('invoiceNumber')
    const orderNumber = formData.get('orderNumber')
    const invoiceDateRaw = formData.get('invoiceDate')

    let invoiceDate: string | undefined
    if (invoiceDateRaw && typeof invoiceDateRaw === 'string') {
      const parsed = Date.parse(invoiceDateRaw)
      if (isNaN(parsed)) {
        return jsonError('invoiceDate must be a valid ISO date (YYYY-MM-DD)', 400)
      }
      invoiceDate = invoiceDateRaw.split('T')[0] // ensure date-only
    }

    // --- Upload file to Sanity CDN ---
    const fileBuffer = Buffer.from(await file.arrayBuffer())
    const uploadedFile = await sanityClient.assets.upload('file', fileBuffer, {
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
    })

    // --- Create invoice document ---
    const invoiceDoc = await sanityClient.create({
      _type: 'invoice',
      title: title.trim(),
      status: 'pending',
      currency: 'USD',
      vendorRef: {_type: 'reference', _ref: vendor._id},
      ...(invoiceNumber && typeof invoiceNumber === 'string' ? {invoiceNumber: invoiceNumber.trim()} : {}),
      ...(orderNumber && typeof orderNumber === 'string' ? {orderNumber: orderNumber.trim()} : {}),
      ...(invoiceDate ? {invoiceDate} : {}),
      file: {
        _type: 'file',
        asset: {
          _type: 'reference',
          _ref: uploadedFile._id,
        },
      },
    })

    // Write activity event (non-fatal)
    await sanityClient
      .create({
        _type: 'vendorActivityEvent',
        eventId: `invoice-upload-${invoiceDoc._id}-${Date.now()}`,
        eventType: 'vendor.invoice.created',
        vendorRef: {_type: 'reference', _ref: vendor._id},
        vendorId: vendor._id,
        occurredAt: new Date().toISOString(),
        summary: `Invoice uploaded: ${title.trim()}`,
        payload: {
          invoiceId: invoiceDoc._id,
          filename: file.name,
          uploadedBy: token.email,
        },
      })
      .catch((err: unknown) => {
        console.error('[vendor/invoices/upload] Failed to write activity event:', err)
      })

    return jsonOk(
      {
        invoiceId: invoiceDoc._id,
        fileUrl: uploadedFile.url,
      },
      201,
    )
  } catch (err) {
    return handleAuthError(err)
  }
}

export const GET: APIRoute = () =>
  new Response(JSON.stringify({error: 'Method not allowed'}), {
    status: 405,
    headers: {'Content-Type': 'application/json'},
  })
