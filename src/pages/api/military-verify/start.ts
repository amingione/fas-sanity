import type {APIRoute} from 'astro'
import {startMilitaryVerification} from '../../../lib/militaryVerification'

type StartRequest = {
  email?: string
  firstName?: string
  lastName?: string
  birthDate?: string
}

export const POST: APIRoute = async ({request}) => {
  let payload: StartRequest
  try {
    payload = (await request.json()) as StartRequest
  } catch {
    return jsonResponse({error: 'Invalid JSON payload'}, 400)
  }

  const email = payload.email?.trim() || ''
  const firstName = payload.firstName?.trim() || ''
  const lastName = payload.lastName?.trim() || ''
  const birthDate = payload.birthDate?.trim() || ''

  if (!email || !firstName || !lastName || !birthDate) {
    return jsonResponse({error: 'Missing required fields'}, 400)
  }

  try {
    const result = await startMilitaryVerification({
      email,
      firstName,
      lastName,
      birthDate,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
      userAgent: request.headers.get('user-agent'),
    })

    if (result.alreadyVerified) {
      return jsonResponse(
        {
          success: false,
          error: 'You already have an active military discount code. Check your email.',
          existingCode: result.code,
        },
        200,
      )
    }

    if (result.alreadyPending) {
      return jsonResponse({
        success: true,
        verified: false,
        requiresDocuments: result.status === 'requires_documents',
        uploadUrl: result.uploadUrl,
        verificationId: result.verificationId,
        message: 'A verification is already in progress.',
      })
    }

    if (result.verified) {
      return jsonResponse({
        success: true,
        verified: true,
        code: result.code,
        message: 'Verification successful. Check your email for your discount code.',
      })
    }

    if (result.requiresDocuments) {
      return jsonResponse({
        success: true,
        verified: false,
        requiresDocuments: true,
        uploadUrl: result.uploadUrl,
        verificationId: result.verificationId,
        message: 'Please upload documents to complete verification.',
      })
    }

    if (result.status === 'pending' && result.verificationId) {
      return jsonResponse({
        success: true,
        verified: false,
        requiresDocuments: false,
        verificationId: result.verificationId,
        message: 'Verification is in progress. Please check back soon.',
      })
    }

    return jsonResponse({error: 'Verification could not be completed.'}, 400)
  } catch (error: any) {
    console.error('military-verify/start error:', error)
    return jsonResponse(
      {error: error?.message || 'Verification failed. Please try again later.'},
      500,
    )
  }
}

const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {'Content-Type': 'application/json'},
  })
