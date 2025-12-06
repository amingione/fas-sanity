import React, {useState} from 'react'
import type {DocumentActionComponent} from 'sanity'
import {CreateLabelWizard} from '../../components/wizard/CreateLabelWizard'
import {readStudioEnv} from '../../utils/studioEnv'

export const createEasyPostLabelAction: DocumentActionComponent = (props) => {
  const provider = (
    readStudioEnv('SHIPPING_PROVIDER') ||
    readStudioEnv('SANITY_STUDIO_SHIPPING_PROVIDER') ||
    ''
  ).toLowerCase()

  const {published, onComplete} = props
  const [open, setOpen] = useState(false)

  if (provider !== 'easypost') return null
  if (!published || published._type !== 'order') return null

  const orderId = (published._id || '').replace(/^drafts\./, '')

  const handleClose = () => {
    setOpen(false)
    onComplete()
  }

  return {
    label: 'Create EasyPost Label',
    tone: 'positive',
    onHandle: () => setOpen(true),
    dialog: open
      ? {
          type: 'dialog' as const,
          onClose: handleClose,
          header: 'Create Shipping Label',
          content: (
            <CreateLabelWizard
              order={published as any}
              orderId={orderId}
              onComplete={handleClose}
            />
          ),
        }
      : undefined,
  }
}
