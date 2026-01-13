import type {DocumentActionComponent} from 'sanity'
import {PackageIcon, RocketIcon, EnvelopeIcon} from '@sanity/icons'
import {Button, Inline, Stack, Text, TextInput} from '@sanity/ui'
import {useState} from 'react'
import {callNetlifyFunction} from '../../utils/netlifyHelpers'

const openUrl = (url?: string | null) => {
  if (!url) return
  try {
    window.open(url, '_blank', 'noopener')
  } catch {
    window.location.href = url
  }
}

export const GeneratePackingSlipAction: DocumentActionComponent = (props) => {
  const {type, draft, published, onComplete} = props
  if (type !== 'order') return null

  return {
    label: 'Generate packing slip',
    icon: PackageIcon,
    onHandle: async () => {
      const doc = draft || published
      if (!doc?._id) {
        alert('Save the order before generating a packing slip.')
        onComplete()
        return
      }
      try {
        const orderId = doc._id.replace(/^drafts\./, '')
        const response = await callNetlifyFunction('generatePackingSlips', {orderId})
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const filenameSafe = (doc.orderNumber || orderId).toString().replace(/[^a-z0-9_-]/gi, '') || 'order'
        const a = document.createElement('a')
        a.href = url
        a.download = `packing-slip-${filenameSafe}.pdf`
        a.click()
        window.URL.revokeObjectURL(url)
        onComplete()
      } catch (err) {
        console.error('GeneratePackingSlipAction failed', err)
        alert((err as Error)?.message || 'Failed to generate packing slip')
        onComplete()
      }
    },
  }
}

