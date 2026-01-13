import type {DocumentActionComponent} from 'sanity'
import {Button, Inline, Stack, Text, TextInput} from '@sanity/ui'
import {useState} from 'react'
import {formatApiError} from '../../utils/formatApiError'
import {resolveNetlifyBase} from '../../utils/netlifyBase'

const getFnBase = (): string => resolveNetlifyBase()

export const createShippingLabel: DocumentActionComponent = (props) => {
  const {id, published, onComplete} = props
  const [dialogOpen, setDialogOpen] = useState(false)
  const [weightInput, setWeightInput] = useState('1')
  const [lengthInput, setLengthInput] = useState('10')
  const [widthInput, setWidthInput] = useState('8')
  const [heightInput, setHeightInput] = useState('4')
  const [dialogMessage, setDialogMessage] = useState('')
  const [formError, setFormError] = useState('')
  const [labelUrl, setLabelUrl] = useState<string | null>(null)

  if (!published || published._type !== 'invoice') return null
  return {
    label: 'Create Shipping Label',
    onHandle: () => {
      setDialogOpen(true)
    },
    dialog: dialogOpen
      ? {
          type: 'dialog',
          header: 'Create Shipping Label',
          onClose: () => {
            setDialogOpen(false)
            setFormError('')
            setDialogMessage('')
            setLabelUrl(null)
            onComplete()
          },
          content: dialogMessage ? (
            <Stack space={3}>
              <Text size={1}>{dialogMessage}</Text>
            </Stack>
          ) : (
            <Stack space={3}>
              <Text size={1} muted>
                Enter package weight and dimensions before purchasing the label.
              </Text>
              <TextInput
                value={weightInput}
                onChange={(event) => setWeightInput(event.currentTarget.value)}
                placeholder="Weight (lb)"
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
          ),
          footer: (
            <Inline space={3}>
              <Button
                text="Close"
                mode="ghost"
                onClick={() => {
                  setDialogOpen(false)
                  setFormError('')
                  setDialogMessage('')
                  setLabelUrl(null)
                  onComplete()
                }}
              />
              {dialogMessage ? (
                labelUrl ? (
                  <Button
                    text="Open Label"
                    tone="primary"
                    onClick={() => {
                      if (labelUrl) {
                        try {
                          window.open(labelUrl, '_blank')
                        } catch {}
                      }
                      setDialogOpen(false)
                      setFormError('')
                      setDialogMessage('')
                      setLabelUrl(null)
                      onComplete()
                    }}
                  />
                ) : null
              ) : (
                <Button
                  text="Purchase Label"
                  tone="primary"
                  onClick={async () => {
                    const wt = Number.parseFloat(weightInput)
                    const L = Number.parseFloat(lengthInput)
                    const W = Number.parseFloat(widthInput)
                    const H = Number.parseFloat(heightInput)
                    if (
                      !Number.isFinite(wt) ||
                      !Number.isFinite(L) ||
                      !Number.isFinite(W) ||
                      !Number.isFinite(H) ||
                      wt <= 0 ||
                      L <= 0 ||
                      W <= 0 ||
                      H <= 0
                    ) {
                      setFormError('Enter positive numbers for weight and dimensions.')
                      return
                    }
                    setFormError('')
                    try {
                      const base = getFnBase().replace(/\/$/, '')
                      const res = await fetch(`${base}/.netlify/functions/easypostCreateLabel`, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({
                          invoiceId: id,
                          package_details: {
                            weight: {value: wt, unit: 'pound'},
                            dimensions: {unit: 'inch', length: L, width: W, height: H},
                          },
                          source: 'sanity-manual',
                        }),
                      })
                      const result = await res.json().catch(() => ({}))
                      if (!res.ok || result?.error) {
                        throw new Error(formatApiError(result?.error ?? result ?? `HTTP ${res.status}`))
                      }
                      setLabelUrl(result?.labelUrl || null)
                      setDialogMessage(
                        `EasyPost label created. Tracking: ${result?.trackingNumber || 'n/a'}`,
                      )
                    } catch (error: any) {
                      console.error('Request failed', String(error?.message || error))
                      setFormError(error?.message || 'Request failed')
                    }
                  }}
                />
              )}
            </Inline>
          ),
        }
      : undefined,
  }
}
