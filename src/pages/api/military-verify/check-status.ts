import type {APIRoute} from 'astro'
import {checkMilitaryVerificationStatus} from '../../../lib/militaryVerification'

type StatusRequest = {
  verificationId?: string
}

export const POST: APIRoute = async ({request}) => {
  let payload: StatusRequest
  try {
    payload = (await request.json()) as StatusRequest
  } catch {
    return jsonResponse({error: 'Invalid JSON payload'}, 400)
  }

  const verificationId = payload.verificationId?.trim() || ''
  if (!verificationId) {
    return jsonResponse({error: 'verificationId is required'}, 400)
  }

  try {
    const result = await checkMilitaryVerificationStatus(verificationId)
    if (result.verified) {
      return jsonResponse({
        success: true,
        verified: true,
        code: result.code,
        message: 'Verification complete. Check your email for your discount code.',
      })
    }

    return jsonResponse({
      success: true,
      verified: false,
      status: result.status,
      uploadUrl: result.uploadUrl,
      message:
        result.status === 'requires_documents'
          ? 'Document review in progress.'
          : 'Verification in progress.',
    })
  } catch (error: any) {
    console.error('military-verify/check-status error:', error)
    return jsonResponse(
      {error: error?.message || 'Failed to check verification status.'},
      500,
    )
  }
}

const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {'Content-Type': 'application/json'},
  })
