import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {OkHandIcon, RobotIcon} from '@sanity/icons'
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Inline,
  Spinner,
  Stack,
  Text,
  TextInput,
  useToast,
} from '@sanity/ui'
import {set, unset, StringInputProps, useFormValue} from 'sanity'
import {getNetlifyFunctionBaseCandidates} from '../../utils/netlifyBase'
import {canonicalizeTrackingNumber, validateTrackingNumber} from '../../../../../shared/tracking'

const MAX_MANUAL_FULFILLMENT_RETRIES = 3
const RETRY_BACKOFF_BASE_MS = 250
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

type StatusTone = 'positive' | 'critical' | 'caution'

type StatusState = {
  tone: StatusTone
  text: string
}

function normalizeForDisplay(raw?: string | null) {
  return (raw ?? '').toString().trim()
}

const ManualTrackingInput = React.forwardRef<HTMLInputElement, StringInputProps>(
  function ManualTrackingInput(props, forwardedRef) {
    const {value, onChange, elementProps, schemaType} = props
    const [inputValue, setInputValue] = useState(typeof value === 'string' ? value : '')
    const [isSending, setIsSending] = useState(false)
    const [status, setStatus] = useState<StatusState | null>(null)
    const toast = useToast()
    const [lastCarrierLabel, setLastCarrierLabel] = useState<string | null>(null)
    const [lastTrackingUrl, setLastTrackingUrl] = useState<string | null>(null)

    const orderIdValue = useFormValue(['_id']) as string | undefined
    const orderNumber = useFormValue(['orderNumber']) as string | undefined
    const storedTrackingNumber = useFormValue(['trackingNumber']) as string | undefined
    const shippingLog = useFormValue(['shippingLog']) as any
    const orderStatusValue = useFormValue(['status']) as string | undefined
    const baseCandidates = useMemo(() => getNetlifyFunctionBaseCandidates(), [])
    const shippingLogEntries = useMemo(
      () => (Array.isArray(shippingLog) ? shippingLog : []),
      [shippingLog],
    )
    const existingTrackingSet = useMemo(() => {
      const tracked = new Set<string>()
      const append = (candidate: unknown) => {
        if (typeof candidate === 'string' && candidate) {
          const canonical = canonicalizeTrackingNumber(candidate)
          if (canonical) {
            tracked.add(canonical)
          }
          return
        }
        if (candidate && typeof candidate === 'object' && 'toString' in candidate) {
          const canonical = canonicalizeTrackingNumber(String(candidate))
          if (canonical) {
            tracked.add(canonical)
          }
        }
      }

      append(storedTrackingNumber)
      for (const entry of shippingLogEntries) {
        append(entry?.trackingNumber)
      }

      return tracked
    }, [shippingLogEntries, storedTrackingNumber])
    const lastSuccessfulBaseRef = useRef<string | null>(baseCandidates[0] ?? null)
    const lastTriggeredRef = useRef<string | null>(null)
    const hasMountedRef = useRef(false)
    const debounceRef = useRef<number | null>(null)

    const manualFulfillmentLogged = useMemo(
      () =>
        shippingLogEntries.some(
          (entry: any) =>
            entry &&
            typeof entry.status === 'string' &&
            entry.status.toLowerCase() === 'fulfilled_manual',
        ),
      [shippingLogEntries],
    )
    const normalizedOrderStatus = (orderStatusValue || '').toString().toLowerCase()
    const isOrderFulfilled = normalizedOrderStatus === 'fulfilled'
    const fulfillmentBadge = useMemo(() => {
      if (manualFulfillmentLogged) {
        return {label: 'Fulfilled (Manual)', tone: 'positive' as const, Icon: OkHandIcon}
      }
      if (isOrderFulfilled) {
        return {label: 'Fulfilled (Auto)', tone: 'primary' as const, Icon: RobotIcon}
      }
      return null
    }, [isOrderFulfilled, manualFulfillmentLogged])

    useEffect(() => {
      setInputValue(typeof value === 'string' ? value : '')
    }, [value])

    useEffect(() => {
      if (!normalizeForDisplay(inputValue)) {
        setLastCarrierLabel(null)
        setLastTrackingUrl(null)
      }
    }, [inputValue])

    useEffect(
      () => () => {
        if (debounceRef.current) {
          window.clearTimeout(debounceRef.current)
          debounceRef.current = null
        }
      },
      [],
    )

    const handleChange = useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        const nextValue = event.currentTarget.value
        setInputValue(nextValue)
        const canonical = canonicalizeTrackingNumber(nextValue)
        if (status) {
          setStatus(null)
        }
        if (!canonical) {
          onChange?.(unset())
          lastTriggeredRef.current = null
        } else {
          onChange?.(set(canonical))
        }
      },
      [onChange, status],
    )

    const sendManualFulfillment = useCallback(
      async (
        trackingNumber: string,
        options: {force?: boolean; origin?: 'auto' | 'manual'} = {},
      ) => {
        const validation = validateTrackingNumber(trackingNumber)
        if (!validation.isValid) {
          const message =
            validation.reason || 'Enter a valid tracking number before sending an update.'
          setStatus({tone: 'critical', text: message})
          if (options.origin === 'manual') {
            toast.push({
              status: 'error',
              title: 'Invalid tracking number',
              description: message,
              closable: true,
            })
          }
          return
        }

        const canonical = validation.canonical
        const baseId = (typeof orderIdValue === 'string' ? orderIdValue : '')
          .replace(/^drafts\./, '')
          .trim()
        if (!baseId) {
          const message = 'Save the order before adding a manual tracking number.'
          setStatus({tone: 'critical', text: message})
          if (options.origin !== 'auto') {
            toast.push({
              status: 'error',
              title: 'Order must be saved',
              description: message,
              closable: true,
            })
          }
          return
        }

        if (!options.force && lastTriggeredRef.current === canonical) {
          return
        }

        if (!options.force && existingTrackingSet.has(canonical)) {
          const message =
            'That tracking number is already recorded. Use “Resend update email” if you need to notify the customer again.'
          setStatus({tone: 'caution', text: message})
          if (options.origin !== 'auto') {
            toast.push({
              status: 'warning',
              title: 'Tracking number already saved',
              description: message,
              closable: true,
            })
          }
          return
        }

        setIsSending(true)
        setStatus(null)

        const payload = JSON.stringify({
          orderId: baseId,
          trackingNumber: canonical,
          forceResend: options.force === true,
        })
        const attempted = new Set<string>()
        const bases = Array.from(
          new Set(
            [lastSuccessfulBaseRef.current, ...baseCandidates].filter(
              (candidate): candidate is string => Boolean(candidate),
            ),
          ),
        )

        let response: Response | null = null
        let lastError: unknown = null

        baseLoop: for (const base of bases) {
          if (!base || attempted.has(base)) continue
          attempted.add(base)
          const url = `${base}/.netlify/functions/manual-fulfill-order`

          for (let attempt = 0; attempt < MAX_MANUAL_FULFILLMENT_RETRIES; attempt++) {
            try {
              const result = await fetch(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: payload,
              })

              if (!result.ok) {
                const message = await result.text().catch(() => '')
                const error = new Error(message || 'Manual fulfillment request failed')
                ;(error as any).status = result.status
                lastError = error
                if (result.status === 404) {
                  continue baseLoop
                }
                const retryableStatus =
                  (result.status >= 500 && result.status < 600) || result.status === 429
                if (retryableStatus && attempt < MAX_MANUAL_FULFILLMENT_RETRIES - 1) {
                  await sleep(RETRY_BACKOFF_BASE_MS * (attempt + 1))
                  continue
                }
                if (retryableStatus) {
                  break
                }
                throw error
              }

              response = result
              lastSuccessfulBaseRef.current = base

              if (typeof window !== 'undefined') {
                try {
                  window.localStorage?.setItem('NLFY_BASE', base)
                } catch {
                  // ignore storage errors
                }
              }

              break baseLoop
            } catch (err) {
              lastError = err
              const rawStatus =
                (err as any)?.status ??
                (err as any)?.statusCode ??
                (err as any)?.response?.status ??
                (err as any)?.response?.statusCode
              const statusCode =
                typeof rawStatus === 'number' ? rawStatus : Number.parseInt(rawStatus, 10)
              if (statusCode === 404) {
                continue baseLoop
              }
              const retryableError =
                err instanceof TypeError ||
                (Number.isFinite(statusCode) && statusCode >= 500 && statusCode < 600)

              if (retryableError && attempt < MAX_MANUAL_FULFILLMENT_RETRIES - 1) {
                await sleep(RETRY_BACKOFF_BASE_MS * (attempt + 1))
                continue
              }

              if (retryableError) {
                break
              }

              break baseLoop
            }
          }
        }

        if (!response) {
          const message = (lastError as any)?.message || 'Manual fulfillment failed'
          setIsSending(false)
          setStatus({tone: 'critical', text: message})
          toast.push({
            status: 'error',
            title: 'Manual fulfillment failed',
            description: message,
            closable: true,
          })
          return
        }

        try {
          const data = await response.json().catch(() => ({}))
          if (!data?.success) {
            throw new Error(data?.message || 'Manual fulfillment could not be completed')
          }

          lastTriggeredRef.current = canonical
          if (typeof data?.trackingCarrierLabel === 'string') {
            setLastCarrierLabel(data.trackingCarrierLabel)
          } else if (validation.carrierLabel) {
            setLastCarrierLabel(validation.carrierLabel)
          }
          if (typeof data?.trackingUrl === 'string') {
            setLastTrackingUrl(data.trackingUrl)
          } else if (validation.trackingUrl) {
            setLastTrackingUrl(validation.trackingUrl)
          } else {
            setLastTrackingUrl(null)
          }

          const resolvedStatus =
            typeof data?.orderStatus === 'string' ? data.orderStatus : 'fulfilled'
          const messageBase =
            data?.message ||
            `Order${orderNumber ? ` ${orderNumber}` : ''} is now ${resolvedStatus}. Tracking number ${canonical} has been saved.`
          const carrierText =
            typeof (data?.trackingCarrierLabel || validation.carrierLabel) === 'string'
              ? ` Carrier: ${(data?.trackingCarrierLabel || validation.carrierLabel) as string}.`
              : ''
          const trackingLinkText = data?.trackingUrl ? ` Track here: ${data.trackingUrl}.` : ''

          if (data?.emailSkipped) {
            const description = `${messageBase}${carrierText}${trackingLinkText} ${
              data?.emailMessage ||
              'This tracking update was already sent to the customer. No additional email was delivered.'
            }`.trim()
            setStatus({
              tone: 'caution',
              text: description,
            })
            toast.push({
              status: 'warning',
              title: 'Tracking already shared',
              description,
              closable: true,
            })
          } else if (data?.emailSent === false) {
            const description = `${messageBase}${carrierText}${trackingLinkText} ${
              data?.emailMessage ||
              'Email delivery is disabled or failed, so please notify the customer manually.'
            }`.trim()
            setStatus({
              tone: 'caution',
              text: description,
            })
            toast.push({
              status: 'warning',
              title: 'Customer email not sent',
              description,
              closable: true,
            })
          } else {
            const description = `${messageBase}${carrierText}${trackingLinkText} ${
              data?.emailMessage || 'A shipping update email was sent to the customer successfully.'
            }`.trim()
            setStatus({
              tone: 'positive',
              text: description,
            })
            toast.push({
              status: 'success',
              title: 'Manual fulfillment sent',
              description,
              closable: true,
            })
          }
        } catch (err: any) {
          const message = err?.message || 'Manual fulfillment failed'
          setStatus({tone: 'critical', text: message})
          toast.push({
            status: 'error',
            title: 'Manual fulfillment failed',
            description: message,
            closable: true,
          })
        } finally {
          setIsSending(false)
        }
      },
      [baseCandidates, existingTrackingSet, orderIdValue, orderNumber, toast],
    )
    const scheduleAutoSend = useCallback(
      (trackingNumber: string) => {
        if (debounceRef.current) {
          window.clearTimeout(debounceRef.current)
          debounceRef.current = null
        }
        const validation = validateTrackingNumber(trackingNumber)
        if (!validation.isValid) {
          if (validation.reason) {
            setStatus({tone: 'critical', text: validation.reason})
          }
          return
        }
        debounceRef.current = window.setTimeout(() => {
          void sendManualFulfillment(validation.canonical, {origin: 'auto'})
        }, 1200)
      },
      [sendManualFulfillment],
    )

    useEffect(() => {
      if (!hasMountedRef.current) {
        hasMountedRef.current = true
        return
      }

      const canonical = canonicalizeTrackingNumber(value as string)
      if (!canonical) return
      if (lastTriggeredRef.current === canonical) return

      scheduleAutoSend(canonical)
    }, [scheduleAutoSend, value])

    const handleResend = useCallback(() => {
      void sendManualFulfillment(inputValue, {force: true, origin: 'manual'})
    }, [inputValue, sendManualFulfillment])

    const tone: StatusTone = status?.tone ?? 'critical'
    const inputValidation = useMemo(() => validateTrackingNumber(inputValue), [inputValue])
    const carrierLabel = inputValidation.isValid
      ? inputValidation.carrierLabel || lastCarrierLabel
      : null
    const carrierUrl = inputValidation.isValid
      ? inputValidation.trackingUrl || lastTrackingUrl
      : null
    const hasInput = normalizeForDisplay(inputValue).length > 0

    return (
      <Stack space={3}>
        {fulfillmentBadge ? (
          <Card padding={3} radius={2} tone={fulfillmentBadge.tone} border>
            <Inline space={2} style={{alignItems: 'center'}}>
              <fulfillmentBadge.Icon style={{width: 18, height: 18}} />
              <Text size={1} weight="semibold">
                {fulfillmentBadge.label}
              </Text>
            </Inline>
          </Card>
        ) : null}
        <Flex gap={3} align="flex-end" wrap="wrap">
          <Box flex={1} style={{minWidth: 280}}>
            <TextInput
              {...elementProps}
              ref={forwardedRef}
              value={inputValue}
              onChange={handleChange}
              placeholder={schemaType.placeholder || 'Enter tracking number'}
              disabled={isSending}
              autoComplete="off"
            />
          </Box>
          {hasInput && (
            <Card
              padding={3}
              radius={2}
              tone={inputValidation.isValid ? 'positive' : 'caution'}
              border
              style={{minWidth: 220}}
            >
              <Stack space={2}>
                <Inline space={2} style={{alignItems: 'center'}}>
                  <Badge
                    mode="outline"
                    tone={inputValidation.isValid ? 'positive' : 'caution'}
                    style={{textTransform: 'none'}}
                  >
                    {inputValidation.isValid
                      ? carrierLabel || 'Carrier detected'
                      : 'Needs attention'}
                  </Badge>
                </Inline>
                {!inputValidation.isValid && inputValidation.reason ? (
                  <Text size={1}>{inputValidation.reason}</Text>
                ) : null}
                {inputValidation.isValid && !carrierUrl && carrierLabel ? (
                  <Text size={1} muted>
                    Carrier auto-detected as {carrierLabel}.
                  </Text>
                ) : null}
                {inputValidation.isValid && carrierUrl ? (
                  <Inline space={2} style={{alignItems: 'center'}}>
                    <Button
                      as="a"
                      href={carrierUrl}
                      text="Open tracking"
                      tone="primary"
                      mode="bleed"
                      rel="noopener noreferrer"
                      target="_blank"
                    />
                    <Text size={0} muted>
                      {carrierUrl.replace(/^https?:\/\//, '')}
                    </Text>
                  </Inline>
                ) : null}
              </Stack>
            </Card>
          )}
        </Flex>
        <Text size={1} muted>
          Adding a tracking number fulfills the order and emails the customer using the
          transactional template.
        </Text>
        <Flex align="center" gap={3}>
          <Button
            text="Resend update email"
            mode="ghost"
            tone="primary"
            disabled={isSending || !canonicalizeTrackingNumber(inputValue)}
            onClick={handleResend}
          />
          {isSending && (
            <Inline space={2}>
              <Spinner muted size={2} />
              <Text size={1} muted>
                Sending update…
              </Text>
            </Inline>
          )}
        </Flex>
        {status && (
          <Card padding={3} radius={2} tone={tone} border>
            <Text size={1}>{status.text}</Text>
          </Card>
        )}
      </Stack>
    )
  },
)

export default ManualTrackingInput
