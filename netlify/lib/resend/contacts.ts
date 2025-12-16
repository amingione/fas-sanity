import {Resend} from 'resend'
import {resolveResendApiKey} from '../../../shared/resendEnv'

type ContactAction = 'created' | 'updated' | 'removed' | 'skipped' | 'failed'

export interface ContactData {
  email: string
  firstName?: string
  lastName?: string
  unsubscribed?: boolean
}

export interface ContactAudienceResult {
  success: boolean
  action: ContactAction
  error?: unknown
}

export interface SyncContactResult {
  general: ContactAudienceResult
  subscribers: ContactAudienceResult
}

const resendApiKey = resolveResendApiKey()
const resend = resendApiKey ? new Resend(resendApiKey) : null

const AUDIENCE_GENERAL =
  process.env.RESEND_AUDIENCE_GENERAL || '2b09020e-6039-4478-abd0-21c9a166f0ff'
const AUDIENCE_SUBSCRIBERS =
  process.env.RESEND_AUDIENCE_SUBSCRIBERS || '5c338174-537e-43f6-9f06-b9957c43ae12'

if (!resendApiKey) {
  console.warn('[resend/contacts] RESEND_API_KEY not configured; contact sync is disabled.')
}

/**
 * Sync a contact to the two-tier audience system.
 * - Always upserts into the General audience
 * - Adds to Subscribers when unsubscribed !== true
 * - Removes from Subscribers when unsubscribed === true
 */
export async function syncContact(data: ContactData): Promise<SyncContactResult> {
  const defaultResult: SyncContactResult = {
    general: {success: false, action: 'skipped', error: undefined},
    subscribers: {success: false, action: 'skipped', error: undefined},
  }

  if (!resend) {
    const error = new Error('RESEND_API_KEY not configured')
    return {
      general: {...defaultResult.general, error},
      subscribers: {...defaultResult.subscribers, error},
    }
  }

  const trimmedEmail = data.email.trim().toLowerCase()
  const isSubscribed = data.unsubscribed !== true

  const results: SyncContactResult = {
    general: {success: false, action: 'skipped'},
    subscribers: {success: false, action: 'skipped'},
  }

  try {
    const generalResult = await upsertContactToAudience(AUDIENCE_GENERAL, {
      ...data,
      email: trimmedEmail,
    })
    results.general = generalResult
    console.log(`[resend/contacts] General: ${generalResult.action} ${trimmedEmail}`)
  } catch (error) {
    console.error('[resend/contacts] Failed to sync General audience', error)
    results.general = {success: false, action: 'failed', error}
  }

  if (isSubscribed) {
    try {
      const subscribersResult = await upsertContactToAudience(AUDIENCE_SUBSCRIBERS, {
        ...data,
        email: trimmedEmail,
      })
      results.subscribers = subscribersResult
      console.log(`[resend/contacts] Subscribers: ${subscribersResult.action} ${trimmedEmail}`)
    } catch (error) {
      console.error('[resend/contacts] Failed to sync Subscribers audience', error)
      results.subscribers = {success: false, action: 'failed', error}
    }
  } else {
    try {
      const removeResult = await removeContactFromAudience(AUDIENCE_SUBSCRIBERS, trimmedEmail)
      results.subscribers = removeResult
      console.log(`[resend/contacts] Subscribers: ${removeResult.action} ${trimmedEmail}`)
    } catch (error) {
      console.warn('[resend/contacts] Remove from Subscribers failed', error)
      results.subscribers = {success: false, action: 'failed', error}
    }
  }

  return results
}

/** Create or update a contact for a specific audience */
async function upsertContactToAudience(
  audienceId: string,
  data: ContactData,
): Promise<ContactAudienceResult> {
  if (!resend) throw new Error('RESEND_API_KEY not configured')

  const email = data.email.trim().toLowerCase()
  const existing = await resend.contacts.get({audienceId, email})

  if (existing?.error && existing.error.name !== 'not_found') {
    throw new Error(existing.error.message)
  }

  if (existing?.data) {
    const update = await resend.contacts.update({
      audienceId,
      email,
      firstName: data.firstName,
      lastName: data.lastName,
      unsubscribed: data.unsubscribed ?? false,
    })

    if (update.error) {
      throw new Error(update.error.message)
    }

    return {success: true, action: 'updated'}
  }

  const created = await resend.contacts.create({
    audienceId,
    email,
    firstName: data.firstName,
    lastName: data.lastName,
    unsubscribed: data.unsubscribed ?? false,
  })

  if (created.error) {
    throw new Error(created.error.message)
  }

  return {success: true, action: 'created'}
}

/** Remove a contact from an audience */
async function removeContactFromAudience(
  audienceId: string,
  email: string,
): Promise<ContactAudienceResult> {
  if (!resend) throw new Error('RESEND_API_KEY not configured')

  const removed = await resend.contacts.remove({audienceId, email})

  if (removed.error && removed.error.name !== 'not_found') {
    throw new Error(removed.error.message)
  }

  return {success: true, action: 'removed'}
}

export async function listContacts(audienceId: string) {
  if (!resend) throw new Error('RESEND_API_KEY not configured')
  const list = await resend.contacts.list({audienceId})
  if (list.error) throw new Error(list.error.message)
  return list.data
}

export async function getAudienceStats() {
  try {
    const general = await listContacts(AUDIENCE_GENERAL)
    const subscribers = await listContacts(AUDIENCE_SUBSCRIBERS)

    return {
      general: general?.data?.length || 0,
      subscribers: subscribers?.data?.length || 0,
    }
  } catch (error) {
    console.error('[resend/contacts] Failed to fetch audience stats', error)
    return {general: 0, subscribers: 0}
  }
}
