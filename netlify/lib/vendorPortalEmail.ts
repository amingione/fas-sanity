import type {SanityClient} from '@sanity/client'

export const syncVendorPortalEmail = async (
  sanity: SanityClient,
  vendorId: string,
  email: string,
): Promise<boolean> => {
  const normalizedVendorId = vendorId.replace(/^drafts\./, '')
  const normalizedEmail = email.trim()
  if (!normalizedVendorId || !normalizedEmail) return false

  await sanity
    .patch(normalizedVendorId)
    .setIfMissing({portalAccess: {}})
    .set({'portalAccess.email': normalizedEmail})
    .commit({autoGenerateArrayKeys: true})

  return true
}
