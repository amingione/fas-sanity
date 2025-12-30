import {TagIcon} from '@sanity/icons'
import type {DocumentActionDescription, DocumentActionProps} from 'sanity'
import {generateInitialVendorNumber} from '../../utils/generateVendorNumber'
import {getClient} from '../../utils/sanityClient'

const API_VERSION = '2024-10-01'

export const generateVendorNumberAction = (
  props: DocumentActionProps,
): DocumentActionDescription | null => {
  const {draft, published, id} = props
  const hasNumber = Boolean((draft as any)?.vendorNumber || (published as any)?.vendorNumber)

  if (hasNumber) {
    return {
      label: 'Vendor Number Set',
      icon: TagIcon,
      tone: 'positive',
      disabled: true,
      title: 'Vendor number already generated.',
      onHandle: props.onComplete,
    }
  }

  const client = getClient({apiVersion: API_VERSION})

  return {
    label: 'Generate Vendor Number',
    icon: TagIcon,
    tone: 'primary',
    onHandle: async () => {
      try {
        const vendorNumber = await generateInitialVendorNumber(client)
        const targets = [
          (draft as any)?._id,
          (published as any)?._id,
          id, // fallback
        ].filter(Boolean) as string[]

        await Promise.all(
          targets.map((targetId) =>
            client.patch(targetId).set({vendorNumber}).commit({autoGenerateArrayKeys: true}),
          ),
        )
      } catch (error) {
        console.error('generateVendorNumberAction: failed to generate vendor number', error)
        alert('Unable to generate vendor number. Please try again or contact an admin.')
      } finally {
        props.onComplete()
      }
    },
  }
}
