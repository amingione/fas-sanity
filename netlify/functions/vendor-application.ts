import type {Handler, HandlerEvent} from '@netlify/functions'
import {createClient} from '@sanity/client'
import multiparty from 'multiparty'
import {createReadStream} from 'fs'
import {Readable} from 'stream'

const client = (() => {
  const projectId = process.env.SANITY_PROJECT_ID
  const token = process.env.SANITY_WRITE_TOKEN
  if (!projectId || !token) {
    console.warn('vendor-application function missing SANITY_PROJECT_ID or SANITY_WRITE_TOKEN')
    return null
  }

  return createClient({
    projectId,
    dataset: process.env.SANITY_DATASET || 'production',
    token,
    apiVersion: '2024-01-01',
    useCdn: false,
  })
})()

type ParsedForm = {
  fields: Record<string, string[] | undefined>
  files: Record<string, multiparty.File[] | undefined>
}

const normalizeHeader = (headers: HandlerEvent['headers']): string | undefined => {
  if (!headers) return undefined
  return (
    headers['content-type'] ||
    headers['Content-Type'] ||
    headers['CONTENT-TYPE'] ||
    headers['content_type']
  )
}

const parseForm = (event: HandlerEvent): Promise<ParsedForm> =>
  new Promise((resolve, reject) => {
    const contentType = normalizeHeader(event.headers)
    if (!contentType) {
      reject(new Error('Missing Content-Type header'))
      return
    }

    const bodyBuffer = Buffer.from(event.body || '', event.isBase64Encoded ? 'base64' : 'utf8')
    const stream = new Readable({
      read() {
        this.push(bodyBuffer)
        this.push(null)
      },
    }) as Readable & {headers: Record<string, string>}

    stream.headers = {
      'content-type': contentType,
      'content-length': String(bodyBuffer.length),
    }

    const form = new multiparty.Form()
    form.parse(stream as any, (err, fields, files) => {
      if (err) {
        reject(err)
      } else {
        resolve({fields, files})
      }
    })
  })

const getFieldValue = (
  fields: Record<string, string[] | undefined>,
  name: string,
): string | null => {
  const value = fields[name]
  if (!value || value.length === 0) return null
  return value[0]
}

const getFieldValues = (fields: Record<string, string[] | undefined>, name: string): string[] => {
  const value = fields[name]
  if (!value) return []
  return value.filter((entry) => typeof entry === 'string' && entry.length > 0)
}

const parseBoolean = (value: string | null, defaultValue = false) => {
  if (value == null) return defaultValue
  const normalized = value.toLowerCase()
  return normalized === 'true' || normalized === 'on' || normalized === '1'
}

const parseNumberField = (value: string | null): number | undefined => {
  if (!value) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? undefined : parsed
}

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }

  if (event.httpMethod === 'OPTIONS') {
    return {statusCode: 200, headers, body: ''}
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({error: 'Method not allowed'}),
    }
  }

  if (!client) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({error: 'Server misconfiguration: missing Sanity credentials'}),
    }
  }

  try {
    const {fields, files} = await parseForm(event)
    const getField = (name: string) => getFieldValue(fields, name)

    const applicationNumber = `APP-${Date.now().toString().slice(-6)}`
    const yearsInBusiness = parseNumberField(getField('yearsInBusiness'))
    const productsInterested = getFieldValues(fields, 'productsInterested')
    const taxExempt = parseBoolean(getField('taxExempt'), false)
    const shippingAddressSame = parseBoolean(getField('shippingAddressSame'), true)

    let taxCertAssetId: string | null = null
    const taxFiles = files.taxExemptCertificate
    if (Array.isArray(taxFiles) && taxFiles[0]) {
      const file = taxFiles[0]
      const stream = createReadStream(file.path)
      const asset = await client.assets.upload('file', stream, {
        filename: file.originalFilename || 'tax-certificate.pdf',
      })
      taxCertAssetId = asset?._id || null
    }

    const shippingAddress = !shippingAddressSame
      ? {
          street: getField('shippingAddress.street'),
          city: getField('shippingAddress.city'),
          state: getField('shippingAddress.state'),
          zip: getField('shippingAddress.zip'),
          country: getField('shippingAddress.country') || 'US',
        }
      : undefined

    const application = await client.create({
      _type: 'vendorApplication',
      applicationNumber,
      status: 'pending',
      submittedAt: new Date().toISOString(),
      companyName: getField('companyName'),
      businessType: getField('businessType'),
      taxId: getField('taxId'),
      yearsInBusiness,
      website: getField('website'),
      contactName: getField('contactName'),
      contactTitle: getField('contactTitle'),
      email: getField('email'),
      phone: getField('phone'),
      alternatePhone: getField('alternatePhone'),
      businessAddress: {
        street: getField('businessAddress.street'),
        city: getField('businessAddress.city'),
        state: getField('businessAddress.state'),
        zip: getField('businessAddress.zip'),
        country: getField('businessAddress.country') || 'US',
      },
      shippingAddressSame,
      ...(shippingAddress ? {shippingAddress} : {}),
      estimatedMonthlyVolume: getField('estimatedMonthlyVolume'),
      productsInterested,
      currentSuppliers: getField('currentSuppliers'),
      howDidYouHear: getField('howDidYouHear'),
      additionalNotes: getField('additionalNotes'),
      taxExempt,
      ...(taxCertAssetId
        ? {
            taxExemptCertificate: {
              _type: 'file',
              asset: {_type: 'reference', _ref: taxCertAssetId},
            },
          }
        : {}),
    })

    console.log('Vendor application created', application._id)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        applicationNumber,
        applicationId: application._id,
        message: 'Application submitted successfully',
      }),
    }
  } catch (error) {
    console.error('Vendor application error', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to submit application',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
    }
  }
}