export const CreateShippingLabelAction: DocumentActionComponent = (props) => {
  const {type, draft, published, onComplete} = props
  if (type !== 'order') return null
  const doc = draft || published
  const labelAlreadyPurchased = Boolean(doc?.labelPurchased)
  const defaultDimensions = {weight: 2, length: 10, width: 8, height: 4}
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'form' | 'message'>('form')
  const [dialogMessage, setDialogMessage] = useState('')
  const [formError, setFormError] = useState('')
  const [weightInput, setWeightInput] = useState('')
  const [lengthInput, setLengthInput] = useState('')
  const [widthInput, setWidthInput] = useState('')
  const [heightInput, setHeightInput] = useState('')
  const [resultLabelUrl, setResultLabelUrl] = useState<string | null>(null)

  const openMessageDialog = (message: string) => {
    setDialogMode('message')
    setDialogMessage(message)
    setDialogOpen(true)
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setDialogMessage('')
    setFormError('')
    setResultLabelUrl(null)
    onComplete()
  }

  const openFormDialog = () => {
    const packageDimensions: {
      weight?: number | null
      length?: number | null
      width?: number | null
      height?: number | null
    } = doc?.packageDimensions || {}
    const normalizedFromDoc = {
      weight:
        typeof packageDimensions.weight === 'number' && packageDimensions.weight > 0
          ? packageDimensions.weight
          : null,
      length:
        typeof packageDimensions.length === 'number' && packageDimensions.length > 0
          ? packageDimensions.length
          : null,
      width:
        typeof packageDimensions.width === 'number' && packageDimensions.width > 0
          ? packageDimensions.width
          : null,
      height:
        typeof packageDimensions.height === 'number' && packageDimensions.height > 0
          ? packageDimensions.height
          : null,
    }
    const seed = {
      weight: normalizedFromDoc.weight ?? defaultDimensions.weight,
      length: normalizedFromDoc.length ?? defaultDimensions.length,
      width: normalizedFromDoc.width ?? defaultDimensions.width,
      height: normalizedFromDoc.height ?? defaultDimensions.height,
    }
    setWeightInput(String(seed.weight))
    setLengthInput(String(seed.length))
    setWidthInput(String(seed.width))
    setHeightInput(String(seed.height))
    setDialogMode('form')
    setDialogOpen(true)
  }

  return {
    label: 'Create shipping label',
    icon: RocketIcon,
    tone: 'primary',
    disabled: labelAlreadyPurchased,
    title: labelAlreadyPurchased ? 'Label already purchased for this order.' : undefined,
    onHandle: () => {
      if (!doc?._id) {
        openMessageDialog('Save the order before creating a label.')
        return
      }
      if (doc.labelPurchased) {
        openMessageDialog(
          `Label already purchased${doc.trackingNumber ? ` (Tracking ${doc.trackingNumber})` : ''}.`,
        )
        return
      }
      if (!doc.shippingAddress) {
        openMessageDialog('Add a shipping address before purchasing a label.')
        return
      }
      openFormDialog()
    },
    dialog: dialogOpen
      ? {
          type: 'dialog',
          onClose: closeDialog,
          header: dialogMode === 'form' ? 'Create Shipping Label' : 'Shipping Label',
          content:
            dialogMode === 'form' ? (
              <Stack space={3}>
                <Text size={1} muted>
                  Confirm package details before purchasing the label.
                </Text>
                <TextInput
                  value={weightInput}
                  onChange={(event) => setWeightInput(event.currentTarget.value)}
                  placeholder="Weight (lbs)"
                />
                <TextInput
                  value={lengthInput}
                  onChange={(event) => setLengthInput(event.currentTarget.value)}
                  placeholder="Length (in)"
                />
                <TextInput
                  value={widthInput}
                  onChange={(event) => setWidthInput(event.currentTarget.value)}
                  placeholder="Width (in)"
                />
                <TextInput
                  value={heightInput}
                  onChange={(event) => setHeightInput(event.currentTarget.value)}
                  placeholder="Height (in)"
                />
                {formError ? (
                  <Text size={1} tone="critical">
                    {formError}
                  </Text>
                ) : null}
              </Stack>
            ) : (
              <Stack space={3}>
                <Text size={1}>{dialogMessage}</Text>
              </Stack>
            ),
          footer: (
            <Inline space={3}>
              <Button text="Close" mode="ghost" onClick={closeDialog} />
              {dialogMode === 'form' ? (
                <Button
                  text="Purchase Label"
                  tone="primary"
                  onClick={async () => {
                    const weight = Number.parseFloat(weightInput)
                    const length = Number.parseFloat(lengthInput)
                    const width = Number.parseFloat(widthInput)
                    const height = Number.parseFloat(heightInput)
                    if (
                      !Number.isFinite(weight) ||
                      !Number.isFinite(length) ||
                      !Number.isFinite(width) ||
                      !Number.isFinite(height) ||
                      weight <= 0 ||
                      length <= 0 ||
                      width <= 0 ||
                      height <= 0
                    ) {
                      setFormError('Enter positive numbers for weight and dimensions.')
                      return
                    }
                    setFormError('')
                    const body = {
                      orderId: (doc._id || '').replace(/^drafts\./, ''),
                      packageDetails: {
                        weight,
                        dimensions: {length, width, height},
                      },
                      rateId: doc.easypostRateId,
                      source: 'sanity-manual',
                    }
                    try {
                      const response = await fetch('/.netlify/functions/easypostCreateLabel', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(body),
                      })
                      if (!response.ok) {
                        const result = await response.json().catch(() => ({}))
                        throw new Error(result?.error || result?.message || 'Unable to create label')
                      }
                      const {trackingNumber, labelUrl, carrier, service, cost} =
                        (await response.json()) as {
                          trackingNumber?: string
                          labelUrl?: string
                          carrier?: string
                          service?: string
                          cost?: number
                        }
                      const costLabel = typeof cost === 'number' ? cost.toFixed(2) : null
                      setResultLabelUrl(labelUrl || null)
                      setDialogMessage(
                        `Shipping label created.\nTracking: ${trackingNumber || 'Pending'}\n` +
                          `Carrier: ${carrier || 'n/a'} • Service: ${service || 'n/a'}${
                            costLabel ? ` • Cost: $${costLabel}` : ''
                          }`,
                      )
                      setDialogMode('message')
                    } catch (err) {
                      console.error('CreateShippingLabelAction failed', err)
                      setFormError((err as Error)?.message || 'Failed to create shipping label')
                    }
                  }}
                />
              ) : resultLabelUrl ? (
                <Button
                  text="Open Label"
                  tone="primary"
                  onClick={() => {
                    if (resultLabelUrl) openUrl(resultLabelUrl)
                    closeDialog()
                  }}
                />
              ) : null}
            </Inline>
          ),
        }
      : undefined,
  }
}

export const SendShippingConfirmationAction: DocumentActionComponent = (props) => {
  const {type, draft, published, onComplete} = props
  if (type !== 'order') return null

  return {
    label: 'Send shipping confirmation',
    icon: EnvelopeIcon,
    onHandle: async () => {
      const doc = draft || published
      if (!doc?.trackingNumber) {
        alert('Add a tracking number before emailing the customer.')
        onComplete()
        return
      }
      try {
        const response = await fetch('/api/send-shipping-confirmation', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            orderId: doc._id,
            orderNumber: doc.orderNumber,
            customerEmail: doc.customerEmail,
            trackingNumber: doc.trackingNumber,
            trackingUrl: doc.trackingUrl,
          }),
        })
        if (!response.ok) {
          const {message} = await response.json().catch(() => ({message: 'Unable to send email'}))
          throw new Error(message)
        }
        alert('Shipping confirmation sent.')
      } catch (err) {
        console.error('SendShippingConfirmationAction failed', err)
        alert((err as Error)?.message || 'Failed to send shipping confirmation')
      } finally {
        onComplete()
      }
    },
  }
}
